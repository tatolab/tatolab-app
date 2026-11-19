import { InputControlBinderContext } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { createInputControlBinder } from "@tatolab/tato-app-view-sdk/pin_services/input_control_binding";
import { createInputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import type { GraphEditMode, ProjectGraphTransactionApplying, StreamGraphInputValueRead } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { GraphInputControl } from "./graph_input_control";
import type { GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const PROJECT = "/projects/s06-perform";
const STREAM_ASSET = "0df4a7aa-1111-2222-3333-444444444444";

const valueOf = (nodeId: string): InputAddress => ({ graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: nodeId, input: "value" });

const BRIGHTNESS: GraphInputOfTheStream = { node_id: "3fd9fe1a", port_name: "brightness", family: "channels", value_address: valueOf("3fd9fe1a"), value_pin: null, lifetime: "kept", range: { lowest: 0, highest: 1 }, control: "slider" };
const CUE: GraphInputOfTheStream = { node_id: "3067457b", port_name: "cue", family: "records", value_address: valueOf("3067457b"), value_pin: null, lifetime: "kept", range: null, control: "json" };
const STROBE: GraphInputOfTheStream = { node_id: "5b1c0e2a", port_name: "strobe", family: "channels", value_address: valueOf("5b1c0e2a"), value_pin: null, lifetime: "reset", range: null, control: "toggle" };
const VIDEO: GraphInputOfTheStream = { node_id: "9a0b1c2d", port_name: "video_in", family: "image", value_address: null, value_pin: null, lifetime: "kept", range: null, control: "not_written" };

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
  const valuesRead = (read: StreamGraphInputValueRead) => ({ kind: "values" as const, stream_asset: STREAM_ASSET, values: [{ level: [], node_id: graphInput.node_id, input: "value", value_read: read }] });
  const takeTheValue = (read: StreamGraphInputValueRead) => act(async () => inputValues.takeTheInputValues(PROJECT, valuesRead(read)));
  inputValues.takeTheInputValues(PROJECT, valuesRead(valueRead));
  const binder = createInputControlBinder({ watchNodeUiElements: (listener) => (listener({ elements: [] }), () => undefined), inputValues });
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
  const setTheFieldTo = (input: HTMLElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    rowHolder,
    sent,
    field,
    takeTheValue,
    moveTheSliderTo: (value: number) => act(async () => setTheFieldTo(field('input[type="range"]'), String(value))),
    letGo: () => act(async () => window.dispatchEvent(new Event("pointerup"))),
    typeAndPressEnter: async (selector: string, words: string) => {
      const input = field(selector);
      await act(async () => {
        input.focus();
        setTheFieldTo(input, words);
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
    },
    refusalWords: () => rowHolder.querySelector("[data-graph-input-refusal]")?.textContent ?? null,
  };
}

test("dragging a ranged Input's slider sets its Graph Input's value live while it moves and live on release, committing nothing", async () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "default" });

  expect(nameOfTheField(row.rowHolder, 'input[type="range"]')).toBe("brightness");
  expect(row.field("[data-graph-input-lifetime]").textContent).toBe("Kept at Stop");
  await row.moveTheSliderTo(0.8);
  expect(row.rowHolder.querySelector("[data-property-live-edit]")).not.toBeNull();
  await row.letGo();

  expect(row.sent).toEqual([
    { node: "3fd9fe1a", input: "value", value: 0.8, mode: "live" },
    { node: "3fd9fe1a", input: "value", value: 0.8, mode: "live" },
  ]);
  expect(row.refusalWords()).toBeNull();
});

test("Escape during a drag puts back the value it began at and sends nothing more", async () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "default" });

  await row.moveTheSliderTo(0.8);
  await act(async () => row.field('input[type="range"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await row.letGo();

  expect(row.sent).toEqual([
    { node: "3fd9fe1a", input: "value", value: 0.8, mode: "live" },
    { node: "3fd9fe1a", input: "value", value: null, mode: "live" },
  ]);
  expect(row.rowHolder.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe("0.5");
});

test("a live value says so and offers Back to saved, which takes the live value off, live", async () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "saved" });
  expect(row.rowHolder.querySelector("[data-graph-input-live]")).toBeNull();
  expect(row.rowHolder.querySelector("[data-graph-input-back-to-saved]")).toBeNull();

  await row.takeTheValue({ value: 0.9, comes_from: "live" });
  expect(row.field("[data-graph-input-live]").textContent).toBe("Live");
  await act(async () => row.field("[data-graph-input-back-to-saved]").click());

  expect(row.sent).toEqual([{ node: "3fd9fe1a", input: "value", value: null, mode: "live" }]);
  await row.takeTheValue({ value: 0.5, comes_from: "saved" });
  expect(row.rowHolder.querySelector("[data-graph-input-live]")).toBeNull();
});

