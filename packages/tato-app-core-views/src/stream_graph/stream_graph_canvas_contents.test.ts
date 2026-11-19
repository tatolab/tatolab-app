import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type NodeCatalog, type StreamCondition, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
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
    not_ready_because: null,
    config: {},
    input_ports: inputs.map((port) => ({ name: port, family: "image" as const, stream_facts: null, values_checked: null, pin: null, value_read: null })),
    output_ports: outputs.map((port) => ({ name: port, family: null, stream_facts: null, values_checked: null, pin: null, value_read: null })),
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    pins: {},
    exposed_config_fields: [],
    studio: NODE_STUDIO_FIELDS_NONE_SET,
    fragment: null, graph_interface: null, live: true,
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
          pin: { pin_type: { type: "texture" }, flow: "stream" },
          value_read: null,
        },
      ],
    },
    graphNode("invert", ["video_in"], ["video_out"]),
  ],
  links: [
    { id: "L1", source_node: "camera", source_port: "video", target_node: "invert", target_port: "video_in", state: "wired", live: true },
    { id: "", source_node: "invert", source_port: "video_out", target_node: "display", target_port: "video", state: "awaiting_remote", live: true },
    { id: "L3", source_node: "camera", source_port: "video", target_node: "display", target_port: "video", state: "reconnecting_later", live: true },
  ],
  graph_document_text: "{}",
};

test("each_node_is_a_card_keyed_by_its_name_with_its_ports_as_pins_of_their_types_and_an_input_shows_the_facts_its_one_link_carries", () => {
  expect(streamGraphCanvasContents(GRAPH, null).nodes).toEqual([
    { node_id: "camera", title: "camera", type_name: "Effect", description: null, condition: { look: "healthy" }, inputs: [], outputs: [{ name: "video", pin: { pin_type: { type: "texture" }, flow: "stream" }, family: "image", description: null, stream_facts_words: ["29.97 fps"], value_address: null }], saved_position: null, frame_id: null, is_collapsed: false, subgraph: null },
    {
      node_id: "invert",
      title: "invert",
      type_name: "Effect",
      description: null,
      condition: { look: "healthy" },
      inputs: [{ name: "video_in", pin: null, family: "image", description: null, stream_facts_words: ["29.97 fps"], value_address: null }],
      outputs: [{ name: "video_out", pin: null, family: null, description: null, stream_facts_words: [], value_address: null }],
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

test("a_running_node_not_ready_is_a_not_ready_card_carrying_why_word_for_word_unless_its_process_keeps_raising", () => {
  const notReadyBecause = "ImageFile names no image asset. To fix: set its `asset` config to the UUID of a PNG or JPEG imported into the project";
  const raisedBecause = "process() raised RuntimeError: broke on purpose (nodes/invert.py, line 29)";
  const graph: StreamGraphSummary = {
    ...GRAPH,
    nodes: [
      { ...graphNode("poster", [], ["image"]), state: "Running", not_ready_because: notReadyBecause },
      { ...graphNode("invert", ["video_in"], ["video_out"]), state: "Running", not_ready_because: notReadyBecause, process_raising_because: raisedBecause },
      { ...graphNode("camera", [], ["video"]), state: "Running" },
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, null).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["poster", { look: "not_ready", not_ready_because: notReadyBecause }],
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
        category: null,
        config_schema: null,
        inputs: [{ name: "video_in", description: "The frames to invert.", family: "image", pin: null, input_mode: null }],
        outputs: [{ name: "video_out", description: "  ", family: "image", pin: null, input_mode: null }],
      },
    ],
  };
  const invert = streamGraphCanvasContents(GRAPH, catalog).nodes.find((node) => node.node_id === "invert");
  expect(invert?.description).toBe("Inverts each frame's colours.");
  expect(invert?.inputs.map((pin) => pin.description)).toEqual(["The frames to invert."]);
  expect(invert?.outputs.map((pin) => pin.description)).toEqual([null]);
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

test("a_node_a_new_reading_leaves_as_it_was_is_drawn_by_the_object_the_reading_before_drew_it_with_and_a_changed_node_by_a_new_one", () => {
  const before = streamGraphCanvasContents(GRAPH, null);
  const reread = streamGraphCanvasContents(structuredClone(GRAPH), null, before);
  expect(reread.nodes).toHaveLength(2);
  reread.nodes.forEach((node, index) => expect(node).toBe(before.nodes[index]));

  const invertFailed = streamGraphCanvasContents({ ...GRAPH, nodes: GRAPH.nodes.map((node) => (node.name === "invert" ? { ...node, state: "Error", failed_because: "it fell over" } : node)) }, null, reread);
  expect(invertFailed.nodes[0]).toBe(before.nodes[0]);
  expect(invertFailed.nodes[1]).not.toBe(before.nodes[1]);
  expect(invertFailed.nodes[1]?.condition).toEqual({ look: "failed", failed_because: "it fell over" });
});

test("an_input_that_holds_a_value_is_addressed_by_its_nodes_id_at_the_level_drawn_and_a_new_value_draws_its_card_by_the_same_object", () => {
  const withGain = (gain: number): StreamGraphSummary => ({
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) =>
      node.name === "invert" ? { ...node, input_ports: [...node.input_ports, { name: "gain", family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "float" }, flow: "value" }, value_read: { value: gain, comes_from: "saved" } }] } : node,
    ),
  });
  const level = { project_folder: "/projects/demo", stream_asset: "stream-asset", level: ["SUB"] };
  const before = streamGraphCanvasContents(withGain(0.5), null, null, level);
  const invert = before.nodes.find((node) => node.node_id === "invert");
  expect(invert?.inputs.map((input) => [input.name, input.value_address])).toEqual([
    ["video_in", null],
    ["gain", { graph: level, node_id: "INVERT", input: "gain" }],
  ]);
  expect(streamGraphCanvasContents(withGain(0.75), null, before, { ...level }).nodes.find((node) => node.node_id === "invert")).toBe(invert);
  expect(streamGraphCanvasContents(withGain(0.5), null).nodes.find((node) => node.node_id === "invert")?.inputs.map((input) => input.value_address)).toEqual([null, null]);
  const linked: StreamGraphSummary = {
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) => (node.name === "invert" ? { ...node, input_ports: node.input_ports.map((port) => ({ ...port, value_read: { value: null, comes_from: "wire" as const } })) } : node)),
  };
  expect(streamGraphCanvasContents(linked, null, null, level).nodes.find((node) => node.node_id === "invert")?.inputs.map((input) => input.value_address)).toEqual([null]);
});

