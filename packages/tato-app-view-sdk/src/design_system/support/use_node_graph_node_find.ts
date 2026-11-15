import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { nodeGraphFindIndexAfterAStep, nodeGraphNodeIdsMatching, NO_NODE_GRAPH_NODE_FOUND, type NodeGraphNodesFound } from "../node_graph_find_bar";
import type { NodeGraphCanvasNode } from "./node_graph_canvas_contract";

/** The canvas's find bar: the words looked for, the cards they match, and the current match brought into view. */
export function useNodeGraphNodeFind(nodes: readonly NodeGraphCanvasNode[], reactFlow: ReactFlowInstance, canvasElement: RefObject<HTMLDivElement | null>) {
  const [nodeFind, setNodeFind] = useState<{ find_words: string; current_index: number } | null>(null);
  const nodeIdsFound = useMemo(() => (nodeFind === null ? [] : nodeGraphNodeIdsMatching(nodes, nodeFind.find_words)), [nodes, nodeFind]);
  const currentNodeIdFound = nodeFind === null ? null : (nodeIdsFound[Math.min(nodeFind.current_index, nodeIdsFound.length - 1)] ?? null);
  const nodesFound = useMemo<NodeGraphNodesFound>(
    () => (nodeFind === null ? NO_NODE_GRAPH_NODE_FOUND : { found_node_ids: new Set(nodeIdsFound), current_node_id: currentNodeIdFound }),
    [nodeFind, nodeIdsFound, currentNodeIdFound],
  );
  useEffect(() => {
    if (currentNodeIdFound !== null) void reactFlow.fitView({ nodes: [{ id: currentNodeIdFound }], minZoom: reactFlow.getZoom(), maxZoom: reactFlow.getZoom(), duration: 200 });
  }, [currentNodeIdFound, reactFlow]);
  const openTheNodeFind = useCallback(() => setNodeFind((findSoFar) => findSoFar ?? { find_words: "", current_index: 0 }), []);
  const closeTheNodeFind = useCallback(() => {
    setNodeFind(null);
    canvasElement.current?.focus({ preventScroll: true });
  }, [canvasElement]);
  const changeTheFindWords = useCallback((findWords: string) => setNodeFind({ find_words: findWords, current_index: 0 }), []);
  const stepTheFind = useCallback(
    (step: 1 | -1) =>
      setNodeFind((findSoFar) => (findSoFar === null ? null : { ...findSoFar, current_index: nodeGraphFindIndexAfterAStep(findSoFar.current_index, nodeIdsFound.length, step) })),
    [nodeIdsFound.length],
  );
  return { nodeFind, changeTheFindWords, stepTheFind, nodeIdsFound, currentNodeIdFound, nodesFound, openTheNodeFind, closeTheNodeFind };
}
