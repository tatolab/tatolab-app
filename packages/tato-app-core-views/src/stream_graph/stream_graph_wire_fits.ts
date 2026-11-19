// How a wire dragged off a pin fits, as the runtime's `check_link_candidates` answers it: the question asked once
// per drag, from the pin by its node's id, and the answer read back onto the canvas's pins by name, each socket's
// words the runtime's own; for a wire let go over empty canvas, the node types it fits and the port of each a placed
// one is linked by. Studio judges no pin itself: a pin the runtime did not answer for is left unjudged.

import { nodeGraphPinKey, type NodeGraphCanvasDraggedPin, type NodeGraphPinWireFit, type NodeGraphWireFits } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import type { CheckLinkCandidatesRequest, LinkCandidateEnd, LinkCandidatesChecking, LinkCheckResult } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nameInWords, nodeTypeClassName } from "../shared/node_words";
import type { EditedStreamGraph } from "../shared/stream_graph_edits";

/** What a wire dragged off a pin is asked against: the pins placed in its graph, or every port of each node type its stream offers. */
export type LinkCandidatesAsked = "placed_ports" | "node_type_ports";

/** The runtime's question of how a wire dragged off `draggedOff` at `level` links to each of `among`, refusals among the placed pins included; `null` for a pin of a node `edited` names no id for. */
export function linkCandidatesRequestOf(edited: EditedStreamGraph, draggedOff: NodeGraphCanvasDraggedPin, level: readonly string[], among: LinkCandidatesAsked): CheckLinkCandidatesRequest | null {
  const node = edited.nodeIdByName.get(draggedOff.node_id);
  if (node === undefined) return null;
  const end = { node, port: draggedOff.pin };
  return {
    stream: edited.streamAsset,
    ...(level.length === 0 ? {} : { level: [...level] }),
    from: draggedOff.side === "output" ? { output: end } : { input: end },
    among,
    ...(among === "placed_ports" ? { include_refused: true } : {}),
  };
}

/** How one check fits a socket, and what a pointer resting on it reads: the convert node the runtime would place, or its refusal in its words. */
function wireFitOfTheCheck(check: LinkCheckResult): NodeGraphPinWireFit {
  switch (check.outcome) {
    case "connects":
    case "connects_with_free_conversion":
      return { outcome: check.outcome, words: null };
    case "connects_through_convert_node":
      return { outcome: check.outcome, words: check.convert_node === undefined || check.convert_node === null ? null : `Connects through a ${nameInWords(nodeTypeClassName(check.convert_node.node_type))} node` };
    case "refused":
      return { outcome: check.outcome, words: check.refusal?.runtime_words ?? null };
  }
}

/** How a wire dragged off `draggedOff` fits each placed pin `checking` answers for, keyed by the canvas's names; none when the runtime was not asked or refused the question, so the canvas judges nothing. */
export function wireFitsOfTheAnswer(edited: EditedStreamGraph, draggedOff: NodeGraphCanvasDraggedPin, checking: LinkCandidatesChecking): NodeGraphWireFits {
  const fits = new Map<string, NodeGraphPinWireFit>();
  if (checking.kind !== "checked") return fits;
  const nodeNameById = new Map(edited.graph.nodes.map((node) => [node.id, node.name]));
  const otherSide = draggedOff.side === "output" ? "input" : "output";
  const keyOfThePlacedPin = (end: LinkCandidateEnd): string | null => {
    const nodeName = end.kind === "placed_port" ? nodeNameById.get(end.node) : undefined;
    return nodeName === undefined ? null : nodeGraphPinKey(nodeName, otherSide, end.port);
  };
  for (const { end, check } of checking.result.candidates) {
    const key = keyOfThePlacedPin(end);
    if (key !== null) fits.set(key, wireFitOfTheCheck(check));
  }
  for (const { end, why } of checking.result.not_checked ?? []) {
    const key = keyOfThePlacedPin(end);
    if (key !== null) fits.set(key, { outcome: "not_checked", words: why });
  }
  return fits;
}

/** The port of each node type a wire let go over empty canvas fits, the first the runtime did not refuse, by type; `null` when the runtime was not asked or refused the question, so the search judges nothing. */
export function portsALooseWireFits(checking: LinkCandidatesChecking): ReadonlyMap<string, string> | null {
  if (checking.kind !== "checked") return null;
  const portByNodeType = new Map<string, string>();
  for (const { end, check } of checking.result.candidates) {
    if (end.kind === "node_type_port" && check.outcome !== "refused" && !portByNodeType.has(end.node_type)) portByNodeType.set(end.node_type, end.port);
  }
  return portByNodeType;
}
