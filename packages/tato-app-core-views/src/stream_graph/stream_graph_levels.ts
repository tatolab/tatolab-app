// The levels of a stream's graph the canvas can show: the stream's own, and the inside of each subgraph
// stepped into from it, reached by the names of the subgraph nodes stepped through.

import type { StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** One level of a stream's graph: what the canvas draws there, and the subgraph nodes stepped through to reach it, outermost first. */
export interface StreamGraphLevel {
  graph: StreamGraphSummary;
  subgraphs_stepped_through: readonly StreamGraphNode[];
}

/** The deepest level of `graph` that `subgraphNamesSteppedThrough` reaches, each name a subgraph node of the level before; the names past one the graph no longer holds are dropped. */
export function streamGraphLevelReached(graph: StreamGraphSummary, subgraphNamesSteppedThrough: readonly string[]): StreamGraphLevel {
  let level: StreamGraphSummary = graph;
  const steppedThrough: StreamGraphNode[] = [];
  for (const subgraphName of subgraphNamesSteppedThrough) {
    const subgraph = level.nodes.find((node) => node.name === subgraphName);
    if (subgraph === undefined || subgraph.fragment === null) break;
    steppedThrough.push(subgraph);
    level = { ...graph, nodes: subgraph.fragment.nodes, links: subgraph.fragment.links, groups: subgraph.fragment.groups, notes: [] };
  }
  return { graph: level, subgraphs_stepped_through: steppedThrough };
}

/** Why the inside of `subgraph` is read only, in words for the strip over it. */
export function whyTheInsideOfTheSubgraphIsReadOnly(subgraph: StreamGraphNode): string {
  switch (subgraph.fragment?.kind) {
    case "generated":
      return `Made by ${subgraph.type}. Refresh it from its code, or unlock it to edit its nodes.`;
    case "placed_stream":
      return "Another stream, placed by reference. Edit it in its own tab.";
    default:
      return "Editing inside a subgraph waits on tatolab/streamlib#3519. Unlock it to edit its nodes.";
  }
}
