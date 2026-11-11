import { describe, expect, it } from "vitest";
import { areasOfTheLayout, type StudioAreaLayoutNode } from "./studio_area_layout";
import { NO_STUDIO_LAYOUT_EDGE_HIDDEN, STUDIO_LAYOUT_SHAPES, studioLayoutHasAnAreaAt, studioLayoutShapedAs, studioLayoutWithEdgesHidden, studioLayoutWithShownSplitSizes } from "./studio_layout_shapes";

const area = (area_id: string, view_type_id: string): StudioAreaLayoutNode => ({ kind: "area", area_id, view_type_id });

const BUILD: StudioAreaLayoutNode = {
  kind: "split",
  split_id: "build-columns",
  direction: "row",
  parts: [
    { size_percent: 18, part: area("outliner", "outliner") },
    { size_percent: 60, part: area("stream-graph", "stream_graph") },
    {
      size_percent: 22,
      part: {
        kind: "split",
        split_id: "build-right",
        direction: "column",
        parts: [
          { size_percent: 38, part: area("viewer", "viewer") },
          { size_percent: 62, part: area("properties", "properties") },
        ],
      },
    },
  ],
};

const GRAPH_OVER_LOGS: StudioAreaLayoutNode = {
  kind: "split",
  split_id: "code-rows",
  direction: "column",
  parts: [
    { size_percent: 70, part: area("graph", "stream_graph") },
    { size_percent: 30, part: area("logs", "logs") },
  ],
};

const viewTypesOf = (layout: StudioAreaLayoutNode) => areasOfTheLayout(layout).map(({ view_type_id }) => view_type_id);

describe("shaping a layout", () => {
  it("puts the view the layout gave the most room in the main slot, and the rest after it in order", () => {
    const shaped = studioLayoutShapedAs(BUILD, "three_columns");
    expect(viewTypesOf(shaped)).toEqual(["outliner", "stream_graph", "viewer"]);
    expect(shaped).toMatchObject({ kind: "split", direction: "row", parts: [{ size_percent: 33 }, { size_percent: 34, part: { area_id: "stream-graph" } }, { size_percent: 33 }] });
  });

  it("keeps a single view, the largest, as Single", () => {
    expect(studioLayoutShapedAs(BUILD, "single")).toEqual(area("stream-graph", "stream_graph"));
  });

  it("fills a shape with more slots than the layout has areas with views it did not show, on new area ids", () => {
    const shaped = studioLayoutShapedAs(GRAPH_OVER_LOGS, "grid");
    const areas = areasOfTheLayout(shaped);
    expect(areas.map(({ view_type_id }) => view_type_id)).toEqual(["stream_graph", "logs", "viewer", "outliner"]);
    expect(new Set(areas.map(({ area_id }) => area_id)).size).toBe(4);
    expect(areas.slice(2).map(({ area_id }) => area_id)).toEqual(["area-1", "area-2"]);
  });

  it("gives every shape distinct split ids, so the window lays each one out afresh", () => {
    for (const { shape } of STUDIO_LAYOUT_SHAPES) {
      const shaped = studioLayoutShapedAs(BUILD, shape);
      const splitIds: string[] = [];
      const collect = (node: StudioAreaLayoutNode) => {
        if (node.kind === "split") {
          splitIds.push(node.split_id);
          node.parts.forEach(({ part }) => collect(part));
        }
      };
      collect(shaped);
      expect(new Set(splitIds).size).toBe(splitIds.length);
      expect(splitIds.every((splitId) => splitId.startsWith(shape))).toBe(true);
    }
  });
});

describe("hiding a layout's edges", () => {
  it("has a left and a right edge side by side, and a bottom where the largest part stacks", () => {
    expect((["left", "bottom", "right"] as const).map((edge) => studioLayoutHasAnAreaAt(BUILD, edge))).toEqual([true, false, true]);
    expect(studioLayoutHasAnAreaAt(GRAPH_OVER_LOGS, "bottom")).toBe(true);
    expect(studioLayoutHasAnAreaAt(GRAPH_OVER_LOGS, "left")).toBe(false);
    expect(studioLayoutHasAnAreaAt(area("solo", "viewer"), "right")).toBe(false);
  });

  it("drops the left and right parts and sizes the rest up to fill the split", () => {
    const shown = studioLayoutWithEdgesHidden(BUILD, { ...NO_STUDIO_LAYOUT_EDGE_HIDDEN, left: true });
    expect(viewTypesOf(shown)).toEqual(["stream_graph", "viewer", "properties"]);
    expect(shown.kind === "split" ? shown.parts.map(({ size_percent }) => Math.round(size_percent)) : []).toEqual([73, 27]);
    expect(studioLayoutWithEdgesHidden(BUILD, { left: true, bottom: false, right: true })).toEqual(area("stream-graph", "stream_graph"));
  });

  it("drops the bottom of a stack, leaving the one part above in its place", () => {
    expect(studioLayoutWithEdgesHidden(GRAPH_OVER_LOGS, { ...NO_STUDIO_LAYOUT_EDGE_HIDDEN, bottom: true })).toEqual(area("graph", "stream_graph"));
  });

  it("shows the layout as it is with no edge hidden, or one it has no area at", () => {
    expect(studioLayoutWithEdgesHidden(BUILD, NO_STUDIO_LAYOUT_EDGE_HIDDEN)).toBe(BUILD);
    expect(studioLayoutWithEdgesHidden(BUILD, { ...NO_STUDIO_LAYOUT_EDGE_HIDDEN, bottom: true })).toEqual(BUILD);
  });

  it("keeps a hidden part's size when the parts shown are resized", () => {
    const resized = studioLayoutWithShownSplitSizes(BUILD, "build-columns", { "stream-graph": 50, "build-right": 50 });
    expect(resized.kind === "split" ? resized.parts.map(({ size_percent }) => size_percent) : []).toEqual([18, 41, 41]);
  });
});
