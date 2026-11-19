import { useCallback, useEffect, useMemo, useState } from "react";
import type { NodeChange, ReactFlowInstance } from "@xyflow/react";
import { failureWordsTheCardShows } from "../node_graph/node_card";
import { layOutNodeGraph, nodeGraphCardHeight, type NodeGraphPosition } from "./node_graph_layout";
import type { NodeGraphCanvasCardMove, NodeGraphCanvasEditing, NodeGraphCanvasLink, NodeGraphCanvasNode, NodeGraphCanvasNote, NodeGraphCanvasViewport } from "./node_graph_canvas_contract";
import type { NodeGraphFlowNode } from "./node_graph_flow_elements";
import { type HeldPositionById, type NodeGraphNoteSize, samePosition, onTheCanvasPixel, inCanvasPixels, sameSize, heldValuesNotShownYet, withEntriesSet, withoutTheIds } from "./node_graph_held_layout";

/** The narrowest a card is drawn; a card with longer names grows to fit them. */
const NODE_GRAPH_CARD_SMALLEST_WIDTH = 180;

/** How the canvas frames the whole graph. */
export const FIT_TO_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1, duration: 0 };

/** What decides where the cards with no saved place sit: the nodes, their pins and the links; a new one lays the graph out again. */
function nodeGraphShapeKey(
  nodes: readonly NodeGraphCanvasNode[],
  links: readonly NodeGraphCanvasLink[],
): string {
  return JSON.stringify([
    nodes.map((node) => [
      node.node_id,
      node.title,
      node.inputs.map((pin) => pin.name),
      node.outputs.map((pin) => pin.name),
      failureWordsTheCardShows(node) !== null,
    ]),
    links.map((link) => [
      link.source_node_id,
      link.source_pin,
      link.target_node_id,
      link.target_pin,
    ]),
  ]);
}

/** The shape key while every card has a saved place, when no card is laid out and so no shape decides anything. */
const EVERY_CARD_PLACED_SHAPE_KEY = "every card placed";

/** The cards' sizes as drawn, read once React Flow has measured them for one shape of the graph, and again as a laid-out card's height changes, as its controls load or a List's rows grow. */
interface MeasuredCardSizes {
  shapeKey: string;
  sizeByNode: ReadonlyMap<string, { width: number; height: number }>;
}

/** Whether a card with no saved place is measured at another height than `measured` holds, so the cards below it would overlap it. */
function hasALaidOutCardChangedHeight(nodes: readonly NodeGraphCanvasNode[], cardSizeByNode: ReadonlyMap<string, { width: number; height: number }>, measured: MeasuredCardSizes): boolean {
  return nodes.some((node) => node.saved_position === null && !Object.is(cardSizeByNode.get(node.node_id)?.height, measured.sizeByNode.get(node.node_id)?.height));
}

