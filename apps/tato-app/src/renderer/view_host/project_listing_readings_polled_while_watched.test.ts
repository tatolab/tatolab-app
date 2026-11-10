import { afterEach, expect, test, vi } from "vitest";
import type { ProjectNodeTypeListing } from "../../shared/tatolab_backend_contract";
import { ProjectListingReadingsPolledWhileWatched } from "./project_listing_readings_polled_while_watched";
import type { ProjectNodeTypesReading } from "./studio_view_contract";

afterEach(() => {
  vi.useRealTimers();
});

const POLL_MILLISECONDS = 1000;
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

test("a_watched_projects_node_types_are_listed_again_each_round_and_told_only_when_they_change", async () => {
  vi.useFakeTimers();
  const { backend, served, foldersAsked } = listingBackend();
  served.listing = listingDeclaring(["nodes.a:A"]);
  const readings = new ProjectListingReadingsPolledWhileWatched(backend.listProjectNodeTypes, POLL_MILLISECONDS);
  const seen: ProjectNodeTypesReading[] = [];
  const stop = readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await vi.advanceTimersByTimeAsync(10);
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  served.listing = listingDeclaring(["nodes.a:A", "nodes.b:B"]);
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS);
  stop();
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 3);

  expect(typesSeen(seen)).toEqual([["nodes.a:A"], ["nodes.a:A", "nodes.b:B"]]);
  expect(foldersAsked).toEqual([PROJECT_FOLDER, PROJECT_FOLDER, PROJECT_FOLDER]);
});

test("a_refused_listing_is_told_in_the_runtimes_words_and_a_hidden_window_lists_nothing", async () => {
  vi.useFakeTimers();
  const { backend, served, foldersAsked } = listingBackend();
  served.refusal = "list_project_node_types failed: the project's interpreter printed no listing";
  const readings = new ProjectListingReadingsPolledWhileWatched(backend.listProjectNodeTypes, POLL_MILLISECONDS);
  readings.setPollingAllowed(false);
  const seen: ProjectNodeTypesReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await vi.advanceTimersByTimeAsync(POLL_MILLISECONDS * 3);
  expect(foldersAsked).toEqual([]);
  readings.setPollingAllowed(true);
  await vi.advanceTimersByTimeAsync(10);

  expect(seen).toEqual([{ kind: "not_listed", because: "list_project_node_types failed: the project's interpreter printed no listing" }]);
});

test("a_second_view_watching_the_same_project_is_told_the_latest_listing_at_once_and_shares_one_poll", async () => {
  vi.useFakeTimers();
  const { backend, served, foldersAsked } = listingBackend();
  served.listing = listingDeclaring(["nodes.a:A"]);
  const readings = new ProjectListingReadingsPolledWhileWatched(backend.listProjectNodeTypes, POLL_MILLISECONDS);
  readings.watchTheProject(PROJECT_FOLDER, () => undefined);
  await vi.advanceTimersByTimeAsync(10);
  const seenBySecond: ProjectNodeTypesReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seenBySecond.push(reading));

  expect(typesSeen(seenBySecond)).toEqual([["nodes.a:A"]]);
  expect(foldersAsked).toEqual([PROJECT_FOLDER]);
});
