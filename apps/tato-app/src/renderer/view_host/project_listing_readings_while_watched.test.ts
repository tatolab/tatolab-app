import { expect, test } from "vitest";
import type { ProjectNodeTypeListing } from "../../shared/tatolab_backend_contract";
import { ProjectListingReadingsWhileWatched } from "./project_listing_readings_while_watched";
import type { ProjectNodeTypesReading } from "./studio_view_contract";

const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";

function listingDeclaring(nodeTypeNames: string[]): ProjectNodeTypeListing {
  return {
    project_directory: PROJECT_FOLDER,
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_name: "pattern",
    sources: [
      {
        origin: { source: "project" },
        node_types: nodeTypeNames.map((type) => ({ type, kind: "process", description: "", category: "nodes", inputs: [], outputs: [], path: null, line: null })),
        graph_generators: [],
        unreadable_modules: [],
      },
    ],
  };
}

/** A runtime listing `served.listing` for each ask, or refusing in `served.refusal`. */
function listingBackend() {
  const served: { listing: ProjectNodeTypeListing; refusal: string | null } = { listing: listingDeclaring([]), refusal: null };
  const foldersAsked: string[] = [];
  const backend = {
    listProjectNodeTypes: (projectFolder: string): Promise<ProjectNodeTypeListing> => {
      foldersAsked.push(projectFolder);
      return served.refusal === null ? Promise.resolve(structuredClone(served.listing)) : Promise.reject(served.refusal);
    },
  };
  return { backend, served, foldersAsked };
}

const typesSeen = (seen: ProjectNodeTypesReading[]) =>
  seen.map((reading) => (reading.kind === "listed" ? reading.listing.sources.flatMap((source) => source.node_types.map((nodeType) => nodeType.type)) : reading.because));

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

test("a_watched_project_is_listed_once_and_again_only_when_told_it_changed_and_told_only_when_the_listing_differs", async () => {
  const { backend, served, foldersAsked } = listingBackend();
  served.listing = listingDeclaring(["nodes.a:A"]);
  const readings = new ProjectListingReadingsWhileWatched(backend.listProjectNodeTypes);
  const seen: ProjectNodeTypesReading[] = [];
  const stop = readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await settle();
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  await settle();
  served.listing = listingDeclaring(["nodes.a:A", "nodes.b:B"]);
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  await settle();
  stop();
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  await settle();

  expect(typesSeen(seen)).toEqual([["nodes.a:A"], ["nodes.a:A", "nodes.b:B"]]);
  expect(foldersAsked).toEqual([PROJECT_FOLDER, PROJECT_FOLDER, PROJECT_FOLDER]);
});

test("changes_told_during_a_listing_are_read_in_one_more_listing_after_it", async () => {
  const { backend, foldersAsked } = listingBackend();
  const readings = new ProjectListingReadingsWhileWatched(backend.listProjectNodeTypes);
  readings.watchTheProject(PROJECT_FOLDER, () => undefined);
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  await settle();

  expect(foldersAsked).toEqual([PROJECT_FOLDER, PROJECT_FOLDER]);
});

test("a_refused_listing_is_told_in_the_runtimes_words_and_a_hidden_window_lists_nothing_until_it_is_shown", async () => {
  const { backend, served, foldersAsked } = listingBackend();
  served.refusal = "list_project_node_types failed: the project's interpreter printed no listing";
  const readings = new ProjectListingReadingsWhileWatched(backend.listProjectNodeTypes);
  readings.setReadingAllowed(false);
  const seen: ProjectNodeTypesReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  readings.listTheProjectAgainNow(PROJECT_FOLDER);
  await settle();
  expect(foldersAsked).toEqual([]);
  readings.setReadingAllowed(true);
  await settle();

  expect(foldersAsked).toEqual([PROJECT_FOLDER]);
  expect(seen).toEqual([{ kind: "not_listed", because: "list_project_node_types failed: the project's interpreter printed no listing" }]);
});

test("a_second_view_watching_the_same_project_is_told_the_latest_listing_at_once_and_shares_one_listing", async () => {
  const { backend, served, foldersAsked } = listingBackend();
  served.listing = listingDeclaring(["nodes.a:A"]);
  const readings = new ProjectListingReadingsWhileWatched(backend.listProjectNodeTypes);
  readings.watchTheProject(PROJECT_FOLDER, () => undefined);
  await settle();
  const seenBySecond: ProjectNodeTypesReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seenBySecond.push(reading));

  expect(typesSeen(seenBySecond)).toEqual([["nodes.a:A"]]);
  expect(foldersAsked).toEqual([PROJECT_FOLDER]);
});
