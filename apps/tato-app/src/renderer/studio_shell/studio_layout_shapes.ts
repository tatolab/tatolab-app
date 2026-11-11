// Layouts as shapes: how many areas there are and where, filled with the views a layout already shows, and the
// left, bottom and right areas a layout can hide.

import { layoutWithSplitSizes, studioAreaLayoutNodeId, type StudioArea, type StudioAreaLayoutNode, type StudioAreaSplit } from "./studio_area_layout";

/** A plain shape of areas the layout menu offers. */
export type StudioLayoutShape = "single" | "two_columns" | "two_rows" | "three_columns" | "grid" | "main_and_right" | "left_main_and_right" | "main_and_bottom";

/** The shapes in the layout menu's order, each with its title. */
export const STUDIO_LAYOUT_SHAPES: readonly { shape: StudioLayoutShape; title: string }[] = [
  { shape: "single", title: "Single" },
  { shape: "two_columns", title: "Two columns" },
  { shape: "two_rows", title: "Two rows" },
  { shape: "three_columns", title: "Three columns" },
  { shape: "grid", title: "Grid 2×2" },
  { shape: "main_and_right", title: "Main + right" },
  { shape: "left_main_and_right", title: "Left + main + right" },
  { shape: "main_and_bottom", title: "Main + bottom" },
];

/** A shape's outline before its areas are filled: a split of parts, or a slot, the main one taking the view the layout gave the most room. */
type StudioLayoutShapeOutline = { kind: "slot"; is_main: boolean } | { kind: "split"; direction: "row" | "column"; parts: [number, StudioLayoutShapeOutline][] };

const MAIN_SLOT: StudioLayoutShapeOutline = { kind: "slot", is_main: true };
const SLOT: StudioLayoutShapeOutline = { kind: "slot", is_main: false };

function shapeSplit(direction: "row" | "column", parts: [number, StudioLayoutShapeOutline][]): StudioLayoutShapeOutline {
  return { kind: "split", direction, parts };
}

/** `shape`'s outline: its splits, their sizes in percent, and which slot is the main one. */
export function studioLayoutShapeOutline(shape: StudioLayoutShape): StudioLayoutShapeOutline {
  switch (shape) {
    case "single":
      return MAIN_SLOT;
    case "two_columns":
      return shapeSplit("row", [[50, MAIN_SLOT], [50, SLOT]]);
    case "two_rows":
      return shapeSplit("column", [[50, MAIN_SLOT], [50, SLOT]]);
    case "three_columns":
      return shapeSplit("row", [[33, SLOT], [34, MAIN_SLOT], [33, SLOT]]);
    case "grid":
      return shapeSplit("column", [[50, shapeSplit("row", [[50, MAIN_SLOT], [50, SLOT]])], [50, shapeSplit("row", [[50, SLOT], [50, SLOT]])]]);
    case "main_and_right":
      return shapeSplit("row", [[75, MAIN_SLOT], [25, SLOT]]);
    case "left_main_and_right":
      return shapeSplit("row", [[20, SLOT], [60, MAIN_SLOT], [20, SLOT]]);
    case "main_and_bottom":
      return shapeSplit("column", [[70, MAIN_SLOT], [30, SLOT]]);
  }
}

/** The views a shape's spare slots show, in this order, when the layout shaped held fewer areas than the shape has. */
const VIEW_TYPES_FOR_SPARE_SLOTS = ["stream_graph", "viewer", "outliner", "properties", "library", "history"] as const;

/** Each area of `layout` with its share of the whole layout, in the order its splits hold them. */
function areasWithTheirShares(layout: StudioAreaLayoutNode, shareOfTheWhole = 1): { area: StudioArea; share: number }[] {
  if (layout.kind === "area") return [{ area: layout, share: shareOfTheWhole }];
  const sizeOfTheParts = layout.parts.reduce((sum, { size_percent }) => sum + size_percent, 0);
  return layout.parts.flatMap(({ size_percent, part }) => areasWithTheirShares(part, (shareOfTheWhole * size_percent) / sizeOfTheParts));
}

