// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { nodeUiElementTag } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_flow_elements";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStudioNodeUiElements } from "../../mock/mock_node_ui_elements";
import { mountedWindowOverTheMock, coreViewPage, cleanUpTheWindowsOfEarlierTests, PATTERN_MAIN_STREAM } from "./tatolab_window_view_test_support";
import type { TatolabBackend } from "./backend/tatolab_backend";

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

// A frame imports each listed script from the dev server, which no test serves, so the stand-in is defined under the tag
// the mock's listing mints, as loading the Studio's own control in a frame defines it.
const [MOCK_FLOAT_CONTROL_LISTED] = mockStudioNodeUiElements(window.location.origin, false);
const FLOAT_CONTROL_TAG = nodeUiElementTag(MOCK_FLOAT_CONTROL_LISTED ?? expect.unreachable("the mock lists the Studio's Float control"));
customElements.define(FLOAT_CONTROL_TAG, StandInFloatControl);

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

/** What the main stream's Inverting Effect reads on its `amount`, as the mock's graph renders it. */
async function amountTheGraphReads(backend: TatolabBackend): Promise<unknown> {
  const graph = await backend.describeStreamGraph(PATTERN_MAIN_STREAM);
  return graph.nodes.find((node) => node.name === "invertingeffect")?.input_ports.find((port) => port.name === "amount")?.value_read;
}

describe("a Float input's control", () => {
  it("draws on the node's unwired Float input with its value, and the same element draws for that input in Properties", async () => {
    await mountedWindowOverTheMock("state=running");
    const onTheCard = await waitFor(() => controlOnTheCard("invertingeffect", "amount") ?? expect.unreachable("no control on the card's amount row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(wordsOfTheControl(onTheCard)).toBe("1");
    expect([onTheCard.getAttribute("data-surface"), onTheCard.getAttribute("data-state")]).toEqual(["node", "editable"]);
    expect(onTheCard.parentElement?.classList.contains("nodrag")).toBe(true);
    expect(onTheCard.parentElement?.classList.contains("nopan")).toBe(true);
    expect(onTheCard.parentElement?.hasAttribute(NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE)).toBe(true);
    expect(coreViewPage("stream_graph", "stream-graph").querySelector('[data-node-graph-card="invertingeffect"] [data-input-control="video_from_upstream"]')).toBeNull();

    fireEvent.click(coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card"));
    const inProperties = await waitFor(() => floatControlIn(coreViewPage("properties").querySelector('[data-properties-port="amount"] [data-input-control="amount"]')) ?? expect.unreachable("no control on Properties' amount row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(inProperties.tagName).toBe(onTheCard.tagName);
    expect(inProperties.getAttribute("data-surface")).toBe("properties");
    expect(wordsOfTheControl(inProperties)).toBe("1");
  });

  it("draws a control on the recorded sample's unwired Float input with the value the runtime read by default, and none on its wired or untyped pins", async () => {
    await mountedWindowOverTheMock("state=running&main_graph=every_pin_kind");
    const onTheCard = await waitFor(() => controlOnTheCard("warmth", "base") ?? expect.unreachable("no control on Warmth's base row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(wordsOfTheControl(onTheCard)).toBe("0.1");
    expect([onTheCard.getAttribute("data-surface"), onTheCard.getAttribute("data-state")]).toEqual(["node", "editable"]);
    const streamGraph = coreViewPage("stream_graph", "stream-graph");
    expect(streamGraph.querySelector('[data-node-graph-card="warmth"] [data-input-control="count"]')).toBeNull();
    expect(streamGraph.querySelector('[data-node-graph-card="tally"] [data-input-control]')).toBeNull();
  });

  it("sends a drag on the node live, with no history entry for a move, and its release is one Undo step", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    const onTheCard = await waitFor(() => controlOnTheCard("invertingeffect", "amount") ?? expect.unreachable("no control on the card's amount row"), AS_LONG_AS_A_FRAME_BINDS);
    const entriesBefore = await historyLength(backend);

    onTheCard.dragTo(1.1);
    onTheCard.dragTo(1.3);
    await waitFor(async () => expect(await amountTheGraphReads(backend)).toEqual({ value: 1.3, comes_from: "live" }));
    expect(await historyLength(backend)).toBe(entriesBefore);
    expect(wordsOfTheControl(onTheCard)).toBe("1.3");

    onTheCard.release();
    await waitFor(async () => expect(await amountTheGraphReads(backend)).toEqual({ value: 1.3, comes_from: "saved" }));
    expect(await historyLength(backend)).toBe(entriesBefore + 1);

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(async () => expect(await amountTheGraphReads(backend)).toEqual({ value: 1, comes_from: "default" }));
    await waitFor(() => expect(wordsOfTheControl(onTheCard)).toBe("1"));
  });

  it("where the listing is refused, Properties draws its own field for the input, and the field follows each value, an Undo's too", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&node_ui=refused");
    fireEvent.click(await waitFor(() => coreViewPage("stream_graph", "stream-graph").querySelector<HTMLElement>('[data-node-graph-card="invertingeffect"]') ?? expect.unreachable("no Inverting Effect card")));
    const field = await waitFor(() => coreViewPage("properties").querySelector<HTMLInputElement>('[data-properties-port="amount"] input[aria-label="Value of amount"]') ?? expect.unreachable("no field on Properties' amount row"), AS_LONG_AS_A_FRAME_BINDS);
    expect(coreViewPage("properties").querySelector('[data-properties-port="amount"] [data-input-control="amount"]')?.firstElementChild ?? null).toBeNull();
    expect(field.value).toBe("");

    field.focus();
    fireEvent.change(field, { target: { value: "1.5" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(async () => expect(await amountTheGraphReads(backend)).toEqual({ value: 1.5, comes_from: "saved" }));
    await waitFor(() => expect(field.value).toBe("1.5"));

    await backend.undoInTheOpenProject({ kind: "person", name: "Sam" });
    await waitFor(async () => expect(await amountTheGraphReads(backend)).toEqual({ value: 1, comes_from: "default" }));
    await waitFor(() => expect(field.value).toBe(""));
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
