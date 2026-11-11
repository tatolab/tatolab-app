import { describe, expect, it } from "vitest";
import { modulesAndMarketplaceSectionSchema } from "@tatolab/tato-app-view-sdk";
import { MODULES_SHOWN } from "../../shared/tatolab_electron_bridge_contract";
import type { StudioAreaLayoutNode } from "./studio_area_layout";
import { A_POPPED_OUT_WINDOW_HAS_NO_AREAS, NO_LAYOUT_WHILE_NO_PROJECT_IS_OPEN, showViewTypeInAreaOf, watchAreasForTheViewType, type StudioViewTypeAreaSources } from "./studio_view_type_areas";

const BUILD_LAYOUT: StudioAreaLayoutNode = {
  kind: "split",
  split_id: "root",
  direction: "row",
  parts: [
    { size_percent: 60, part: { kind: "area", area_id: "graph", view_type_id: "stream_graph" } },
    {
      size_percent: 40,
      part: {
        kind: "split",
        split_id: "right",
        direction: "column",
        parts: [
          { size_percent: 50, part: { kind: "area", area_id: "viewer", view_type_id: "viewer" } },
          { size_percent: 50, part: { kind: "area", area_id: "empty", view_type_id: null } },
        ],
      },
    },
  ],
};

const VIEW_TITLES: Readonly<Record<string, string>> = { stream_graph: "Stream graph", viewer: "Viewer", "acme-dj:deck": "DJ Deck" };

/** Areas read from `layoutTree`, which a call to `changeTheLayout` replaces and tells the watcher of. */
function areaSources(layoutTree: StudioAreaLayoutNode | null, isPoppedOut = false) {
  let tree = layoutTree;
  const watchers = new Set<() => void>();
  const shown: { view_type_id: string; area_id: string }[] = [];
  const sources: StudioViewTypeAreaSources = {
    readChosenLayoutTree: () => tree,
    isAPoppedOutViewsWindow: () => isPoppedOut,
    viewTitleOf: (viewTypeId) => VIEW_TITLES[viewTypeId] ?? null,
    watchChanges: (onChanged) => {
      watchers.add(onChanged);
      return () => watchers.delete(onChanged);
    },
    showViewTypeInTheArea: (showing) => shown.push(showing),
  };
  const changeTheLayout = (nextTree: StudioAreaLayoutNode | null) => {
    tree = nextTree;
    for (const watcher of watchers) watcher();
  };
  return { sources, shown, changeTheLayout };
}

describe("a view type's areas in the chosen layout", () => {
  it("lists every area by the title of what it shows, and again only when that changes", () => {
    const { sources, changeTheLayout } = areaSources(BUILD_LAYOUT);
    const readings: unknown[] = [];
    const stopWatching = watchAreasForTheViewType("acme-dj:deck", sources, (reading) => readings.push(reading));
    changeTheLayout(BUILD_LAYOUT);
    changeTheLayout({ kind: "area", area_id: "viewer", view_type_id: "acme-dj:deck" });
    stopWatching();
    changeTheLayout(BUILD_LAYOUT);
    expect(readings).toEqual([
      {
        kind: "areas_listed",
        view_title: "DJ Deck",
        areas: [
          { area_id: "graph", shows_view_title: "Stream graph", shows_the_view_type: false },
          { area_id: "viewer", shows_view_title: "Viewer", shows_the_view_type: false },
          { area_id: "empty", shows_view_title: null, shows_the_view_type: false },
        ],
      },
      { kind: "areas_listed", view_title: "DJ Deck", areas: [{ area_id: "viewer", shows_view_title: "DJ Deck", shows_the_view_type: true }] },
    ]);
  });

  it("names no areas for an id no view type has, in a popped-out view's window, or while no project is open", () => {
    const told = (viewTypeId: string, sources: StudioViewTypeAreaSources) => {
      let reading: unknown = null;
      watchAreasForTheViewType(viewTypeId, sources, (latest) => {
        reading = latest;
      })();
      return reading;
    };
    expect(told("acme-lens:bokeh", areaSources(BUILD_LAYOUT).sources)).toEqual({ kind: "not_a_view_type" });
    expect(told("acme-dj:deck", areaSources(BUILD_LAYOUT, true).sources)).toEqual({ kind: "no_areas", because: A_POPPED_OUT_WINDOW_HAS_NO_AREAS });
    expect(told("acme-dj:deck", areaSources(null).sources)).toEqual({ kind: "no_areas", because: NO_LAYOUT_WHILE_NO_PROJECT_IS_OPEN });
  });

  it("shows the view type in an area the layout has, and says why it can't otherwise", () => {
    const { sources, shown } = areaSources(BUILD_LAYOUT);
    expect(showViewTypeInAreaOf("acme-dj:deck", "viewer", sources)).toEqual({ kind: "opened" });
    expect(showViewTypeInAreaOf("acme-dj:deck", "timeline", sources)).toEqual({ kind: "not_opened", because: "The layout shown has no area timeline." });
    expect(showViewTypeInAreaOf("acme-lens:bokeh", "viewer", sources)).toEqual({ kind: "not_opened", because: "Tato Studio has no view named acme-lens:bokeh." });
    expect(shown).toEqual([{ view_type_id: "acme-dj:deck", area_id: "viewer" }]);
  });
});

describe("the sections a view may open the Modules and Marketplace window on", () => {
  it("are the window's own sections, so neither list drifts from the other", () => {
    expect([...modulesAndMarketplaceSectionSchema.options]).toEqual([...MODULES_SHOWN]);
  });
});
