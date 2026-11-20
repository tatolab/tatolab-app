// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import type { InputWiring } from "../pin_model/input_wiring.js";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "../node_ui/input_control_element.js";
import { NO_PROJECT, listedElementOf } from "../node_ui/test_fixtures/node_ui_listing_fixtures.js";
import type { GraphEditMode, PortViewerTarget } from "../studio_readings.js";
import type { PortViewerEvent, ViewInputEvent } from "../view_wire_messages.js";
import { createInputControlBinder } from "./input_control_binding.js";
import { createInputValues } from "./input_values.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const CAMERA_VIDEO: PortViewerTarget = { stream: "main-a1b2c3", node_id: "CAMERA-ID", port: "video" };
const WIRED_FROM_THE_CAMERA: InputWiring = { kind: "wired", target: CAMERA_VIDEO, wired_from_words: "camera › video" };

/** The `video_in` input of a filter node, a Texture its node type annotates with a preview, read through `wiring`. */
function videoIn(wiring: InputWiring): ControlledInput {
  return {
    address: { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "FILTER-ID", input: "video_in", member: null },
    declaration: { input_name: "video_in", label: "video_in", pin_type: { type: "texture" }, annotations: { control: "preview" }, may_be_unset: false },
    rebuilds_its_node: false,
    driven_by: wiring,
  };
}

/** A preview as the binder meets one: it keeps the state and the values it is handed, and what its wire carries. */
class StandInPreview extends HTMLElement implements InputControlElement<"texture"> {
  pinHanded: ControlledPin<"texture"> | null = null;
  statesHanded: InputControlState[] = [];
  valuesHanded: null[] = [];
  set pin(pin: ControlledPin<"texture">) {
    this.pinHanded = pin;
  }
  set value(value: null) {
    this.valuesHanded.push(value);
  }
  set state(state: InputControlState) {
    this.statesHanded.push(state);
  }
}
customElements.define("stand-in-preview", StandInPreview);

/** A frame a port viewer delivers, which records whether it was closed. */
function aFrame(): { event: PortViewerEvent; wasClosed: () => boolean } {
  let isClosed = false;
  const videoFrame: VideoFrame = new Proxy(Object.create(null), { get: (_target, property) => (property === "close" ? () => (isClosed = true) : undefined) });
  return { event: { kind: "image_frame", video_frame: videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 }, wasClosed: () => isClosed };
}

