// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import type { InputAddress } from "../pin_model/node_inputs.js";
import { fireInputControlCancel, fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiSurface } from "../node_ui/input_control_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "../node_ui/node_ui_elements_listing.js";
import { NO_PROJECT, listedElementOf } from "../node_ui/test_fixtures/node_ui_listing_fixtures.js";
import type { GraphEditMode, JsonValue, StreamInputValuesReading } from "../studio_readings.js";
import type { PinType } from "../pin_types.js";
import { createInputControlBinder, BLOCKED_REGISTRATION_ATTRIBUTE, releaseOfAGestureOn, type InputControlShown } from "./input_control_binding.js";
import { createInputValues } from "./input_values.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const GAIN: InputAddress = { graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "MIX-ID", input: "gain", member: null };
const FLOAT_GAIN: ControlledInput = { address: GAIN, declaration: { input_name: "gain", label: "gain", pin_type: { type: "float" }, annotations: {}, may_be_unset: false }, rebuilds_its_node: false, driven_by: null };
const FLOAT_DEFAULT = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts" });
const STAND_IN_TAG = "stand-in-float-control";
const KNOB_GAIN: ControlledInput = { ...FLOAT_GAIN, declaration: { ...FLOAT_GAIN.declaration, annotations: { control: "night-show:knob" } } };
const NIGHT_SHOWS_KNOB = listedElementOf("night-show", { kind: "control", type: "float", control: "knob" }, { script: "knob.ts", folder_version: "v1" });

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
  return { kind: "values", stream_asset: STREAM_ASSET, values: [{ level: [], node_id: "MIX-ID", input: "gain", member: null, value_read: { value: gain, comes_from: comesFrom } }] };
}

/** A binder over a store whose every write applies at once, with the listing, the loads and the flushes in the test's hands. */
function binderUnderTest({ loading = { kind: "defined", tag: STAND_IN_TAG }, surface = "node", input = FLOAT_GAIN }: { loading?: NodeUiElementLoading; surface?: NodeUiSurface; input?: ControlledInput } = {}) {
  const sent: { value: unknown; mode: GraphEditMode }[] = [];
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
    project: NO_PROJECT,
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
  const binding = binder.bindInputControl(host, input, { surface, read_only: false }, (each) => shown.push(each));
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

test("the control's own cancel ends the gesture it opened with nothing committed, and the stored value is set back on it", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  control.dragTo(0.9);
  control.dragTo(0.95);
  fireInputControlCancel(control);
  await slot.settled();
  slot.flush();
  expect(slot.sent.map((write) => write.mode)).not.toContain("commit");
  expect(slot.sent.at(-1)).toEqual({ value: null, mode: "live" });
  expect(slot.inputValues.shownValue(GAIN)).toEqual({ value: 0.5, comes_from: "saved" });
  expect(control.shownValue).toBe(0.5);
});

test("a native cancel, and a control's cancel with no gesture open, are not acted on", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  const control = slot.control();
  fireInputControlCancel(control);
  control.dragTo(0.9);
  control.dispatchEvent(new Event("cancel"));
  control.release();
  await slot.settled();
  expect(slot.sent).toEqual([
    { value: 0.9, mode: "live" },
    { value: 0.9, mode: "commit" },
  ]);
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

test("a drawn control whose newer version is blocked stays drawn and marked with why, and a version that passes takes the mark off with a new element", async () => {
  const knob = NIGHT_SHOWS_KNOB;
  const findings = ["Tato Studio keeps showing the version that last passed.", "node_ui/knob.ts:1:50: error: Type 'string' is not assignable to type 'number'. (TS2322)"];
  const slot = binderUnderTest({ input: KNOB_GAIN });
  slot.list([knob]);
  await slot.settled();
  const drawn = slot.control();

  slot.list([{ ...knob, script_serving: { kind: "blocked", findings } }]);
  await slot.settled();
  expect(slot.control()).toBe(drawn);
  expect(slot.loadsAsked).toHaveLength(1);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(true);
  expect(slot.host.title).toBe(findings.join("\n"));
  drawn.commitTyped(0.3);
  await slot.settled();
  expect(slot.sent).toEqual([{ value: 0.3, mode: "commit" }]);

  slot.list([{ ...knob, folder_version: "v3", script_serving: { kind: "served", script_url: "tatolab-app://app/node_ui/night-show/knob.js?v3" } }]);
  await slot.settled();
  expect(slot.control()).not.toBe(drawn);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(false);
});

test("a project's default for a built-in type is passed over with the runtime's finding on the slot, the Studio's control still drawing; taking the entry out takes the mark off", async () => {
  const finding = "`controls[0]` registers the default control of `float`, a built-in type: only the Studio's own module may register it.";
  const nightShowsFloatDefault = listedElementOf("night-show", { kind: "control", type: "float", control: null }, { script: "fader.ts", script_serving: { kind: "blocked", findings: [finding] } });
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT, nightShowsFloatDefault]);
  await slot.settled();
  const drawn = slot.control();
  expect(slot.loadsAsked).toEqual([FLOAT_DEFAULT]);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(true);
  expect(slot.host.title).toBe(`night-show's fader.ts does not pass its checks: ${finding}`);

  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  expect(slot.control()).toBe(drawn);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(false);
  expect(slot.host.title).toBe("");
});

