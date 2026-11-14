import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type NodeCatalog, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";

function graphNode(name: string, inputs: string[], outputs: string[]): StreamGraphNode {
  return {
    id: name.toUpperCase(),
    name,
    type: `nodes.${name}:Effect`,
    kind: "process",
    state: "Running",
    failed_because: null,
    process_raising_because: null,
    config: {},
    input_ports: inputs.map((port) => ({ name: port, family: "image" as const, stream_facts: null, values_checked: null })),
    output_ports: outputs.map((port) => ({ name: port, family: null, stream_facts: null, values_checked: null })),
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    pins: {},
    exposed_config_fields: [],
    studio: NODE_STUDIO_FIELDS_NONE_SET,
    fragment: null, graph_interface: null,
  };
}

const GRAPH: StreamGraphSummary = {
  stream: "main",
  stream_asset: null,
  groups: [],
  notes: [],
  nodes: [
    {
      ...graphNode("camera", [], []),
      output_ports: [
        {
          name: "video",
          family: "image",
          stream_facts: { family: "image", frame_rate: { numerator: 30000, denominator: 1001 }, content_light_level: null, mastering_display_colour_volume: null },
          values_checked: null,
        },
      ],
    },
    graphNode("invert", ["video_in"], ["video_out"]),
  ],
  links: [
    { id: "L1", source_node: "camera", source_port: "video", target_node: "invert", target_port: "video_in", state: "wired" },
    { id: "", source_node: "invert", source_port: "video_out", target_node: "display", target_port: "video", state: "awaiting_remote" },
    { id: "L3", source_node: "camera", source_port: "video", target_node: "display", target_port: "video", state: "reconnecting_later" },
  ],
  graph_document_text: "{}",
};

test("each_node_is_a_card_keyed_by_its_name_with_its_ports_as_pins_and_an_input_shows_the_facts_its_one_link_carries", () => {
  expect(streamGraphCanvasContents(GRAPH, null).nodes).toEqual([
    { node_id: "camera", title: "camera", type_name: "Effect", description: null, condition: { look: "healthy" }, input_pins: [], output_pins: [{ name: "video", family: "image", description: null, stream_facts_words: ["29.97 fps"] }], saved_position: null, frame_id: null, is_collapsed: false, subgraph: null },
    {
      node_id: "invert",
      title: "invert",
      type_name: "Effect",
      description: null,
      condition: { look: "healthy" },
      input_pins: [{ name: "video_in", family: "image", description: null, stream_facts_words: ["29.97 fps"] }],
      output_pins: [{ name: "video_out", family: null, description: null, stream_facts_words: [] }],
      saved_position: null,
      frame_id: null,
      is_collapsed: false,
      subgraph: null,
    },
  ]);
});

test("each_link_is_drawn_by_its_state_and_described_in_words", () => {
  expect(streamGraphCanvasContents(GRAPH, null).links.map((link) => [link.link_id, link.look, link.description])).toEqual([
    ["L1", "carrying", "camera.video → invert.video_in, wired"],
    ["invert.video_out->display.video", "waiting", "invert.video_out → display.video, waiting for the other machine"],
    ["L3", "waiting", "camera.video → display.video, reconnecting_later"],
  ]);
});

test("a_running_node_whose_process_keeps_raising_is_a_failed_card_carrying_what_it_raised_word_for_word", () => {
  const raisedBecause = "process() raised RuntimeError: broke on purpose (nodes/invert.py, line 29)";
  const graph: StreamGraphSummary = {
    ...GRAPH,
    nodes: [
      { ...graphNode("invert", ["video_in"], ["video_out"]), state: "Running", process_raising_because: raisedBecause },
      { ...graphNode("camera", [], ["video"]), state: "Running" },
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, null).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["invert", { look: "failed", failed_because: raisedBecause }],
    ["camera", { look: "healthy" }],
  ]);
});

