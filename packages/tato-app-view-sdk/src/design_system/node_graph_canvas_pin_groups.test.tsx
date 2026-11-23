// @vitest-environment happy-dom
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeGraphCanvas } from "./node_graph_canvas";
import type { NodeGraphCanvasEditing, NodeGraphCanvasNode } from "./support/node_graph_canvas_contract";
import type { InputAddress } from "../pin_model/node_inputs";
import type { NodePin, NodePinSlot } from "../pin_model/node_pins";
import { createInputValues, type InputValues } from "../pin_services/input_values";

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const GRAPH = { project_folder: "/projects/demo", stream_asset: "main.stream", level: [] } as const;

function aPin(name: string, fields: Partial<NodePin> = {}): NodePin {
  return { name, member: null, bundle: null, pin: { pin_type: { type: "texture" }, flow: "stream" }, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null, slot: null, ...fields };
}

function aSlotPin(group: string, slot: number, pin: string, slots: NodePinSlot["slots"], isTheEmptySlot: boolean): NodePin {
  return aPin(`${group}.${slot}.${pin}`, { slot: { group, slot, pin, slots, is_the_empty_slot: isTheEmptySlot } });
}

function countAddress(group: string): InputAddress {
  return { graph: GRAPH, node_id: "compositor", input: group, member: null };
}

const COMPOSITOR: NodeGraphCanvasNode = {
  node_id: "compositor",
  title: "compositor",
  type_name: null,
  node_type: null,
  description: null,
  condition: { look: "healthy" },
  inputs: [
    aPin("bands", { pin: { pin_type: { type: "integer" }, flow: "value" }, takes_a_wire: false, value_address: countAddress("bands"), setting: { read: "at_setup" } }),
    aSlotPin("layers", 0, "picture", "follow_their_wires", false),
    aSlotPin("layers", 1, "picture", "follow_their_wires", true),
  ],
  outputs: [aSlotPin("bands", 0, "banded", "set_by_the_input_of_the_groups_name", false), aSlotPin("bands", 1, "banded", "set_by_the_input_of_the_groups_name", false)],
  saved_position: { x: 0, y: 0 },
  frame_id: null,
  is_collapsed: false,
  subgraph: null,
  kind: { look: "process" },
};

function editing(): NodeGraphCanvasEditing {
  const applied = async () => "applied" as const;
  return {
    onCardsMoved: applied,
    fitsOfAWireFrom: async () => new Map(),
    onPinsWired: vi.fn(),
    onWireLetGoOverTheCanvas: vi.fn(),
    onNodeAskedFor: vi.fn(),
    onNodeTypeDropped: vi.fn(),
    onNoteAskedFor: vi.fn(),
    onDeleted: vi.fn(),
    onFrameAskedFor: applied,
    onSubgraphAskedFor: vi.fn(),
    onNoteChanged: applied,
    onTidiedUp: applied,
    onFrameChanged: vi.fn(),
    onFrameRemoved: vi.fn(),
    onCardCollapsed: vi.fn(),
    onBundleOpened: vi.fn(),
  };
}

/** The input values store, recording what each transaction it sends asks for and answering none. */
function inputValuesRecordingWhatTheySend(): { inputValues: InputValues; sent: unknown[] } {
  const sent: unknown[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (...asked) => {
      sent.push(asked);
      return new Promise(() => undefined);
    },
    newGestureIdempotencyKey: () => `gesture-${sent.length}`,
  });
  return { inputValues, sent };
}

async function drawnCompositor(inputValues: InputValues | null): Promise<RenderResult> {
  const drawn = render(<NodeGraphCanvas label="Stream graph" nodes={[COMPOSITOR]} links={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} editing={editing()} inputValues={inputValues} />);
  await vi.waitFor(() => expect(drawn.container.querySelectorAll("[data-node-graph-card]")).toHaveLength(1));
  return drawn;
}

describe("a card's pin groups", () => {
  it("labels each slot's pins by their names in the slot, tags each slot with its number, and draws the empty slot empty", async () => {
    const { container } = await drawnCompositor(null);

    expect([...container.querySelectorAll("[data-node-graph-input-pin]")].map((label) => label.textContent)).toEqual(["bands", "picture", "picture"]);
    expect([...container.querySelectorAll("[data-node-graph-slot-tag]")].map((tag) => tag.getAttribute("data-node-graph-slot-tag"))).toEqual(["bands 1", "bands 2", "layers 1", "layers 2"]);
    expect([...container.querySelectorAll("[data-node-graph-empty-slot]")].map((row) => row.querySelector("[data-node-graph-input-pin]")?.getAttribute("data-node-graph-input-pin"))).toEqual(["layers.1.picture"]);
    expect([...container.querySelectorAll(".node-graph-pin[data-empty-slot]")].map((socket) => socket.getAttribute("data-handleid"))).toEqual(["input:layers.1.picture"]);
    expect(container.querySelector('[data-handleid="input:layers.1.picture"]')?.getAttribute("title")).toBe("layers 2 › picture · Texture, a stream");
  });

  it.each([
    ["add-slot", 3],
    ["remove-slot", 1],
  ] as const)("its %s button on the last slot of a group whose count is set commits the count %i, one Undo step", async (button, count) => {
    const { inputValues, sent } = inputValuesRecordingWhatTheySend();
    const { container } = await drawnCompositor(inputValues);

    expect(container.querySelectorAll(`[data-node-graph-${button}]`)).toHaveLength(1);
    expect(container.querySelectorAll(`[data-node-graph-${button}="layers"]`)).toHaveLength(0);
    await act(async () => container.querySelector<HTMLButtonElement>(`[data-node-graph-${button}="bands"]`)?.click());

    expect(sent).toEqual([[GRAPH.project_folder, [{ operation: "set_node_input_value", stream: GRAPH.stream_asset, node: "compositor", input: "bands", value: count }], { mode: "commit", idempotencyKey: "gesture-0" }]]);
  });
});
