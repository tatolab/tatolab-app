// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountedWindowOverTheMock, coreViewPage, cleanUpTheWindowsOfEarlierTests, PATTERN_MAIN_STREAM, tagOfTheStudiosFloatControl } from "./tatolab_window_view_test_support";
import type { TatolabBackend } from "./backend/tatolab_backend";

vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

/** A Float control as a person drives one, standing in for the Studio's own, which its package's tests bind and drag. */
class StandInFloatControl extends HTMLElement implements InputControlElement<"float"> {
  set pin(_pin: ControlledPin<"float">) {}
  set value(value: number) {
    this.textContent = String(value);
  }
  set state(_state: InputControlState) {}
  commitTyped(value: number): void {
    this.textContent = String(value);
    fireInputControlEvent(this, "change", value);
  }
}

/** The same stand-in under the tag of the Studio's Float slider, which draws a Float input whose range has both ends. */
class StandInFloatSlider extends StandInFloatControl {}

customElements.define(tagOfTheStudiosFloatControl(null), StandInFloatControl);
customElements.define(tagOfTheStudiosFloatControl("slider"), StandInFloatSlider);

afterEach(cleanUpTheWindowsOfEarlierTests);

/** Waits as long as a frame takes to list, load and bind its controls over the mock. */
const AS_LONG_AS_A_FRAME_BINDS = { timeout: 5_000 };

const properties = () => coreViewPage("properties");
const streamGraph = () => coreViewPage("stream_graph", "stream-graph");

/** Selects the card `nodeName` in the Stream graph and waits for Properties to show its node. */
async function selectInTheStreamGraph(nodeName: string): Promise<void> {
  fireEvent.click(await waitFor(() => streamGraph().querySelector<HTMLElement>(`[data-node-graph-card="${nodeName}"]`) ?? expect.unreachable(`no ${nodeName} card`), AS_LONG_AS_A_FRAME_BINDS));
  await waitFor(() => expect(properties().querySelector(`[data-properties-of-node="${nodeName}"]`)).not.toBeNull(), AS_LONG_AS_A_FRAME_BINDS);
}

/** Properties' row of the selected node's input `input`. */
function inputRow(input: string): HTMLElement {
  return properties().querySelector<HTMLElement>(`[data-properties-section="inputs"] [data-properties-port="${input}"]`) ?? expect.unreachable(`no ${input} row in Properties' Inputs`);
}

/** The Float control Properties draws on the row of `input`, or `null` while it draws none. */
function controlOnTheRow(input: string): StandInFloatControl | null {
  const control = properties().querySelector(`[data-properties-port="${input}"] [data-input-control="${input}"]`)?.firstElementChild ?? null;
  return control instanceof StandInFloatControl ? control : null;
}

/** The button on `row` that `selector` names. */
function buttonOn(row: HTMLElement, selector: string): HTMLElement {
  return row.querySelector<HTMLElement>(selector) ?? expect.unreachable(`no ${selector} on the row`);
}

/** How many entries the open project's history holds. */
async function historyLength(backend: TatolabBackend): Promise<number> {
  const reading = await backend.readOpenProjectTransactions();
  return reading.kind === "read" ? reading.project_transactions.transactions.length : -1;
}

/** Each operation the open project's history records, by name. */
async function operationsRecorded(backend: TatolabBackend): Promise<string[]> {
  const reading = await backend.readOpenProjectTransactions();
  if (reading.kind !== "read") return [];
  return reading.project_transactions.transactions.flatMap((transaction) =>
    transaction.operations.flatMap((operation) => (typeof operation === "object" && operation !== null && !Array.isArray(operation) && typeof operation["operation"] === "string" ? [operation["operation"]] : [])),
  );
}

/** What the main stream's node `nodeName` reads on its input `input`, as the mock's graph renders it. */
async function valueTheGraphReads(backend: TatolabBackend, nodeName: string, input: string): Promise<unknown> {
  const graph = await backend.describeStreamGraph(PATTERN_MAIN_STREAM);
  return graph.nodes.find((node) => node.name === nodeName)?.input_ports.find((port) => port.name === input)?.value_read;
}

/** The links of the main stream's graph into the node `nodeName`, as `source.port -> input`. */
async function linksInto(backend: TatolabBackend, nodeName: string): Promise<string[]> {
  const graph = await backend.describeStreamGraph(PATTERN_MAIN_STREAM);
  return graph.links.filter((link) => link.target_node === nodeName).map((link) => `${link.source_node}.${link.source_port} -> ${link.target_port}`);
}