test("a_node_in_error_is_a_failed_card_carrying_why_word_for_word_and_a_restarting_node_a_restarting_card", () => {
  const failedBecause = "start() raised: RuntimeError: no Rive file at ./missing.riv";
  const graph: StreamGraphSummary = {
    ...GRAPH,
    nodes: [
      { ...graphNode("rivesource", [], ["video"]), state: "Error", failed_because: failedBecause },
      { ...graphNode("browsersource", [], ["video"]), state: "Error" },
      { ...graphNode("camera", [], ["video"]), state: "Restarting" },
      { ...graphNode("invert", ["video_in"], ["video_out"]), state: "Pending" },
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, null).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["rivesource", { look: "failed", failed_because: failedBecause }],
    ["browsersource", { look: "failed", failed_because: null }],
    ["camera", { look: "restarting" }],
    ["invert", { look: "healthy" }],
  ]);
});

test("a_node_left_somewhere_draws_there_in_the_frame_of_its_group_and_the_graphs_groups_and_notes_are_drawn_too", () => {
  const groupId = "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421";
  const graph: StreamGraphSummary = {
    ...GRAPH,
    nodes: [
      { ...graphNode("camera", [], ["video"]), studio: { ...NODE_STUDIO_FIELDS_NONE_SET, position: [40, -12], group: groupId } },
      { ...graphNode("invert", ["video_in"], ["video_out"]), studio: { ...NODE_STUDIO_FIELDS_NONE_SET, group: "9a9a9a9a-0000-4000-8000-000000000000" } },
    ],
    groups: [{ id: groupId, title: "Inputs", description: null, colour: "#3b82f6" }],
    notes: [{ id: "n1", text: "Tune here", position: [300, 80], size: [220, 90] }],
  };

  const contents = streamGraphCanvasContents(graph, null);

  expect(contents.nodes.map((node) => [node.node_id, node.saved_position, node.frame_id])).toEqual([
    ["camera", { x: 40, y: -12 }, groupId],
    ["invert", null, null],
  ]);
  expect(contents.frames).toEqual([{ frame_id: groupId, title: "Inputs", description: null, colour: "#3b82f6" }]);
  expect(contents.notes).toEqual([{ note_id: "n1", text: "Tune here", position: { x: 300, y: 80 }, size: { width: 220, height: 90 } }]);
});

test("a card and its pins carry their node type's descriptions from the stream's node catalog, and a blank one is none", () => {
  const catalog: NodeCatalog = {
    stream: "main",
    node_types: [
      {
        type: "nodes.invert:Effect",
        description: "Inverts each frame's colours.",
        config_schema: null,
        inputs: [{ name: "video_in", description: "The frames to invert.", family: "image" }],
        outputs: [{ name: "video_out", description: "  ", family: "image" }],
      },
    ],
  };
  const invert = streamGraphCanvasContents(GRAPH, catalog).nodes.find((node) => node.node_id === "invert");
  expect(invert?.description).toBe("Inverts each frame's colours.");
  expect(invert?.input_pins.map((pin) => pin.description)).toEqual(["The frames to invert."]);
  expect(invert?.output_pins.map((pin) => pin.description)).toEqual([null]);
  expect(streamGraphCanvasContents(GRAPH, catalog).nodes.find((node) => node.node_id === "camera")?.description).toBeNull();
});

test("a_subgraph_card_carries_its_kind_and_names_it_beside_its_title", () => {
  const holding = (type: string, kind: "generated" | "placed_stream"): StreamGraphNode => ({ ...graphNode("look", [], []), type, fragment: { kind, nodes: [], links: [], groups: [] } });
  const cards = streamGraphCanvasContents(
    { ...GRAPH, links: [], nodes: [holding("tatolab.project:StreamFragment", "placed_stream"), { ...holding("generators.looks:mic_levels", "generated"), name: "levels" }] },
    null,
  ).nodes;
  expect(cards.map((card) => [card.node_id, card.subgraph, card.type_name])).toEqual([
    ["look", "placed_stream", "Subgraph"],
    ["levels", "generated", "mic_levels"],
  ]);
});
