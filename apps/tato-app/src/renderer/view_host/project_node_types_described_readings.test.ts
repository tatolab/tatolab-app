import { expect, test } from "vitest";
import type { DescribeNodeTypesToolResult, ListedStream, ListNodeTypesToolResult } from "../../shared/tatolab_backend_contract";
import { ProjectNodeTypesDescribedReadings } from "./project_node_types_described_readings";
import type { ProjectNodeTypesDescribedReading } from "./studio_view_contract";

const PROJECT_FOLDER = "/home/jonathanf/streams/pattern";

function listingOf(projectNodeTypes: string[], builtInNodeTypes: string[]): ListNodeTypesToolResult {
  const listed = (nodeType: string) => ({ node_type: nodeType, documentation: "", category: null, kind: "process" as const, described_from: "interpreter" as const });
  return {
    project_directory: PROJECT_FOLDER,
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_name: "pattern",
    sources: [
      { source: "project", node_types: projectNodeTypes.map(listed), graph_generators: [], unreadable_modules: [] },
      { source: "built_in", node_types: builtInNodeTypes.map(listed), graph_generators: [], unreadable_modules: [] },
    ],
  };
}

/** A runtime listing `served.listing` for each ask and describing each node type asked for, or refusing to describe in `served.describeRefusal`. */
function nodeTypesBackend() {
  const served: { listing: ListNodeTypesToolResult; describeRefusal: string | null } = { listing: listingOf(["nodes.a:A"], ["tatolab.stream:PreviousValue"]), describeRefusal: null };
  const asked: string[] = [];
  const backend = {
    listNodeTypes: (projectFolder: string): Promise<ListNodeTypesToolResult> => {
      asked.push(`list ${projectFolder}`);
      return Promise.resolve(structuredClone(served.listing));
    },
    describeNodeTypes: (projectFolder: string, nodeTypes: readonly string[]): Promise<DescribeNodeTypesToolResult> => {
      asked.push(`describe ${projectFolder} ${nodeTypes.join(" ")}`);
      if (served.describeRefusal !== null) return Promise.reject(served.describeRefusal);
      return Promise.resolve({
        node_types: nodeTypes.map((nodeType) => ({ node_type: nodeType, described_from: "interpreter", documentation: "", category: null, kind: "process", inputs: [], outputs: [], source: "project" })),
      });
    },
  };
  return { backend, served, asked };
}

function streamOfTheProject(stream: string, isLoaded: boolean): ListedStream {
  return {
    stream,
    display_name: stream,
    location: { project_directory: PROJECT_FOLDER, project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90", stream_asset: `${stream}-asset` },
    state: isLoaded ? "running" : "stopped",
    node_count: isLoaded ? 3 : null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    condition: { load: isLoaded ? "loaded" : "not_loaded", playback: isLoaded ? "playing" : "stopped", health: "healthy", diagnostics: [] },
    action: null,
    step: null,
  };
}

const describedSeen = (seen: ProjectNodeTypesDescribedReading[]) =>
  seen.map((reading) => (reading.kind === "listed" ? reading.node_types.described.map((described) => described.node_type) : reading.because));

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

test("a_watched_project_is_listed_and_every_node_type_it_lists_described_in_the_order_listed", async () => {
  const { backend, asked } = nodeTypesBackend();
  const readings = new ProjectNodeTypesDescribedReadings(backend);
  const seen: ProjectNodeTypesDescribedReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await settle();

  expect(asked).toEqual([`list ${PROJECT_FOLDER}`, `describe ${PROJECT_FOLDER} nodes.a:A tatolab.stream:PreviousValue`]);
  expect(describedSeen(seen)).toEqual([["nodes.a:A", "tatolab.stream:PreviousValue"]]);
  expect(seen[0]?.kind === "listed" && seen[0].node_types.listing.project_name).toBe("pattern");
});

test("a_project_is_listed_again_as_one_of_its_streams_loads_or_unloads_and_not_while_the_same_streams_stay_loaded", async () => {
  const { backend, served } = nodeTypesBackend();
  const readings = new ProjectNodeTypesDescribedReadings(backend);
  const seen: ProjectNodeTypesDescribedReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await settle();
  served.listing = listingOf(["nodes.a:A", "nodes.b:B"], []);
  readings.takeTheStreamsListed([streamOfTheProject("main", false)]);
  await settle();
  expect(describedSeen(seen)).toHaveLength(1);
  readings.takeTheStreamsListed([streamOfTheProject("main", true)]);
  await settle();
  readings.takeTheStreamsListed([streamOfTheProject("main", true)]);
  await settle();
  served.listing = listingOf(["nodes.a:A"], []);
  readings.takeTheStreamsListed(null);
  await settle();

  expect(describedSeen(seen)).toEqual([["nodes.a:A", "tatolab.stream:PreviousValue"], ["nodes.a:A", "nodes.b:B"], ["nodes.a:A"]]);
});

test("a_description_the_runtime_refuses_is_told_in_its_words", async () => {
  const { backend, served } = nodeTypesBackend();
  served.describeRefusal = "describe_node_types failed: the project's interpreter printed no description";
  const readings = new ProjectNodeTypesDescribedReadings(backend);
  const seen: ProjectNodeTypesDescribedReading[] = [];
  readings.watchTheProject(PROJECT_FOLDER, (reading) => seen.push(reading));
  await settle();

  expect(describedSeen(seen)).toEqual(["describe_node_types failed: the project's interpreter printed no description"]);
});
