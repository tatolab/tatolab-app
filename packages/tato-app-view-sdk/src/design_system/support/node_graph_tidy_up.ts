// Where Tidy up puts the cards and notes: each frame's cards laid out on their own by the one layered layout, and the
// frames, with the cards in none as one more block, stacked top to bottom in the order wires run between them.

import { layOutNodeGraph, type NodeGraphLayoutLink, type NodeGraphLayoutNode, type NodeGraphPosition } from "./node_graph_layout";
import { NODE_GRAPH_FRAME_PADDING, NODE_GRAPH_FRAME_TITLE_ROOM } from "./node_graph_editing";

/** A card Tidy up places: what the layout reads of it, where it sits now, and the frame it is in, by `frame_id`; `null` for none. */
export interface NodeGraphTidyCard {
  layout: NodeGraphLayoutNode;
  position: NodeGraphPosition;
  frame_id: string | null;
}

/** A note Tidy up places beside the cards: where its top-left corner sits now, and its size. */
export interface NodeGraphTidyNote {
  note_id: string;
  position: NodeGraphPosition;
  size: { width: number; height: number };
}

/** Where Tidy up puts each card and note it moves, by id. */
export interface NodeGraphTidiedPlaces {
  cards: ReadonlyMap<string, NodeGraphPosition>;
  notes: ReadonlyMap<string, NodeGraphPosition>;
}

/** The room between two stacked blocks, frame edge to frame edge. */
const NODE_GRAPH_TIDY_BLOCK_GAP = 72;
/** The room between a note and what it sits above or below. */
const NODE_GRAPH_TIDY_NOTE_GAP = 40;

/** The cards of one frame, or the cards in none, laid out together. */
interface Block {
  frame_id: string | null;
  cards: readonly NodeGraphTidyCard[];
}

interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectangleAround(rectangles: readonly Rectangle[]): Rectangle {
  return {
    left: Math.min(...rectangles.map((rectangle) => rectangle.left)),
    top: Math.min(...rectangles.map((rectangle) => rectangle.top)),
    right: Math.max(...rectangles.map((rectangle) => rectangle.right)),
    bottom: Math.max(...rectangles.map((rectangle) => rectangle.bottom)),
  };
}

/** Where a note sits by the block it is nearest: under the cards when inside a frame, else on the side of the block it sits on now. */
type NoteSide = "under the cards" | "above" | "below" | "left" | "right";

function sideOfTheNote(middle: NodeGraphPosition, rectangle: Rectangle, isAFrame: boolean): NoteSide {
  const outLeft = rectangle.left - middle.x;
  const outRight = middle.x - rectangle.right;
  const outAbove = rectangle.top - middle.y;
  const outBelow = middle.y - rectangle.bottom;
  const farthestOut = Math.max(outLeft, outRight, outAbove, outBelow);
  if (farthestOut <= 0) return isAFrame ? "under the cards" : "above";
  if (farthestOut === outLeft) return "left";
  if (farthestOut === outRight) return "right";
  return farthestOut === outAbove ? "above" : "below";
}

const cardRectangle = (card: NodeGraphTidyCard, position: NodeGraphPosition): Rectangle => ({
  left: position.x,
  top: position.y,
  right: position.x + card.layout.card_width,
  bottom: position.y + (card.layout.card_height ?? 0),
});

/** The blocks in the order wires run between them, a block fed by another after it; a loop between blocks, or none, keeps the order they sit in now, top to bottom. */
function blocksInTheOrderWiresRun(blocks: readonly Block[], links: readonly NodeGraphLayoutLink[]): Block[] {
  const blockOfTheCard = new Map(blocks.flatMap((block) => block.cards.map((card) => [card.layout.node_id, block] as const)));
  const topNow = (block: Block) => Math.min(...block.cards.map((card) => card.position.y));
  const feeders = new Map<Block, Set<Block>>(blocks.map((block) => [block, new Set<Block>()]));
  for (const link of links) {
    const source = blockOfTheCard.get(link.source_node_id);
    const target = blockOfTheCard.get(link.target_node_id);
    if (source !== undefined && target !== undefined && source !== target) feeders.get(target)?.add(source);
  }
  const ordered: Block[] = [];
  const waiting = [...blocks].sort((first, second) => topNow(first) - topNow(second));
  while (waiting.length > 0) {
    const nextIndex = waiting.findIndex((block) => [...(feeders.get(block) ?? [])].every((feeder) => ordered.includes(feeder)));
    // A loop between blocks: the topmost one waiting goes next.
    const [next] = waiting.splice(Math.max(0, nextIndex), 1);
    if (next !== undefined) ordered.push(next);
  }
  return ordered;
}

/**
 * Where Tidy up puts `cards` and `notes`: each frame's cards laid out on their own, the frames stacked from where the
 * topmost, leftmost card sits now in the order wires run between them, and the cards in no frame as one more block. A
 * note inside a frame goes under that frame's cards; a note outside every frame stays on the side it sits on now of the
 * block nearest it.
 */
