// A layout of the studio's areas, as data: a tree of splits whose leaves are areas, each showing one
// view type with the settings it keeps. It is saved as JSON and read back with every field checked.

import type { JsonValue } from "../view_host/studio_view_contract";

/** One area: its id, the view type it shows (`null` while it shows none), the settings that view keeps, and for a `node` view the node it shows. */
export interface StudioArea {
  kind: "area";
  area_id: string;
  view_type_id: string | null;
  settings?: JsonValue;
  /** The id of the node a `node` view's area shows of the nodes of its type; absent to show the first. */
  shown_node_id?: string;
}

/** Parts side by side (`row`) or stacked (`column`), each with its share of the split in percent. */
export interface StudioAreaSplit {
  kind: "split";
  split_id: string;
  direction: "row" | "column";
  parts: { size_percent: number; part: StudioAreaLayoutNode }[];
}

/** A split or an area. */
export type StudioAreaLayoutNode = StudioArea | StudioAreaSplit;

/** The id a node is known by in its split. */
export function studioAreaLayoutNodeId(node: StudioAreaLayoutNode): string {
  return node.kind === "area" ? node.area_id : node.split_id;
}

function isAJsonRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAJsonValue);
  return isAJsonRecord(value) && Object.values(value).every(isAJsonValue);
}

/** The layout `saved` holds, or `null` when it is not one: every split's parts are areas or splits, with ids unique across the tree. */
export function studioAreaLayoutFromSaved(saved: unknown): StudioAreaLayoutNode | null {
  const seenIds = new Set<string>();
  const nodeFrom = (candidate: unknown): StudioAreaLayoutNode | null => {
    if (!isAJsonRecord(candidate)) return null;
    if (candidate["kind"] === "area") {
      const areaId = candidate["area_id"];
      const viewTypeId = candidate["view_type_id"];
      const settings = candidate["settings"];
      const shownNodeId = candidate["shown_node_id"];
      if (typeof areaId !== "string" || seenIds.has(areaId) || !(viewTypeId === null || typeof viewTypeId === "string")) return null;
      if (settings !== undefined && !isAJsonValue(settings)) return null;
      if (shownNodeId !== undefined && typeof shownNodeId !== "string") return null;
      seenIds.add(areaId);
      return {
        kind: "area",
        area_id: areaId,
        view_type_id: viewTypeId,
        ...(settings === undefined ? {} : { settings }),
        ...(shownNodeId === undefined ? {} : { shown_node_id: shownNodeId }),
      };
    }
    if (candidate["kind"] !== "split") return null;
    const splitId = candidate["split_id"];
    const direction = candidate["direction"];
    const parts = candidate["parts"];
    if (typeof splitId !== "string" || seenIds.has(splitId) || (direction !== "row" && direction !== "column") || !Array.isArray(parts) || parts.length < 2) return null;
    seenIds.add(splitId);
    const readParts: StudioAreaSplit["parts"] = [];
    for (const part of parts) {
      if (!isAJsonRecord(part)) return null;
      const sizePercent = part["size_percent"];
      const node = nodeFrom(part["part"]);
      if (typeof sizePercent !== "number" || !Number.isFinite(sizePercent) || sizePercent <= 0 || node === null) return null;
      readParts.push({ size_percent: sizePercent, part: node });
    }
    return { kind: "split", split_id: splitId, direction, parts: readParts };
  };
  return nodeFrom(saved);
}

/** `layout` with each node rewritten by `rewrite`, from the leaves up. */
function rewrittenLayout(layout: StudioAreaLayoutNode, rewrite: (node: StudioAreaLayoutNode) => StudioAreaLayoutNode): StudioAreaLayoutNode {
  if (layout.kind === "area") return rewrite(layout);
  return rewrite({ ...layout, parts: layout.parts.map((part) => ({ ...part, part: rewrittenLayout(part.part, rewrite) })) });
}

