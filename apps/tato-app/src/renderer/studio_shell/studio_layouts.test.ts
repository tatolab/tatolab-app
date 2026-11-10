import { describe, expect, it } from "vitest";
import { layoutWithAreaSettings, layoutWithAreaShowing, layoutWithSplitSizes, studioAreaLayoutFromSaved, type StudioAreaLayoutNode } from "./studio_area_layout";
import { defaultStudioLayout, STUDIO_LAYOUTS, StudioLayoutsKeptInStorage, studioLayoutsFromSaved, studioLayoutsStorageKey } from "./studio_layouts";

function areaIdsOf(node: StudioAreaLayoutNode): string[] {
  return node.kind === "area" ? [node.area_id] : node.parts.flatMap(({ part }) => areaIdsOf(part));
}

/** A page storage held in memory. */
function storageInMemory() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items };
}

describe("the five layouts", () => {
  it("lays each out after the canvas, the outliner over properties down the right of every one", () => {
    expect(STUDIO_LAYOUTS.map(({ title, shortcut_digit }) => `${title} ${shortcut_digit}`)).toEqual(["Build 1", "Compose 2", "Spatial 3", "Code 4", "Perform 5"]);
    expect(areaIdsOf(defaultStudioLayout("build"))).toEqual(["viewer", "stream-graph", "outliner", "properties"]);
    expect(areaIdsOf(defaultStudioLayout("compose"))).toEqual(["stream-graph", "viewer", "code", "outliner", "properties"]);
    expect(areaIdsOf(defaultStudioLayout("spatial"))).toEqual(["scene", "viewer", "stream-graph", "outliner", "properties"]);
    expect(areaIdsOf(defaultStudioLayout("code"))).toEqual(["files", "code", "stream-graph", "viewer", "outliner", "properties"]);
    expect(areaIdsOf(defaultStudioLayout("perform"))).toEqual(["viewer", "scene", "stream-graph", "outliner", "properties"]);
  });

  it("reads every default back as it was saved", () => {
    for (const { name } of STUDIO_LAYOUTS) expect(studioAreaLayoutFromSaved(JSON.parse(JSON.stringify(defaultStudioLayout(name))))).toEqual(defaultStudioLayout(name));
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

  it("falls back, layout by layout, to the default of any it does not hold or that does not parse", () => {
    const saved = { chosen_layout: "perform", layouts: { code: { kind: "area", area_id: "only", view_type_id: "code" }, build: { kind: "split" } } };
    const layouts = studioLayoutsFromSaved(saved);
    expect(layouts.chosen_layout).toBe("perform");
    expect(layouts.layouts.code).toEqual({ kind: "area", area_id: "only", view_type_id: "code" });
    expect(layouts.layouts.build).toEqual(defaultStudioLayout("build"));
    expect(studioLayoutsFromSaved({ chosen_layout: "dance" }).chosen_layout).toBe("build");
  });

  it("changes an area's view, its settings and a split's sizes without touching the rest", () => {
    const build = defaultStudioLayout("build");
    const withOutlinerInTheViewer = layoutWithAreaSettings(layoutWithAreaShowing(build, "viewer", "outliner"), "viewer", { row_expansion: { imports: true } });
    const resized = layoutWithSplitSizes(withOutlinerInTheViewer, "side", { outliner: 70 });
    const sideColumn = resized.kind === "split" ? resized.parts[1]?.part : undefined;
    expect(sideColumn?.kind === "split" && sideColumn.parts.map(({ size_percent }) => size_percent)).toEqual([70, 58]);
    expect(JSON.stringify(resized)).toContain('{"kind":"area","area_id":"viewer","view_type_id":"outliner","settings":{"row_expansion":{"imports":true}}}');
    expect(areaIdsOf(resized)).toEqual(areaIdsOf(build));
  });
});

describe("layouts kept per project folder", () => {
  it("keeps each folder's layouts under its own key, and reads defaults for a folder with none or text that is not JSON", () => {
    const storage = storageInMemory();
    const layoutsKept = new StudioLayoutsKeptInStorage(storage);
    layoutsKept.keepLayoutsOf("/a", { ...studioLayoutsFromSaved(undefined), chosen_layout: "code" });
    storage.setItem(studioLayoutsStorageKey("/c"), "{not json");

    expect(layoutsKept.readLayoutsOf("/a").chosen_layout).toBe("code");
    expect(layoutsKept.readLayoutsOf("/b").chosen_layout).toBe("build");
    expect(layoutsKept.readLayoutsOf("/c").chosen_layout).toBe("build");
    expect(new StudioLayoutsKeptInStorage(null).readLayoutsOf("/a").chosen_layout).toBe("build");
  });
});
