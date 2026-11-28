// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import type { NodeOfABody } from "../pin_model/controlled_inputs.js";
import type { InputAddress } from "../pin_model/node_inputs.js";
import { fireNodeBodyEvent, type DrawnNode, type NodeBodyElement, type NodeBodyInputs } from "../node_ui/node_body_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "../node_ui/node_ui_elements_listing.js";
import { ReadOnlyValueLineElement } from "../node_ui/read_only_value_line_element.js";
import { NO_PROJECT, listedElementOf } from "../node_ui/test_fixtures/node_ui_listing_fixtures.js";
import type { GraphEditMode, JsonValue, StreamInputValuesReading } from "../studio_readings.js";
import { createInputControlBinder, BLOCKED_REGISTRATION_ATTRIBUTE } from "./input_control_binding.js";
import { createInputValues } from "./input_values.js";
import type { NodeBodyShown } from "./node_body_binding.js";

const PROJECT = "/projects/demo";
const STREAM_ASSET = "11111111-2222-3333-4444-555555555555";
const CROSSFADE = "nodes.crossfade:Crossfade";
const addressOf = (input: string): InputAddress => ({ graph: { project_folder: PROJECT, stream_asset: STREAM_ASSET, level: [] }, node_id: "FADE-ID", input, member: null });
const declarationOf = (input: string, pinType: { type: "float" } | { type: "string" }) => ({ input_name: input, label: input, pin_type: pinType, annotations: {}, may_be_unset: false });

/** A crossfade whose `mix` is set by a person and whose `caption` is fed by a wire. */
const CROSSFADE_NODE: NodeOfABody = {
  node_type: CROSSFADE,
  project_folder: PROJECT,
  inputs: [
    { declaration: declarationOf("mix", { type: "float" }), value_address: addressOf("mix"), wiring: { kind: "unwired", because: "Nothing is wired into mix." } },
    {
      declaration: declarationOf("caption", { type: "string" }),
      value_address: null,
      wiring: { kind: "wired", target: { stream: STREAM_ASSET, node_id: "TITLE-ID", port: "text" }, wired_from_words: "title › text" },
    },
    { declaration: declarationOf("gain", { type: "float" }), value_address: addressOf("gain"), wiring: null },
  ],
};
const CROSSFADE_BODY = listedElementOf("acme", { kind: "node_body", node_type: CROSSFADE }, { script: "crossfade_body.ts" });
const STAND_IN_TAG = "stand-in-crossfade-body";
const MISFIT_TAG = "stand-in-misfit-body";

/** A crossfade body as the binder meets one: it keeps what it is handed and fires what the test asks of it. */
class StandInCrossfadeBody extends HTMLElement implements NodeBodyElement<typeof StandInCrossfadeBody.inputTypes> {
  static readonly inputTypes = { mix: "float", caption: "string" } as const;
  nodesHanded: DrawnNode<typeof StandInCrossfadeBody.inputTypes>[] = [];
  inputsHanded: NodeBodyInputs<typeof StandInCrossfadeBody.inputTypes>[] = [];
  set node(node: DrawnNode<typeof StandInCrossfadeBody.inputTypes>) {
    this.nodesHanded.push(node);
  }
  set inputs(inputs: NodeBodyInputs<typeof StandInCrossfadeBody.inputTypes>) {
    this.inputsHanded.push(inputs);
  }
}
customElements.define(STAND_IN_TAG, StandInCrossfadeBody);

/** A body that states a `mix` of another type than the node's. */
class StandInMisfitBody extends HTMLElement {
  static readonly inputTypes = { mix: "integer", level: "float" } as const;
  node: unknown = null;
  inputs: unknown = null;
}
customElements.define(MISFIT_TAG, StandInMisfitBody);

function valuesRead(mix: JsonValue): StreamInputValuesReading {
  return { kind: "values", stream_asset: STREAM_ASSET, values: [{ level: [], node_id: "FADE-ID", input: "mix", member: null, value_read: { value: mix, comes_from: "saved" } }] };
}

