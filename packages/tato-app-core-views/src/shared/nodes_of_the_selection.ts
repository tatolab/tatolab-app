import type { StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";

const NO_NODES_SELECTED: readonly string[] = [];

/** The stream whose nodes `selection` holds and those nodes' names, the one picked last at the end; `null` when it holds no node. */
export function nodesTheSelectionHolds(selection: StudioSelection | null): { stream: string; nodes: readonly string[] } | null {
  if (selection?.kind === "node") return { stream: selection.stream, nodes: [selection.node] };
  if (selection?.kind === "nodes") return { stream: selection.stream, nodes: selection.nodes };
  return null;
}

/** The names of the nodes of `stream` that `selection` holds, the one picked last at the end. */
export function nodesTheSelectionHoldsInTheStream(selection: StudioSelection | null, stream: string): readonly string[] {
  const selectedNodes = nodesTheSelectionHolds(selection);
  return selectedNodes !== null && selectedNodes.stream === stream ? selectedNodes.nodes : NO_NODES_SELECTED;
}

/** The selection of `nodes` of `stream`, one node or several, the one picked last at the end; `null` when `nodes` is empty. */
export function selectionOfTheNodes(stream: string, nodes: readonly string[]): StudioSelection | null {
  const pickedLast = nodes.at(-1);
  if (pickedLast === undefined) return null;
  return nodes.length === 1 ? { kind: "node", stream, node: pickedLast } : { kind: "nodes", stream, nodes: [...nodes] };
}
