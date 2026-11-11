import { describe, expect, it } from "vitest";
import { studioViewsReadingOf } from "./studio_views_listed_for_views";

const OUTLINER = { folder: "outliner", manifest_text: JSON.stringify({ contract: "1.0", title: "Outliner", description: "The project's streams.", entry: "index.html", placement: "area" }) };
const BROKEN_CORE_VIEW = { folder: "broken", manifest_text: "{ not json" };

describe("the views a view reads", () => {
  it("lists Studio's own from their manifests, then the project's, each that does not open with why", () => {
    const reading = studioViewsReadingOf([OUTLINER, BROKEN_CORE_VIEW], {
      kind: "listed",
      studio_views: [
        {
          view_type_id: "acme-dj:deck",
          project_name: "Acme DJ",
          import_folder: "acme-dj",
          opens: true,
          not_opened_because: null,
          manifest_json: { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node", outputs: [{ name: "crossfader", family: "array" }] },
          folder_url: "tatolab-app://app/project_views/acme-dj/deck/",
        },
        { view_type_id: "acme-dj:rig", project_name: "Acme DJ", import_folder: "acme-dj", opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0.", manifest_json: { title: "Rig" }, folder_url: "x" },
      ],
    });
    expect(reading.kind === "listed" && reading.studio_views.map((studioView) => [studioView.view_type_id, studioView.title, studioView.brought_by, studioView.placement, studioView.not_opened_because === null])).toEqual([
      ["outliner", "Outliner", "Tato Studio", "area", true],
      ["broken", "broken", "Tato Studio", null, false],
      ["acme-dj:deck", "DJ Deck", "Acme DJ", "node", true],
      ["acme-dj:rig", "Rig", "Acme DJ", null, false],
    ]);
    expect(reading.kind === "listed" && reading.studio_views[2]?.outputs).toEqual([{ name: "crossfader", family: "array", description: "" }]);
  });

  it("lists Studio's own alone with no project open, and beside the runtime's words when the project's are not listed", () => {
    expect(studioViewsReadingOf([OUTLINER], { kind: "none_open" })).toMatchObject({ kind: "listed", studio_views: [{ view_type_id: "outliner" }] });
    expect(studioViewsReadingOf([OUTLINER], { kind: "not_listed", because: "list_project_views failed" })).toMatchObject({ kind: "not_listed", built_in_views: [{ view_type_id: "outliner" }], because: "list_project_views failed" });
  });
});
