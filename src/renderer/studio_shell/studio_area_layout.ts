// A layout of the studio's areas, as data: a tree of splits whose leaves are areas, each showing one
// view type with the settings it keeps. It is saved as JSON and read back with every field checked.

import type { JsonValue } from "../view_host/studio_view_contract";

/** One area: its id, the view type it shows (`null` while it shows none), and the settings that view keeps. */
export interface StudioArea {
  kind: "area";
  area_id: string;
  view_type_id: string | null;
  settings?: JsonValue;
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
      if (typeof areaId !== "string" || seenIds.has(areaId) || !(viewTypeId === null || typeof viewTypeId === "string")) return null;
      if (settings !== undefined && !isAJsonValue(settings)) return null;
      seenIds.add(areaId);
      return settings === undefined ? { kind: "area", area_id: areaId, view_type_id: viewTypeId } : { kind: "area", area_id: areaId, view_type_id: viewTypeId, settings };
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

/** `layout` with split `splitId`'s parts sized as `sizePercentByPartId` gives; a part it does not name keeps its size. */
export function layoutWithSplitSizes(layout: StudioAreaLayoutNode, splitId: string, sizePercentByPartId: Readonly<Record<string, number>>): StudioAreaLayoutNode {
  return rewrittenLayout(layout, (node) =>
    node.kind === "split" && node.split_id === splitId
      ? { ...node, parts: node.parts.map((part) => ({ ...part, size_percent: sizePercentByPartId[studioAreaLayoutNodeId(part.part)] ?? part.size_percent })) }
      : node,
  );
}
