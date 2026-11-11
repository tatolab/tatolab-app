import { describe, expect, it } from "vitest";
import { coreViewTypesOf } from "./core_view_types";
import { StudioViewTypeRegistry } from "./studio_view_type_registry";
import { tatolabFrameViewType } from "./tatolab_frame_view_type";
import type { StudioViewsReading } from "./studio_view_contract";
import { studioViewsReadingOf, watchTheStudioViewsOfTheRegistry } from "./studio_views_listed_for_views";

const OUTLINER = { folder: "outliner", manifest_text: JSON.stringify({ contract: "1.0", title: "Outliner", description: "The project's streams.", entry: "index.html", placement: "area" }) };
const TRANSACTIONS = { folder: "transactions", manifest_text: JSON.stringify({ contract: "1.0", title: "Transactions", entry: "index.html", placement: "area" }) };
const BROKEN_CORE_VIEW = { folder: "broken", manifest_text: "{ not json" };

/** A registry holding the Outliner, Transactions for Developer mode, and a core view whose manifest is not JSON, as the window builds one. */
function registryAsTheWindowBuildsIt(): StudioViewTypeRegistry {
  const coreViewTypes = coreViewTypesOf([OUTLINER, TRANSACTIONS, BROKEN_CORE_VIEW], (folder) => `https://views.example/${folder}/`);
  const coreViewTypeIn = (folder: string) => {
    const coreViewType = coreViewTypes.view_types_by_folder.get(folder);
    return coreViewType === undefined ? [] : [coreViewType];
  };
  return new StudioViewTypeRegistry(
    coreViewTypeIn("outliner"),
    (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }),
    coreViewTypes.not_opened,
    coreViewTypeIn("transactions"),
  );
}

function viewTypeIdsListed(reading: StudioViewsReading): string[] {
  return (reading.kind === "listed" ? reading.studio_views : reading.built_in_views).map((studioView) => studioView.view_type_id);
}

describe("the views a view reads", () => {
  it("lists what the registry offers and refuses, Studio's own first, a project view named like Studio's refused with the registry's words", () => {
    const registry = registryAsTheWindowBuildsIt();
    registry.projectStudioViews.publish({
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
        { view_type_id: "outliner", project_name: "Acme DJ", import_folder: null, opens: true, not_opened_because: null, manifest_json: { contract: "1.0", title: "My outliner", entry: "index.html", placement: "area" }, folder_url: "y" },
      ],
    });
    const reading = studioViewsReadingOf(registry);
    expect(reading.kind === "listed" && reading.studio_views.map((studioView) => [studioView.view_type_id, studioView.title, studioView.brought_by, studioView.placement, studioView.not_opened_because])).toEqual([
      ["outliner", "Outliner", "Tato Studio", "area", null],
      ["broken", "broken", "Tato Studio", null, expect.stringContaining("`tatolab_view.json`")],
      ["acme-dj:deck", "DJ Deck", "Acme DJ", "node", null],
      ["acme-dj:rig", "Rig", "Acme DJ", null, "`contract`: this runtime reads view contract 1.0."],
      ["outliner", "My outliner", "Acme DJ", null, "The studio already has a view named outliner."],
    ]);
    expect(reading.kind === "listed" && reading.studio_views[2]?.outputs).toEqual([{ name: "crossfader", family: "array", description: "" }]);
  });

  it("lists Studio's own alone with no project open, and beside the runtime's words when the project's are not listed", () => {
    const registry = registryAsTheWindowBuildsIt();
    expect(studioViewsReadingOf(registry)).toMatchObject({ kind: "listed", studio_views: [{ view_type_id: "outliner" }, { view_type_id: "broken" }] });
    registry.projectStudioViews.publish({ kind: "not_listed", because: "list_project_views failed" });
    expect(studioViewsReadingOf(registry)).toMatchObject({ kind: "not_listed", built_in_views: [{ view_type_id: "outliner" }, { view_type_id: "broken" }], because: "list_project_views failed" });
  });

  it("tells the watcher again as Developer mode turns on and off, Transactions listed only while it is on, and nothing once it stops watching", () => {
    const registry = registryAsTheWindowBuildsIt();
    const readingsTold: string[][] = [];
    const stopWatching = watchTheStudioViewsOfTheRegistry(registry, (reading) => readingsTold.push(viewTypeIdsListed(reading)));
    expect(readingsTold).toEqual([["outliner", "broken"]]);
    registry.developerMode.publish(true);
    expect(readingsTold.at(-1)).toEqual(["outliner", "transactions", "broken"]);
    registry.developerMode.publish(false);
    expect(readingsTold.at(-1)).toEqual(["outliner", "broken"]);
    const readingsToldBeforeStopping = readingsTold.length;
    stopWatching();
    registry.developerMode.publish(true);
    registry.projectStudioViews.publish({ kind: "none_open" });
    expect(readingsTold.length).toBe(readingsToldBeforeStopping);
  });
});
