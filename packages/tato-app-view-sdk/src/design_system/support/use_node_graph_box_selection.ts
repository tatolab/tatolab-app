import { useCallback, useEffect, useRef, useState } from "react";
import { useStoreApi, type ReactFlowInstance } from "@xyflow/react";
import type { NodeGraphFlowNode, NodeGraphLinkFlowEdge } from "./node_graph_flow_elements";

/** What a box dragged out on the canvas does with the selection it starts from, as in Blender: Shift adds, Ctrl or ⌘ takes away, and a plain box replaces. */
export type NodeGraphBoxSelectionMode = "replace" | "add" | "take_away";

/** The cards, notes and links selected on the canvas. */
export interface NodeGraphCanvasSelection {
  cardIds: ReadonlySet<string>;
  noteIds: ReadonlySet<string>;
  linkIds: ReadonlySet<string>;
}

/** The mode the keys held as a box starts choose. */
export function boxSelectionModeOf(keys: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): NodeGraphBoxSelectionMode {
  if (keys.shiftKey) return "add";
  if (keys.ctrlKey || keys.metaKey) return "take_away";
  return "replace";
}

/** The ids a box leaves selected: `before` with what the box holds added, taken away, or in its place. */
export function selectionAfterTheBox(mode: NodeGraphBoxSelectionMode, before: ReadonlySet<string>, inTheBox: ReadonlySet<string>): Set<string> {
  if (mode === "replace") return new Set(inTheBox);
  if (mode === "add") return new Set([...before, ...inTheBox]);
  return new Set([...before].filter((id) => !inTheBox.has(id)));
}

interface BoxPress {
  mode: NodeGraphBoxSelectionMode;
  selectionBefore: NodeGraphCanvasSelection;
}

/**
 * The box the pointer drags out on the canvas. It selects the cards and notes it touches, and the links joined to those
 * cards, by the mode the keys held as it started. React Flow's own box always replaces the selection, and clears it before
 * telling anyone a box started, so the selection is kept at the press that may start a box, React Flow's selection changes
 * are passed over while that press is held, and the selection follows the box React Flow draws. React Flow also marks its
 * own copy of each card in or out of its box; whenever a mark differs from the selection, `boxMarksRedrawn` counts up so
 * the canvas hands it the cards again.
 */
export function useNodeGraphBoxSelection({
  reactFlow,
  selection,
  isACard,
  noteIdOfTheFlowNode,
  linkIdsJoinedTo,
  onBoxed,
}: {
  reactFlow: Pick<ReactFlowInstance, "getIntersectingNodes">;
  selection: NodeGraphCanvasSelection;
  isACard: (flowNodeId: string) => boolean;
  /** The note a flow node draws, or null when it draws none. */
  noteIdOfTheFlowNode: (flowNodeId: string) => string | null;
  /** The links that can be selected joined to any of `cardIds`. */
  linkIdsJoinedTo: (cardIds: ReadonlySet<string>) => ReadonlySet<string>;
  onBoxed: (selection: NodeGraphCanvasSelection) => void;
}) {
  const store = useStoreApi<NodeGraphFlowNode, NodeGraphLinkFlowEdge>();
  const boxPress = useRef<BoxPress | null>(null);
  const [boxMarksRedrawn, setBoxMarksRedrawn] = useState(0);
  const latestSelection = useRef(selection);
  latestSelection.current = selection;
  const latestCallbacks = useRef({ reactFlow, isACard, noteIdOfTheFlowNode, linkIdsJoinedTo, onBoxed });
  latestCallbacks.current = { reactFlow, isACard, noteIdOfTheFlowNode, linkIdsJoinedTo, onBoxed };

  useEffect(
    () =>
      store.subscribe((state, stateBefore) => {
        const press = boxPress.current;
        const box = state.userSelectionRect;
        if (press === null || box === null || box === stateBefore.userSelectionRect) return;
        const callbacks = latestCallbacks.current;
        const [panX, panY, zoom] = state.transform;
        const boxOnTheCanvas = { x: (box.x - panX) / zoom, y: (box.y - panY) / zoom, width: box.width / zoom, height: box.height / zoom };
        const cardIdsInTheBox = new Set<string>();
        const noteIdsInTheBox = new Set<string>();
        for (const flowNode of callbacks.reactFlow.getIntersectingNodes(boxOnTheCanvas, true)) {
          const noteId = callbacks.noteIdOfTheFlowNode(flowNode.id);
          if (noteId !== null) noteIdsInTheBox.add(noteId);
          else if (callbacks.isACard(flowNode.id)) cardIdsInTheBox.add(flowNode.id);
        }
        const { selectionBefore } = press;
        const selectionAfter: NodeGraphCanvasSelection = {
          cardIds: selectionAfterTheBox(press.mode, selectionBefore.cardIds, cardIdsInTheBox),
          noteIds: selectionAfterTheBox(press.mode, selectionBefore.noteIds, noteIdsInTheBox),
          linkIds: selectionAfterTheBox(press.mode, selectionBefore.linkIds, callbacks.linkIdsJoinedTo(cardIdsInTheBox)),
        };
        callbacks.onBoxed(selectionAfter);
        const isAMarkOtherThanTheSelection = [...state.nodeLookup.values()].some((flowNode) => {
          const noteId = callbacks.noteIdOfTheFlowNode(flowNode.id);
          if (noteId === null && !callbacks.isACard(flowNode.id)) return false;
          const isSelected = noteId === null ? selectionAfter.cardIds.has(flowNode.id) : selectionAfter.noteIds.has(noteId);
          return (flowNode.selected ?? false) !== isSelected;
        });
        if (isAMarkOtherThanTheSelection) setBoxMarksRedrawn((count) => count + 1);
      }),
    [store],
  );

  const letGoOfTheBox = useCallback(() => {
    boxPress.current = null;
  }, []);
  useEffect(() => {
    // A press let go anywhere, or lost with the window's focus, ends the box.
    window.addEventListener("pointerup", letGoOfTheBox, true);
    window.addEventListener("pointercancel", letGoOfTheBox, true);
    window.addEventListener("blur", letGoOfTheBox);
    return () => {
      window.removeEventListener("pointerup", letGoOfTheBox, true);
      window.removeEventListener("pointercancel", letGoOfTheBox, true);
      window.removeEventListener("blur", letGoOfTheBox);
    };
  }, [letGoOfTheBox]);

  /** Keeps the selection at a press that may drag out a box: a left press on the empty canvas, or anywhere with Shift. */
  const pressTheCanvas = useCallback((press: { button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget | null }) => {
    const isOnTheEmptyCanvas = press.target instanceof Element && press.target.classList.contains("react-flow__pane");
    boxPress.current = press.button === 0 && (isOnTheEmptyCanvas || press.shiftKey) ? { mode: boxSelectionModeOf(press), selectionBefore: latestSelection.current } : null;
  }, []);
  /** Whether a press that may drag out a box is held, its selection followed here rather than from React Flow's changes. */
  const isABoxPossible = useCallback(() => boxPress.current !== null, []);

  return { pressTheCanvas, isABoxPossible, boxMarksRedrawn };
}
