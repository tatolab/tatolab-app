import { useCallback, useEffect, useRef, useState } from "react";
import { useStoreApi, type ReactFlowInstance } from "@xyflow/react";
import type { NodeGraphFlowNode, NodeGraphLinkFlowEdge } from "./node_graph_flow_elements";

/** What a box dragged out on the canvas does with the selection it starts from, as in Blender: Shift adds, Ctrl or ⌘ takes away, and a plain box replaces. */
export type NodeGraphBoxSelectionMode = "replace" | "add" | "take_away";

/** The mode the keys held as a box starts choose. */
export function boxSelectionModeOf(keys: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): NodeGraphBoxSelectionMode {
  if (keys.shiftKey) return "add";
  if (keys.ctrlKey || keys.metaKey) return "take_away";
  return "replace";
}

/** The selection a box leaves: `before` with what the box holds added, taken away, or in its place. */
export function selectionAfterTheBox(mode: NodeGraphBoxSelectionMode, before: ReadonlySet<string>, inTheBox: ReadonlySet<string>): Set<string> {
  if (mode === "replace") return new Set(inTheBox);
  if (mode === "add") return new Set([...before, ...inTheBox]);
  return new Set([...before].filter((id) => !inTheBox.has(id)));
}

interface BoxStarted {
  mode: NodeGraphBoxSelectionMode;
  cardIdsBefore: ReadonlySet<string>;
  noteIdsBefore: ReadonlySet<string>;
}

/**
 * The box the pointer drags out on the canvas, which selects the cards and notes it touches by the mode the keys held as it
 * started. React Flow's own box always replaces the selection, so while a box is out its card and note selection changes are
 * passed over, and the selection follows the box React Flow draws instead.
 */
export function useNodeGraphBoxSelection({
  reactFlow,
  selectedIds,
  selectedNoteIds,
  isACard,
  noteIdOfTheFlowNode,
  onBoxed,
}: {
  reactFlow: Pick<ReactFlowInstance, "getIntersectingNodes">;
  selectedIds: ReadonlySet<string>;
  selectedNoteIds: ReadonlySet<string>;
  isACard: (flowNodeId: string) => boolean;
  /** The note a flow node draws, or null when it draws none. */
  noteIdOfTheFlowNode: (flowNodeId: string) => string | null;
  onBoxed: (cardIds: ReadonlySet<string>, noteIds: ReadonlySet<string>) => void;
}) {
  const store = useStoreApi<NodeGraphFlowNode, NodeGraphLinkFlowEdge>();
  const boxStarted = useRef<BoxStarted | null>(null);
  const [boxMarksRedrawn, setBoxMarksRedrawn] = useState(0);
  const selectionNow = useRef({ selectedIds, selectedNoteIds });
  selectionNow.current = { selectedIds, selectedNoteIds };
  const followers = useRef({ reactFlow, isACard, noteIdOfTheFlowNode, onBoxed });
  followers.current = { reactFlow, isACard, noteIdOfTheFlowNode, onBoxed };

  useEffect(
    () =>
      store.subscribe((state, stateBefore) => {
        const started = boxStarted.current;
        const box = state.userSelectionRect;
        if (started === null || box === null || box === stateBefore.userSelectionRect) return;
        const [panX, panY, zoom] = state.transform;
        const boxOnTheCanvas = { x: (box.x - panX) / zoom, y: (box.y - panY) / zoom, width: box.width / zoom, height: box.height / zoom };
        const { reactFlow: flow, isACard: isACardNow, noteIdOfTheFlowNode: noteIdOf, onBoxed: boxed } = followers.current;
        const cardIdsInTheBox = new Set<string>();
        const noteIdsInTheBox = new Set<string>();
        for (const flowNode of flow.getIntersectingNodes(boxOnTheCanvas, true)) {
          const noteId = noteIdOf(flowNode.id);
          if (noteId !== null) noteIdsInTheBox.add(noteId);
          else if (isACardNow(flowNode.id)) cardIdsInTheBox.add(flowNode.id);
        }
        const cardIdsSelected = selectionAfterTheBox(started.mode, started.cardIdsBefore, cardIdsInTheBox);
        const noteIdsSelected = selectionAfterTheBox(started.mode, started.noteIdsBefore, noteIdsInTheBox);
        boxed(cardIdsSelected, noteIdsSelected);
        // React Flow marks its own copy of each card in or out of its box; a card it marked otherwise than the selection is
        // handed to it again, so every card shows the selection.
        const isMarkedOtherwise = [...state.nodeLookup.values()].some((flowNode) => {
          const noteId = noteIdOf(flowNode.id);
          const isSelected = noteId === null ? cardIdsSelected.has(flowNode.id) : noteIdsSelected.has(noteId);
          return (noteId !== null || isACardNow(flowNode.id)) && (flowNode.selected ?? false) !== isSelected;
        });
        if (isMarkedOtherwise) setBoxMarksRedrawn((count) => count + 1);
      }),
    [store],
  );

  // React Flow clears the selection as its box starts, before telling anyone the box started, so the selection is kept at
  // the press that may start one, and its card and note selection changes are passed over until the press is let go.
  const pressTheCanvas = useCallback((press: { button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget | null }) => {
    const isOnTheEmptyCanvas = press.target instanceof Element && press.target.classList.contains("react-flow__pane");
    if (press.button !== 0 || (!isOnTheEmptyCanvas && !press.shiftKey)) return;
    boxStarted.current = { mode: boxSelectionModeOf(press), cardIdsBefore: selectionNow.current.selectedIds, noteIdsBefore: selectionNow.current.selectedNoteIds };
    const letGo = () => {
      boxStarted.current = null;
      window.removeEventListener("pointerup", letGo, true);
      window.removeEventListener("pointercancel", letGo, true);
    };
    window.addEventListener("pointerup", letGo, true);
    window.addEventListener("pointercancel", letGo, true);
  }, []);
  /** Whether a press that may drag out a box is held, its selection followed here rather than from React Flow's changes. */
  const isABoxPossible = useCallback(() => boxStarted.current !== null, []);

  /** Counts each time the cards are to be handed to React Flow again to undo its box's marks. */
  return { pressTheCanvas, isABoxPossible, boxMarksRedrawn };
}
