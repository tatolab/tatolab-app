// The studio's five layouts, after the concept canvas's grids, and each one's edited tree, kept per
// workspace folder in the page's storage so a workspace reopens as it was left.

import { studioAreaLayoutFromSaved, type StudioArea, type StudioAreaLayoutNode, type StudioAreaSplit } from "./studio_area_layout";

/** A layout by the name it is saved under. */
export type WorkspaceLayoutName = "build" | "compose" | "spatial" | "code" | "perform";

/** The layouts in Window › Workspace layout's order, each with its title and the digit held with Ctrl or ⌘ that chooses it. */
export const WORKSPACE_LAYOUTS: readonly { name: WorkspaceLayoutName; title: string; shortcut_digit: string }[] = [
  { name: "build", title: "Build", shortcut_digit: "1" },
  { name: "compose", title: "Compose", shortcut_digit: "2" },
  { name: "spatial", title: "Spatial", shortcut_digit: "3" },
  { name: "code", title: "Code", shortcut_digit: "4" },
  { name: "perform", title: "Perform", shortcut_digit: "5" },
];

/** Each layout's tree as the person left it, and the one chosen. */
export interface WorkspaceLayoutsOfAFolder {
  chosen_layout: WorkspaceLayoutName;
  layouts: Record<WorkspaceLayoutName, StudioAreaLayoutNode>;
}

function area(areaId: string, viewTypeId: string | null): StudioArea {
  return { kind: "area", area_id: areaId, view_type_id: viewTypeId };
}

function split(splitId: string, direction: "row" | "column", parts: [number, StudioAreaLayoutNode][]): StudioAreaSplit {
  return { kind: "split", split_id: splitId, direction, parts: parts.map(([sizePercent, part]) => ({ size_percent: sizePercent, part })) };
}

/** The column down the right edge every layout keeps: the outliner over properties. */
function sideColumn(): StudioAreaSplit {
  return split("side", "column", [
    [42, area("outliner", "outliner")],
    [58, area("properties", "properties")],
  ]);
}

/** `layoutName` as the studio first lays it out; an area on `null` waits for a view a workspace project brings. */
export function defaultWorkspaceLayout(layoutName: WorkspaceLayoutName): StudioAreaLayoutNode {
  switch (layoutName) {
    case "build":
      return split("build-columns", "row", [
        [57, split("build-left", "column", [[50, area("scene", null)], [50, area("stream-graph", "stream_graph")]])],
        [25, split("build-middle", "column", [[50, area("viewer", "viewer")], [50, area("code", "code")]])],
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
        [43, area("code", "code")],
        [39, split("code-middle", "column", [[50, area("stream-graph", "stream_graph")], [50, area("agent", "agent")]])],
        [18, sideColumn()],
      ]);
    case "perform":
      return split("perform-columns", "row", [
        [82, split("perform-main", "column", [[58, area("viewer", "viewer")], [42, split("perform-bottom", "row", [[50, area("scene", null)], [50, area("stream-graph", "stream_graph")]])]])],
        [18, sideColumn()],
      ]);
  }
}

function isAWorkspaceLayoutName(candidate: unknown): candidate is WorkspaceLayoutName {
  return WORKSPACE_LAYOUTS.some((layout) => layout.name === candidate);
}

/** `saved`'s field `fieldName`, or `undefined` when `saved` is not an object or has none. */
function savedField(saved: unknown, fieldName: string): unknown {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return undefined;
  return Object.entries(saved).find(([savedFieldName]) => savedFieldName === fieldName)?.[1];
}

/** The layouts `saved` holds; any layout it does not hold, or holds in a shape that does not parse, is that layout's default. */
export function workspaceLayoutsFromSaved(saved: unknown): WorkspaceLayoutsOfAFolder {
  const chosenLayout = savedField(saved, "chosen_layout");
  const savedLayouts = savedField(saved, "layouts");
  const layoutOf = (layoutName: WorkspaceLayoutName) => studioAreaLayoutFromSaved(savedField(savedLayouts, layoutName)) ?? defaultWorkspaceLayout(layoutName);
  return {
    chosen_layout: isAWorkspaceLayoutName(chosenLayout) ? chosenLayout : "build",
    layouts: { build: layoutOf("build"), compose: layoutOf("compose"), spatial: layoutOf("spatial"), code: layoutOf("code"), perform: layoutOf("perform") },
  };
}

/** The page storage a workspace's layouts are kept in: the window's `localStorage`, or none where the page may not use it. */
export type WorkspaceLayoutsStorage = Pick<Storage, "getItem" | "setItem"> | null;

/** The key `workspaceFolder`'s layouts are kept under. */
export function workspaceLayoutsStorageKey(workspaceFolder: string): string {
  return `studio-workspace-layouts:${workspaceFolder}`;
}

/** Each workspace folder's layouts, read from and kept in the page's storage. */
export class WorkspaceLayoutsKeptInStorage {
  constructor(private readonly storage: WorkspaceLayoutsStorage) {}

  /** The layouts kept for `workspaceFolder`, each a default where none is kept or what is kept does not parse. */
  readLayoutsOf(workspaceFolder: string): WorkspaceLayoutsOfAFolder {
    let saved: unknown = undefined;
    try {
      const savedText = this.storage?.getItem(workspaceLayoutsStorageKey(workspaceFolder)) ?? null;
      saved = savedText === null ? undefined : JSON.parse(savedText);
    } catch {
      saved = undefined;
    }
    return workspaceLayoutsFromSaved(saved);
  }

  /** Keep `layouts` for `workspaceFolder`; a page that may not store keeps them only while it is open. */
  keepLayoutsOf(workspaceFolder: string, layouts: WorkspaceLayoutsOfAFolder): void {
    try {
      this.storage?.setItem(workspaceLayoutsStorageKey(workspaceFolder), JSON.stringify(layouts));
    } catch {
      return;
    }
  }
}
