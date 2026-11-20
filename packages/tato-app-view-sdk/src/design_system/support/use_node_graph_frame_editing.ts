import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { NODE_GRAPH_FRAME_COLOURS, type NodeGraphCanvasEditing, type NodeGraphCanvasFrame, type NodeGraphCanvasFrameChange } from "./node_graph_canvas_contract";
import type { NodeGraphFrameWordsBeingEdited } from "./node_graph_flow_elements";

/** How many colours other frames use beyond the presets a frame's menu offers again. */
const FRAME_COLOURS_USED_ELSEWHERE_OFFERED = 3;

/** The colours the canvas's frames use that no preset is, newest frame first, at most `FRAME_COLOURS_USED_ELSEWHERE_OFFERED`. */
function frameColoursUsedBeyondThePresets(frames: readonly NodeGraphCanvasFrame[]): readonly string[] {
  const presetColours = new Set(NODE_GRAPH_FRAME_COLOURS.map(({ colour }) => colour.toLowerCase()));
  const usedColours = frames.flatMap((frame) => (frame.colour === null || presetColours.has(frame.colour.toLowerCase()) ? [] : [frame.colour.toLowerCase()]));
  return [...new Set(usedColours.reverse())].slice(0, FRAME_COLOURS_USED_ELSEWHERE_OFFERED);
}

/** The editing of the canvas's frames: framing the selection with a title typed ahead, the frame words being edited, and the frame whose colour is picked. */
export function useNodeGraphFrameEditing(editing: NodeGraphCanvasEditing | null, frames: readonly NodeGraphCanvasFrame[], selectedIds: ReadonlySet<string>) {
  const [frameWordsBeingEdited, setFrameWordsBeingEdited] = useState<NodeGraphFrameWordsBeingEdited | null>(null);
  const frameIdsWhenAFrameWasAskedFor = useRef<ReadonlySet<string> | null>(null);
  const titleTypedWhileTheFrameIsMade = useRef({ typed: "", isEntered: false });
  const frameTheSelection = useCallback(() => {
    if (editing === null) return;
    const frameIdsBefore = new Set(frames.map((frame) => frame.frame_id));
    frameIdsWhenAFrameWasAskedFor.current = frameIdsBefore;
    titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: false };
    void editing.onFrameAskedFor([...selectedIds]).then((answer) => {
      if (answer === "refused" && frameIdsWhenAFrameWasAskedFor.current === frameIdsBefore) frameIdsWhenAFrameWasAskedFor.current = null;
    });
  }, [editing, frames, selectedIds]);
  /** Takes a key typed while the frame asked for is made into its title, and whether it took it. */
  const takeAKeyTypedWhileTheFrameIsMade = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): boolean => {
    const titleTyped = titleTypedWhileTheFrameIsMade.current;
    if (frameIdsWhenAFrameWasAskedFor.current === null || titleTyped.isEntered || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key.length === 1) titleTyped.typed += event.key;
    else if (event.key === "Backspace") titleTyped.typed = titleTyped.typed.slice(0, -1);
    else if (event.key === "Enter") titleTyped.isEntered = true;
    else if (event.key === "Escape") titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: true };
    if (event.key.length !== 1 && event.key !== "Backspace" && event.key !== "Enter" && event.key !== "Escape") return false;
    event.preventDefault();
    return true;
  }, []);
  useEffect(() => {
    const frameIdsBefore = frameIdsWhenAFrameWasAskedFor.current;
    if (frameIdsBefore === null) return;
    const newFrame = frames.find((frame) => !frameIdsBefore.has(frame.frame_id));
    if (newFrame === undefined) return;
    frameIdsWhenAFrameWasAskedFor.current = null;
    const { typed, isEntered } = titleTypedWhileTheFrameIsMade.current;
    titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: false };
    const typedTitle = typed.trim();
    if (isEntered && typedTitle !== "") {
      editing?.onFrameChanged(newFrame.frame_id, { title: typedTitle });
      return;
    }
    if (isEntered) return;
    setFrameWordsBeingEdited({ frame_id: newFrame.frame_id, field: "title", ...(typed === "" ? {} : { typed_ahead: typed }) });
  }, [frames, editing]);
  const frameWordsEditing = useMemo(() => ({ frameWordsBeingEdited, editTheFrameWords: setFrameWordsBeingEdited }), [frameWordsBeingEdited]);
  const [frameIdWhoseColourIsPicked, setFrameIdWhoseColourIsPicked] = useState<string | null>(null);
  const frameWhoseColourIsPicked = frames.find((frame) => frame.frame_id === frameIdWhoseColourIsPicked) ?? null;
  const frameColoursUsed = useMemo(() => frameColoursUsedBeyondThePresets(frames), [frames]);
  // A caller hands new editing on every reading of its graph; the cards and frames are handed calls that reach the newest
  // one, so a reading does not draw every card again.
  const newestEditing = useRef(editing);
  useLayoutEffect(() => {
    newestEditing.current = editing;
  }, [editing]);
  const isEditable = editing !== null;
  const cardAndFrameEditing = useMemo(
    () =>
      isEditable
        ? {
            onFrameChanged: (frameId: string, change: NodeGraphCanvasFrameChange) => newestEditing.current?.onFrameChanged(frameId, change),
            onFrameRemoved: (frameId: string) => newestEditing.current?.onFrameRemoved(frameId),
            onCardCollapsed: (nodeId: string, collapsed: boolean) => newestEditing.current?.onCardCollapsed(nodeId, collapsed),
            onBundleOpened: (nodeId: string, side: "input" | "output", pin: string, open: boolean) => newestEditing.current?.onBundleOpened(nodeId, side, pin, open),
          }
        : null,
    [isEditable],
  );
  return { takeAKeyTypedWhileTheFrameIsMade, frameTheSelection, frameWordsEditing, setFrameIdWhoseColourIsPicked, frameWhoseColourIsPicked, frameColoursUsed, cardAndFrameEditing };
}
