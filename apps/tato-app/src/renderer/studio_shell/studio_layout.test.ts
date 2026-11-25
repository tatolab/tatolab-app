import { describe, expect, it } from "vitest";
import {
  layoutWithAreaClosed,
  layoutWithAreaSettings,
  layoutWithAreaShowing,
  layoutWithAreaShowingNode,
  layoutWithAreaSplit,
  layoutWithAreaSwappedWithItsNeighbour,
  layoutWithSplitSizes,
  neighbourOfTheArea,
  studioAreaLayoutFromSaved,
  studioAreaLayoutNodeId,
  type StudioAreaLayoutNode,
} from "./studio_area_layout";
import { AUDIO_VIDEO_PREVIEW_VIEW_TYPE, defaultStudioLayout, editStudioLayout, STUDIO_LAYOUT_PRESETS_STORAGE_KEY, STUDIO_LAYOUTS_SHIPPED, StudioLayoutKeptInStorage, studioLayoutFromSaved, studioLayoutStorageKey } from "./studio_layout";

function areaIdsOf(node: StudioAreaLayoutNode): string[] {
  return node.kind === "area" ? [node.area_id] : node.parts.flatMap(({ part }) => areaIdsOf(part));
}

/** A page storage held in memory. */
function storageInMemory() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items };
}

const ONLY_THE_VIEWER: StudioAreaLayoutNode = { kind: "area", area_id: "only", view_type_id: "viewer" };

describe("the layout a project first opens on", () => {
  it("is Composition: the outliner left, the Audio Video Preview over a big stream graph in the middle, and properties right", () => {
    const columns = defaultStudioLayout();
    expect(areaIdsOf(columns)).toEqual(["outliner", "preview", "stream-graph", "properties"]);
    expect(columns.kind === "split" && columns.direction === "row" && columns.parts.map(({ size_percent }) => size_percent)).toEqual([17, 61, 22]);
    const middle = columns.kind === "split" ? columns.parts[1]?.part : undefined;
    expect(middle).toMatchObject({ kind: "split", direction: "column", parts: [{ part: { view_type_id: AUDIO_VIDEO_PREVIEW_VIEW_TYPE } }, { part: { view_type_id: "stream_graph" } }] });
    expect(STUDIO_LAYOUTS_SHIPPED.map(({ title }) => title)).toEqual(["Composition", "Edit", "Code", "Review"]);
  });

  it("reads back as it was saved", () => {
    expect(studioAreaLayoutFromSaved(JSON.parse(JSON.stringify(defaultStudioLayout())))).toEqual(defaultStudioLayout());
  });
});

