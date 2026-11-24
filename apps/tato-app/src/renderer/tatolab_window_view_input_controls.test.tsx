// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_flow_elements";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountedWindowOverTheMock, coreViewPage, cleanUpTheWindowsOfEarlierTests, PULSE_STAGE_MAIN_STREAM, tagOfTheStudiosFloatControl } from "./tatolab_window_view_test_support";
import type { TatolabBackend } from "./backend/tatolab_backend";
import { inputValueReadOfThePort } from "@tatolab/tato-app-view-sdk/studio_readings";

vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

/** A Float control as a person drives one, standing in for the Studio's own, which its package's tests bind and drag. */
class StandInFloatControl extends HTMLElement implements InputControlElement<"float"> {
  #value = 0;
  set pin(_pin: ControlledPin<"float">) {}
  set value(value: number) {
    this.#value = value;
    this.textContent = String(value);
  }
  set state(state: InputControlState) {
    this.setAttribute("data-control-state", state);
  }
  dragTo(value: number): void {
    this.#value = value;
    this.textContent = String(value);
    fireInputControlEvent(this, "input", value);
  }
  release(): void {
    fireInputControlEvent(this, "change", this.#value);
  }
}

/** The same stand-in under the tag of the Studio's Float slider, which draws a Float input whose range has both ends. */
class StandInFloatSlider extends StandInFloatControl {}

const FLOAT_SLIDER_TAG = tagOfTheStudiosFloatControl("slider");
customElements.define(tagOfTheStudiosFloatControl(null), StandInFloatControl);
customElements.define(FLOAT_SLIDER_TAG, StandInFloatSlider);

afterEach(cleanUpTheWindowsOfEarlierTests);

/** The value a Float control shows. */
function wordsOfTheControl(control: Element): string | null {
  return control.textContent;
}

/** The control in the stream graph's card `nodeName`, on its input `input`. */
function controlOnTheCard(nodeName: string, input: string): StandInFloatControl | null {
  return floatControlIn(coreViewPage("stream_graph", "stream-graph").querySelector(`[data-node-graph-card="${nodeName}"] [data-input-control="${input}"]`));
}

/** The Float control `slot` holds, or `null` while it holds none. */
function floatControlIn(slot: Element | null): StandInFloatControl | null {
  const control = slot?.firstElementChild ?? null;
  return control instanceof StandInFloatControl ? control : null;
}

/** Waits as long as a frame takes to list, load and bind its controls over the mock. */
const AS_LONG_AS_A_FRAME_BINDS = { timeout: 5_000 };

/** How many entries the open project's history holds. */
async function historyLength(backend: TatolabBackend): Promise<number> {
  const reading = await backend.readOpenProjectTransactions();
  return reading.kind === "read" ? reading.project_transactions.transactions.length : -1;
}

/** What the main stream's Kaleidoscope reads on its `spin`, as the mock's graph renders it. */
async function spinTheGraphReads(backend: TatolabBackend): Promise<unknown> {
  const graph = await backend.describeStreamGraph(PULSE_STAGE_MAIN_STREAM);
  const spin = graph.nodes.find((node) => node.name === "kaleidoscope")?.ports.inputs.find((port) => port.name === "spin");
  return spin === undefined ? undefined : inputValueReadOfThePort(spin);
}

describe("a Float input's control", () => {
  it("draws on the node's unwired Float input with its value, and the same element draws for that input in Properties", async () => {
    await mountedWindowOverTheMock("state=running");
    const onTheCard = await waitFor(() => controlOnTheCard("kaleidoscope", "spin") ?? expect.unreachable("no control on the card's spin row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(wordsOfTheControl(onTheCard)).toBe("0");
    expect([onTheCard.getAttribute("data-surface"), onTheCard.getAttribute("data-state")]).toEqual(["node", "editable"]);
    expect(onTheCard.parentElement?.classList.contains("nodrag")).toBe(true);
    expect(onTheCard.parentElement?.classList.contains("nopan")).toBe(true);
    expect(onTheCard.parentElement?.hasAttribute(NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE)).toBe(true);
    expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-node-graph-card="kaleidoscope"] [data-input-control="image"]')).toBeNull();

    fireEvent.click(coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-node-graph-card="kaleidoscope"]') ?? expect.unreachable("no Kaleidoscope card"));
    const inProperties = await waitFor(() => floatControlIn(coreViewPage("properties").querySelector('[data-properties-port="spin"] [data-input-control="spin"]')) ?? expect.unreachable("no control on Properties' spin row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(inProperties.tagName).toBe(onTheCard.tagName);
    expect(inProperties.getAttribute("data-surface")).toBe("properties");
    expect(wordsOfTheControl(inProperties)).toBe("0");
  });

  it("draws the slider on the recorded sample's unwired Float input whose range has both ends, with the value the runtime read by default, and none on its wired or untyped pins", async () => {
    await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind");
    const onTheCard = await waitFor(() => controlOnTheCard("warmth", "base") ?? expect.unreachable("no control on Warmth's base row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(onTheCard.tagName.toLowerCase()).toBe(FLOAT_SLIDER_TAG);
    expect(wordsOfTheControl(onTheCard)).toBe("0.1");
    expect([onTheCard.getAttribute("data-surface"), onTheCard.getAttribute("data-state")]).toEqual(["node", "editable"]);
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    expect(streamGraph.querySelector('[data-node-graph-card="warmth"] [data-input-control="count"]')).toBeNull();
    expect(streamGraph.querySelector('[data-node-graph-card="tally"] [data-input-control]')).toBeNull();
  });

  it("sends a drag on the node live, with no history entry for a move, and its release is one Undo step", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    const onTheCard = await waitFor(() => controlOnTheCard("kaleidoscope", "spin") ?? expect.unreachable("no control on the card's spin row"), AS_LONG_AS_A_FRAME_BINDS);
    const entriesBefore = await historyLength(backend);

    onTheCard.dragTo(1.1);
    onTheCard.dragTo(1.3);
    await waitFor(async () => expect(await spinTheGraphReads(backend)).toEqual({ value: 1.3, comes_from: "live" }));
    expect(await historyLength(backend)).toBe(entriesBefore);
    expect(wordsOfTheControl(onTheCard)).toBe("1.3");

    onTheCard.release();
    await waitFor(async () => expect(await spinTheGraphReads(backend)).toEqual({ value: 1.3, comes_from: "saved" }));
    expect(await historyLength(backend)).toBe(entriesBefore + 1);

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(async () => expect(await spinTheGraphReads(backend)).toEqual({ value: 0, comes_from: "default" }));
    await waitFor(() => expect(wordsOfTheControl(onTheCard)).toBe("0"));
  });

  it("where the listing is refused, Properties shows the input's value in words, and the words follow each value set live and taken off", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&node_ui=refused");
    fireEvent.click(await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-node-graph-card="kaleidoscope"]') ?? expect.unreachable("no Kaleidoscope card")));
    const words = () => coreViewPage("properties").querySelector('[data-properties-port="spin"] [data-properties-input-value-words]')?.textContent;
    await waitFor(() => expect(words()).toBe("0.0"), AS_LONG_AS_A_FRAME_BINDS);
    expect(coreViewPage("properties").querySelector('[data-properties-port="spin"] [data-input-control="spin"]')?.firstElementChild ?? null).toBeNull();

    const graph = await backend.describeStreamGraph(PULSE_STAGE_MAIN_STREAM);
    const kaleidoscope = graph.nodes.find((node) => node.name === "kaleidoscope") ?? expect.unreachable("no Kaleidoscope");
    const setLive = (value: number | null) => backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: graph.asset ?? expect.unreachable("the main stream has no asset"), node: kaleidoscope.id, input: "spin", value }], "live", null);
    await setLive(1.5);
    await waitFor(() => expect(words()).toBe("1.5"), AS_LONG_AS_A_FRAME_BINDS);

    await setLive(null);
    await waitFor(async () => expect(await spinTheGraphReads(backend)).toEqual({ value: 0, comes_from: "default" }), AS_LONG_AS_A_FRAME_BINDS);
    await waitFor(() => expect(words()).toBe("0.0"), AS_LONG_AS_A_FRAME_BINDS);
  });

  it("shows the runtime's recorded refusal of a value under Properties' control, in its words, until a value is taken", async () => {
    await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind&refusal=value_of_another_type");
    fireEvent.click(await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-node-graph-card="warmth"]') ?? expect.unreachable("no Warmth card")));
    const inProperties = await waitFor(() => floatControlIn(coreViewPage("properties").querySelector('[data-properties-port="base"] [data-input-control="base"]')) ?? expect.unreachable("no control on Properties' base row"), AS_LONG_AS_A_FRAME_BINDS);
    const refusalLine = () => coreViewPage("properties").querySelector('[data-properties-input-value-refusal="base"]');
    expect(refusalLine()).toBeNull();

    inProperties.dragTo(0.3);
    inProperties.release();
    await waitFor(() => expect(refusalLine()?.textContent).toContain('the value of input `base` of `warmth` is "warm", and `base` takes a number. To fix: send 0.5'));
    expect(refusalLine()?.textContent).toContain("The value wasn't set:");

    inProperties.dragTo(0.5);
    inProperties.release();
    await waitFor(() => expect(refusalLine()).toBeNull());
  });
});
