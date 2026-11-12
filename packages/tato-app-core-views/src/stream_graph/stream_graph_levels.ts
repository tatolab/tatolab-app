// The levels of a stream's graph the canvas can show: the stream's own, and the inside of each subgraph
// stepped into from it, reached by the names of the subgraph nodes stepped through and edited by their UUIDs.

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

/** The level of `graph` that `level`, the path of subgraph node UUIDs from the stream's own level inward, reaches; `null` when one of them is no subgraph of the level before. */
export function streamGraphLevelAtTheSubgraphIds(graph: StreamGraphSummary, level: readonly string[]): StreamGraphLevel | null {
  let levelReached: StreamGraphLevel = { graph, subgraphs_stepped_through: [] };
  for (const subgraphId of level) {
    const subgraphName = levelReached.graph.nodes.find((node) => node.id === subgraphId && node.fragment !== null)?.name;
    if (subgraphName === undefined) return null;
    levelReached = streamGraphLevelReached(graph, [...levelReached.subgraphs_stepped_through.map((subgraph) => subgraph.name), subgraphName]);
  }
  return levelReached;
}

/** Whether the runtime edits the inside of `subgraph`: a stream of its own project placed by reference, never an import's stream or a graph generator's output. */
export function isTheInsideOfTheSubgraphEdited(subgraph: StreamGraphNode): boolean {
  return subgraph.fragment?.kind === "placed_stream" && theImportAPlacedStreamIsOf(subgraph) === null;
}

/** The import whose stream `subgraph` places, from its config's `stream.from`; `null` for a stream of its own project. */
function theImportAPlacedStreamIsOf(subgraph: StreamGraphNode): string | null {
  const placedStream = subgraph.config["stream"];
  if (placedStream === null || typeof placedStream !== "object" || Array.isArray(placedStream)) return null;
  const importedFrom = placedStream["from"];
  return typeof importedFrom === "string" ? importedFrom : null;
}

/** The first subgraph stepped through whose inside the runtime edits nothing in, a graph generator's output or an import's stream, which keeps every level inside it read only; `null` when each is a stream of the project. */
export function theSubgraphKeepingTheLevelReadOnly(subgraphsSteppedThrough: readonly StreamGraphNode[]): { subgraph: StreamGraphNode; depth: number } | null {
  const depth = subgraphsSteppedThrough.findIndex((subgraph) => !isTheInsideOfTheSubgraphEdited(subgraph));
  const subgraph = subgraphsSteppedThrough[depth];
  return subgraph === undefined ? null : { subgraph, depth };
}

/** The `level` a graph action names to edit inside the first `depth` subgraphs stepped through: their UUIDs, outermost first. */
export function levelOfTheSubgraphsSteppedThrough(subgraphsSteppedThrough: readonly StreamGraphNode[], depth: number = subgraphsSteppedThrough.length): string[] {
  return subgraphsSteppedThrough.slice(0, depth).map((subgraph) => subgraph.id);
}

/** Why the inside of `subgraph`, a graph generator's output or an import's stream, is read only, in words for the strip over it. */
export function whyTheInsideOfTheSubgraphIsReadOnly(subgraph: StreamGraphNode): string {
  return subgraph.fragment?.kind === "placed_stream"
    ? "A stream of an imported project. Open the import as its own project to edit it, or unlock it to edit a copy here."
    : `Made by ${subgraph.type}. Refresh it from its code, or unlock it to edit its nodes.`;
}
