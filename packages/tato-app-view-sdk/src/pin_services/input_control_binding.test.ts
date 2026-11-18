// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import type { InputAddress } from "../pin_model/node_inputs.js";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiSurface } from "../node_ui/input_control_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "../node_ui/node_ui_elements_listing.js";
import { listedElementOf } from "../node_ui/test_fixtures/node_ui_listing_fixtures.js";
import type { GraphEditMode, JsonValue, StreamInputValuesReading } from "../studio_readings.js";
import { createInputControlBinder, type InputControlShown } from "./input_control_binding.js";
import { createInputValues } from "./input_values.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const GAIN: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "MIX-ID", input: "gain" };
const FLOAT_GAIN: ControlledInput = { address: GAIN, declaration: { input_name: "gain", label: "gain", pin_type: { type: "float" }, annotations: {}, may_be_unset: false } };
const FLOAT_DEFAULT = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts" });
const STAND_IN_TAG = "stand-in-float-control";

/** A Float control as the binder meets one: it keeps what it is handed, and a press the host makes read only puts its value back with an `input` and no `change`. */
class StandInFloatControl extends HTMLElement implements InputControlElement<"float"> {
  pinsHanded: ControlledPin<"float">[] = [];
  valuesHanded: number[] = [];
  shownValue = 0;
  #pressStartedAt: number | null = null;
  set pin(pin: ControlledPin<"float">) {
    this.pinsHanded.push(pin);
  }
  set value(value: number) {
    this.valuesHanded.push(value);
    this.shownValue = value;
  }
  set state(state: InputControlState) {
    if (state === "editable" || this.#pressStartedAt === null) return;
    const startedAt = this.#pressStartedAt;
    this.#pressStartedAt = null;
    this.shownValue = startedAt;
    fireInputControlEvent(this, "input", startedAt);
  }
  dragTo(value: number): void {
    this.#pressStartedAt ??= this.shownValue;
    this.shownValue = value;
    fireInputControlEvent(this, "input", value);
  }
  release(): void {
    if (this.#pressStartedAt === null) return;
    this.#pressStartedAt = null;
    fireInputControlEvent(this, "change", this.shownValue);
  }
  commitTyped(value: number): void {
    this.shownValue = value;
    fireInputControlEvent(this, "change", value);
  }
}
customElements.define(STAND_IN_TAG, StandInFloatControl);

function valuesRead(gain: JsonValue, comesFrom: "saved" | "default" | "live" = "saved"): StreamInputValuesReading {
  return { kind: "values", stream_asset: STREAM_ASSET, values: [{ level: [], node_id: "MIX-ID", input: "gain", value_read: { value: gain, comes_from: comesFrom } }] };
}

/** A binder over a store whose every write applies at once, with the listing, the loads and the flushes in the test's hands. */
function binderUnderTest({ loading = { kind: "defined", tag: STAND_IN_TAG }, surface = "node" }: { loading?: NodeUiElementLoading; surface?: NodeUiSurface } = {}) {
  const sent: { value: JsonValue | null; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.5));
  const listingListeners = new Set<(reading: NodeUiElementsReading) => void>();
  const loadsAsked: ListedNodeUiElement[] = [];
  const flushes: (() => void)[] = [];
  const binder = createInputControlBinder({
    watchNodeUiElements: (listener) => {
      listingListeners.add(listener);
      return () => listingListeners.delete(listener);
    },
    inputValues,
    loadElement: (listed) => {
      loadsAsked.push(listed);
      return Promise.resolve(loading);
    },
    requestAFlush: (flush) => flushes.push(flush),
  });
  const list = (elements: readonly ListedNodeUiElement[]) => {
    for (const listener of listingListeners) listener({ elements });
  };
  const flush = () => {
    for (const each of flushes.splice(0)) each();
  };
  const host = document.createElement("div");
  document.body.append(host);
  const shown: InputControlShown[] = [];
  const binding = binder.bindInputControl(host, FLOAT_GAIN, { surface, read_only: false }, (each) => shown.push(each));
  const control = (): StandInFloatControl => {
    const element = host.firstElementChild;
    if (!(element instanceof StandInFloatControl)) throw new Error("the slot holds no control");
    return element;
  };
  const settled = async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  };
  return { inputValues, sent, binding, host, shown, list, flush, control, settled, loadsAsked, listingListeners };
}