/** `layout` with area `areaId` showing `viewTypeId` on that view type's default settings. */
export function layoutWithAreaShowing(layout: StudioAreaLayoutNode, areaId: string, viewTypeId: string): StudioAreaLayoutNode {
  return rewrittenLayout(layout, (node) => (node.kind === "area" && node.area_id === areaId ? { kind: "area", area_id: areaId, view_type_id: viewTypeId } : node));
}

/** `layout` with area `areaId` keeping `settings`. */
export function layoutWithAreaSettings(layout: StudioAreaLayoutNode, areaId: string, settings: JsonValue): StudioAreaLayoutNode {
  return rewrittenLayout(layout, (node) => (node.kind === "area" && node.area_id === areaId ? { ...node, settings } : node));
}

/** `layout` with area `areaId` showing the node `nodeId` of the nodes of its `node` view's type. */
export function layoutWithAreaShowingNode(layout: StudioAreaLayoutNode, areaId: string, nodeId: string): StudioAreaLayoutNode {
  return rewrittenLayout(layout, (node) => (node.kind === "area" && node.area_id === areaId ? { ...node, shown_node_id: nodeId } : node));
}

/** `layout` with split `splitId`'s parts sized as `sizePercentByPartId` gives; a part it does not name keeps its size. */
export function layoutWithSplitSizes(layout: StudioAreaLayoutNode, splitId: string, sizePercentByPartId: Readonly<Record<string, number>>): StudioAreaLayoutNode {
  return rewrittenLayout(layout, (node) =>
    node.kind === "split" && node.split_id === splitId
      ? { ...node, parts: node.parts.map((part) => ({ ...part, size_percent: sizePercentByPartId[studioAreaLayoutNodeId(part.part)] ?? part.size_percent })) }
      : node,
  );
}

/** Whether an area of `layout` shows `viewTypeId`. */
export function layoutShowsTheViewType(layout: StudioAreaLayoutNode, viewTypeId: string): boolean {
  if (layout.kind === "area") return layout.view_type_id === viewTypeId;
  return layout.parts.some((part) => layoutShowsTheViewType(part.part, viewTypeId));
}

/** Every area of `layout`, in the order its splits hold them. */
export function areasOfTheLayout(layout: StudioAreaLayoutNode): StudioArea[] {
  if (layout.kind === "area") return [layout];
  return layout.parts.flatMap((part) => areasOfTheLayout(part.part));
}

/** Which way an area is split: its new area beside it (`row`) or under it (`column`). */
export type StudioAreaSplitDirection = StudioAreaSplit["direction"];