/** How many slots `outline` holds. */
function slotCountOf(outline: StudioLayoutShapeOutline): number {
  return outline.kind === "slot" ? 1 : outline.parts.reduce((count, [, part]) => count + slotCountOf(part), 0);
}

/**
 * `layout` reshaped as `shape`, keeping its views where they fit: the area it gave the most room fills the main slot, the
 * rest fill the other slots in the order the layout held them, each keeping its id and settings; a spare slot shows a view
 * the layout did not, and an area that finds no slot is left out.
 */
export function studioLayoutShapedAs(layout: StudioAreaLayoutNode, shape: StudioLayoutShape): StudioAreaLayoutNode {
  const outline = studioLayoutShapeOutline(shape);
  const areasHeld = areasWithTheirShares(layout);
  const largestShare = Math.max(...areasHeld.map(({ share }) => share));
  const mainArea = areasHeld.find(({ share }) => share === largestShare)?.area ?? null;
  const otherAreas = areasHeld.map(({ area }) => area).filter((area) => area !== mainArea);
  const viewTypesShown = new Set(areasHeld.map(({ area }) => area.view_type_id));
  const spareViewTypes = VIEW_TYPES_FOR_SPARE_SLOTS.filter((viewTypeId) => !viewTypesShown.has(viewTypeId));
  const areaIdsTaken = new Set(areasHeld.map(({ area }) => area.area_id));
  const spareAreaFor = (viewTypeId: string | null): StudioArea => {
    let areaNumber = 1;
    while (areaIdsTaken.has(`area-${areaNumber}`)) areaNumber += 1;
    areaIdsTaken.add(`area-${areaNumber}`);
    return { kind: "area", area_id: `area-${areaNumber}`, view_type_id: viewTypeId };
  };
  const slotsLeft = slotCountOf(outline) - (mainArea === null ? 0 : 1);
  const otherSlotAreas = Array.from({ length: slotsLeft }, (_, slotIndex) => otherAreas[slotIndex] ?? spareAreaFor(spareViewTypes[slotIndex - otherAreas.length] ?? null));
  let splitNumber = 0;
  const filled = (node: StudioLayoutShapeOutline): StudioAreaLayoutNode => {
    if (node.kind === "slot") return node.is_main && mainArea !== null ? mainArea : (otherSlotAreas.shift() ?? spareAreaFor(null));
    splitNumber += 1;
    return { kind: "split", split_id: `${shape}-${splitNumber}`, direction: node.direction, parts: node.parts.map(([sizePercent, part]) => ({ size_percent: sizePercent, part: filled(part) })) };
  };
  return filled(outline);
}

/** The edges whose areas the title row's buttons hide and show. */
export type StudioLayoutEdge = "left" | "bottom" | "right";

/** Which edges of a layout are hidden. */
export type StudioLayoutEdgesHidden = Readonly<Record<StudioLayoutEdge, boolean>>;

/** Every edge shown. */
export const NO_STUDIO_LAYOUT_EDGE_HIDDEN: StudioLayoutEdgesHidden = { left: false, bottom: false, right: false };

/** The split whose last part is `layout`'s bottom area: the layout itself when it stacks, or else its largest part when that stacks; `null` when it has none. */
function splitHoldingTheBottom(layout: StudioAreaLayoutNode): StudioAreaSplit | null {
  if (layout.kind === "area") return null;
  if (layout.direction === "column") return layout;
  const largestPart = layout.parts.reduce((largest, part) => (part.size_percent > largest.size_percent ? part : largest));
  return largestPart.part.kind === "split" && largestPart.part.direction === "column" ? largestPart.part : null;
}

