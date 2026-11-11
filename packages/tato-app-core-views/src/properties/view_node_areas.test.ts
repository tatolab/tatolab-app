import { describe, expect, it } from "vitest";
import { areasToShowTheViewIn, viewShownInAreasWords } from "./view_node_areas";

const AREAS = [
  { area_id: "graph", shows_view_title: "Stream graph", shows_the_view_type: false, is_the_asking_views_area: false },
  { area_id: "deck", shows_view_title: "DJ Deck", shows_the_view_type: true, is_the_asking_views_area: false },
  { area_id: "properties", shows_view_title: "Properties", shows_the_view_type: false, is_the_asking_views_area: true },
  { area_id: "spare", shows_view_title: null, shows_the_view_type: false, is_the_asking_views_area: false },
];

describe("a view node's Shown in row", () => {
  it("counts the areas showing the view", () => {
    expect(viewShownInAreasWords(AREAS)).toBe("1 area");
    expect(viewShownInAreasWords(AREAS.map((area) => ({ ...area, shows_the_view_type: true })))).toBe("4 areas");
    expect(viewShownInAreasWords([])).toBe("Not shown");
  });

  it("offers every area but those showing the view and Properties' own, each by what it replaces", () => {
    expect(areasToShowTheViewIn(AREAS)).toEqual([
      { area_id: "graph", words: "In place of Stream graph" },
      { area_id: "spare", words: "In the empty area" },
    ]);
  });
});
