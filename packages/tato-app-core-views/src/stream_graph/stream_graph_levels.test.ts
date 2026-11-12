import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphFragment, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { levelOfTheSubgraphsSteppedThrough, streamGraphLevelAtTheSubgraphIds, streamGraphLevelReached, theSubgraphKeepingTheLevelReadOnly, whyTheInsideOfTheSubgraphIsReadOnly } from "./stream_graph_levels";

function graphNode(name: string, type: string, fragment: StreamGraphFragment | null = null, config: StreamGraphNode["config"] = {}): StreamGraphNode {
  return { id: `uuid-${name}`, name, type, state: null, failed_because: null, process_raising_because: null, config, pins: {}, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, exposed_config_fields: [], studio: NODE_STUDIO_FIELDS_NONE_SET, fragment, graph_interface: null };
}

const BLUR = graphNode("blur", "nodes.blur:Blur");
const PLACED_STREAM = "tatolab.project:StreamFragment";
const INNER = graphNode("inner", PLACED_STREAM, { kind: "placed_stream", nodes: [BLUR], links: [], groups: [] }, { stream: { asset: "asset-inner" } });
const LOOK = graphNode(
  "look",
  PLACED_STREAM,
  {
    kind: "placed_stream",
    nodes: [graphNode("in", "tatolab.stream:GraphInput"), INNER],
    links: [{ id: "L9", source_node: "in", source_port: "value", target_node: "inner", target_port: "in-video", state: "wired" }],
    groups: [{ id: "g", title: "Inside", description: null, colour: null }],
  },
  { stream: { asset: "asset-look" } },
);
const GRAPH: StreamGraphSummary = {
  stream: "main",
  stream_asset: "asset",
  groups: [],
  notes: [{ id: "n", text: "top", position: [0, 0], size: [10, 10] }],
  nodes: [graphNode("camera", "nodes.camera:Camera"), LOOK],
  links: [],
  graph_document_text: "{}",
};

test("no_subgraph_stepped_into_is_the_streams_own_level", () => {
  expect(streamGraphLevelReached(GRAPH, [])).toEqual({ graph: GRAPH, subgraphs_stepped_through: [] });
});

test("stepping_through_subgraphs_shows_the_innermost_ones_nodes_links_and_groups_without_the_streams_notes", () => {
  const level = streamGraphLevelReached(GRAPH, ["look", "inner"]);
  expect(level.subgraphs_stepped_through.map((subgraph) => subgraph.name)).toEqual(["look", "inner"]);
  expect(level.graph.nodes).toEqual([BLUR]);
  expect(level.graph.notes).toEqual([]);
  expect(streamGraphLevelReached(GRAPH, ["look"]).graph.groups.map((group) => group.title)).toEqual(["Inside"]);
});

test("a_name_the_graph_no_longer_holds_or_that_holds_no_subgraph_stops_the_steps_there", () => {
  expect(streamGraphLevelReached(GRAPH, ["look", "gone", "blur"]).subgraphs_stepped_through.map((subgraph) => subgraph.name)).toEqual(["look"]);
  expect(streamGraphLevelReached(GRAPH, ["camera"]).subgraphs_stepped_through).toEqual([]);
});

test("an_edit_inside_names_the_level_by_the_uuids_of_the_subgraphs_stepped_through_outermost_first", () => {
  const steppedThrough = streamGraphLevelReached(GRAPH, ["look", "inner"]).subgraphs_stepped_through;
  expect(levelOfTheSubgraphsSteppedThrough(steppedThrough)).toEqual(["uuid-look", "uuid-inner"]);
  expect(levelOfTheSubgraphsSteppedThrough(steppedThrough, 1)).toEqual(["uuid-look"]);
  expect(levelOfTheSubgraphsSteppedThrough([])).toEqual([]);
});

test("only_streams_of_the_project_placed_all_the_way_in_leave_the_level_editable_and_the_first_other_keeps_it_read_only", () => {
  expect(theSubgraphKeepingTheLevelReadOnly(streamGraphLevelReached(GRAPH, ["look", "inner"]).subgraphs_stepped_through)).toBeNull();
  const generated = graphNode("levels", "generators.mics:mic_levels", { kind: "generated", nodes: [INNER], links: [], groups: [] });
  const imported = graphNode("lobby", PLACED_STREAM, { kind: "placed_stream", nodes: [INNER], links: [], groups: [] }, { stream: { asset: "asset-lobby", from: "project-lobby-wall" } });
  const graphHoldingBoth: StreamGraphSummary = { ...GRAPH, nodes: [...GRAPH.nodes, generated, imported] };
  expect(theSubgraphKeepingTheLevelReadOnly(streamGraphLevelReached(graphHoldingBoth, ["levels", "inner"]).subgraphs_stepped_through)).toEqual({ subgraph: generated, depth: 0 });
  expect(theSubgraphKeepingTheLevelReadOnly(streamGraphLevelReached(graphHoldingBoth, ["lobby", "inner"]).subgraphs_stepped_through)).toEqual({ subgraph: imported, depth: 0 });
});

test("the_read_only_words_say_what_a_generators_subgraph_and_an_imports_stream_need", () => {
  expect(whyTheInsideOfTheSubgraphIsReadOnly(graphNode("levels", "generators.mics:mic_levels", { kind: "generated", nodes: [], links: [], groups: [] }))).toBe(
    "Made by generators.mics:mic_levels. Refresh it from its code, or unlock it to edit its nodes.",
  );
  expect(whyTheInsideOfTheSubgraphIsReadOnly(graphNode("lobby", PLACED_STREAM, { kind: "placed_stream", nodes: [], links: [], groups: [] }, { stream: { asset: "a", from: "p" } }))).toBe(
    "A stream of an imported project. Open the import as its own project to edit it, or unlock it to edit a copy here.",
  );
});

test("a level named by its subgraph UUIDs is reached as the subgraph names stepped through reach it, and one naming no subgraph reaches none", () => {
  expect(streamGraphLevelAtTheSubgraphIds(GRAPH, [])).toEqual({ graph: GRAPH, subgraphs_stepped_through: [] });
  expect(streamGraphLevelAtTheSubgraphIds(GRAPH, ["uuid-look", "uuid-inner"])).toEqual(streamGraphLevelReached(GRAPH, ["look", "inner"]));
  expect(streamGraphLevelAtTheSubgraphIds(GRAPH, ["uuid-look", "uuid-blur"])).toBeNull();
  expect(streamGraphLevelAtTheSubgraphIds(GRAPH, ["uuid-camera"])).toBeNull();
});
