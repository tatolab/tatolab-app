// What the node graph canvas decides on its own while a person edits a graph: whether two pins can be
// wired, the rectangle a labelled frame is drawn around its cards with, which frame a dropped card
// belongs to, and which link a dropped card lands on.

import type { NodeGraphPosition } from "./node_graph_layout";

/** The family a pin carries, or `null` while none is known. */
export type NodeGraphEditedPinFamily = string | null;

/** Whether an output of `sourceFamily` can be wired to an input of `targetFamily`: the runtime joins ports of one family, and a pin whose family is unknown is left for the runtime to judge. */
export function canPinsOfTheseFamiliesBeWired(sourceFamily: NodeGraphEditedPinFamily, targetFamily: NodeGraphEditedPinFamily): boolean {
  return sourceFamily === null || targetFamily === null || sourceFamily === targetFamily;
}

/** Where a card sits and how big it is drawn. */
export interface NodeGraphCardRectangle {
  position: NodeGraphPosition;
  width: number;
  height: number;
}

/** A frame's rectangle on the canvas. */
export interface NodeGraphFrameRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far a frame reaches past its cards on each side, and how much more above them for its title tab and description. */
export const NODE_GRAPH_FRAME_PADDING = 24;
export const NODE_GRAPH_FRAME_TITLE_ROOM = 44;

/** The rectangle a frame is drawn with around `cards`: their bounds, padded, with room above for the title; `null` for a frame with no card drawn. */
export function frameRectangleAroundCards(cards: readonly NodeGraphCardRectangle[]): NodeGraphFrameRectangle | null {
  if (cards.length === 0) return null;
  const left = Math.min(...cards.map((card) => card.position.x));
  const top = Math.min(...cards.map((card) => card.position.y));
  const right = Math.max(...cards.map((card) => card.position.x + card.width));
  const bottom = Math.max(...cards.map((card) => card.position.y + card.height));
  return {
    x: left - NODE_GRAPH_FRAME_PADDING,
    y: top - NODE_GRAPH_FRAME_PADDING - NODE_GRAPH_FRAME_TITLE_ROOM,
    width: right - left + NODE_GRAPH_FRAME_PADDING * 2,
    height: bottom - top + NODE_GRAPH_FRAME_PADDING * 2 + NODE_GRAPH_FRAME_TITLE_ROOM,
  };
}

/** A frame's rectangle drawn around its cards that were not dragged, by its id; `null` when every card of the frame was dragged. */
export interface NodeGraphFrameLeftStanding {
  frame_id: string;
  rectangle: NodeGraphFrameRectangle | null;
}

function isInsideTheFrame(point: NodeGraphPosition, rectangle: NodeGraphFrameRectangle): boolean {
  return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height;
}

/** The frame a dragged card belongs to once let go, judged by its centre: it stays in its own frame while inside it, or while the whole frame moved with it; otherwise it joins the smallest frame it lands inside, or none. */
export function frameACardIsLetGoIn(card: NodeGraphCardRectangle, cardsFrameId: string | null, framesLeftStanding: readonly NodeGraphFrameLeftStanding[]): string | null {
  const centre = { x: card.position.x + card.width / 2, y: card.position.y + card.height / 2 };
  const ownFrame = cardsFrameId === null ? undefined : framesLeftStanding.find((frame) => frame.frame_id === cardsFrameId);
  if (cardsFrameId !== null && (ownFrame === undefined || ownFrame.rectangle === null || isInsideTheFrame(centre, ownFrame.rectangle))) return cardsFrameId;
  const framesLandedIn = framesLeftStanding.flatMap(({ frame_id, rectangle }) => (rectangle !== null && isInsideTheFrame(centre, rectangle) ? [{ frame_id, area: rectangle.width * rectangle.height }] : []));
  return framesLandedIn.reduce<{ frame_id: string; area: number } | null>((smallest, candidate) => (smallest === null || candidate.area < smallest.area ? candidate : smallest), null)?.frame_id ?? null;
}

/** A link's midpoint on the canvas, by its id. */
export interface NodeGraphLinkMidpoint {
  link_id: string;
  midpoint: NodeGraphPosition;
}

/** The link whose midpoint lies inside `card`, the nearest to the card's centre when several do; `null` when none does. */
export function linkUnderACard(card: NodeGraphCardRectangle, linkMidpoints: readonly NodeGraphLinkMidpoint[]): string | null {
  const centre = { x: card.position.x + card.width / 2, y: card.position.y + card.height / 2 };
  const linksInside = linkMidpoints.filter(
    ({ midpoint }) => midpoint.x >= card.position.x && midpoint.x <= card.position.x + card.width && midpoint.y >= card.position.y && midpoint.y <= card.position.y + card.height,
  );
  const distanceToTheCentre = ({ midpoint }: NodeGraphLinkMidpoint) => Math.hypot(midpoint.x - centre.x, midpoint.y - centre.y);
  return linksInside.reduce<NodeGraphLinkMidpoint | null>((nearest, candidate) => (nearest === null || distanceToTheCentre(candidate) < distanceToTheCentre(nearest) ? candidate : nearest), null)?.link_id ?? null;
}

/** How far below the lowest card something placed clear of the graph lands. */
export const NODE_GRAPH_CLEAR_PLACE_GAP = 48;

/** Where something placed from a tool lands so it covers no card: under the lowest one, level with the leftmost; `whenThereIsNoCard` on an empty canvas. */
export function placeClearBelowTheCards(cards: readonly NodeGraphCardRectangle[], whenThereIsNoCard: { x: number; y: number }): { x: number; y: number } {
  if (cards.length === 0) return whenThereIsNoCard;
  return { x: Math.min(...cards.map((card) => card.position.x)), y: Math.max(...cards.map((card) => card.position.y + card.height)) + NODE_GRAPH_CLEAR_PLACE_GAP };
}
