import { InputControlBinderContext } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { createInputControlBinder, type ProjectAControlReaches } from "@tatolab/tato-app-view-sdk/pin_services/input_control_binding";
import { createInputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import type { GraphEditMode, ProjectGraphTransactionApplying, StreamGraphInputValueRead } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { GraphInputControl } from "./graph_input_control";
import { WHY_NOTHING_SETS_THE_INPUT, type GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const PROJECT = "/projects/s06-perform";

/** The project the binder reaches: no control here asks it anything. */
const NO_PROJECT: ProjectAControlReaches = {
  pickAProjectAsset: () => Promise.resolve({ kind: "not_started", because: "no project in this test" }),
  readAssetPreviewInTheProject: () => Promise.resolve({ kind: "not_read", because: "no project in this test" }),
  watchProjectAssets: () => () => undefined,
  watchPortViewer: () => () => undefined,
};
const STREAM_ASSET = "0df4a7aa-1111-2222-3333-444444444444";

const valueOf = (nodeId: string): InputAddress => ({ graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: nodeId, input: "value", member: null });

const FLOAT_VALUE = { pin_type: { type: "float" }, flow: "value" } as const;
const BRIGHTNESS: GraphInputOfTheStream = { node_id: "3fd9fe1a", port_name: "brightness", value_address: valueOf("3fd9fe1a"), value_pin: FLOAT_VALUE, value_annotations: { range: { minimum: 0, maximum: 1 } }, lifetime: "kept" };
const STROBE: GraphInputOfTheStream = { node_id: "5b1c0e2a", port_name: "strobe", value_address: valueOf("5b1c0e2a"), value_pin: { pin_type: { type: "boolean" }, flow: "value" }, value_annotations: {}, lifetime: "reset" };
const VIDEO: GraphInputOfTheStream = { node_id: "9a0b1c2d", port_name: "video_in", value_address: null, value_pin: { pin_type: { type: "texture" }, flow: "stream" }, value_annotations: {}, lifetime: "kept" };

const APPLIED = (mode: GraphEditMode): ProjectGraphTransactionApplying => ({ kind: "applied", transaction: { mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });

afterEach(() => {
  document.body.replaceChildren();
});

/** The row of `graphInput` drawn in a frame whose store reads its value as `valueRead` and answers each write with `answerOf`, recording each one it sends. */
function drawTheRow(graphInput: GraphInputOfTheStream, valueRead: StreamGraphInputValueRead, answerOf: (mode: GraphEditMode) => ProjectGraphTransactionApplying = APPLIED) {
  const sent: { node: string; input: string; value: unknown; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: async (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ node: operation.node, input: operation.input, value: operation.value ?? null, mode: sending.mode });
      return answerOf(sending.mode);
    },
    newGestureIdempotencyKey: () => "never-committed",
  });
  const valuesRead = (read: StreamGraphInputValueRead) => ({ kind: "values" as const, stream_asset: STREAM_ASSET, values: [{ level: [], node_id: graphInput.node_id, input: "value", member: null, value_read: read }] });
  const takeTheValue = (read: StreamGraphInputValueRead) => act(async () => inputValues.takeTheInputValues(PROJECT, valuesRead(read)));
  inputValues.takeTheInputValues(PROJECT, valuesRead(valueRead));
  const binder = createInputControlBinder({ watchNodeUiElements: (listener) => (listener({ elements: [] }), () => undefined), inputValues, project: NO_PROJECT });
  const rowHolder = document.createElement("ul");
  document.body.append(rowHolder);
  act(() =>
    createRoot(rowHolder).render(
      <InputControlBinderContext value={binder}>
        <GraphInputControl graphInput={graphInput} />
      </InputControlBinderContext>,
    ),
  );
  const field = (selector: string): HTMLElement => rowHolder.querySelector<HTMLElement>(selector) ?? expect.unreachable(`the row drew no ${selector}`);
  return {
    rowHolder,
    sent,
    setLive: (value: boolean | number) => act(async () => inputValues.beginGesture(graphInput.value_address ?? expect.unreachable("no address"), "live").release(value)),
    field,
    takeTheValue,
    refusalWords: () => rowHolder.querySelector("[data-graph-input-refusal]")?.textContent ?? null,
  };
}

test("an Input is named by its port and its value's type, and where the control table draws no control its value shows in words", () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "default" });

  expect(row.rowHolder.querySelector("[data-graph-input]")?.textContent).toContain("brightness");
  expect(row.rowHolder.querySelector("[data-graph-input]")?.textContent).toContain("Float");
  expect(row.field("[data-graph-input-value-words]").textContent).toBe("0.5");
  expect(row.field("[data-graph-input-lifetime]").textContent).toBe("Kept at Stop");
});

test("a live value says so and offers Back to saved, which takes the live value off, live", async () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "saved" });
  expect(row.rowHolder.querySelector("[data-graph-input-live]")).toBeNull();
  expect(row.rowHolder.querySelector("[data-graph-input-back-to-saved]")).toBeNull();

  await row.takeTheValue({ value: 0.9, comes_from: "live" });
  expect(row.field("[data-graph-input-live]").textContent).toBe("Live");
  const backToSaved = row.field("[data-graph-input-back-to-saved]");
  expect(backToSaved.getAttribute("aria-label")).toBe("Back to saved: brightness");
  await act(async () => backToSaved.click());

  expect(row.sent).toEqual([{ node: "3fd9fe1a", input: "value", value: null, mode: "live" }]);
  await row.takeTheValue({ value: 0.5, comes_from: "saved" });
  expect(row.rowHolder.querySelector("[data-graph-input-live]")).toBeNull();
});

test("the runtime's refusal of a value set live shows on its row in the runtime's own words", async () => {
  const because = "the stream is stopped, and `strobe` is reset at Stop, so a value set on it now is refused";
  const row = drawTheRow(STROBE, { value: false, comes_from: "default" }, () => ({ kind: "not_sent", because }));

  expect(row.field("[data-graph-input-lifetime]").textContent).toBe("Reset at Stop");
  await row.setLive(true);

  expect(row.sent).toEqual([{ node: "5b1c0e2a", input: "value", value: true, mode: "live" }]);
  expect(row.refusalWords()).toContain(because);
});

test("an Input that holds no value says nothing sets it", () => {
  const row = drawTheRow(VIDEO, { value: null, comes_from: null });

  expect(row.field("[data-graph-input-not-set]").textContent).toBe(WHY_NOTHING_SETS_THE_INPUT);
  expect(row.rowHolder.querySelector("[data-graph-input-value-words]")).toBeNull();
});
