import { describe, expect, it } from "vitest";
import nightShowsViewsDeclaringPinTypes from "../../main/test-fixtures/local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall-its-deck-declaring-pin-types.json?raw";
import { projectViewsFromTheListProjectViewsToolResult, studioViewOpeningOf, viewFolderNameOf } from "../../main/project_views_on_the_wire";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
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

/** The result text a recorded MCP `tools/call` response carries, parsed: what `list_project_views` answers as its result. */
function operationResultOfTheRecording(recordedResponse: string): unknown {
  const recorded: unknown = JSON.parse(recordedResponse);
  const toolResult = typeof recorded === "object" && recorded !== null && "result" in recorded ? recorded.result : null;
  const content: unknown[] = typeof toolResult === "object" && toolResult !== null && "content" in toolResult && Array.isArray(toolResult.content) ? toolResult.content : [];
  const firstContent = content[0];
  return JSON.parse(typeof firstContent === "object" && firstContent !== null && "text" in firstContent && typeof firstContent.text === "string" ? firstContent.text : "null");
}

/** The views of night-show importing lobby-wall as the window lists them from `list_project_views`, its deck's manifest declaring each port by its pin type alone. */
function nightShowsViewsListedFromTheRecording(): ListedStudioView[] {
  const listed = projectViewsFromTheListProjectViewsToolResult(operationResultOfTheRecording(nightShowsViewsDeclaringPinTypes));
  if (!listed.ok) throw new Error(listed.failure);
  return listed.value.map((listedView) => ({
    view_type_id: listedView.view_type,
    project: listedView.project,
    project_name: listedView.project_name,
    view_folder: viewFolderNameOf(listedView),
    import_folder: listedView.import_folder,
    manifest_json: listedView.manifest,
    folder_url: `tatolab-app://app/project_views/${listedView.view_folder_in_the_project}/`,
    newer_version_blocked_because: null,
    ...studioViewOpeningOf(listedView),
  }));
}

describe("the views a view reads", () => {
  it("lists a view's declared ports by the pin type its manifest names, with no family written beside it", () => {
    const listedViews = nightShowsViewsListedFromTheRecording();
    const deck = listedViews.find((listedView) => listedView.view_type_id === "night-show:deck");
    expect(JSON.stringify(deck?.manifest_json)).not.toContain('"family"');
    const registry = registryAsTheWindowBuildsIt();
    registry.projectStudioViews.publish({ kind: "listed", studio_views: listedViews });

    const reading = studioViewsReadingOf(registry);
    const deckListed = reading.kind === "listed" ? reading.studio_views.find((studioView) => deck !== undefined && studioView.view_type_id === deck.view_type_id) : undefined;

    expect(deckListed?.inputs).toEqual([{ name: "level", family: "array", pin_type: { type: "tensor" }, description: "" }]);
    expect(deckListed?.outputs).toEqual([{ name: "cue", family: "records", pin_type: { type: "string" }, description: "" }]);
  });

  it("lists what the registry offers and refuses, Studio's own first, each project view by the type the runtime lists it as, and one listed by a type of Studio's own as not opened", () => {
    const ACME_DJ = "3d1f6a2e-8b4c-4e7a-9f05-6c2d8e1b7a43";
    const THE_OPEN_PROJECT = "9e4b7c15-2a6d-4f83-b0e9-1d5c3a8f6e27";
    const registry = registryAsTheWindowBuildsIt();
    registry.projectStudioViews.publish({
      kind: "listed",
      studio_views: [
        {
          view_type_id: "acme-dj:deck",
          project: ACME_DJ,
          project_name: "Acme DJ",
          view_folder: "deck",
          import_folder: "acme-dj",
          opens: true,
          not_opened_because: null,
          manifest_json: { contract: "1.1", title: "DJ Deck", entry: "index.html", placement: "node", outputs: [{ name: "crossfader", pin_type: { type: "tensor" } }] },
          folder_url: "tatolab-app://app/project_views/acme-dj/deck/",
          newer_version_blocked_because: null,
        },
        { view_type_id: "acme-dj:rig", project: ACME_DJ, project_name: "Acme DJ", view_folder: "rig", import_folder: "acme-dj", opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0.", manifest_json: { title: "Rig" }, folder_url: "x", newer_version_blocked_because: null },
        { view_type_id: "5a0c8e3b-7d14-4b96-a2f7-9e3d1c6b8f40", project: THE_OPEN_PROJECT, project_name: "Acme DJ", view_folder: "outliner", import_folder: null, opens: true, not_opened_because: null, manifest_json: { contract: "1.0", title: "My outliner", entry: "index.html", placement: "area" }, folder_url: "y", newer_version_blocked_because: null },
        { view_type_id: "outliner", project: THE_OPEN_PROJECT, project_name: "Acme DJ", view_folder: "tree", import_folder: null, opens: true, not_opened_because: null, manifest_json: { contract: "1.0", title: "Tree", entry: "index.html", placement: "area" }, folder_url: "z", newer_version_blocked_because: null },
      ],
    });
    const reading = studioViewsReadingOf(registry);
    expect(reading.kind === "listed" && reading.studio_views.map((studioView) => [studioView.view_type_id, studioView.title, studioView.brought_by, studioView.placement, studioView.not_opened_because])).toEqual([
      ["outliner", "Outliner", "Tato Studio", "area", null],
      ["broken", "broken", "Tato Studio", null, expect.stringContaining("`tatolab_view.json`")],
      ["acme-dj:deck", "DJ Deck", "Acme DJ", "node", null],
      ["5a0c8e3b-7d14-4b96-a2f7-9e3d1c6b8f40", "My outliner", "Acme DJ", "area", null],
      ["acme-dj:rig", "Rig", "Acme DJ", null, "`contract`: this runtime reads view contract 1.0."],
      ["outliner", "Tree", "Acme DJ", null, "Studio's own view `outliner` has this type."],
    ]);
    expect(reading.kind === "listed" && reading.studio_views[2]?.outputs).toEqual([{ name: "crossfader", family: "array", pin_type: { type: "tensor" }, description: "" }]);
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