describe("Properties' Inputs", () => {
  it("draws the recorded sample's unwired Float input's own control with where its value comes from, and its Reset to default is one Undo step", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind");
    await selectInTheStreamGraph("warmth");
    const control = await waitFor(() => controlOnTheRow("base") ?? expect.unreachable("no control on Properties' base row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(control.getAttribute("data-surface")).toBe("properties");
    expect(inputRow("base").querySelector("[data-properties-input-description]")?.textContent).toBe("How warm the picture is on the first beat of a bar.");
    expect(inputRow("base").querySelector("[data-properties-input-comes-from]")?.textContent).toBe("Default");
    expect(inputRow("base").querySelector("[data-properties-input-reset]")).toBeNull();

    control.commitTyped(0.4);
    await waitFor(async () => expect(await valueTheGraphReads(backend, "warmth", "base")).toEqual({ value: 0.4, comes_from: "saved" }));
    await waitFor(() => expect(inputRow("base").querySelector("[data-properties-input-comes-from]")?.textContent).toBe("Saved"));
    const entriesBefore = await historyLength(backend);

    fireEvent.click(buttonOn(inputRow("base"), "[data-properties-input-reset]"));
    await waitFor(async () => expect(await valueTheGraphReads(backend, "warmth", "base")).toEqual({ value: 0.1, comes_from: "default" }));
    expect(await historyLength(backend)).toBe(entriesBefore + 1);
    await waitFor(() => expect(controlOnTheRow("base")?.textContent).toBe("0.1"));
    await waitFor(() => expect(inputRow("base").querySelector("[data-properties-input-reset]")).toBeNull());

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(async () => expect(await valueTheGraphReads(backend, "warmth", "base")).toEqual({ value: 0.4, comes_from: "saved" }));
    await waitFor(() => expect(controlOnTheRow("base")?.textContent).toBe("0.4"));
  });

  it("names the node and pin that drive a wired input, with no value of its own, its disconnect is one Undo step, and it jumps to that node", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    await selectInTheStreamGraph("brightnessmeter");
    const linkedEnds = () => [...inputRow("video_from_upstream").querySelectorAll("[data-property-port-linked-end]")].map((linkedEnd) => linkedEnd.getAttribute("data-property-port-linked-end"));
    await waitFor(() => expect(linkedEnds()).toEqual(["Inverting Effect › video_to_downstream"]));
    expect(inputRow("video_from_upstream").querySelector("input, [data-input-control]")).toBeNull();
    expect(inputRow("video_from_upstream").querySelector("[data-properties-input-promote]")).toBeNull();

    const entriesBefore = await historyLength(backend);
    fireEvent.click(buttonOn(inputRow("video_from_upstream"), "[data-property-port-linked-end-disconnect]"));
    await waitFor(async () => expect(await linksInto(backend, "brightnessmeter")).toEqual([]));
    await waitFor(() => expect(linkedEnds()).toEqual([]));
    expect(inputRow("video_from_upstream").textContent).toContain("Not connected");
    expect(await historyLength(backend)).toBe(entriesBefore + 1);

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(() => expect(linkedEnds()).toEqual(["Inverting Effect › video_to_downstream"]));

    fireEvent.click(buttonOn(inputRow("video_from_upstream"), "[data-property-port-linked-end-jump]"));
    await waitFor(() => expect(properties().querySelector('[data-properties-of-node="invertingeffect"]')).not.toBeNull());
  });

  it("promotes an unwired input to a new Graph Input wired into it, one Undo step taking out both", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    await selectInTheStreamGraph("invertingeffect");
    await waitFor(() => controlOnTheRow("amount") ?? expect.unreachable("no control on Properties' amount row"), AS_LONG_AS_A_FRAME_BINDS);
    const entriesBefore = await historyLength(backend);

    fireEvent.click(buttonOn(inputRow("amount"), "[data-properties-input-promote]"));
    await waitFor(async () => expect(await linksInto(backend, "invertingeffect")).toContain("invertingeffect_amount.value -> amount"));
    await waitFor(() => expect(streamGraph().querySelector('[data-node-graph-card="invertingeffect_amount"]')).not.toBeNull());
    await waitFor(() => expect([...inputRow("amount").querySelectorAll("[data-property-port-linked-end]")].map((linkedEnd) => linkedEnd.getAttribute("data-property-port-linked-end"))).toEqual(["invertingeffect_amount › value"]));
    expect(controlOnTheRow("amount")).toBeNull();
    expect(await historyLength(backend)).toBe(entriesBefore + 1);

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(() => expect(streamGraph().querySelector('[data-node-graph-card="invertingeffect_amount"]')).toBeNull());
    expect(await linksInto(backend, "invertingeffect")).not.toContain("invertingeffect_amount.value -> amount");
    await waitFor(() => controlOnTheRow("amount") ?? expect.unreachable("no control on Properties' amount row once undone"), AS_LONG_AS_A_FRAME_BINDS);
  });

  it("while the control table's listing loads, draws an input's value in words and no field that would write it", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=running", { listNodeUiElements: () => new Promise(() => undefined) });
    await selectInTheStreamGraph("invertingeffect");
    await waitFor(() => expect(inputRow("amount").querySelector("[data-properties-input-value-words]")?.textContent).toBe("1.0"), AS_LONG_AS_A_FRAME_BINDS);
    expect(inputRow("amount").querySelector('input[aria-label="Value of amount"]')).toBeNull();
    expect(controlOnTheRow("amount")).toBeNull();
  });

  it("draws its own field where the table has no control for an input, and the field sets the input's value, not its old pin value", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&node_ui=refused");
    await selectInTheStreamGraph("invertingeffect");
    const field = await waitFor(() => inputRow("amount").querySelector<HTMLInputElement>('input[aria-label="Value of amount"]') ?? expect.unreachable("no field on Properties' amount row"), AS_LONG_AS_A_FRAME_BINDS);

    field.focus();
    fireEvent.change(field, { target: { value: "0.5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(async () => expect(await valueTheGraphReads(backend, "invertingeffect", "amount")).toEqual({ value: 0.5, comes_from: "saved" }));
    const operations = await operationsRecorded(backend);
    expect(operations).toContain("set_node_input_value");
    expect(operations).not.toContain("set_pin_value");
  });
});