/** Whether `layout` has an area at `edge` to hide: a left or right part of a side-by-side layout, or a bottom part of a stack. */
export function studioLayoutHasAnAreaAt(layout: StudioAreaLayoutNode, edge: StudioLayoutEdge): boolean {
  if (edge === "bottom") return splitHoldingTheBottom(layout) !== null;
  return layout.kind === "split" && layout.direction === "row" && layout.parts.length >= 2;
}

/** `split` without the parts `isLeftOut` names, the rest sized up to fill it; the one part left in place of the split. */
function splitWithoutParts(split: StudioAreaSplit, isLeftOut: (partIndex: number) => boolean): StudioAreaLayoutNode {
  const kept = split.parts.filter((_, partIndex) => !isLeftOut(partIndex));
  const [onlyPart] = kept;
  if (kept.length === 1 && onlyPart !== undefined) return onlyPart.part;
  if (kept.length === split.parts.length || kept.length === 0) return split;
  const shareKept = kept.reduce((sum, { size_percent }) => sum + size_percent, 0);
  return { ...split, parts: kept.map((part) => ({ ...part, size_percent: (part.size_percent * 100) / shareKept })) };
}

/** `layout` as it shows with the edges `edgesHidden` names hidden; an edge it has no area at is ignored, and at least one area always shows. */
export function studioLayoutWithEdgesHidden(layout: StudioAreaLayoutNode, edgesHidden: StudioLayoutEdgesHidden): StudioAreaLayoutNode {
  const bottomSplit = edgesHidden.bottom ? splitHoldingTheBottom(layout) : null;
  const withoutTheBottom = (node: StudioAreaLayoutNode): StudioAreaLayoutNode => {
    if (bottomSplit === null || node.kind === "area") return node;
    if (node === bottomSplit) return splitWithoutParts(node, (partIndex) => partIndex === node.parts.length - 1);
    return { ...node, parts: node.parts.map((part) => ({ ...part, part: withoutTheBottom(part.part) })) };
  };
  const shown = withoutTheBottom(layout);
  if (shown.kind === "area" || shown.direction !== "row" || layout.kind !== "split" || layout.direction !== "row") return shown;
  const lastIndex = shown.parts.length - 1;
  return splitWithoutParts(shown, (partIndex) => (edgesHidden.left && partIndex === 0 && lastIndex > 0) || (edgesHidden.right && partIndex === lastIndex && lastIndex > (edgesHidden.left ? 1 : 0)));
}

/** The split `splitId` of `layout`, or `null` when it holds none. */
function splitOfTheLayout(layout: StudioAreaLayoutNode, splitId: string): StudioAreaSplit | null {
  if (layout.kind === "area") return null;
  if (layout.split_id === splitId) return layout;
  for (const { part } of layout.parts) {
    const found = splitOfTheLayout(part, splitId);
    if (found !== null) return found;
  }
  return null;
}

/** `layout` with the parts of split `splitId` that show sized as a drag left them, sharing what they held together; a part hidden at an edge keeps its size. */
export function studioLayoutWithShownSplitSizes(layout: StudioAreaLayoutNode, splitId: string, sizePercentByShownPartId: Readonly<Record<string, number>>): StudioAreaLayoutNode {
  const split = splitOfTheLayout(layout, splitId);
  const partsShown = split === null ? [] : split.parts.filter((part) => sizePercentByShownPartId[studioAreaLayoutNodeId(part.part)] !== undefined);
  const shareHeldByThePartsShown = partsShown.reduce((sum, { size_percent }) => sum + size_percent, 0);
  const shareTheDragGave = partsShown.reduce((sum, part) => sum + (sizePercentByShownPartId[studioAreaLayoutNodeId(part.part)] ?? 0), 0);
  if (shareTheDragGave === 0) return layoutWithSplitSizes(layout, splitId, sizePercentByShownPartId);
  const scale = shareHeldByThePartsShown / shareTheDragGave;
  return layoutWithSplitSizes(layout, splitId, Object.fromEntries(Object.entries(sizePercentByShownPartId).map(([partId, sizePercent]) => [partId, sizePercent * scale])));
}