/** A binder over a store whose every write applies at once, with one body slot bound for the crossfade, and the listing, the loads and the flushes in the test's hands. */
function bodySlotUnderTest({ loading = { kind: "defined", tag: STAND_IN_TAG }, readOnly = false }: { loading?: NodeUiElementLoading; readOnly?: boolean } = {}) {
  const sent: { input: string; value: unknown; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ input: operation.input, value: operation.value ?? null, mode: sending.mode });
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
  const host = document.createElement("div");
  document.body.append(host);
  const shown: NodeBodyShown[] = [];
  const binding = binder.bindNodeBody(host, CROSSFADE_NODE, readOnly, (each) => shown.push(each));
  const body = (): StandInCrossfadeBody => {
    const element = host.firstElementChild;
    if (!(element instanceof StandInCrossfadeBody)) throw new Error("the slot holds no body");
    return element;
  };
  return {
    inputValues,
    sent,
    binding,
    host,
    shown,
    body,
    loadsAsked,
    listingListeners,
    list: (elements: readonly ListedNodeUiElement[]) => {
      for (const listener of listingListeners) listener({ elements });
    },
    flush: () => {
      for (const each of flushes.splice(0)) each();
    },
    settled: async () => {
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

test("a body slot shows nothing until the listing arrives, then the body its node type registers, handed the declaration of each input it states and each of those inputs before it is connected", async () => {
  const slot = bodySlotUnderTest();
  expect(slot.shown).toEqual(["pending"]);
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  expect(slot.loadsAsked).toEqual([CROSSFADE_BODY]);
  expect(slot.shown).toEqual(["pending", "body"]);
  const body = slot.body();
  expect(body.nodesHanded.map(({ node_type, declarations, surface }) => ({ node_type, declarations, surface }))).toEqual([
    { node_type: CROSSFADE, declarations: { mix: declarationOf("mix", { type: "float" }), caption: declarationOf("caption", { type: "string" }) }, surface: "node" },
  ]);
  expect(body.inputsHanded).toEqual([
    {
      mix: { state: "editable", value: 0.5 },
      caption: { state: "driven_by_wire", value: null },
    },
  ]);

  slot.inputValues.takeTheInputValues(PROJECT, valuesRead(0.75));
  slot.flush();
  expect(body.inputsHanded.at(-1)).toEqual({ mix: { state: "editable", value: 0.75 }, caption: { state: "driven_by_wire", value: null } });
});

test("a drag on an input of the body sends each move live and its release one commit, and while it is open the body keeps the value it fired, not one that arrives", async () => {
  const slot = bodySlotUnderTest();
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  const body = slot.body();
  fireNodeBodyEvent(body, "input", "mix", 0.6);
  await slot.settled();
  slot.inputValues.takeTheInputValues(PROJECT, valuesRead(0.1));
  slot.flush();
  expect(body.inputsHanded.at(-1)?.mix).toEqual({ state: "editable", value: 0.6 });
  fireNodeBodyEvent(body, "input", "mix", 0.7);
  fireNodeBodyEvent(body, "change", "mix", 0.7);
  await slot.settled();
  expect(slot.sent).toEqual([
    { input: "mix", value: 0.6, mode: "live" },
    { input: "mix", value: 0.7, mode: "live" },
    { input: "mix", value: 0.7, mode: "commit" },
  ]);
  slot.flush();
  expect(body.inputsHanded.at(-1)?.mix).toEqual({ state: "editable", value: 0.7 });
});

test("a lone change is one commit, and nothing is sent for an input fed by its wire, an input the body does not state, a value of another type, or a slot that cannot be edited", async () => {
  const slot = bodySlotUnderTest();
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  const body = slot.body();
  fireNodeBodyEvent(body, "change", "mix", 0.25);
  body.dispatchEvent(new CustomEvent("change", { detail: { input: "caption", value: "words" } }));
  body.dispatchEvent(new CustomEvent("change", { detail: { input: "gain", value: 2 } }));
  body.dispatchEvent(new CustomEvent("change", { detail: { input: "mix", value: "loud" } }));
  body.dispatchEvent(new Event("change"));
  await slot.settled();
  expect(slot.sent).toEqual([{ input: "mix", value: 0.25, mode: "commit" }]);

  slot.binding.update(CROSSFADE_NODE, true);
  await slot.settled();
  expect(slot.body().inputsHanded.at(-1)?.mix).toEqual({ state: "read_only", value: 0.25 });
  fireNodeBodyEvent(slot.body(), "change", "mix", 0.9);
  await slot.settled();
  expect(slot.sent).toHaveLength(1);
});

test("Escape during a drag cancels it, and a change the body still fires as its press ends commits nothing until the next press", async () => {
  const slot = bodySlotUnderTest();
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  const body = slot.body();
  fireNodeBodyEvent(body, "input", "mix", 0.9);
  await slot.settled();
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.body.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  fireNodeBodyEvent(body, "change", "mix", 0.9);
  await slot.settled();
  slot.flush();
  expect(slot.sent).toEqual([
    { input: "mix", value: 0.9, mode: "live" },
    { input: "mix", value: null, mode: "live" },
  ]);
  expect(body.inputsHanded.at(-1)?.mix).toEqual({ state: "editable", value: 0.5 });

  slot.host.dispatchEvent(new Event("pointerdown"));
  fireNodeBodyEvent(body, "change", "mix", 0.3);
  await slot.settled();
  expect(slot.sent.at(-1)).toEqual({ input: "mix", value: 0.3, mode: "commit" });
});

test("a node type with no body, and a body that did not pass its checks, show no body and load nothing, so the card draws its rows alone", async () => {
  const slot = bodySlotUnderTest();
  slot.list([listedElementOf("acme", { kind: "node_body", node_type: "nodes.fader:Fader" })]);
  await slot.settled();
  expect(slot.shown).toEqual(["pending", "no_body"]);

  slot.list([listedElementOf("acme", { kind: "node_body", node_type: CROSSFADE }, { script_serving: { kind: "blocked", findings: ["crossfade_body.ts:3:1 TS2322"], runtime_findings: [] } })]);
  await slot.settled();
  expect(slot.loadsAsked).toEqual([]);
  expect(slot.host.childElementCount).toBe(0);
});

test("a drawn body whose newer version is blocked stays drawn and marked with why", async () => {
  const findings = ["Tato Studio keeps showing the version that last passed.", "node_ui/crossfade_body.ts:3:1: error: TS2322"];
  const slot = bodySlotUnderTest();
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  const drawn = slot.body();

  slot.list([{ ...CROSSFADE_BODY, script_serving: { kind: "blocked", findings, runtime_findings: [] } }]);
  await slot.settled();
  expect(slot.body()).toBe(drawn);
  expect(slot.loadsAsked).toHaveLength(1);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(true);
  expect(slot.host.title).toBe(findings.join("\n"));

  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  expect(slot.body()).toBe(drawn);
  expect(slot.host.hasAttribute(BLOCKED_REGISTRATION_ATTRIBUTE)).toBe(false);
});

test("a body whose inputTypes do not fit the node, and one that does not load, are the read-only line with why", async () => {
  const misfit = bodySlotUnderTest({ loading: { kind: "defined", tag: MISFIT_TAG } });
  misfit.list([CROSSFADE_BODY]);
  await misfit.settled();
  expect(misfit.shown.at(-1)).toBe("read_only_line");
  const line = misfit.host.firstElementChild;
  expect(line).toBeInstanceOf(ReadOnlyValueLineElement);
  expect(line?.shadowRoot?.querySelector("[part=because]")?.textContent).toBe(
    `The body draws mix as integer, where its mix is float; level as float, which it has no typed input named, so it does not draw a node of ${CROSSFADE}.`,
  );

  const notLoaded = bodySlotUnderTest({ loading: { kind: "not_loaded", because: "acme · node_ui/crossfade_body.ts does not load: 404" } });
  notLoaded.list([CROSSFADE_BODY]);
  await notLoaded.settled();
  expect(notLoaded.shown.at(-1)).toBe("read_only_line");
});

test("unbinding the body takes it off and stops watching the listing", async () => {
  const slot = bodySlotUnderTest();
  slot.list([CROSSFADE_BODY]);
  await slot.settled();
  slot.binding.unbind();
  expect(slot.host.childElementCount).toBe(0);
  expect(slot.listingListeners.size).toBe(0);
});
