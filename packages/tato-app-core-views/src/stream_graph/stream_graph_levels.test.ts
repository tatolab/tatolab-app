import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphFragment, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamGraphLevelReached, whyTheInsideOfTheSubgraphIsReadOnly } from "./stream_graph_levels";

function graphNode(name: string, type: string, fragment: StreamGraphFragment | null = null): StreamGraphNode {
  return { id: `uuid-${name}`, name, type, state: null, failed_because: null, process_raising_because: null, config: {}, pins: {}, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, studio: NODE_STUDIO_FIELDS_NONE_SET, fragment };
}

const BLUR = graphNode("blur", "nodes.blur:Blur");
const INNER = graphNode("inner", "tatolab.project:AuthoredFragment", { kind: "authored", nodes: [BLUR], links: [], groups: [] });
const LOOK = graphNode("look", "tatolab.project:AuthoredFragment", {
  kind: "authored",
  nodes: [graphNode("in", "tatolab.stream:GraphInput"), INNER],
  links: [{ id: "L9", source_node: "in", source_port: "value", target_node: "inner", target_port: "in-video", state: "wired" }],
  groups: [{ id: "g", title: "Inside", description: null, colour: null }],
});
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

test("the_read_only_words_say_what_each_kind_of_subgraph_waits_on_or_needs", () => {
  expect(whyTheInsideOfTheSubgraphIsReadOnly(graphNode("levels", "generators.mics:mic_levels", { kind: "generated", nodes: [], links: [], groups: [] }))).toBe(
    "Made by generators.mics:mic_levels. Refresh it from its code, or unlock it to edit its nodes.",
  );
  expect(whyTheInsideOfTheSubgraphIsReadOnly(LOOK)).toBe("Editing inside a subgraph waits on tatolab/streamlib#3519. Unlock it to edit its nodes.");
  expect(whyTheInsideOfTheSubgraphIsReadOnly(graphNode("lobby", "tatolab.project:StreamFragment", { kind: "placed_stream", nodes: [], links: [], groups: [] }))).toBe(
    "Another stream, placed by reference. Edit it in its own tab.",
  );
});
