import { describe, expect, it } from "vitest";
import { layoutWithAreaSettings, layoutWithAreaShowing, layoutWithSplitSizes, studioAreaLayoutFromSaved, type StudioAreaLayoutNode } from "./studio_area_layout";
import { defaultStudioLayout, StudioLayoutKeptInStorage, studioLayoutFromSaved, studioLayoutStorageKey } from "./studio_layout";

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
  it("lays the outliner left, the graph in the middle, and the viewer over properties on the right", () => {
    expect(areaIdsOf(defaultStudioLayout())).toEqual(["outliner", "stream-graph", "viewer", "properties"]);
    const columns = defaultStudioLayout();
    expect(columns.kind === "split" && columns.parts.map(({ size_percent }) => size_percent)).toEqual([18, 60, 22]);
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
    const layout = defaultStudioLayout();
    const withOutlinerInTheViewer = layoutWithAreaSettings(layoutWithAreaShowing(layout, "viewer", "outliner"), "viewer", { row_expansion: { imports: true } });
    const resized = layoutWithSplitSizes(withOutlinerInTheViewer, "main-right", { viewer: 50 });
    const rightColumn = resized.kind === "split" ? resized.parts[2]?.part : undefined;
    expect(rightColumn?.kind === "split" && rightColumn.parts.map(({ size_percent }) => size_percent)).toEqual([50, 62]);
    expect(JSON.stringify(resized)).toContain('{"kind":"area","area_id":"viewer","view_type_id":"outliner","settings":{"row_expansion":{"imports":true}}}');
    expect(areaIdsOf(resized)).toEqual(areaIdsOf(layout));
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

  it("keeps the hidden edges and saved presets with it, leaving out a preset with no name or a layout that does not parse", () => {
    const layoutKept = new StudioLayoutKeptInStorage(storageInMemory());
    layoutKept.keepLayoutOf("/a", { layout: defaultStudioLayout(), edges_hidden: { left: true, bottom: false, right: false }, presets_saved: [{ title: "Show night", layout: ONLY_THE_VIEWER }] });

    const readBack = layoutKept.readLayoutOf("/a");
    expect(readBack.edges_hidden).toEqual({ left: true, bottom: false, right: false });
    expect(readBack.presets_saved).toEqual([{ title: "Show night", layout: ONLY_THE_VIEWER }]);
    expect(studioLayoutFromSaved({ presets_saved: [{ title: " ", layout: ONLY_THE_VIEWER }, { title: "Broken", layout: { kind: "area" } }] }).presets_saved).toEqual([]);
  });
});
