// @vitest-environment happy-dom
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { Profiler } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeGraphCanvas } from "./node_graph_canvas";
import type { NodeGraphCanvasEditing, NodeGraphCanvasLink, NodeGraphCanvasNode } from "./support/node_graph_canvas_contract";
import type { NodeGraphCardFlowNode } from "./support/node_graph_flow_elements";

/** The node id of each card commit, as React's Profiler reports a commit of the card or of anything inside it. */
const { cardCommits } = vi.hoisted((): { cardCommits: string[] } => ({ cardCommits: [] }));

vi.mock("./node_graph/node_card", async (importOriginal) => {
  const original = await importOriginal<typeof import("./node_graph/node_card")>();
  const OriginalCardView = original.NodeGraphCardView;
  return {
    ...original,
    NodeGraphCardView: (props: NodeProps<NodeGraphCardFlowNode>) => (
      <Profiler id={props.id} onRender={(nodeId) => cardCommits.push(nodeId)}>
        <OriginalCardView {...props} />
      </Profiler>
    ),
  };
});

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  cardCommits.length = 0;
});

const NODE_IDS = ["source", "effect", "sink", "meter"] as const;

function card(nodeId: string, index: number): NodeGraphCanvasNode {
  return {
    node_id: nodeId,
    title: nodeId,
    type_name: null,
    description: null,
    condition: { look: "healthy" },
    inputs: ["gain", "offset", "mix", "threshold"].map((name) => ({ name, pin: { pin_type: { type: "float" }, flow: "value" }, family: "channels", description: null, stream_facts_words: [] })),
    outputs: [{ name: "out", pin: { pin_type: { type: "float" }, flow: "value" }, family: "channels", description: null, stream_facts_words: [] }],
    saved_position: { x: index * 300, y: 0 },
    frame_id: null,
    is_collapsed: false,
    subgraph: null,
  };
}

function link(sourceNodeId: string, targetNodeId: string, targetPin: string): NodeGraphCanvasLink {
  return { link_id: `${sourceNodeId}->${targetNodeId}.${targetPin}`, source_node_id: sourceNodeId, source_pin: "out", target_node_id: targetNodeId, target_pin: targetPin, look: "carrying", description: "wired" };
}

/** New editing, as a caller makes it again for every reading of its graph. */
function editingOfAReading(): NodeGraphCanvasEditing {
  const applied = async () => "applied" as const;
  return {
    onCardsMoved: applied,
    onPinsWired: vi.fn(),
    onWireLetGoOverTheCanvas: vi.fn(),
    onNodeAskedFor: vi.fn(),
    onNoteAskedFor: vi.fn(),
    onDeleted: vi.fn(),
    onFrameAskedFor: applied,
    onSubgraphAskedFor: vi.fn(),
    onNoteChanged: applied,
    onFrameChanged: vi.fn(),
    onFrameRemoved: vi.fn(),
    onCardCollapsed: vi.fn(),
  };
}

interface CanvasReading {
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  selectedNodeIds: readonly string[];
}

/** The canvas as the Stream graph view draws a reading: new arrays and new editing each time. */
function canvasOf({ nodes, links, selectedNodeIds }: CanvasReading) {
  return <NodeGraphCanvas label="Stream graph" nodes={[...nodes]} links={links.map((graphLink) => ({ ...graphLink }))} selectedNodeIds={selectedNodeIds} onNodesSelected={vi.fn()} editing={editingOfAReading()} />;
}

async function drawnCanvas(reading: CanvasReading): Promise<RenderResult> {
  const drawn = render(canvasOf(reading));
  await vi.waitFor(() => expect(drawn.container.querySelectorAll("[data-node-graph-card]")).toHaveLength(reading.nodes.length));
  await act(async () => {
    await new Promise((settled) => setTimeout(settled, 50));
  });
  cardCommits.length = 0;
  return drawn;
}

const commitsOf = (nodeId: string) => cardCommits.filter((committed) => committed === nodeId).length;

describe("the cards of the node graph canvas", () => {
  const nodes = NODE_IDS.map(card);
  const links = [link("source", "effect", "gain"), link("effect", "sink", "gain"), link("effect", "meter", "mix")];

  it("commits no card over 200 readings that leave every node as it was", async () => {
    const drawn = await drawnCanvas({ nodes, links, selectedNodeIds: [] });
    for (let reading = 0; reading < 200; reading += 1) drawn.rerender(canvasOf({ nodes, links, selectedNodeIds: [] }));
    expect(cardCommits).toEqual([]);
  }, 30_000);

  it("commits only the card selected, at most twice, when one card is selected", async () => {
    const drawn = await drawnCanvas({ nodes, links, selectedNodeIds: [] });
    drawn.rerender(canvasOf({ nodes, links, selectedNodeIds: ["effect"] }));
    await vi.waitFor(() => expect(drawn.container.querySelector('[data-node-graph-card="effect"]')?.hasAttribute("data-selected")).toBe(true));
    expect(commitsOf("effect")).toBeGreaterThanOrEqual(1);
    expect(commitsOf("effect")).toBeLessThanOrEqual(2);
    expect(cardCommits.filter((committed) => committed !== "effect")).toEqual([]);
  });

  it("commits only the cards a structural edit touches: the node changed, and a socket a new link joins first", async () => {
    const drawn = await drawnCanvas({ nodes, links, selectedNodeIds: [] });
    const renamedNodes = nodes.map((node) => (node.node_id === "sink" ? { ...node, title: "Display" } : node));
    drawn.rerender(canvasOf({ nodes: renamedNodes, links: [...links, link("source", "meter", "gain")], selectedNodeIds: [] }));
    await vi.waitFor(() => expect(drawn.container.querySelector('[data-node-graph-card="meter"] [data-handleid="input:gain"]')?.hasAttribute("data-linked")).toBe(true));
    expect(new Set(cardCommits)).toEqual(new Set(["sink", "meter"]));
  });
});

describe("the node graph canvas zoomed out", () => {
  it("marks its root zoomed out below the zoom inline controls are read at, which hides them without changing a row's height", async () => {
    const drawn = render(<NodeGraphCanvas label="Stream graph" nodes={[card("source", 0)]} links={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} viewportWhereItWasLeft={{ x: 0, y: 0, zoom: 0.3 }} />);
    await vi.waitFor(() => expect(drawn.container.querySelector(".node-graph-canvas")?.classList.contains("node-graph-canvas-zoomed-out")).toBe(true));
  });

  it("leaves its root unmarked at the zoom inline controls are read at", async () => {
    const drawn = render(<NodeGraphCanvas label="Stream graph" nodes={[card("source", 0)]} links={[]} selectedNodeIds={[]} onNodesSelected={vi.fn()} viewportWhereItWasLeft={{ x: 0, y: 0, zoom: 0.5 }} />);
    await vi.waitFor(() => expect(drawn.container.querySelector(".react-flow__viewport")?.getAttribute("style")).toContain("scale(0.5)"));
    expect(drawn.container.querySelector(".node-graph-canvas")?.classList.contains("node-graph-canvas-zoomed-out")).toBe(false);
  });
});