describe("a saved layout", () => {
  it("is refused when a split has one part, a size is not positive, an id repeats, or a field has the wrong type", () => {
    const area = (areaId: string) => ({ kind: "area", area_id: areaId, view_type_id: "outliner" });
    expect(studioAreaLayoutFromSaved({ kind: "split", split_id: "s", direction: "row", parts: [{ size_percent: 100, part: area("a") }] })).toBeNull();
    expect(studioAreaLayoutFromSaved({ kind: "split", split_id: "s", direction: "row", parts: [{ size_percent: 0, part: area("a") }, { size_percent: 50, part: area("b") }] })).toBeNull();
    expect(studioAreaLayoutFromSaved({ kind: "split", split_id: "s", direction: "row", parts: [{ size_percent: 50, part: area("a") }, { size_percent: 50, part: area("a") }] })).toBeNull();
    expect(studioAreaLayoutFromSaved({ kind: "split", split_id: "s", direction: "diagonal", parts: [] })).toBeNull();
    expect(studioAreaLayoutFromSaved({ kind: "area", area_id: "a", view_type_id: 3 })).toBeNull();
    expect(studioAreaLayoutFromSaved("not a layout")).toBeNull();
  });

  it("falls back to the default, every edge shown, when it holds no layout or one that does not parse", () => {
    expect(studioLayoutFromSaved({ layout: ONLY_THE_VIEWER }).layout).toEqual(ONLY_THE_VIEWER);
    expect(studioLayoutFromSaved({ layout: { kind: "split" }, edges_hidden: { left: true } })).toEqual({ layout: defaultStudioLayout(), edges_hidden: { left: false, bottom: false, right: false }, presets_saved: [] });
    expect(studioLayoutFromSaved(undefined).layout).toEqual(defaultStudioLayout());
  });

  it("changes an area's view, its settings and a split's sizes without touching the rest", () => {
    const layout = editStudioLayout();
    const withOutlinerInTheViewer = layoutWithAreaSettings(layoutWithAreaShowing(layout, "viewer", "outliner"), "viewer", { row_expansion: { imports: true } });
    const resized = layoutWithSplitSizes(withOutlinerInTheViewer, "main-right", { viewer: 50 });
    const rightColumn = resized.kind === "split" ? resized.parts[2]?.part : undefined;
    expect(rightColumn?.kind === "split" && rightColumn.parts.map(({ size_percent }) => size_percent)).toEqual([50, 62]);
    expect(JSON.stringify(resized)).toContain('{"kind":"area","area_id":"viewer","view_type_id":"outliner","settings":{"row_expansion":{"imports":true}}}');
    expect(areaIdsOf(resized)).toEqual(areaIdsOf(layout));
  });

  it("keeps the node an area shows, and forgets it when the area shows another view", () => {
    const showingANode = layoutWithAreaShowingNode(defaultStudioLayout(), "preview", "node-2");
    expect(studioAreaLayoutFromSaved(JSON.parse(JSON.stringify(showingANode)))).toEqual(showingANode);
    expect(JSON.stringify(showingANode)).toContain(`"area_id":"preview","view_type_id":"${AUDIO_VIDEO_PREVIEW_VIEW_TYPE}","shown_node_id":"node-2"`);
    expect(JSON.stringify(layoutWithAreaShowing(showingANode, "preview", "viewer"))).not.toContain("shown_node_id");
    expect(studioAreaLayoutFromSaved({ kind: "area", area_id: "a", view_type_id: "viewer", shown_node_id: 3 })).toBeNull();
  });
});

describe("the layout kept per project folder", () => {
  it("keeps each folder's layout under its own key, and reads the default for a folder with none or text that is not JSON", () => {
    const storage = storageInMemory();
    const layoutKept = new StudioLayoutKeptInStorage(storage);
    layoutKept.keepLayoutOf("/a", { ...studioLayoutFromSaved(undefined), layout: ONLY_THE_VIEWER });
    storage.setItem(studioLayoutStorageKey("/c"), "{not json");

    expect(layoutKept.readLayoutOf("/a").layout).toEqual(ONLY_THE_VIEWER);
    expect(layoutKept.readLayoutOf("/b").layout).toEqual(defaultStudioLayout());
    expect(layoutKept.readLayoutOf("/c").layout).toEqual(defaultStudioLayout());
    expect(new StudioLayoutKeptInStorage(null).readLayoutOf("/a").layout).toEqual(defaultStudioLayout());
  });

  it("keeps the hidden edges with it, and the saved presets once for every folder, leaving out a preset with no name or a layout that does not parse", () => {
    const storage = storageInMemory();
    const layoutKept = new StudioLayoutKeptInStorage(storage);
    layoutKept.keepLayoutOf("/a", { layout: defaultStudioLayout(), edges_hidden: { left: true, bottom: false, right: false }, presets_saved: [{ title: "Show night", layout: ONLY_THE_VIEWER }] });

    const readBack = layoutKept.readLayoutOf("/a");
    expect(readBack.edges_hidden).toEqual({ left: true, bottom: false, right: false });
    expect(readBack.presets_saved).toEqual([{ title: "Show night", layout: ONLY_THE_VIEWER }]);
    expect(layoutKept.readLayoutOf("/b").presets_saved).toEqual([{ title: "Show night", layout: ONLY_THE_VIEWER }]);
    expect(storage.items.get(studioLayoutStorageKey("/a"))).not.toContain("presets_saved");
    expect(studioLayoutFromSaved({ presets_saved: [{ title: " ", layout: ONLY_THE_VIEWER }, { title: "Broken", layout: { kind: "area" } }] }).presets_saved).toEqual([]);
  });

  it("moves presets a folder kept before presets were the studio's into the studio's, once each", () => {
    const storage = storageInMemory();
    const rehearsal = { title: "Rehearsal", layout: editStudioLayout() };
    storage.setItem(STUDIO_LAYOUT_PRESETS_STORAGE_KEY, JSON.stringify([rehearsal]));
    storage.setItem(studioLayoutStorageKey("/old"), JSON.stringify({ layout: ONLY_THE_VIEWER, presets_saved: [rehearsal, { title: "Show night", layout: ONLY_THE_VIEWER }] }));
    const layoutKept = new StudioLayoutKeptInStorage(storage);

    expect(layoutKept.readLayoutOf("/old")).toMatchObject({ layout: ONLY_THE_VIEWER, presets_saved: [rehearsal, { title: "Show night", layout: ONLY_THE_VIEWER }] });
    expect(storage.items.get(studioLayoutStorageKey("/old"))).not.toContain("presets_saved");
    expect(layoutKept.readLayoutOf("/new").presets_saved.map(({ title }) => title)).toEqual(["Rehearsal", "Show night"]);
  });
});