export function tidyUpNodeGraph(cards: readonly NodeGraphTidyCard[], links: readonly NodeGraphLayoutLink[], notes: readonly NodeGraphTidyNote[]): NodeGraphTidiedPlaces {
  if (cards.length === 0) return { cards: new Map(), notes: new Map() };
  const frameIds = [...new Set(cards.map((card) => card.frame_id))];
  const blocks = blocksInTheOrderWiresRun(
    frameIds.map((frameId) => ({ frame_id: frameId, cards: cards.filter((card) => card.frame_id === frameId) })),
    links,
  );
  const blockRectangleNow = new Map(blocks.map((block) => [block, rectangleAround(block.cards.map((card) => cardRectangle(card, card.position)))]));
  const notesBeside = new Map<Block, { note: NodeGraphTidyNote; side: NoteSide }[]>();
  for (const note of notes) {
    const middle = { x: note.position.x + note.size.width / 2, y: note.position.y + note.size.height / 2 };
    const distanceTo = (block: Block) => {
      const rectangle = blockRectangleNow.get(block);
      if (rectangle === undefined) return Number.POSITIVE_INFINITY;
      return Math.hypot(Math.max(rectangle.left - middle.x, 0, middle.x - rectangle.right), Math.max(rectangle.top - middle.y, 0, middle.y - rectangle.bottom));
    };
    const nearest = blocks.reduce((best, block) => (distanceTo(block) < distanceTo(best) ? block : best));
    const rectangle = blockRectangleNow.get(nearest);
    if (rectangle === undefined) continue;
    notesBeside.set(nearest, [...(notesBeside.get(nearest) ?? []), { note, side: sideOfTheNote(middle, rectangle, nearest.frame_id !== null) }]);
  }

  const startsAt = rectangleAround([...blockRectangleNow.values()]);
  const cardPlaces = new Map<string, NodeGraphPosition>();
  const notePlaces = new Map<string, NodeGraphPosition>();
  const placeTheNote = (note: NodeGraphTidyNote, x: number, y: number) => notePlaces.set(note.note_id, { x: Math.round(x), y: Math.round(y) });
  let top = startsAt.top - (blocks[0]?.frame_id === null ? 0 : NODE_GRAPH_FRAME_PADDING + NODE_GRAPH_FRAME_TITLE_ROOM);
  for (const block of blocks) {
    const frameRoom = block.frame_id === null ? { side: 0, above: 0 } : { side: NODE_GRAPH_FRAME_PADDING, above: NODE_GRAPH_FRAME_PADDING + NODE_GRAPH_FRAME_TITLE_ROOM };
    const beside = notesBeside.get(block) ?? [];
    const notesOn = (side: NoteSide) => beside.filter((placed) => placed.side === side).map((placed) => placed.note);
    for (const note of notesOn("above")) {
      placeTheNote(note, startsAt.left - frameRoom.side, top);
      top += note.size.height + NODE_GRAPH_TIDY_NOTE_GAP;
    }
    const laidOut = layOutNodeGraph(
      block.cards.map((card) => card.layout),
      links,
    );
    const laidOutRectangle = rectangleAround(block.cards.map((card) => cardRectangle(card, laidOut.get(card.layout.node_id) ?? { x: 0, y: 0 })));
    const shift = { x: startsAt.left - laidOutRectangle.left, y: top + frameRoom.above - laidOutRectangle.top };
    for (const card of block.cards) {
      const position = laidOut.get(card.layout.node_id) ?? { x: 0, y: 0 };
      cardPlaces.set(card.layout.node_id, { x: Math.round(position.x + shift.x), y: Math.round(position.y + shift.y) });
    }
    const blockTop = top;
    let bottom = laidOutRectangle.bottom + shift.y;
    for (const note of notesOn("under the cards")) {
      placeTheNote(note, startsAt.left, bottom + NODE_GRAPH_TIDY_NOTE_GAP);
      bottom += NODE_GRAPH_TIDY_NOTE_GAP + note.size.height;
    }
    bottom += frameRoom.side;
    let leftNoteTop = blockTop;
    for (const note of notesOn("left")) {
      placeTheNote(note, startsAt.left - frameRoom.side - NODE_GRAPH_TIDY_NOTE_GAP - note.size.width, leftNoteTop);
      leftNoteTop += note.size.height + NODE_GRAPH_TIDY_NOTE_GAP;
    }
    let rightNoteTop = blockTop;
    const right = laidOutRectangle.right + shift.x + frameRoom.side;
    for (const note of notesOn("right")) {
      placeTheNote(note, right + NODE_GRAPH_TIDY_NOTE_GAP, rightNoteTop);
      rightNoteTop += note.size.height + NODE_GRAPH_TIDY_NOTE_GAP;
    }
    for (const note of notesOn("below")) {
      placeTheNote(note, startsAt.left - frameRoom.side, bottom + NODE_GRAPH_TIDY_NOTE_GAP);
      bottom += NODE_GRAPH_TIDY_NOTE_GAP + note.size.height;
    }
    top = Math.max(bottom, leftNoteTop - NODE_GRAPH_TIDY_NOTE_GAP, rightNoteTop - NODE_GRAPH_TIDY_NOTE_GAP) + NODE_GRAPH_TIDY_BLOCK_GAP;
  }
  return { cards: cardPlaces, notes: notePlaces };
}