test("a_node_or_link_the_running_stream_does_not_hold_yet_is_drawn_not_live_and_each_diagnostic_shows_on_what_it_names", () => {
  const graphWithAnEditNotLive: StreamGraphSummary = {
    ...GRAPH,
    nodes: [...GRAPH.nodes, { ...graphNode("display", ["video"], []), live: false }],
    links: GRAPH.links.map((link) => (link.id === "L3" ? { ...link, live: false } : link)),
  };
  const condition: StreamCondition = {
    load: "loaded",
    playback: "playing",
    health: "degraded",
    diagnostics: [
      { kind: "link_refused", place: { on: "link", from_node: "camera", from_port: "video", to_node: "invert", to_port: "video_in" }, words: "the ports take different frames", recovery: "fix_the_link" },
      { kind: "node_type_not_described", place: { on: "node", node_id: "INVERT", node_name: "invert" }, words: "invert's code describes no node type", recovery: "fix_the_code" },
      { kind: "edit_not_live", place: { on: "node", node_id: "DISPLAY", node_name: "display" }, words: "the running stream refused it", recovery: "restart_the_playback" },
    ],
  };
  const contents = streamGraphCanvasContents(graphWithAnEditNotLive, null, null, null, condition);
  expect(contents.nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["camera", { look: "healthy" }],
    ["invert", { look: "failed", failed_because: "invert's code describes no node type" }],
    ["display", { look: "not_ready", not_ready_because: "Not live yet: the running stream hasn't taken this edit. Restart the playback to make it live." }],
  ]);
  expect(contents.links.map((link) => [link.link_id, link.look, link.description])).toEqual([
    ["L1", "failed", "camera.video → invert.video_in, the ports take different frames"],
    ["invert.video_out->display.video", "waiting", "invert.video_out → display.video, waiting for the other machine"],
    ["L3", "waiting", "camera.video → display.video, Not live yet: the running stream hasn't taken this edit. Restart the playback to make it live."],
  ]);
});