afterEach(() => {
  document.body.replaceChildren();
});

test("a slot holds nothing until the listing arrives, then the element the table picks, handed its pin, state and value before it is connected", async () => {
  const slot = binderUnderTest();
  expect(slot.shown).toEqual(["pending"]);
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  expect(slot.loadsAsked).toEqual([FLOAT_DEFAULT]);
  expect(slot.shown).toEqual(["pending", "element"]);
  const control = slot.control();
  expect(control.pinsHanded.map((pin) => [pin.declaration, pin.surface])).toEqual([[FLOAT_GAIN.declaration, "node"]]);
  expect(control.valuesHanded).toEqual([0.5]);
  expect([control.getAttribute("data-surface"), control.getAttribute("data-state")]).toEqual(["node", "editable"]);
});

test("a drag sends each move live and its release one commit, and a value that arrives mid-drag is not set on the control", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  control.dragTo(0.6);
  control.dragTo(0.7);
  await slot.settled();
  slot.inputValues.takeTheInputValues(PROJECT, valuesRead(0.1));
  slot.flush();
  expect(control.valuesHanded).toEqual([0.5]);
  control.dragTo(0.8);
  control.release();
  await slot.settled();
  expect(slot.sent).toEqual([
    { value: 0.6, mode: "live" },
    { value: 0.7, mode: "live" },
    { value: 0.8, mode: "live" },
    { value: 0.8, mode: "commit" },
  ]);
  slot.flush();
  expect(control.valuesHanded.at(-1)).toBe(0.8);
});

test("in Perform a drag sends each move live and its release live too, so nothing is committed, and Escape puts back the live value it began at", async () => {
  const slot = binderUnderTest({ surface: "perform" });
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  expect(control.pinsHanded.map((pin) => pin.surface)).toEqual(["perform"]);
  control.dragTo(0.6);
  control.release();
  await slot.settled();
  control.dragTo(0.9);
  await slot.settled();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await slot.settled();
  expect(slot.sent).toEqual([
    { value: 0.6, mode: "live" },
    { value: 0.6, mode: "live" },
    { value: 0.9, mode: "live" },
    { value: 0.6, mode: "live" },
  ]);
});

test("a lone change is a whole gesture: one commit and no live value", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  slot.control().commitTyped(0.25);
  await slot.settled();
  expect(slot.sent).toEqual([{ value: 0.25, mode: "commit" }]);
});

test("Escape during a drag cancels it: the live value is taken off, the control's press ends, its value is set back and nothing is committed", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  control.dragTo(0.9);
  await slot.settled();
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.body.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  control.release();
  await slot.settled();
  slot.flush();
  expect(slot.sent).toEqual([
    { value: 0.9, mode: "live" },
    { value: null, mode: "live" },
  ]);
  expect(slot.inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  expect(control.shownValue).toBe(0.5);
});

test("after Escape, a change the element still fires as its press ends commits nothing, and the next press is acted on again", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  control.dragTo(0.9);
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  fireInputControlEvent(control, "change", 0.9);
  await slot.settled();
  expect(slot.sent).toEqual([
    { value: 0.9, mode: "live" },
    { value: null, mode: "live" },
  ]);
  slot.host.dispatchEvent(new Event("pointerdown"));
  control.commitTyped(0.25);
  await slot.settled();
  expect(slot.sent.at(-1)).toEqual({ value: 0.25, mode: "commit" });
});

