// The studio's one layout per project folder, its tree as the person shaped it and the edges they hid, kept in the page's
// storage so a project reopens as it was left; the presets the person saved, kept once for the studio so every project
// lists them; and the layouts Studio ships.

import { Option, Schema } from "effect";
import { studioAreaLayoutFromSaved, type StudioArea, type StudioAreaLayoutNode, type StudioAreaSplit } from "./studio_area_layout";
import type { TatolabWindowLocalStorage } from "../tatolab_window_local_storage";
import { NO_STUDIO_LAYOUT_EDGE_HIDDEN, type StudioLayoutEdgesHidden } from "./studio_layout_shapes";
import { projectViewIdOf } from "../view_host/studio_view_type_registry";

/** How many saved presets the digits held with Ctrl or ⌘ apply, the first on 1. */
export const STUDIO_LAYOUT_PRESETS_ON_A_DIGIT = 9;

/** A layout the person saved as a preset, by the name they gave it. */
export interface StudioLayoutPresetSaved {
  title: string;
  layout: StudioAreaLayoutNode;
}

/** A project folder's layout as the person left it and the edges they hid, with the presets saved in the studio, the same in every project. */
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

/** The UUID of the Core Nodes project, which every project imports. */
const CORE_NODES_PROJECT = "ba5fc2b1-df25-4e86-bec3-aba1564d6233";

/** The Audio Video Preview the Core Nodes project brings, found by that project's UUID and the view's folder. */
export const AUDIO_VIDEO_PREVIEW_VIEW_TYPE = projectViewIdOf(CORE_NODES_PROJECT, "audio_video_preview");

/** The Composition layout, the one a project first opens on: the outliner left, the Audio Video Preview over a big stream graph in the middle, and properties right. */
export function compositionStudioLayout(): StudioAreaLayoutNode {
  return split("composition-columns", "row", [
    [17, area("outliner", "outliner")],
    [61, split("composition-middle", "column", [[42, area("preview", AUDIO_VIDEO_PREVIEW_VIEW_TYPE)], [58, area("stream-graph", "stream_graph")]])],
    [22, area("properties", "properties")],
  ]);
}

/** The Edit layout: the outliner left, the stream graph in the middle, and the Node visualizer over properties right. */
export function editStudioLayout(): StudioAreaLayoutNode {
  return split("main-columns", "row", [
    [18, area("outliner", "outliner")],
    [60, area("stream-graph", "stream_graph")],
    [22, split("main-right", "column", [[38, area("viewer", "viewer")], [62, area("properties", "properties")]])],
  ]);
}

/** The Code layout: the project's files left, Code with the project's log in the middle, and the stream graph over the Node visualizer right. */
export function codeStudioLayout(): StudioAreaLayoutNode {
  return split("code-columns", "row", [
    [18, area("code-files", "files")],
    [52, area("code", "code")],
    [30, split("code-right", "column", [[45, area("code-stream-graph", "stream_graph")], [55, area("code-viewer", "viewer")]])],
  ]);
}

/** The Review layout: the Audio Video Preview large, over a thin strip of the stream graph, with properties right. */
export function reviewStudioLayout(): StudioAreaLayoutNode {
  return split("review-columns", "row", [
    [80, split("review-middle", "column", [[78, area("preview", AUDIO_VIDEO_PREVIEW_VIEW_TYPE)], [22, area("stream-graph", "stream_graph")]])],
    [20, area("properties", "properties")],
  ]);
}

/** The layout a project first opens on. */
export function defaultStudioLayout(): StudioAreaLayoutNode {
  return compositionStudioLayout();
}

/** A layout that ships with Studio, at the top of the layout menu, and which opening a view it is home to switches to when no area shows that view. */
export interface StudioLayoutShipped {
  layout_id: "composition" | "edit" | "code" | "review";
  title: string;
  layout: StudioAreaLayoutNode;
  /** The view types whose openings switch to this layout; the other views it shows are there to work beside them. */
  home_of_view_types: readonly string[];
}

/** The layouts Studio ships, in the layout menu's order. */
export const STUDIO_LAYOUTS_SHIPPED: readonly StudioLayoutShipped[] = [
  { layout_id: "composition", title: "Composition", layout: compositionStudioLayout(), home_of_view_types: [AUDIO_VIDEO_PREVIEW_VIEW_TYPE] },
  { layout_id: "edit", title: "Edit", layout: editStudioLayout(), home_of_view_types: [] },
  { layout_id: "code", title: "Code", layout: codeStudioLayout(), home_of_view_types: ["code"] },
  { layout_id: "review", title: "Review", layout: reviewStudioLayout(), home_of_view_types: [] },
];

/** The layout Studio ships as `viewTypeId`'s home, or `null` when none is, each home's view type read through `viewTypeIdOf`, which gives the id a view is registered under. */
export function shippedStudioLayoutHomeOf(viewTypeId: string, viewTypeIdOf: (viewTypeId: string) => string = (id) => id): StudioLayoutShipped | null {
  return STUDIO_LAYOUTS_SHIPPED.find(({ home_of_view_types: homeOfViewTypes }) => homeOfViewTypes.some((homeOf) => viewTypeIdOf(homeOf) === viewTypeId)) ?? null;
}