describe("arranging an area", () => {
  const newArea = { kind: "area", area_id: "area-1", view_type_id: "viewer" } as const;

  it("splits an area into two halves, joining a split of the same direction and nesting one across it", () => {
    const beside = layoutWithAreaSplit(editStudioLayout(), "stream-graph", "row", newArea);
    expect(beside.kind === "split" && beside.parts.map(({ size_percent, part }) => [studioAreaLayoutNodeId(part), size_percent])).toEqual([
      ["outliner", 18],
      ["stream-graph", 30],
      ["area-1", 30],
      ["main-right", 22],
    ]);
    const under = layoutWithAreaSplit(editStudioLayout(), "stream-graph", "column", newArea);
    const middle = under.kind === "split" ? under.parts[1] : undefined;
    expect(middle).toMatchObject({ size_percent: 60, part: { kind: "split", split_id: "split-1", direction: "column", parts: [{ size_percent: 50, part: { area_id: "stream-graph" } }, { size_percent: 50, part: newArea }] } });
    expect(studioAreaLayoutFromSaved(JSON.parse(JSON.stringify(under)))).toEqual(under);
  });

  it("closes an area, its room going to the parts beside it and a split of one part giving way to that part, but never the only area", () => {
    const withoutTheViewer = layoutWithAreaClosed(editStudioLayout(), "viewer");
    expect(withoutTheViewer?.kind === "split" && withoutTheViewer.parts.map(({ part }) => studioAreaLayoutNodeId(part))).toEqual(["outliner", "stream-graph", "properties"]);
    const withoutTheOutliner = layoutWithAreaClosed(editStudioLayout(), "outliner");
    expect(withoutTheOutliner?.kind === "split" && withoutTheOutliner.parts.map(({ size_percent }) => Math.round(size_percent))).toEqual([73, 27]);
    expect(layoutWithAreaClosed(ONLY_THE_VIEWER, "only")).toBeNull();
  });

  it("swaps an area with the part after it, or before it when it is last, each place keeping its size", () => {
    expect(neighbourOfTheArea(editStudioLayout(), "viewer")).toEqual({ direction: "column", lies: "after" });
    expect(neighbourOfTheArea(editStudioLayout(), "properties")).toEqual({ direction: "column", lies: "before" });
    expect(neighbourOfTheArea(ONLY_THE_VIEWER, "only")).toBeNull();
    const swapped = layoutWithAreaSwappedWithItsNeighbour(editStudioLayout(), "outliner");
    expect(swapped.kind === "split" && swapped.parts.map(({ size_percent, part }) => [studioAreaLayoutNodeId(part), size_percent])).toEqual([
      ["stream-graph", 18],
      ["outliner", 60],
      ["main-right", 22],
    ]);
  });
});
