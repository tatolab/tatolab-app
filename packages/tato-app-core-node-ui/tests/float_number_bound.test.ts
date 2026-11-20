import { createInputControlBinder } from "@tatolab/tato-app-view-sdk/pin_services/input_control_binding";
import { createInputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import type { ControlledInput } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import { nodeUiElementTag, type ListedNodeUiElement } from "@tatolab/tato-app-view-sdk/node_ui_host";
import type { JsonValue, StreamInputValuesReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { afterEach, expect, it, vi } from "vitest";
import FloatNumber from "../node_ui/float_number.ts";
import { NO_PROJECT } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

const FLOAT_NUMBER_LISTED: ListedNodeUiElement = {
  module: "studio",
  brought_by: "studio",
  script: "float_number.ts",
  folder_version: "bound-test",
  registration: { kind: "control", type: "float", control: null },
  script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
};
customElements.define(nodeUiElementTag(FLOAT_NUMBER_LISTED), FloatNumber);

const GAIN: ControlledInput = {
  address: { graph: { project_folder: "/projects/demo", stream_asset: "STREAM-ASSET", level: [] }, node_id: "MIX-ID", input: "gain", member: null },
  declaration: { input_name: "gain", label: "gain", pin_type: { type: "float" }, annotations: {}, may_be_unset: false },
  rebuilds_its_node: false,
  driven_by: null,
};

/** The host's values of the stream, in which the mix node's `gain` reads `value`, saved. */
function valuesOfTheGain(value: JsonValue): StreamInputValuesReading {
  return { kind: "values", stream_asset: "STREAM-ASSET", values: [{ level: [], node_id: "MIX-ID", input: "gain", member: null, value_read: { value, comes_from: "saved" } }] };
}

/** The Studio's Float control bound to `gain` through a binder over a store whose writes apply at once, each flush run at once. */
async function boundFloatNumber() {
  const sent: { value: unknown; mode: string }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_folder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "drag",
  });
  inputValues.takeTheInputValues("/projects/demo", valuesOfTheGain(0.5));
  const binder = createInputControlBinder({ watchNodeUiElements: (listener) => (listener({ elements: [FLOAT_NUMBER_LISTED] }), () => undefined), inputValues, project: NO_PROJECT, requestAFlush: (flush) => flush() });
  const host = document.createElement("div");
  document.body.append(host);
  binder.bindInputControl(host, GAIN, { surface: "node", read_only: false });
  await vi.waitFor(() => expect(host.firstElementChild).toBeInstanceOf(FloatNumber));
  const control = host.firstElementChild as FloatNumber;
  const field = control.shadowRoot?.querySelector<HTMLElement>(".field") ?? expect.unreachable("the control draws no field");
  const words = () => control.shadowRoot?.querySelector("input")?.value;
  const pointer = (type: string, clientX: number) => field.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX, bubbles: true, composed: true }));
  const settled = async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  };
  return { inputValues, sent, words, pointer, settled };
}

afterEach(() => {
  document.body.replaceChildren();
});

it("a value that arrives while the Float control is dragged does not move it, and the release commits where the drag ended", async () => {
  const bound = await boundFloatNumber();
  expect(bound.words()).toBe("0.5");
  bound.pointer("pointerdown", 100);
  bound.pointer("pointermove", 120);
  bound.inputValues.takeTheInputValues("/projects/demo", valuesOfTheGain(0.1));
  await bound.settled();
  expect(bound.words()).toBe("0.7");
  bound.pointer("pointerup", 120);
  await bound.settled();
  expect(bound.sent).toEqual([
    { value: 0.7, mode: "live" },
    { value: 0.7, mode: "commit" },
  ]);
  expect(bound.words()).toBe("0.7");
});

it("Escape while the Float control is dragged puts its number back and commits nothing, and the press's release sends nothing more", async () => {
  const bound = await boundFloatNumber();
  bound.pointer("pointerdown", 100);
  bound.pointer("pointermove", 140);
  await bound.settled();
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  bound.pointer("pointermove", 160);
  bound.pointer("pointerup", 160);
  await bound.settled();
  expect(bound.words()).toBe("0.5");
  expect(bound.sent).toEqual([
    { value: 0.9, mode: "live" },
    { value: null, mode: "live" },
  ]);
});
