import { useCallback, useEffect, useState } from "react";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import type { NodeGraphCanvasNode } from "./node_graph_canvas_contract";
import type { NodeGraphFlowNode, NodeGraphLinkFlowEdge } from "./node_graph_flow_elements";

/** Whether `selectedIds` holds exactly the nodes of `nodeIds`, in any order. */
function holdsTheSameNodes(selectedIds: ReadonlySet<string>, nodeIds: readonly string[]): boolean {
  return selectedIds.size === nodeIds.length && nodeIds.every((nodeId) => selectedIds.has(nodeId));
}

/** What is selected on the canvas, its cards, notes and links, kept to the cards the caller selects and to the cards in the graph; the cards' changes reach `onNodesSelected`, the one picked last at the end. */
export function useNodeGraphSelection(selectedNodeIds: readonly string[], nodeById: ReadonlyMap<string, NodeGraphCanvasNode>, onNodesSelected: (nodeIds: readonly string[]) => void) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set(selectedNodeIds));
  const [selectedNoteIds, setSelectedNoteIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedLinkIds, setSelectedLinkIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setSelectedIds((selectedBefore) => (holdsTheSameNodes(selectedBefore, selectedNodeIds) ? selectedBefore : new Set(selectedNodeIds)));
  }, [selectedNodeIds]);
  useEffect(() => {
    setSelectedIds((selectedBefore) => {
      const stillInTheGraph = [...selectedBefore].filter((nodeId) => nodeById.has(nodeId));
      return stillInTheGraph.length === selectedBefore.size ? selectedBefore : new Set(stillInTheGraph);
    });
  }, [nodeById]);

  const followTheSelectionChanges = useCallback(
    (changes: NodeChange<NodeGraphFlowNode>[]) => {
      const noteSelectionChanges = changes.flatMap((change) => (change.type === "select" && change.id.startsWith("note:") ? [change] : []));
      if (noteSelectionChanges.length > 0) {
        setSelectedNoteIds((selectedBefore) => {
          const selectedAfter = new Set(selectedBefore);
          for (const change of noteSelectionChanges) {
            if (change.selected) selectedAfter.add(change.id.slice("note:".length));
            else selectedAfter.delete(change.id.slice("note:".length));
          }
          return selectedAfter;
        });
      }
      const selectionChanges = changes.flatMap((change) => (change.type === "select" && nodeById.has(change.id) ? [change] : []));
      if (selectionChanges.length > 0) {
        const selectedAfter = new Set(selectedIds);
        for (const change of selectionChanges) {
          if (change.selected) selectedAfter.add(change.id);
          else selectedAfter.delete(change.id);
        }
        if (holdsTheSameNodes(selectedIds, [...selectedAfter])) return;
        setSelectedIds(selectedAfter);
        const clickedLast = [...selectionChanges].reverse().find((change) => change.selected)?.id ?? null;
        onNodesSelected(clickedLast === null ? [...selectedAfter] : [...[...selectedAfter].filter((nodeId) => nodeId !== clickedLast), clickedLast]);
      }
    },
    [onNodesSelected, nodeById, selectedIds],
  );

  const selectWhatTheBoxHolds = useCallback(
    (cardIds: ReadonlySet<string>, noteIds: ReadonlySet<string>) => {
      setSelectedNoteIds((selectedBefore) => (selectedBefore.size === noteIds.size && [...noteIds].every((noteId) => selectedBefore.has(noteId)) ? selectedBefore : noteIds));
      const cardIdsInTheGraph = [...cardIds].filter((nodeId) => nodeById.has(nodeId));
      if (holdsTheSameNodes(selectedIds, cardIdsInTheGraph)) return;
      setSelectedIds(new Set(cardIdsInTheGraph));
      onNodesSelected(cardIdsInTheGraph);
    },
    [nodeById, selectedIds, onNodesSelected],
  );

  const followTheLinkChanges = useCallback((changes: EdgeChange<NodeGraphLinkFlowEdge>[]) => {
    const selectionChanges = changes.flatMap((change) => (change.type === "select" ? [change] : []));
    if (selectionChanges.length === 0) return;
    setSelectedLinkIds((selectedBefore) => {
      const selectedAfter = new Set(selectedBefore);
      for (const change of selectionChanges) {
        if (change.selected) selectedAfter.add(change.id);
        else selectedAfter.delete(change.id);
      }
      return selectedAfter;
    });
  }, []);

  const selectNothing = useCallback(() => {
    onNodesSelected([]);
    setSelectedLinkIds(new Set());
    setSelectedNoteIds(new Set());
    setSelectedIds(new Set());
  }, [onNodesSelected]);
  const clearTheSelectionAfterADelete = useCallback(() => {
    setSelectedLinkIds(new Set());
    setSelectedNoteIds(new Set());
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      onNodesSelected([]);
    }
  }, [selectedIds, onNodesSelected]);
  const selectTheRightClickedCard = useCallback(
    (nodeId: string) => {
      if (selectedIds.has(nodeId)) return;
      setSelectedIds(new Set([nodeId]));
      setSelectedLinkIds(new Set());
      setSelectedNoteIds(new Set());
      onNodesSelected([nodeId]);
    },
    [selectedIds, onNodesSelected],
  );
  const selectTheRightClickedNote = useCallback(
    (noteId: string) => {
      if (selectedNoteIds.has(noteId)) return;
      setSelectedNoteIds(new Set([noteId]));
      setSelectedLinkIds(new Set());
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        onNodesSelected([]);
      }
    },
    [selectedIds, selectedNoteIds, onNodesSelected],
  );
  const selectTheRightClickedLink = useCallback(
    (linkId: string) => {
      if (selectedLinkIds.has(linkId)) return;
      setSelectedLinkIds(new Set([linkId]));
      setSelectedNoteIds(new Set());
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        onNodesSelected([]);
      }
    },
    [selectedIds, selectedLinkIds, onNodesSelected],
  );

  return { selectedIds, selectedNoteIds, selectedLinkIds, followTheSelectionChanges, selectWhatTheBoxHolds, followTheLinkChanges, selectNothing, clearTheSelectionAfterADelete, selectTheRightClickedCard, selectTheRightClickedNote, selectTheRightClickedLink };
}
