// The studio's five layouts, after the concept canvas's grids, and each one's edited tree, kept per
// project folder in the page's storage so a project reopens as it was left.

import { studioAreaLayoutFromSaved, type StudioArea, type StudioAreaLayoutNode, type StudioAreaSplit } from "./studio_area_layout";
import type { TatolabWindowLocalStorage } from "../tatolab_window_local_storage";

/** A layout by the name it is saved under. */
export type StudioLayoutName = "build" | "compose" | "spatial" | "code" | "perform";

/** The layouts in Window › Layout's order, each with its title and the digit held with Ctrl or ⌘ that chooses it. */
export const STUDIO_LAYOUTS: readonly { name: StudioLayoutName; title: string; shortcut_digit: string }[] = [
  { name: "build", title: "Build", shortcut_digit: "1" },
  { name: "compose", title: "Compose", shortcut_digit: "2" },
  { name: "spatial", title: "Spatial", shortcut_digit: "3" },
  { name: "code", title: "Code", shortcut_digit: "4" },
  { name: "perform", title: "Perform", shortcut_digit: "5" },
];

/** Each layout's tree as the person left it, and the one chosen. */
export interface StudioLayoutsOfAFolder {
  chosen_layout: StudioLayoutName;
  layouts: Record<StudioLayoutName, StudioAreaLayoutNode>;
}

function area(areaId: string, viewTypeId: string | null): StudioArea {
  return { kind: "area", area_id: areaId, view_type_id: viewTypeId };
}

function split(splitId: string, direction: "row" | "column", parts: [number, StudioAreaLayoutNode][]): StudioAreaSplit {
  return { kind: "split", split_id: splitId, direction, parts: parts.map(([sizePercent, part]) => ({ size_percent: sizePercent, part })) };
}

/** The column down the right edge of the layouts that keep one: the outliner over properties. */
function sideColumn(): StudioAreaSplit {
  return split("side", "column", [
    [42, area("outliner", "outliner")],
    [58, area("properties", "properties")],
  ]);
}

/** `layoutName` as the studio first lays it out; an area on `null` waits for a view an open project brings. */
export function defaultStudioLayout(layoutName: StudioLayoutName): StudioAreaLayoutNode {
  switch (layoutName) {
    case "build":
      return split("build-columns", "row", [
        [82, split("build-main", "column", [[42, area("viewer", "viewer")], [58, area("stream-graph", "stream_graph")]])],
        [18, sideColumn()],
      ]);
    case "compose":
      return split("compose-columns", "row", [
        [82, split("compose-main", "column", [[61, area("stream-graph", "stream_graph")], [39, split("compose-bottom", "row", [[50, area("viewer", "viewer")], [50, area("code", "code")]])]])],
        [18, sideColumn()],
      ]);
    case "spatial":
      return split("spatial-columns", "row", [
        [57, area("scene", null)],
        [25, split("spatial-middle", "column", [[50, area("viewer", "viewer")], [50, area("stream-graph", "stream_graph")]])],
        [18, sideColumn()],
      ]);
    case "code":
      return split("code-columns", "row", [
        [15, area("files", "files")],
        [40, area("code", "code")],
        [45, split("code-right", "column", [[70, area("stream-graph", "stream_graph")], [30, area("viewer", "viewer")]])],
      ]);
    case "perform":
      return split("perform-columns", "row", [
        [
          76,
          split("perform-main", "column", [
            [82, area("viewer", "viewer")],
            [18, split("perform-previews", "row", [[34, area("preview-first", "viewer")], [33, area("preview-second", "viewer")], [33, area("preview-third", "viewer")]])],
          ]),
        ],
        [24, area("controls", "controls")],
      ]);
  }
}

function isAStudioLayoutName(candidate: unknown): candidate is StudioLayoutName {
  return STUDIO_LAYOUTS.some((layout) => layout.name === candidate);
}

/** `saved`'s field `fieldName`, or `undefined` when `saved` is not an object or has none. */
function savedField(saved: unknown, fieldName: string): unknown {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return undefined;
  return Object.entries(saved).find(([savedFieldName]) => savedFieldName === fieldName)?.[1];
}

/** The layouts `saved` holds; any layout it does not hold, or holds in a shape that does not parse, is that layout's default. */
export function studioLayoutsFromSaved(saved: unknown): StudioLayoutsOfAFolder {
  const chosenLayout = savedField(saved, "chosen_layout");
  const savedLayouts = savedField(saved, "layouts");
  const layoutOf = (layoutName: StudioLayoutName) => studioAreaLayoutFromSaved(savedField(savedLayouts, layoutName)) ?? defaultStudioLayout(layoutName);
  return {
    chosen_layout: isAStudioLayoutName(chosenLayout) ? chosenLayout : "build",
    layouts: { build: layoutOf("build"), compose: layoutOf("compose"), spatial: layoutOf("spatial"), code: layoutOf("code"), perform: layoutOf("perform") },
  };
}

/** The key `projectFolder`'s layouts are kept under. */
export function studioLayoutsStorageKey(projectFolder: string): string {
  return `studio-layouts:${projectFolder}`;
}

/** Each project folder's layouts, read from and kept in the page's storage. */
export class StudioLayoutsKeptInStorage {
  constructor(private readonly storage: TatolabWindowLocalStorage) {}

  /** The layouts kept for `projectFolder`, each a default where none is kept or what is kept does not parse. */
  readLayoutsOf(projectFolder: string): StudioLayoutsOfAFolder {
    let saved: unknown = undefined;
    try {
      const savedText = this.storage?.getItem(studioLayoutsStorageKey(projectFolder)) ?? null;
      saved = savedText === null ? undefined : JSON.parse(savedText);
    } catch {
      saved = undefined;
    }
    return studioLayoutsFromSaved(saved);
  }

  /** Keep `layouts` for `projectFolder`; a page that may not store keeps them only while it is open. */
  keepLayoutsOf(projectFolder: string, layouts: StudioLayoutsOfAFolder): void {
    try {
      this.storage?.setItem(studioLayoutsStorageKey(projectFolder), JSON.stringify(layouts));
    } catch {
      return;
    }
  }
}