test("the runtime's refusal of a move shows on its row in the runtime's own words, and the slider goes back to the value the stream reads", async () => {
  const because = "the stream is stopped, and `strobe` is reset at Stop, so a value set on it now is refused";
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "default" }, () => ({ kind: "not_sent", because }));

  await row.moveTheSliderTo(0.3);
  await row.letGo();

  expect(row.refusalWords()).toContain(because);
  expect(row.rowHolder.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe("0.5");
});

test("a record typed as a JSON object is set live on Enter, and words that are not JSON or not an object are refused there, sending nothing", async () => {
  const row = drawTheRow(CUE, { value: { scene: "intro" }, comes_from: "default" });

  expect(row.rowHolder.querySelector("input")?.value).toBe('{"scene":"intro"}');
  await row.typeAndPressEnter("input", "{scene: finale}");
  expect(row.refusalWords()).toContain("“{scene: finale}” isn't JSON.");
  await row.typeAndPressEnter("input", '"finale"');
  expect(row.refusalWords()).toContain("“\"finale\"” isn't a JSON object.");
  expect(row.sent).toEqual([]);

  await row.typeAndPressEnter("input", '{"scene": "finale"}');
  expect(row.sent).toEqual([{ node: "3067457b", input: "value", value: { scene: "finale" }, mode: "live" }]);
  expect(row.refusalWords()).toBeNull();
});

test("a Channels bool is a switch, switching it sets the other bool live, and its lifetime reads as reset at Stop", async () => {
  const row = drawTheRow(STROBE, { value: false, comes_from: "default" });

  expect(row.field("[data-graph-input-lifetime]").textContent).toBe("Reset at Stop");
  await act(async () => row.field("[data-graph-input-toggle]").click());

  expect(row.sent).toEqual([{ node: "5b1c0e2a", input: "value", value: true, mode: "live" }]);
});

test("a number typed beside the slider is set live, and words that aren't a number are refused there, sending nothing", async () => {
  const row = drawTheRow(BRIGHTNESS, { value: 0.5, comes_from: "default" });

  await row.typeAndPressEnter("[data-property-slider-value]", "bright");
  expect(row.refusalWords()).toContain("“bright” isn't a number.");
  expect(row.sent).toEqual([]);
  await row.typeAndPressEnter("[data-property-slider-value]", "0.25");
  expect(row.sent).toEqual([{ node: "3fd9fe1a", input: "value", value: 0.25, mode: "live" }]);
});

test("an Input no control sets keeps today's line", () => {
  const row = drawTheRow(VIDEO, { value: null, comes_from: null });

  expect(row.field("[data-graph-input-not-set]").textContent).toBe("This image Input carries only what the graph wires into it, so no control writes it.");
});

test("words refused there show over the refusal of the value last sent, and Back to saved, named by its words, clears them", async () => {
  const row = drawTheRow(CUE, { value: { scene: "intro" }, comes_from: "default" }, () => ({ kind: "not_sent", because: "the stream is stopped" }));

  await row.typeAndPressEnter("input", '{"scene": "finale"}');
  expect(row.refusalWords()).toContain("the stream is stopped");
  await row.typeAndPressEnter("input", "{scene: finale}");
  expect(row.refusalWords()).toContain("“{scene: finale}” isn't JSON.");

  await row.takeTheValue({ value: { scene: "drop" }, comes_from: "live" });
  const backToSaved = row.field("[data-graph-input-back-to-saved]");
  expect(backToSaved.getAttribute("aria-label")).toBe("Back to saved: cue");
  await act(async () => backToSaved.click());
  expect(row.refusalWords()).not.toContain("isn't JSON");
});

/** The accessible name of the field `selector` finds in `holder`, from the element its `aria-labelledby` names, else its `aria-label`. */
function nameOfTheField(holder: HTMLElement, selector: string): string | null {
  const field = holder.querySelector(selector) ?? expect.unreachable(`no ${selector}`);
  const labelledBy = field.getAttribute("aria-labelledby");
  return labelledBy === null ? field.getAttribute("aria-label") : (document.getElementById(labelledBy)?.textContent ?? null);
}

test("an Input whose value pin is exact but which the table cannot draw takes Perform's own field, and each field is named by the Input", () => {
  const STRING_VALUE = { pin_type: { type: "string" }, flow: "value" } as const;
  const sliderRow = drawTheRow({ ...BRIGHTNESS, value_pin: STRING_VALUE }, { value: 0.5, comes_from: "default" });
  expect(nameOfTheField(sliderRow.rowHolder, 'input[type="range"]')).toBe("brightness");
  const numberRow = drawTheRow({ ...BRIGHTNESS, node_id: "4aa0", value_address: valueOf("4aa0"), port_name: "gain", range: null, control: "number", value_pin: STRING_VALUE }, { value: 2, comes_from: "default" });
  expect(nameOfTheField(numberRow.rowHolder, 'input[inputmode="decimal"]')).toBe("gain");
  const jsonRow = drawTheRow({ ...CUE, value_pin: STRING_VALUE }, { value: { scene: "intro" }, comes_from: "default" });
  expect(nameOfTheField(jsonRow.rowHolder, "input")).toBe("cue");
});
