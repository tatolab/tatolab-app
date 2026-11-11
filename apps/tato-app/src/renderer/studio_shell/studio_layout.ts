// The studio's one layout per project folder: its tree as the person shaped it, the edges they hid, and the presets they
// saved, kept in the page's storage so a project reopens as it was left.

import { studioAreaLayoutFromSaved, type StudioArea, type StudioAreaLayoutNode, type StudioAreaSplit } from "./studio_area_layout";
import type { TatolabWindowLocalStorage } from "../tatolab_window_local_storage";
import { NO_STUDIO_LAYOUT_EDGE_HIDDEN, type StudioLayoutEdgesHidden } from "./studio_layout_shapes";

/** How many saved presets the digits held with Ctrl or ⌘ apply, the first on 1. */
export const STUDIO_LAYOUT_PRESETS_ON_A_DIGIT = 9;

/** A layout the person saved as a preset, by the name they gave it. */
export interface StudioLayoutPresetSaved {
  title: string;
  layout: StudioAreaLayoutNode;
}

/** A project folder's layout as the person left it, the edges they hid, and the presets they saved. */
export interface StudioLayoutOfAFolder {
  layout: StudioAreaLayoutNode;
  edges_hidden: StudioLayoutEdgesHidden;
  presets_saved: readonly StudioLayoutPresetSaved[];
}

function area(areaId: string, viewTypeId: string | null): StudioArea {
  return { kind: "area", area_id: areaId, view_type_id: viewTypeId };
}

function split(splitId: string, direction: "row" | "column", parts: [number, StudioAreaLayoutNode][]): StudioAreaSplit {
  return { kind: "split", split_id: splitId, direction, parts: parts.map(([sizePercent, part]) => ({ size_percent: sizePercent, part })) };
}

/** The layout a project first opens on: the outliner left, the stream graph in the middle, and the Node visualizer over properties on the right. */
export function defaultStudioLayout(): StudioAreaLayoutNode {
  return split("main-columns", "row", [
    [18, area("outliner", "outliner")],
    [60, area("stream-graph", "stream_graph")],
    [22, split("main-right", "column", [[38, area("viewer", "viewer")], [62, area("properties", "properties")]])],
  ]);
}

/** `saved`'s field `fieldName`, or `undefined` when `saved` is not an object or has none. */
function savedField(saved: unknown, fieldName: string): unknown {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return undefined;
  return Object.entries(saved).find(([savedFieldName]) => savedFieldName === fieldName)?.[1];
}

/** The layout `saved` holds, or the default where it holds none or one that does not parse, with its hidden edges and the presets that parse. */
export function studioLayoutFromSaved(saved: unknown): StudioLayoutOfAFolder {
  const layoutSaved = studioAreaLayoutFromSaved(savedField(saved, "layout"));
  const edgesHiddenSaved = savedField(saved, "edges_hidden");
  const savedPresets = savedField(saved, "presets_saved");
  const presetsSaved = (Array.isArray(savedPresets) ? savedPresets : []).flatMap((savedPreset): StudioLayoutPresetSaved[] => {
    const title = savedField(savedPreset, "title");
    const layout = studioAreaLayoutFromSaved(savedField(savedPreset, "layout"));
    return typeof title === "string" && title.trim() !== "" && layout !== null ? [{ title, layout }] : [];
  });
  return {
    layout: layoutSaved ?? defaultStudioLayout(),
    edges_hidden:
      layoutSaved === null
        ? NO_STUDIO_LAYOUT_EDGE_HIDDEN
        : { left: savedField(edgesHiddenSaved, "left") === true, bottom: savedField(edgesHiddenSaved, "bottom") === true, right: savedField(edgesHiddenSaved, "right") === true },
    presets_saved: presetsSaved,
  };
}

/** The key `projectFolder`'s layout is kept under. */
export function studioLayoutStorageKey(projectFolder: string): string {
  return `studio-layout:${projectFolder}`;
}

/** Each project folder's layout, read from and kept in the page's storage. */
export class StudioLayoutKeptInStorage {
  constructor(private readonly storage: TatolabWindowLocalStorage) {}

  /** The layout kept for `projectFolder`, the default where none is kept or what is kept does not parse. */
  readLayoutOf(projectFolder: string): StudioLayoutOfAFolder {
    let saved: unknown = undefined;
    try {
      const savedText = this.storage?.getItem(studioLayoutStorageKey(projectFolder)) ?? null;
      saved = savedText === null ? undefined : JSON.parse(savedText);
    } catch {
      saved = undefined;
    }
    return studioLayoutFromSaved(saved);
  }

  /** Keep `layout` for `projectFolder`; a page that may not store keeps it only while it is open. */
  keepLayoutOf(projectFolder: string, layout: StudioLayoutOfAFolder): void {
    try {
      this.storage?.setItem(studioLayoutStorageKey(projectFolder), JSON.stringify(layout));
    } catch {
      return;
    }
  }
}