/** A binder whose port viewers the test holds, each refused with `refusal` where it is given, drawing `input` in a slot, and what reached the store. */
async function previewUnderTest(input: ControlledInput, refusal: string | null = null) {
  const sent: { operation: unknown; mode: GraphEditMode }[] = [];
  const portViewers: { target: PortViewerTarget; onEvent: (event: PortViewerEvent) => void; isStopped: boolean }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      sent.push(...operations.map((operation) => ({ operation, mode: sending.mode })));
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  const binder = createInputControlBinder({
    watchNodeUiElements: (listener) => (listener({ elements: [listedElementOf("studio", { kind: "control", type: "texture", control: "preview" }, { script: "wire_preview.ts" })] }), () => undefined),
    inputValues,
    project: {
      ...NO_PROJECT,
      watchPortViewer: (target, onEvent, whenRefused) => {
        const portViewer = { target, onEvent, isStopped: false };
        portViewers.push(portViewer);
        if (refusal !== null) whenRefused?.(refusal);
        return () => {
          portViewer.isStopped = true;
        };
      },
    },
    loadElement: () => Promise.resolve({ kind: "defined", tag: "stand-in-preview" }),
    requestAFlush: (flush) => flush(),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const binding = binder.bindInputControl(host, input, { surface: "node", read_only: false });
  const control = await vi.waitFor(() => (host.firstElementChild instanceof StandInPreview ? host.firstElementChild : expect.unreachable("no control yet")));
  const read: ViewInputEvent[] = [];
  const watch = (inputName = "video_in") => control.pinHanded?.studio.watchWhatIsWiredInto(inputName, (event) => read.push(event)) ?? expect.unreachable("no pin handed");
  return { sent, portViewers, binding, control, read, watch };
}

afterEach(() => {
  document.body.replaceChildren();
});

test("a_control_on_a_texture_input_is_driven_by_its_wire_holds_no_value_and_nothing_it_fires_reaches_the_store", async () => {
  const preview = await previewUnderTest(videoIn(WIRED_FROM_THE_CAMERA));
  expect(preview.control.statesHanded).toEqual(["driven_by_wire"]);
  expect(preview.control.getAttribute("data-state")).toBe("driven_by_wire");
  expect(preview.control.valuesHanded).toEqual([null]);
  fireInputControlEvent(preview.control, "input", null);
  fireInputControlEvent(preview.control, "change", null);
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  expect(preview.sent).toEqual([]);
});

test("the_control_reads_the_output_wired_into_its_input_through_its_port_viewer_until_it_stops", async () => {
  const preview = await previewUnderTest(videoIn(WIRED_FROM_THE_CAMERA));
  const stopWatching = preview.watch();
  expect(preview.portViewers.map((portViewer) => portViewer.target)).toEqual([CAMERA_VIDEO]);
  const first = aFrame();
  preview.portViewers[0]?.onEvent(first.event);
  expect(preview.read).toEqual([first.event]);
  expect(first.wasClosed()).toBe(false);
  stopWatching();
  expect(preview.portViewers[0]?.isStopped).toBe(true);
  const late = aFrame();
  preview.portViewers[0]?.onEvent(late.event);
  expect(preview.read).toEqual([first.event]);
  expect(late.wasClosed()).toBe(true);
});

test("with_nothing_wired_in_the_control_is_told_why_and_no_port_viewer_opens", async () => {
  const preview = await previewUnderTest(videoIn({ kind: "unwired", because: "Nothing is wired into video_in." }));
  preview.watch();
  expect(preview.read).toEqual([{ kind: "unwired", because: "Nothing is wired into video_in." }]);
  expect(preview.portViewers).toEqual([]);
});

test("a_control_is_told_only_of_its_own_input", async () => {
  const preview = await previewUnderTest(videoIn(WIRED_FROM_THE_CAMERA));
  preview.watch("mask_in");
  expect(preview.read).toEqual([{ kind: "unwired", because: "A control reads the wire into its own input, video_in, and not into mask_in." }]);
  expect(preview.portViewers).toEqual([]);
});

test("wired_otherwise_the_control_reads_the_new_output_and_unbound_it_reads_none", async () => {
  const preview = await previewUnderTest(videoIn({ kind: "unwired", because: "Nothing is wired into video_in." }));
  preview.watch();
  preview.binding.update(videoIn(WIRED_FROM_THE_CAMERA), { surface: "node", read_only: false });
  expect(preview.portViewers.map((portViewer) => portViewer.target)).toEqual([CAMERA_VIDEO]);
  const toTheTitler: InputWiring = { kind: "wired", target: { ...CAMERA_VIDEO, node_id: "TITLER-ID", port: "out" }, wired_from_words: "titler › out" };
  preview.binding.update(videoIn(toTheTitler), { surface: "node", read_only: false });
  expect(preview.portViewers.map((portViewer) => [portViewer.target.node_id, portViewer.isStopped])).toEqual([
    ["CAMERA-ID", true],
    ["TITLER-ID", false],
  ]);
  preview.binding.unbind();
  expect(preview.portViewers[1]?.isStopped).toBe(true);
});

test("a_port_viewer_studio_refuses_ends_the_reading_in_words_naming_the_output", async () => {
  const preview = await previewUnderTest(videoIn(WIRED_FROM_THE_CAMERA), "the stream is stopped");
  preview.watch();
  expect(preview.read).toEqual([{ kind: "ended", because: "camera › video cannot be read: the stream is stopped", recovery: "open_the_port_again" }]);
});
