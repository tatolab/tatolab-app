import { describe, expect, it } from "vitest";
import type { StudioViewListed } from "@tatolab/tato-app-view-sdk/studio_readings";
import { libraryViewGroupsOf, studioViewPortsWords, studioViewShownWhereWords, libraryViewRowIdOf } from "./library_views_of_the_listing";

function aView(viewTypeId: string, title: string, broughtBy: string, change: Partial<StudioViewListed> = {}): StudioViewListed {
  return { view_type_id: viewTypeId, title, description: "", brought_by: broughtBy, is_built_in: broughtBy === "Tato Studio", placement: "area", inputs: [], outputs: [], not_opened_because: null, ...change };
}

const OUTLINER = aView("outliner", "Outliner", "Tato Studio");
const SET_LIST = aView("night-set:set_list", "Set list", "Night Set", { placement: "node", inputs: [{ name: "cue", family: "records", description: "" }], outputs: [{ name: "next", family: "array", description: "" }] });
const DECK = aView("acme-dj:deck", "DJ Deck", "Acme DJ", { description: "Two decks and a crossfader." });
const BROKEN = aView("acme-dj:broken", "Broken", "Acme DJ", { placement: null, not_opened_because: "`entry`: Required." });

describe("the views the Library lists", () => {
  it("groups the project's and each import's views by who brought them, Studio's own last", () => {
    const groups = libraryViewGroupsOf({ kind: "listed", studio_views: [OUTLINER, SET_LIST, DECK, BROKEN] }, "");
    expect(groups.map((group) => [group.brought_by, group.studio_views.map((studioView) => studioView.view_type_id)])).toEqual([
      ["Night Set", ["night-set:set_list"]],
      ["Acme DJ", ["acme-dj:deck", "acme-dj:broken"]],
      ["Built in", ["outliner"]],
    ]);
  });

  it("narrows to a search by title, description, view type or who brought it", () => {
    expect(libraryViewGroupsOf({ kind: "listed", studio_views: [OUTLINER, SET_LIST, DECK] }, "crossfader").map((group) => group.brought_by)).toEqual(["Acme DJ"]);
    expect(libraryViewGroupsOf({ kind: "listed", studio_views: [OUTLINER, SET_LIST, DECK] }, "NIGHT").map((group) => group.brought_by)).toEqual(["Night Set"]);
  });

  it("still lists Studio's own views when the project's are not listed", () => {
    expect(libraryViewGroupsOf({ kind: "not_listed", built_in_views: [OUTLINER], because: "list_project_views failed" }, "").map((group) => group.brought_by)).toEqual(["Built in"]);
  });

  it("says a node view's ports, that an area view is a panel, and that a broken one doesn't open", () => {
    expect(studioViewPortsWords(SET_LIST)).toBe("1 in · 1 out");
    expect(studioViewPortsWords(DECK)).toBe("Panel");
    expect(studioViewPortsWords(BROKEN)).toBe("Doesn't open");
  });

  it("says where a view shows, and gives a project view named like one of Studio's a row of its own", () => {
    expect(studioViewShownWhereWords(SET_LIST)).toBe("On a node of its type");
    expect(studioViewShownWhereWords(DECK)).toBe("In any area");
    expect(studioViewShownWhereWords(BROKEN)).toBe("Doesn't open");
    expect(libraryViewRowIdOf(OUTLINER)).not.toBe(libraryViewRowIdOf({ ...OUTLINER, brought_by: "Acme DJ", is_built_in: false }));
  });
});