/** The first id of the form `${prefix}-N` that no node of `layout` takes. */
export function unusedStudioAreaLayoutNodeId(layout: StudioAreaLayoutNode, prefix: "area" | "split"): string {
  const idsTaken = new Set<string>();
  const takeIds = (node: StudioAreaLayoutNode): void => {
    idsTaken.add(studioAreaLayoutNodeId(node));
    if (node.kind === "split") node.parts.forEach(({ part }) => takeIds(part));
  };
  takeIds(layout);
  let number = 1;
  while (idsTaken.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

/**
 * `layout` with area `areaId` halved, `newArea` taking the half after it in `direction`: beside it for `row`, under it for `column`.
 * In a split of that direction already, the new area joins it as the area's next part; anywhere else the area becomes a split of the two.
 */
export function layoutWithAreaSplit(layout: StudioAreaLayoutNode, areaId: string, direction: StudioAreaSplitDirection, newArea: StudioArea): StudioAreaLayoutNode {
  const splitId = unusedStudioAreaLayoutNodeId(layout, "split");
  const splitTheArea = (node: StudioAreaLayoutNode): StudioAreaLayoutNode => {
    if (node.kind === "area") {
      return node.area_id === areaId ? { kind: "split", split_id: splitId, direction, parts: [{ size_percent: 50, part: node }, { size_percent: 50, part: newArea }] } : node;
    }
    if (node.direction === direction) {
      const areaIndex = node.parts.findIndex(({ part }) => part.kind === "area" && part.area_id === areaId);
      const areaPart = node.parts[areaIndex];
      if (areaPart !== undefined) {
        const halfSize = areaPart.size_percent / 2;
        return { ...node, parts: [...node.parts.slice(0, areaIndex), { ...areaPart, size_percent: halfSize }, { size_percent: halfSize, part: newArea }, ...node.parts.slice(areaIndex + 1)] };
      }
    }
    return { ...node, parts: node.parts.map((part) => ({ ...part, part: splitTheArea(part.part) })) };
  };
  return splitTheArea(layout);
}

/** `layout` without area `areaId`, its room given to the parts beside it, and a split left with one part replaced by that part; `null` when it is the layout's only area. */
export function layoutWithAreaClosed(layout: StudioAreaLayoutNode, areaId: string): StudioAreaLayoutNode | null {
  if (layout.kind === "area") return layout.area_id === areaId ? null : layout;
  const closeTheArea = (split: StudioAreaSplit): StudioAreaLayoutNode => {
    const partsLeft = split.parts.flatMap((part): StudioAreaSplit["parts"] => {
      if (part.part.kind === "area") return part.part.area_id === areaId ? [] : [part];
      return [{ ...part, part: closeTheArea(part.part) }];
    });
    const [onlyPart] = partsLeft;
    if (partsLeft.length === 1 && onlyPart !== undefined) return onlyPart.part;
    if (partsLeft.length === split.parts.length) return { ...split, parts: partsLeft };
    const shareLeft = partsLeft.reduce((sum, { size_percent }) => sum + size_percent, 0);
    return { ...split, parts: partsLeft.map((part) => ({ ...part, size_percent: (part.size_percent * 100) / shareLeft })) };
  };
  return closeTheArea(layout);
}

/** Where area `areaId`'s neighbour lies in the split that holds it: after it, or before it when it is the split's last part; `null` for the layout's only area. */
export type StudioAreaNeighbour = { direction: StudioAreaSplitDirection; lies: "after" | "before" } | null;

/** Where area `areaId`'s neighbour lies, the one Swap trades places with. */
export function neighbourOfTheArea(layout: StudioAreaLayoutNode, areaId: string): StudioAreaNeighbour {
  if (layout.kind === "area") return null;
  const areaIndex = layout.parts.findIndex(({ part }) => part.kind === "area" && part.area_id === areaId);
  if (areaIndex !== -1) return { direction: layout.direction, lies: areaIndex === layout.parts.length - 1 ? "before" : "after" };
  for (const { part } of layout.parts) {
    const neighbour = neighbourOfTheArea(part, areaId);
    if (neighbour !== null) return neighbour;
  }
  return null;
}

/** `layout` with area `areaId` and its neighbour trading places, each part keeping the size its place had. */
export function layoutWithAreaSwappedWithItsNeighbour(layout: StudioAreaLayoutNode, areaId: string): StudioAreaLayoutNode {
  if (layout.kind === "area") return layout;
  const areaIndex = layout.parts.findIndex(({ part }) => part.kind === "area" && part.area_id === areaId);
  if (areaIndex === -1) return { ...layout, parts: layout.parts.map((part) => ({ ...part, part: layoutWithAreaSwappedWithItsNeighbour(part.part, areaId) })) };
  const neighbourIndex = areaIndex === layout.parts.length - 1 ? areaIndex - 1 : areaIndex + 1;
  return {
    ...layout,
    parts: layout.parts.map((part, partIndex) => {
      if (partIndex === areaIndex) return { ...part, part: layout.parts[neighbourIndex]?.part ?? part.part };
      if (partIndex === neighbourIndex) return { ...part, part: layout.parts[areaIndex]?.part ?? part.part };
      return part;
    }),
  };
}
