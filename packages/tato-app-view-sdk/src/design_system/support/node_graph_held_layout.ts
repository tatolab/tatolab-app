import type { NodeGraphPosition } from "./node_graph_layout";

/** Where a card or note sits while it is dragged, or after it was let go until the graph shows it there or the edit is refused. */
export type HeldPositionById = ReadonlyMap<string, NodeGraphPosition>;

/** A note's width and height on the canvas. */
export type NodeGraphNoteSize = { width: number; height: number };

/** Whether both positions are there and the same. */
export const samePosition = (first: NodeGraphPosition | null | undefined, second: NodeGraphPosition | null | undefined) =>
  first !== null && first !== undefined && second !== null && second !== undefined && first.x === second.x && first.y === second.y;

/** A card's or note's place on the whole canvas pixel an edit sends it to, so a held place matches the graph that shows it. */
export const onTheCanvasPixel = (position: NodeGraphPosition): NodeGraphPosition => ({ x: Math.round(position.x), y: Math.round(position.y) });

/** A note's size in the whole canvas pixels an edit sends. */
export const inCanvasPixels = (size: NodeGraphNoteSize): NodeGraphNoteSize => ({ width: Math.round(size.width), height: Math.round(size.height) });

/** Whether `second` is there and is the size `first` is. */
export const sameSize = (first: NodeGraphNoteSize, second: NodeGraphNoteSize | undefined) => second !== undefined && first.width === second.width && first.height === second.height;

/** `held` without the entries `isShown` says the graph now shows. */
export function heldValuesNotShownYet<Held>(held: ReadonlyMap<string, Held>, isShown: (id: string, heldValue: Held) => boolean): ReadonlyMap<string, Held> {
  const stillHeld = [...held].filter(([id, heldValue]) => !isShown(id, heldValue));
  return stillHeld.length === held.size ? held : new Map(stillHeld);
}

/** `held` with each of `entries` set. */
export function withEntriesSet<Held>(held: ReadonlyMap<string, Held>, entries: readonly { id: string; value: Held }[]): ReadonlyMap<string, Held> {
  const after = new Map(held);
  for (const { id, value } of entries) after.set(id, value);
  return after;
}

/** `held` without the entries of `ids`. */
export function withoutTheIds<Held>(held: ReadonlyMap<string, Held>, ids: readonly string[]): ReadonlyMap<string, Held> {
  if (!ids.some((id) => held.has(id))) return held;
  const after = new Map(held);
  for (const id of ids) after.delete(id);
  return after;
}