test("a control an annotation picks is not marked for its type's defaults passed over", async () => {
  const nightShowsFloatDefault = listedElementOf("night-show", { kind: "control", type: "float", control: null }, { script_serving: { kind: "blocked", findings: ["default_control_not_the_modules_to_register"] } });
  const slot = binderUnderTest({ input: KNOB_GAIN });
  slot.list([FLOAT_DEFAULT, NIGHT_SHOWS_KNOB, nightShowsFloatDefault]);
  await slot.settled();
  expect(slot.loadsAsked).toEqual([NIGHT_SHOWS_KNOB]);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(false);
});

test("a slot with no control drawn yet whose element is blocked shows the read-only line, unmarked, and never another control", async () => {
  const knob: ListedNodeUiElement = { ...NIGHT_SHOWS_KNOB, script_serving: { kind: "blocked", findings: ["node_ui/knob.ts:1:50 TS2322"] } };
  const slot = binderUnderTest({ loading: { kind: "blocked", findings: ["node_ui/knob.ts:1:50 TS2322"] }, input: KNOB_GAIN });
  slot.list([FLOAT_DEFAULT, knob]);
  await slot.settled();

  expect(slot.shown.at(-1)).toBe("read_only_line");
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(false);
});

test("unbinding the last slot takes its element off and stops watching the listing", async () => {
  const slot = binderUnderTest();
  slot.list([FLOAT_DEFAULT]);
  await slot.settled();
  slot.binding.unbind();
  expect(slot.host.childElementCount).toBe(0);
  expect(slot.listingListeners.size).toBe(0);
});

test("a_surfaces_reading_of_an_input_shows_the_stores_value_and_sends_its_clear_as_one_commit_through_the_one_sender", async () => {
  const sent: { value: unknown; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.5));
  const binder = createInputControlBinder({ watchNodeUiElements: () => () => undefined, inputValues, project: NO_PROJECT });
  const reading = binder.bindInputValue(GAIN, "commit");
  const valuesShown: JsonValue[] = [];
  reading.watchValue((shown) => valuesShown.push(shown.value));
  expect(reading.shownValue()).toEqual({ value: 0.5, comes_from: "saved" });

  reading.clear();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(sent).toEqual([{ value: null, mode: "commit" }]);
  expect(valuesShown).toEqual([0.5, null]);
});

test("a_surfaces_reading_of_an_input_bound_live_sends_its_clear_live_and_shows_the_refusal_of_its_last_write", async () => {
  const sent: { value: unknown; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "not_sent", because: "the stream is stopped" });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(PROJECT, valuesRead(0.6, "live"));
  const binder = createInputControlBinder({ watchNodeUiElements: () => () => undefined, inputValues, project: NO_PROJECT });
  const reading = binder.bindInputValue(GAIN, "live");
  const refusals: (string | null)[] = [];
  reading.watchRefusal((refusal) => refusals.push(refusal));

  reading.clear();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(sent).toEqual([{ value: null, mode: "live" }]);
  expect(refusals).toEqual([null, "the stream is stopped"]);
});

/** A Trigger control as the binder meets one: each press is a `change` carrying no value. */
class StandInTriggerControl extends HTMLElement implements InputControlElement<"trigger"> {
  pinsHanded: ControlledPin<"trigger">[] = [];
  set pin(pin: ControlledPin<"trigger">) {
    this.pinsHanded.push(pin);
  }
  set value(_value: null) {}
  set state(_state: InputControlState) {}
  press(): void {
    fireInputControlEvent(this, "change", null);
  }
}
customElements.define("stand-in-trigger-control", StandInTriggerControl);

