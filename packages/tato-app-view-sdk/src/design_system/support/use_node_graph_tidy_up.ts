import { Effect, Fiber } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeGraphPosition } from "./node_graph_layout";
import type { NodeGraphCanvasCardMove, NodeGraphCanvasEditing, NodeGraphCanvasLink, NodeGraphCanvasNode, NodeGraphCanvasNote } from "./node_graph_canvas_contract";
import { tidyUpNodeGraph } from "./node_graph_tidy_up";
import { layoutLinkOf, layoutNodeOf } from "./use_node_graph_card_layout";

/** How long the cards take to glide to the places Tidy up gives them; the wires come back, routed again, once they are there. */
export const NODE_GRAPH_TIDY_UP_GLIDE_MILLISECONDS = 320;

/** The fewest cards selected that Tidy up lays out on their own; with fewer it lays out the whole graph. */
const FEWEST_CARDS_TIDIED_ON_THEIR_OWN = 2;

/** What Tidy up reads of the canvas: the graph, where each card and note sits now and how big, and how a move is held until the graph shows it. */
interface NodeGraphTidyUpScene {
  editing: NodeGraphCanvasEditing | null;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  notes: readonly NodeGraphCanvasNote[];
  nodeById: ReadonlyMap<string, NodeGraphCanvasNode>;
  selectedIds: ReadonlySet<string>;
  positionOfTheCard: (node: NodeGraphCanvasNode) => NodeGraphPosition;
  frameOfTheCard: (node: NodeGraphCanvasNode) => string | null;
  sizeOfTheCard: (node: NodeGraphCanvasNode) => { width: number; height: number };
  positionOfTheNote: (note: NodeGraphCanvasNote) => NodeGraphPosition;
  sizeOfTheNote: (note: NodeGraphCanvasNote) => { width: number; height: number };
  holdTheCardMoves: (moves: readonly NodeGraphCanvasCardMove[]) => void;
  releaseTheHeldCards: (nodeIds: readonly string[]) => void;
  holdTheNoteMoves: (moves: readonly { note_id: string; position: NodeGraphPosition }[]) => void;
  releaseTheHeldNotePositions: (noteIds: readonly string[]) => void;
}

/**
 * Tidy up: lays out the selected cards, or with fewer than two selected every card and note, holds them at their new
 * places while they glide there, and asks for every move as one edit; a refused edit puts them back.
 */
export function useNodeGraphTidyUp(scene: NodeGraphTidyUpScene) {
  const { editing, nodes, links, notes, nodeById, selectedIds, positionOfTheCard, frameOfTheCard, sizeOfTheCard, positionOfTheNote, sizeOfTheNote, holdTheCardMoves, releaseTheHeldCards, holdTheNoteMoves, releaseTheHeldNotePositions } = scene;
  const [isGliding, setIsGliding] = useState(false);
  const tidyingUp = useRef<Fiber.Fiber<void> | null>(null);
  useEffect(
    () => () => {
      if (tidyingUp.current !== null) Effect.runFork(Fiber.interrupt(tidyingUp.current));
    },
    [],
  );
  const tidiesTheSelection = selectedIds.size >= FEWEST_CARDS_TIDIED_ON_THEIR_OWN;

  const tidyUp = useCallback(() => {
    if (editing === null || nodes.length === 0) return;
    const cardsTidied = tidiesTheSelection ? nodes.filter((node) => selectedIds.has(node.node_id)) : nodes;
    const notesTidied = tidiesTheSelection ? [] : notes;
    const places = tidyUpNodeGraph(
      cardsTidied.map((node) => ({ layout: layoutNodeOf(node, sizeOfTheCard(node)), position: positionOfTheCard(node), frame_id: frameOfTheCard(node) })),
      links.map((link) => layoutLinkOf(link, nodeById)),
      notesTidied.map((note) => ({ note_id: note.note_id, position: positionOfTheNote(note), size: sizeOfTheNote(note) })),
    );
    const cardMoves = cardsTidied.flatMap((node): NodeGraphCanvasCardMove[] => {
      const position = places.cards.get(node.node_id);
      return position === undefined ? [] : [{ node_id: node.node_id, position, frame_id: frameOfTheCard(node) }];
    });
    const noteMoves = [...places.notes].map(([noteId, position]) => ({ note_id: noteId, position }));
    const movedNodeIds = cardMoves.map((move) => move.node_id);
    const movedNoteIds = noteMoves.map((move) => move.note_id);
    const tidiedUp = Effect.gen(function* () {
      yield* Effect.sync(() => {
        setIsGliding(true);
        holdTheCardMoves(cardMoves);
        holdTheNoteMoves(noteMoves);
      });
      const answer = yield* Effect.promise(() => editing.onTidiedUp({ cards: cardMoves, notes: noteMoves }));
      if (answer === "refused")
        yield* Effect.sync(() => {
          releaseTheHeldCards(movedNodeIds);
          releaseTheHeldNotePositions(movedNoteIds);
        });
      yield* Effect.sleep(NODE_GRAPH_TIDY_UP_GLIDE_MILLISECONDS);
    }).pipe(Effect.ensuring(Effect.sync(() => setIsGliding(false))));
    if (tidyingUp.current !== null) Effect.runFork(Fiber.interrupt(tidyingUp.current));
    tidyingUp.current = Effect.runFork(tidiedUp);
  }, [editing, nodes, links, notes, nodeById, selectedIds, tidiesTheSelection, positionOfTheCard, frameOfTheCard, sizeOfTheCard, positionOfTheNote, sizeOfTheNote, holdTheCardMoves, releaseTheHeldCards, holdTheNoteMoves, releaseTheHeldNotePositions]);

  return { tidyUp, tidiesTheSelection, isGliding, tidyUpDisabledReason: nodes.length === 0 ? "Add nodes to tidy up first" : null };
}
