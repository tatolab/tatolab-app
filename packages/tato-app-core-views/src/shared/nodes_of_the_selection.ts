import type { StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";

const NO_NODES_SELECTED: readonly string[] = [];

/** The level a node selection is at: the path of subgraph node UUIDs from its stream's own level inward, empty at that level. */
export function levelOfTheSelection(selection: StudioSelection | null): readonly string[] {
  return selection?.kind === "node" || selection?.kind === "nodes" ? (selection.level ?? NO_NODES_SELECTED) : NO_NODES_SELECTED;
}

function isTheSameLevel(level: readonly string[], otherLevel: readonly string[]): boolean {
  return level.length === otherLevel.length && level.every((subgraph, depth) => otherLevel[depth] === subgraph);
}

/** The stream whose nodes at `level` `selection` holds and those nodes' names, the one picked last at the end; `null` when it holds no node there. */
export function nodesTheSelectionHolds(selection: StudioSelection | null, level: readonly string[] = NO_NODES_SELECTED): { stream: string; nodes: readonly string[] } | null {
  if (!isTheSameLevel(levelOfTheSelection(selection), level)) return null;
  if (selection?.kind === "node") return { stream: selection.stream, nodes: [selection.node] };
  if (selection?.kind === "nodes") return { stream: selection.stream, nodes: selection.nodes };
  return null;
}

/** The names of the nodes at `level` of `stream` that `selection` holds, the one picked last at the end. */
export function nodesTheSelectionHoldsInTheStream(selection: StudioSelection | null, stream: string, level: readonly string[] = NO_NODES_SELECTED): readonly string[] {
  const selectedNodes = nodesTheSelectionHolds(selection, level);
  return selectedNodes !== null && selectedNodes.stream === stream ? selectedNodes.nodes : NO_NODES_SELECTED;
}

/** The selection of `nodes` at `level` of `stream`, one node or several, the one picked last at the end; `null` when `nodes` is empty. */
export function selectionOfTheNodes(stream: string, nodes: readonly string[], level: readonly string[] = NO_NODES_SELECTED): StudioSelection | null {
  const pickedLast = nodes.at(-1);
  if (pickedLast === undefined) return null;
  const atTheLevel = level.length === 0 ? {} : { level: [...level] };
  return nodes.length === 1 ? { kind: "node", stream, node: pickedLast, ...atTheLevel } : { kind: "nodes", stream, nodes: [...nodes], ...atTheLevel };
}
