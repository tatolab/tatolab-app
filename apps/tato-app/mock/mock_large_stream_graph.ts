import type { MockGraphLink, MockGraphPort } from "./mock_stream_fixtures";
import type { MockGraphNode, MockStreamGraph } from "./mock_stream_fixtures";

/** How many cards the large graph holds, in columns of `LARGE_GRAPH_ROWS`. */
const LARGE_GRAPH_NODE_COUNT = 300;
const LARGE_GRAPH_ROWS = 15;

/** The inputs of each node, one stand-in control each in the canvas measurements: 4 × 300 = 1,200. */
const LARGE_GRAPH_INPUT_NAMES = ["gain", "offset", "mix", "threshold"] as const;

/** How many links the large graph holds: every node after the first column takes one, and the first 165 of them a second. */
const LARGE_GRAPH_LINK_COUNT = 450;

/** Where the cards sit: a grid with room between the columns for the links, and between the rows for a card with its body. */
const LARGE_GRAPH_COLUMN_STEP = 300;
const LARGE_GRAPH_ROW_STEP = 200;

const channelsPort = (name: string): MockGraphPort => ({ name, family: "channels", stream_facts: null, values_checked: null, pin: null, value_read: null });

const largeGraphNodeName = (index: number) => `stage-${String(index + 1).padStart(3, "0")}`;

/** The link into `targetIndex`'s input `inputName` from the output of `sourceIndex`. */
function largeGraphLink(sourceIndex: number, targetIndex: number, inputName: string): MockGraphLink {
  return {
    id: `Llarge${String(sourceIndex).padStart(3, "0")}${String(targetIndex).padStart(3, "0")}${inputName}`,
    source_node: largeGraphNodeName(sourceIndex),
    source_port: "out",
    target_node: largeGraphNodeName(targetIndex),
    target_port: inputName,
    state: "wired",
  };
}

/**
 * A graph of 300 nodes of four inputs each and 450 links, every card at a saved place, which the canvas measurements open
 * with `?main_graph=large`; it exists for those measurements only.
 */
export function largeMockStreamGraph(): MockStreamGraph {
  const nodes: MockGraphNode[] = Array.from({ length: LARGE_GRAPH_NODE_COUNT }, (_, index) => ({
    name: largeGraphNodeName(index),
    type: "nodes.large_graph_stage:LargeGraphStage",
    state: "Running",
    config: {},
    input_ports: LARGE_GRAPH_INPUT_NAMES.map(channelsPort),
    output_ports: [channelsPort("out")],
    studio: {
      position: [Math.floor(index / LARGE_GRAPH_ROWS) * LARGE_GRAPH_COLUMN_STEP, (index % LARGE_GRAPH_ROWS) * LARGE_GRAPH_ROW_STEP],
      group: null,
      comment: null,
      colour: null,
      collapsed: null,
      metadata: {},
    },
  }));
  const nodesAfterTheFirstColumn = nodes.slice(LARGE_GRAPH_ROWS).map((_, offset) => offset + LARGE_GRAPH_ROWS);
  const firstLinks = nodesAfterTheFirstColumn.map((targetIndex) => largeGraphLink(targetIndex - LARGE_GRAPH_ROWS, targetIndex, "gain"));
  const secondLinks = nodesAfterTheFirstColumn.slice(0, LARGE_GRAPH_LINK_COUNT - firstLinks.length).map((targetIndex) => {
    const column = Math.floor(targetIndex / LARGE_GRAPH_ROWS);
    const rowBelow = ((targetIndex % LARGE_GRAPH_ROWS) + 1) % LARGE_GRAPH_ROWS;
    return largeGraphLink((column - 1) * LARGE_GRAPH_ROWS + rowBelow, targetIndex, "mix");
  });
  return { nodes, links: [...firstLinks, ...secondLinks], counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] } };
}