test("each press of a Trigger's control fires it once, live on every surface and never as a commit, and the control reaches the input's project", async () => {
  const sent: { operation: unknown; mode: GraphEditMode }[] = [];
  const previewsAsked: [string, string][] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      sent.push(...operations.map((operation) => ({ operation, mode: sending.mode })));
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  const binder = createInputControlBinder({
    watchNodeUiElements: (listener) => (listener({ elements: [listedElementOf("studio", { kind: "control", type: "trigger", control: null }, { script: "trigger_button.ts" })] }), () => undefined),
    inputValues,
    project: {
      ...NO_PROJECT,
      readAssetPreviewInTheProject: (projectFolder, asset) => {
        previewsAsked.push([projectFolder, asset]);
        return Promise.resolve({ kind: "not_read", because: "no preview here" });
      },
    },
    loadElement: () => Promise.resolve({ kind: "defined", tag: "stand-in-trigger-control" }),
    requestAFlush: (flush) => flush(),
  });
  const FLASH: ControlledInput = { address: { ...GAIN, node_id: "FLASH-ID", input: "flash" }, declaration: { input_name: "flash", label: "flash", pin_type: { type: "trigger" }, annotations: {}, may_be_unset: false }, rebuilds_its_node: false, driven_by: null };
  const host = document.createElement("div");
  document.body.append(host);
  binder.bindInputControl(host, FLASH, { surface: "properties", read_only: false });
  const control = await vi.waitFor(() => (host.firstElementChild instanceof StandInTriggerControl ? host.firstElementChild : expect.unreachable("no control yet")));
  control.press();
  control.press();
  fireInputControlEvent(control, "input", null);
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  expect(sent).toEqual([
    { operation: { operation: "set_node_input_value", stream: STREAM_ASSET, node: "FLASH-ID", input: "flash", value: null }, mode: "live" },
    { operation: { operation: "set_node_input_value", stream: STREAM_ASSET, node: "FLASH-ID", input: "flash", value: null }, mode: "live" },
  ]);
  await control.pinsHanded[0]?.studio.readAssetPreview("an-asset");
  expect(previewsAsked).toEqual([[PROJECT, "an-asset"]]);
});

/** A Pin type choice's control as the binder meets one: it keeps the types it is handed, and a pick is one `change` carrying the whole type. */
class StandInTypeChoiceControl extends HTMLElement implements InputControlElement<"pin_type_choice"> {
  typesHanded: PinType[] = [];
  set pin(_pin: ControlledPin<"pin_type_choice">) {}
  set value(pinType: PinType) {
    this.typesHanded.push(pinType);
  }
  set state(_state: InputControlState) {}
  pick(pinType: PinType): void {
    fireInputControlEvent(this, "change", pinType);
  }
}
customElements.define("stand-in-type-choice-control", StandInTypeChoiceControl);

test("a Pin type choice's control is handed the type its input saves, and a type picked in it is committed whole, and one it does not offer is not", async () => {
  const PIN_TYPE: ControlledInput = { address: GAIN, declaration: { input_name: "pin_type", label: "pin_type", pin_type: { type: "pin_type_choice" }, annotations: {}, may_be_unset: false }, rebuilds_its_node: true, driven_by: null };
  const slot = binderUnderTest({ loading: { kind: "defined", tag: "stand-in-type-choice-control" }, surface: "properties", input: PIN_TYPE });
  slot.inputValues.takeTheInputValues(PROJECT, valuesRead({ type: "float" }));
  slot.list([listedElementOf("studio", { kind: "control", type: "pin_type_choice", control: null }, { script: "type_choice.ts" })]);
  await slot.settled();
  const control = slot.host.firstElementChild;
  if (!(control instanceof StandInTypeChoiceControl)) return expect.unreachable("the slot holds no type choice");
  expect(control.typesHanded).toEqual([{ type: "float" }]);
  control.pick({ type: "integer" });
  control.pick({ type: "pin_type_choice" });
  await slot.settled();
  expect(slot.sent).toEqual([{ value: { type: "integer" }, mode: "commit" }]);
});

test("a_gesture_on_a_setting_that_rebuilds_its_node_ends_as_a_commit_alone_on_every_surface", () => {
  expect(releaseOfAGestureOn("perform", { rebuilds_its_node: true })).toBe("commit_alone");
  expect(releaseOfAGestureOn("node", { rebuilds_its_node: true })).toBe("commit_alone");
  expect(releaseOfAGestureOn("perform", { rebuilds_its_node: false })).toBe("live");
  expect(releaseOfAGestureOn("properties", { rebuilds_its_node: false })).toBe("commit");
});