/** `saved`'s field `fieldName`, or `undefined` when `saved` is not an object or has none. */
function savedField(saved: unknown, fieldName: string): unknown {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return undefined;
  return Object.entries(saved).find(([savedFieldName]) => savedFieldName === fieldName)?.[1];
}

const savedPresetSchema = Schema.Struct({ title: Schema.String, layout: Schema.Unknown });
const decodeSavedPreset = Schema.decodeUnknownOption(savedPresetSchema);

/** The presets `saved` lists that parse, in its order: each a titled, non-blank name with a layout that reads. */
export function studioLayoutPresetsFromSaved(saved: unknown): StudioLayoutPresetSaved[] {
  return (Array.isArray(saved) ? saved : []).flatMap((savedPreset): StudioLayoutPresetSaved[] => {
    const decoded = decodeSavedPreset(savedPreset);
    if (Option.isNone(decoded) || decoded.value.title.trim() === "") return [];
    const layout = studioAreaLayoutFromSaved(decoded.value.layout);
    return layout === null ? [] : [{ title: decoded.value.title, layout }];
  });
}

/** `presets` followed by each of `morePresets` not among them already, a preset being the same when its title and layout are. */
function presetsJoined(presets: readonly StudioLayoutPresetSaved[], morePresets: readonly StudioLayoutPresetSaved[]): StudioLayoutPresetSaved[] {
  const keyOf = (preset: StudioLayoutPresetSaved) => JSON.stringify([preset.title, preset.layout]);
  const keysHeld = new Set(presets.map(keyOf));
  return [...presets, ...morePresets.filter((preset) => !keysHeld.has(keyOf(preset)))];
}

/** The layout `saved` holds, or the default where it holds none or one that does not parse, with its hidden edges and the presets saved with it, which a layout kept before presets were the studio's held. */
export function studioLayoutFromSaved(saved: unknown): StudioLayoutOfAFolder {
  const layoutSaved = studioAreaLayoutFromSaved(savedField(saved, "layout"));
  const edgesHiddenSaved = savedField(saved, "edges_hidden");
  return {
    layout: layoutSaved ?? defaultStudioLayout(),
    edges_hidden:
      layoutSaved === null
        ? NO_STUDIO_LAYOUT_EDGE_HIDDEN
        : { left: savedField(edgesHiddenSaved, "left") === true, bottom: savedField(edgesHiddenSaved, "bottom") === true, right: savedField(edgesHiddenSaved, "right") === true },
    presets_saved: studioLayoutPresetsFromSaved(savedField(saved, "presets_saved")),
  };
}

/** The key `projectFolder`'s layout is kept under. */
export function studioLayoutStorageKey(projectFolder: string): string {
  return `studio-layout:${projectFolder}`;
}

/** The key the studio's saved presets are kept under, once for every project. */
export const STUDIO_LAYOUT_PRESETS_STORAGE_KEY = "studio-layout-presets";

/** Each project folder's layout and the studio's saved presets, read from and kept in the page's storage. */
export class StudioLayoutKeptInStorage {
  constructor(private readonly storage: TatolabWindowLocalStorage) {}

  /**
   * The layout kept for `projectFolder`, the default where none is kept or what is kept does not parse, with the studio's presets.
   * Presets a folder's layout still holds from before presets were the studio's join the studio's, and are kept there from then on.
   */
  readLayoutOf(projectFolder: string): StudioLayoutOfAFolder {
    const folderLayout = studioLayoutFromSaved(this.readSaved(studioLayoutStorageKey(projectFolder)));
    const studioPresets = studioLayoutPresetsFromSaved(this.readSaved(STUDIO_LAYOUT_PRESETS_STORAGE_KEY));
    const presetsSaved = presetsJoined(studioPresets, folderLayout.presets_saved);
    const studioLayout = { ...folderLayout, presets_saved: presetsSaved };
    if (folderLayout.presets_saved.length > 0) this.keepLayoutOf(projectFolder, studioLayout);
    return studioLayout;
  }

  /** Keep `layout` for `projectFolder`, and its presets for the studio; a page that may not store keeps them only while it is open. */
  keepLayoutOf(projectFolder: string, layout: StudioLayoutOfAFolder): void {
    const { presets_saved: presetsSaved, ...folderLayout } = layout;
    this.keep(studioLayoutStorageKey(projectFolder), folderLayout);
    this.keep(STUDIO_LAYOUT_PRESETS_STORAGE_KEY, presetsSaved);
  }

  private readSaved(key: string): unknown {
    try {
      const savedText = this.storage?.getItem(key) ?? null;
      return savedText === null ? undefined : JSON.parse(savedText);
    } catch {
      return undefined;
    }
  }

  private keep(key: string, value: unknown): void {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  }
}