/** Where the canvas's cards and notes sit and how big they are: laid out until measured, then on the measured sizes, the graph framed once laid out on them, and each move held until the graph shows it. */
export function useNodeGraphCardLayout(nodes: readonly NodeGraphCanvasNode[], links: readonly NodeGraphCanvasLink[], notes: readonly NodeGraphCanvasNote[], nodeById: ReadonlyMap<string, NodeGraphCanvasNode>, editing: NodeGraphCanvasEditing | null, reactFlow: ReactFlowInstance, viewportWhereItWasLeft: NodeGraphCanvasViewport | null) {
  const [cardSizeByNode, setCardSizeByNode] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(new Map());
  const areCardsMeasured = nodes.every((node) =>
    node.saved_position !== null || cardSizeByNode.has(node.node_id),
  );
  const isEveryCardPlaced = nodes.every((node) => node.saved_position !== null);
  const shapeKey = isEveryCardPlaced ? EVERY_CARD_PLACED_SHAPE_KEY : nodeGraphShapeKey(nodes, links);
  const [measuredCardSizes, setMeasuredCardSizes] = useState<MeasuredCardSizes | null>(null);
  const isLaidOutOnMeasuredSizes = measuredCardSizes?.shapeKey === shapeKey;
  const [hasBeenFramed, setHasBeenFramed] = useState(false);
  const [heldCardPositions, setHeldCardPositions] = useState<HeldPositionById>(new Map());
  const [heldCardFrames, setHeldCardFrames] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [heldNotePositions, setHeldNotePositions] = useState<HeldPositionById>(new Map());
  const [heldNoteSizes, setHeldNoteSizes] = useState<ReadonlyMap<string, NodeGraphNoteSize>>(new Map());

  const savedPositionByNode = useMemo(() => new Map(nodes.map((node) => [node.node_id, node.saved_position])), [nodes]);
  useEffect(() => {
    setHeldCardPositions((held) => heldValuesNotShownYet(held, (nodeId, position) => samePosition(position, savedPositionByNode.get(nodeId))));
  }, [savedPositionByNode]);
  useEffect(() => {
    const frameIdByNode = new Map(nodes.map((node) => [node.node_id, node.frame_id]));
    setHeldCardFrames((held) => heldValuesNotShownYet(held, (nodeId, frameId) => !frameIdByNode.has(nodeId) || frameIdByNode.get(nodeId) === frameId));
  }, [nodes]);
  useEffect(() => {
    const noteById = new Map(notes.map((note) => [note.note_id, note]));
    setHeldNotePositions((held) => heldValuesNotShownYet(held, (noteId, position) => samePosition(position, noteById.get(noteId)?.position)));
    setHeldNoteSizes((held) => heldValuesNotShownYet(held, (noteId, size) => noteById.get(noteId) === undefined || sameSize(size, noteById.get(noteId)?.size)));
  }, [notes]);

  const laidOutPositionByNode: Map<string, NodeGraphPosition> = useMemo(
    () =>
      isEveryCardPlaced
        ? new Map()
        : layOutNodeGraph(
            nodes.map((node) => ({
              node_id: node.node_id,
              input_pin_names: node.inputs.map((pin) => pin.name),
              output_pin_names: node.outputs.map((pin) => pin.name),
              shows_failure_words: failureWordsTheCardShows(node) !== null,
              is_collapsed: node.is_collapsed,
              card_width: (isLaidOutOnMeasuredSizes ? measuredCardSizes.sizeByNode.get(node.node_id)?.width : undefined) ?? NODE_GRAPH_CARD_SMALLEST_WIDTH,
              card_height: (isLaidOutOnMeasuredSizes ? measuredCardSizes.sizeByNode.get(node.node_id)?.height : undefined) ?? null,
            })),
            links,
          ),
    [isEveryCardPlaced, nodes, links, isLaidOutOnMeasuredSizes, measuredCardSizes],
  );
  const positionOfTheCard = useCallback(
    (node: NodeGraphCanvasNode): NodeGraphPosition =>
      heldCardPositions.get(node.node_id) ?? node.saved_position ?? laidOutPositionByNode.get(node.node_id) ?? { x: 0, y: 0 },
    [heldCardPositions, laidOutPositionByNode],
  );
  const frameOfTheCard = useCallback((node: NodeGraphCanvasNode): string | null => (heldCardFrames.has(node.node_id) ? (heldCardFrames.get(node.node_id) ?? null) : node.frame_id), [heldCardFrames]);
  const sizeOfTheCard = useCallback(
    (node: NodeGraphCanvasNode) =>
      cardSizeByNode.get(node.node_id) ?? {
        width: NODE_GRAPH_CARD_SMALLEST_WIDTH,
        height: nodeGraphCardHeight({ input_pin_names: node.inputs.map((pin) => pin.name), output_pin_names: node.outputs.map((pin) => pin.name), shows_failure_words: failureWordsTheCardShows(node) !== null, is_collapsed: node.is_collapsed }),
      },
    [cardSizeByNode],
  );

  useEffect(() => {
    if (!areCardsMeasured) return;
    if (isLaidOutOnMeasuredSizes && !hasALaidOutCardChangedHeight(nodes, cardSizeByNode, measuredCardSizes)) return;
    setMeasuredCardSizes({ shapeKey, sizeByNode: new Map(cardSizeByNode) });
  }, [areCardsMeasured, isLaidOutOnMeasuredSizes, measuredCardSizes, nodes, cardSizeByNode, shapeKey]);

  useEffect(() => {
    if (!isLaidOutOnMeasuredSizes || hasBeenFramed) return;
    if (viewportWhereItWasLeft === null) void reactFlow.fitView(FIT_TO_VIEW_OPTIONS);
    else void reactFlow.setViewport(viewportWhereItWasLeft);
    setHasBeenFramed(true);
  }, [isLaidOutOnMeasuredSizes, hasBeenFramed, reactFlow, viewportWhereItWasLeft]);

  const positionOfTheNote = useCallback((note: NodeGraphCanvasNote): NodeGraphPosition => heldNotePositions.get(note.note_id) ?? note.position, [heldNotePositions]);
  const sizeOfTheNote = useCallback((note: NodeGraphCanvasNote): NodeGraphNoteSize => heldNoteSizes.get(note.note_id) ?? note.size, [heldNoteSizes]);

  const followTheLayoutChanges = useCallback(
    (changes: NodeChange<NodeGraphFlowNode>[]) => {
      const measuredChanges = changes.flatMap((change) =>
        change.type === "dimensions" && change.dimensions !== undefined && nodeById.has(change.id)
          ? [{ id: change.id, size: change.dimensions }]
          : [],
      );
      if (measuredChanges.length > 0) {
        setCardSizeByNode((sizesBefore) => {
          const sizesAfter = new Map(sizesBefore);
          for (const { id, size } of measuredChanges) sizesAfter.set(id, size);
          return sizesAfter;
        });
      }
      const draggedCards = changes.flatMap((change) => (change.type === "position" && change.position !== undefined && nodeById.has(change.id) ? [{ id: change.id, value: onTheCanvasPixel(change.position) }] : []));
      if (draggedCards.length > 0) setHeldCardPositions((held) => withEntriesSet(held, draggedCards));
      const movedNotes = changes.flatMap((change) =>
        change.type === "position" && change.position !== undefined && change.id.startsWith("note:") ? [{ id: change.id.slice("note:".length), value: onTheCanvasPixel(change.position) }] : [],
      );
      if (movedNotes.length > 0) setHeldNotePositions((held) => withEntriesSet(held, movedNotes));
      const resizedNotes = changes.flatMap((change) =>
        change.type === "dimensions" && change.dimensions !== undefined && change.resizing === true && change.id.startsWith("note:") ? [{ id: change.id.slice("note:".length), value: inCanvasPixels(change.dimensions) }] : [],
      );
      if (resizedNotes.length > 0) setHeldNoteSizes((held) => withEntriesSet(held, resizedNotes));
    },
    [nodeById],
  );

  const holdTheCardMoves = useCallback((moves: readonly NodeGraphCanvasCardMove[]) => {
    setHeldCardPositions((held) => withEntriesSet(held, moves.map((move) => ({ id: move.node_id, value: move.position }))));
    setHeldCardFrames((held) => withEntriesSet(held, moves.map((move) => ({ id: move.node_id, value: move.frame_id }))));
  }, []);
  const releaseTheHeldCards = useCallback((nodeIds: readonly string[]) => {
    setHeldCardPositions((held) => withoutTheIds(held, nodeIds));
    setHeldCardFrames((held) => withoutTheIds(held, nodeIds));
  }, []);
  const releaseTheHeldNotePosition = useCallback((noteId: string) => setHeldNotePositions((held) => withoutTheIds(held, [noteId])), []);

  const keepTheResizedNote = useCallback(
    (noteId: string, resized: NodeGraphPosition & NodeGraphNoteSize) => {
      if (editing === null) return;
      const position = onTheCanvasPixel(resized);
      const size = inCanvasPixels(resized);
      setHeldNotePositions((held) => withEntriesSet(held, [{ id: noteId, value: position }]));
      setHeldNoteSizes((held) => withEntriesSet(held, [{ id: noteId, value: size }]));
      void editing.onNoteChanged(noteId, { position, size }).then((answer) => {
        if (answer !== "refused") return;
        setHeldNotePositions((held) => withoutTheIds(held, [noteId]));
        setHeldNoteSizes((held) => withoutTheIds(held, [noteId]));
      });
    },
    [editing],
  );

  return { cardSizeByNode, isLaidOutOnMeasuredSizes, hasBeenFramed, positionOfTheCard, frameOfTheCard, sizeOfTheCard, positionOfTheNote, sizeOfTheNote, followTheLayoutChanges, holdTheCardMoves, releaseTheHeldCards, releaseTheHeldNotePosition, keepTheResizedNote };
}