test("a press the pointer gives up cancels the gesture it opened", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  slot.control().dragTo(0.9);
  slot.host.dispatchEvent(new Event("pointercancel"));
  await slot.settled();
  expect(slot.sent.map((write) => write.mode)).toEqual(["live", "live"]);
  expect(slot.sent.at(-1)?.value).toBeNull();
});

test("an update that keeps the declaration keeps the element, and read only it acts on no event; a changed declaration mounts a new element", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const first = slot.control();
  slot.binding.update({ ...FLOAT_GAIN }, { surface: "node", read_only: true });
  expect(slot.control()).toBe(first);
  expect(first.getAttribute("data-state")).toBe("read_only");
  first.commitTyped(0.3);
  await slot.settled();
  expect(slot.sent).toEqual([]);
  slot.binding.update({ ...FLOAT_GAIN, declaration: { ...FLOAT_GAIN.declaration, label: "Gain" } }, { surface: "node", read_only: false });
  await slot.settled();
  expect(slot.control()).not.toBe(first);
  expect(first.isConnected).toBe(false);
});

test("an input the table has no control for shows no control, and an element that does not load shows the read-only line with why", async () => {
  const noControl = binderUnderTest();
  noControl.list([]);
  expect(noControl.shown).toEqual(["pending", "no_control"]);
  expect(noControl.host.childElementCount).toBe(0);
  const blocked = binderUnderTest({ loading: { kind: "blocked", findings: ["float_number.ts:3:1 TS2322"] } });
  blocked.list([FLOAT_DEFAULT]);
  await blocked.settled();
  expect(blocked.shown.at(-1)).toBe("read_only_line");
  expect(blocked.host.firstElementChild?.shadowRoot?.querySelector("[part=because]")?.textContent).toBe("Its control does not pass its checks: float_number.ts:3:1 TS2322");
});

test("unbinding the last slot takes its element off and stops watching the listing", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  slot.binding.unbind();
  expect(slot.host.childElementCount).toBe(0);
  expect(slot.listingListeners.size).toBe(0);
});

test("a_surfaces_own_field_shows_the_stores_value_and_writes_a_whole_gesture_and_a_clear_each_as_one_commit_through_the_one_sender", async () => {
  const sent: { value: JsonValue | null; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.5));
  const binder = createInputControlBinder({ watchNodeUiElements: () => () => undefined, inputValues });
  const field = binder.bindOwnField(GAIN, "commit");
  const valuesShown: JsonValue[] = [];
  field.watchValue((shown) => valuesShown.push(shown.value));
  expect(field.shownValue()).toEqual({ value: 0.5, comes_from: "saved" });

  field.beginGesture().release({ gain: [1, 2] });
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  field.clear();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(sent).toEqual([
    { value: { gain: [1, 2] }, mode: "commit" },
    { value: null, mode: "commit" },
  ]);
  expect(valuesShown).toEqual([0.5, { gain: [1, 2] }, null]);
});

test("a_surfaces_own_field_bound_live_sends_its_gesture_and_its_clear_live_and_shows_the_refusal_of_its_last_write", async () => {
  const sent: { value: JsonValue | null; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve(
        sent.length === 2
          ? { kind: "not_sent", because: "the stream is stopped" }
          : { kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } },
      );
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.5));
  const binder = createInputControlBinder({ watchNodeUiElements: () => () => undefined, inputValues });
  const field = binder.bindOwnField(GAIN, "live");
  const refusals: (string | null)[] = [];
  field.watchRefusal((refusal) => refusals.push(refusal));

  const gesture = field.beginGesture();
  gesture.move(0.6);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  gesture.release(0.7);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.6, "live"));
  field.clear();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(sent).toEqual([
    { value: 0.6, mode: "live" },
    { value: 0.7, mode: "live" },
    { value: null, mode: "live" },
  ]);
  expect(refusals).toEqual([null, "the stream is stopped", null]);
});
