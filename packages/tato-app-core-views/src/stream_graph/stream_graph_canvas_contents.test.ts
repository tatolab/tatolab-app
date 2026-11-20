import { expect, test } from "vitest";
import type { NodeTypeDescription, StreamCondition, StreamGraph, StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph, type GraphNodeFields } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";

function graphNode(name: string, inputs: string[], outputs: string[], fields: GraphNodeFields = {}): StreamGraphNode {
  return aGraphNode(name, {
    id: name.toUpperCase(),
    type: `nodes.${name}:Effect`,
    kind: "process",
    inputs: inputs.map((port) => aGraphPort(port, "image")),
    outputs: outputs.map((port) => aGraphPort(port, null)),
    ...fields,
    components: { state: "Running", ...fields.components },
  });
}

/** No node type described. */
const NONE_DESCRIBED: ReadonlyMap<string, NodeTypeDescription> = new Map();

const GRAPH: StreamGraph = aStreamGraph(
  [
    graphNode("camera", [], [], {
      outputs: [
        aGraphPort("video", "image", {
          stream_facts: { family: "image", frame_rate: { numerator: 30000, denominator: 1001 }, content_light_level: null, mastering_display_colour_volume: null },
          pin_type: { type: "texture" },
          flow: "stream",
        }),
      ],
    }),
    graphNode("invert", ["video_in"], ["video_out"]),
  ],
  [aGraphLink("L1", ["camera", "video"], ["invert", "video_in"]), aGraphLink("L2", ["invert", "video_out"], ["display", "video"], "pending"), aGraphLink("L3", ["camera", "video"], ["display", "video"], "disconnected")],
);

test("each_node_is_a_card_keyed_by_its_name_with_its_ports_as_pins_of_their_types_and_an_input_shows_the_facts_its_one_link_carries", () => {
  expect(streamGraphCanvasContents(GRAPH, NONE_DESCRIBED).nodes).toEqual([
    { node_id: "camera", title: "camera", type_name: "Effect", node_type: "nodes.camera:Effect", description: null, condition: { look: "healthy" }, inputs: [], outputs: [{ name: "video", pin: { pin_type: { type: "texture" }, flow: "stream" }, family: "image", description: null, annotations: {}, stream_facts_words: ["29.97 fps"], value_address: null, setting: null, wire: null }], saved_position: null, frame_id: null, is_collapsed: false, subgraph: null, kind: { look: "process" } },
    {
      node_id: "invert",
      title: "invert",
      type_name: "Effect",
      node_type: "nodes.invert:Effect",
      description: null,
      condition: { look: "healthy" },
      inputs: [{ name: "video_in", pin: null, family: "image", description: null, annotations: {}, stream_facts_words: ["29.97 fps"], value_address: null, setting: null, wire: null }],
      outputs: [{ name: "video_out", pin: null, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, wire: null }],
      saved_position: null,
      frame_id: null,
      is_collapsed: false,
      subgraph: null,
      kind: { look: "process" },
    },
  ]);
});

test("each_link_is_drawn_by_its_state_and_described_in_words", () => {
  expect(streamGraphCanvasContents(GRAPH, NONE_DESCRIBED).links.map((link) => [link.link_id, link.look, link.description])).toEqual([
    ["L1", "carrying", "camera.video → invert.video_in, wired"],
    ["L2", "waiting", "invert.video_out → display.video, waiting to be wired"],
    ["L3", "ending", "camera.video → display.video, disconnected"],
  ]);
});

test("a_running_node_whose_process_keeps_raising_is_a_failed_card_carrying_what_it_raised_word_for_word", () => {
  const raisedBecause = "process() raised RuntimeError: broke on purpose (nodes/invert.py, line 29)";
  const graph: StreamGraph = {
    ...GRAPH,
    nodes: [
      graphNode("invert", ["video_in"], ["video_out"], { components: { state: "Running", process_raising_because: raisedBecause } }),
      graphNode("camera", [], ["video"], { components: { state: "Running" } }),
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, NONE_DESCRIBED).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["invert", { look: "failed", failed_because: raisedBecause }],
    ["camera", { look: "healthy" }],
  ]);
});

test("a_running_node_not_ready_is_a_not_ready_card_carrying_why_word_for_word_unless_its_process_keeps_raising", () => {
  const notReadyBecause = "ImageFile names no image asset. To fix: set its `asset` config to the UUID of a PNG or JPEG imported into the project";
  const raisedBecause = "process() raised RuntimeError: broke on purpose (nodes/invert.py, line 29)";
  const graph: StreamGraph = {
    ...GRAPH,
    nodes: [
      graphNode("poster", [], ["image"], { components: { state: "Running", not_ready_because: notReadyBecause } }),
      graphNode("invert", ["video_in"], ["video_out"], { components: { state: "Running", not_ready_because: notReadyBecause, process_raising_because: raisedBecause } }),
      graphNode("camera", [], ["video"], { components: { state: "Running" } }),
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, NONE_DESCRIBED).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["poster", { look: "not_ready", not_ready_because: notReadyBecause }],
    ["invert", { look: "failed", failed_because: raisedBecause }],
    ["camera", { look: "healthy" }],
  ]);
});

test("a_node_in_error_is_a_failed_card_carrying_why_word_for_word_and_a_restarting_node_a_restarting_card", () => {
  const failedBecause = "start() raised: RuntimeError: no Rive file at ./missing.riv";
  const graph: StreamGraph = {
    ...GRAPH,
    nodes: [
      graphNode("rivesource", [], ["video"], { components: { state: "Error", failed_because: failedBecause } }),
      graphNode("browsersource", [], ["video"], { components: { state: "Error" } }),
      graphNode("camera", [], ["video"], { components: { state: "Restarting" } }),
      graphNode("invert", ["video_in"], ["video_out"], { components: { state: "Pending" } }),
    ],
    links: [],
  };

  expect(streamGraphCanvasContents(graph, NONE_DESCRIBED).nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["rivesource", { look: "failed", failed_because: failedBecause }],
    ["browsersource", { look: "failed", failed_because: null }],
    ["camera", { look: "restarting" }],
    ["invert", { look: "healthy" }],
  ]);
});

test("a_node_left_somewhere_draws_there_in_the_frame_of_its_group_and_the_graphs_groups_and_notes_are_drawn_too", () => {
  const groupId = "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421";
  const graph: StreamGraph = {
    ...GRAPH,
    nodes: [
      graphNode("camera", [], ["video"], { studio: { contract: 1, position: [40, -12], group: groupId } }),
      graphNode("invert", ["video_in"], ["video_out"], { studio: { contract: 1, group: "9a9a9a9a-0000-4000-8000-000000000000" } }),
    ],
    groups: [{ id: groupId, title: "Inputs", colour: "#3b82f6" }],
    studio: { contract: 1, notes: [{ id: "n1", text: "Tune here", position: [300, 80], size: [220, 90] }] },
  };

  const contents = streamGraphCanvasContents(graph, NONE_DESCRIBED);

  expect(contents.nodes.map((node) => [node.node_id, node.saved_position, node.frame_id])).toEqual([
    ["camera", { x: 40, y: -12 }, groupId],
    ["invert", null, null],
  ]);
  expect(contents.frames).toEqual([{ frame_id: groupId, title: "Inputs", description: null, colour: "#3b82f6" }]);
  expect(contents.notes).toEqual([{ note_id: "n1", text: "Tune here", position: { x: 300, y: 80 }, size: { width: 220, height: 90 } }]);
});

test("a card and its pins carry their node type's descriptions, and a blank one is none", () => {
  const invertDescribed: NodeTypeDescription = {
    node_type: "nodes.invert:Effect",
    described_from: "interpreter",
    documentation: "Inverts each frame's colours.",
    inputs: [{ name: "video_in", documentation: "The frames to invert.", family: { family: "image" }, mode: "wire_only" }],
    outputs: [{ name: "video_out", documentation: "  ", family: { family: "image" } }],
    source: "project",
  };
  const describedByType = new Map([[invertDescribed.node_type, invertDescribed]]);
  const invert = streamGraphCanvasContents(GRAPH, describedByType).nodes.find((node) => node.node_id === "invert");
  expect(invert?.description).toBe("Inverts each frame's colours.");
  expect(invert?.inputs.map((pin) => pin.description)).toEqual(["The frames to invert."]);
  expect(invert?.outputs.map((pin) => pin.description)).toEqual([null]);
  expect(streamGraphCanvasContents(GRAPH, describedByType).nodes.find((node) => node.node_id === "camera")?.description).toBeNull();
});

test("a_subgraph_card_carries_its_kind_and_a_generated_one_names_its_generator_beside_its_title", () => {
  const holding = (name: string, type: string): StreamGraphNode => graphNode(name, [], [], { type, kind: "fragment", fragment: { nodes: [], links: [], groups: [] } });
  const cards = streamGraphCanvasContents(
    { ...GRAPH, links: [], nodes: [holding("look", "tatolab.project:StreamFragment"), holding("levels", "generators.looks:mic_levels")] },
    NONE_DESCRIBED,
  ).nodes;
  expect(cards.map((card) => [card.node_id, card.subgraph, card.kind, card.type_name])).toEqual([
    ["look", "placed_stream", { look: "placed_stream" }, null],
    ["levels", "generated", { look: "subgraph" }, "mic_levels"],
  ]);
});

test("a_card_carries_how_its_nodes_code_runs_with_a_functions_language_and_an_unknown_kind_where_the_runtime_names_none", () => {
  const cards = streamGraphCanvasContents(
    {
      ...GRAPH,
      links: [],
      nodes: [
        graphNode("camera", [], [], { kind: "process" }),
        graphNode("blur", [], [], { kind: "shader" }),
        graphNode("spin", [], [], { kind: "function", language: "python" }),
        graphNode("beats", [], [], { kind: "function", language: "rust" }),
        graphNode("halftone", [], [], { kind: null }),
      ],
    },
    NONE_DESCRIBED,
  ).nodes;
  expect(cards.map((card) => [card.node_id, card.kind])).toEqual([
    ["camera", { look: "process" }],
    ["blur", { look: "shader" }],
    ["spin", { look: "function", language: "python" }],
    ["beats", { look: "function", language: "rust" }],
    ["halftone", { look: "unknown" }],
  ]);
});

test("a_node_a_new_reading_leaves_as_it_was_is_drawn_by_the_object_the_reading_before_drew_it_with_and_a_changed_node_by_a_new_one", () => {
  const before = streamGraphCanvasContents(GRAPH, NONE_DESCRIBED);
  const reread = streamGraphCanvasContents(structuredClone(GRAPH), NONE_DESCRIBED, before);
  expect(reread.nodes).toHaveLength(2);
  reread.nodes.forEach((node, index) => expect(node).toBe(before.nodes[index]));

  const invertFailed = streamGraphCanvasContents({ ...GRAPH, nodes: GRAPH.nodes.map((node) => (node.name === "invert" ? { ...node, components: { ...node.components, state: "Error", failed_because: "it fell over" } } : node)) }, NONE_DESCRIBED, reread);
  expect(invertFailed.nodes[0]).toBe(before.nodes[0]);
  expect(invertFailed.nodes[1]).not.toBe(before.nodes[1]);
  expect(invertFailed.nodes[1]?.condition).toEqual({ look: "failed", failed_because: "it fell over" });
});

test("an_input_that_holds_a_value_is_addressed_by_its_nodes_id_at_the_level_drawn_and_a_new_value_draws_its_card_by_the_same_object", () => {
  const withGain = (gain: number): StreamGraph => ({
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) =>
      node.name === "invert"
        ? { ...node, ports: { ...node.ports, inputs: [...node.ports.inputs, aGraphPort("gain", "channels", { pin_type: { type: "float" }, flow: "value", value: gain, value_comes_from: "saved" })] } }
        : node,
    ),
  });
  const level = { project_folder: "/projects/demo", stream_asset: "stream-asset", level: ["SUB"] };
  const before = streamGraphCanvasContents(withGain(0.5), NONE_DESCRIBED, null, level);
  const invert = before.nodes.find((node) => node.node_id === "invert");
  expect(invert?.inputs.map((input) => [input.name, input.value_address])).toEqual([
    ["video_in", null],
    ["gain", { graph: level, node_id: "INVERT", input: "gain" }],
  ]);
  expect(streamGraphCanvasContents(withGain(0.75), NONE_DESCRIBED, before, { ...level }).nodes.find((node) => node.node_id === "invert")).toBe(invert);
  expect(streamGraphCanvasContents(withGain(0.5), NONE_DESCRIBED).nodes.find((node) => node.node_id === "invert")?.inputs.map((input) => input.value_address)).toEqual([null, null]);
  const linked: StreamGraph = {
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) => (node.name === "invert" ? { ...node, ports: { ...node.ports, inputs: node.ports.inputs.map((port) => ({ ...port, value_comes_from: "wire" as const })) } } : node)),
  };
  expect(streamGraphCanvasContents(linked, NONE_DESCRIBED, null, level).nodes.find((node) => node.node_id === "invert")?.inputs.map((input) => input.value_address)).toEqual([null]);
});

test("a_cards_settings_come_first_among_its_inputs_a_typed_ones_port_and_then_each_one_of_a_node_type_not_yet_typed_addressed_where_its_value_is_kept_and_one_the_node_takes_as_an_input_is_none", () => {
  const described: NodeTypeDescription = {
    node_type: "nodes.invert:Effect",
    described_from: "interpreter",
    documentation: "",
    source: "project",
    inputs: [
      { name: "video_in", documentation: "", mode: "wire_only" },
      { name: "gain", documentation: "", pin_type: { kind: "is", pin_type: { type: "float" } }, flow: "value", mode: "setting_only", read: "each_run" },
      { name: "width", documentation: "Canvas width.", mode: "setting_only", read: "at_setup", default_value: 1280 },
    ],
    outputs: [],
  };
  const withGain: StreamGraph = {
    ...GRAPH,
    nodes: GRAPH.nodes.map((node) =>
      node.name === "invert" ? { ...node, ports: { ...node.ports, inputs: [...node.ports.inputs, aGraphPort("gain", "channels", { pin_type: { type: "float" }, flow: "value", value: 1, value_comes_from: "default" })] } } : node,
    ),
  };
  const level = { project_folder: "/projects/demo", stream_asset: "stream-asset", level: [] };
  const invert = streamGraphCanvasContents(withGain, new Map([[described.node_type, described]]), null, level).nodes.find((node) => node.node_id === "invert");
  expect(invert?.inputs.map((input) => [input.name, input.setting, input.pin, input.description, input.value_address?.input ?? null])).toEqual([
    ["gain", { read: "each_run" }, { pin_type: { type: "float" }, flow: "value" }, null, "gain"],
    ["width", { read: "at_setup" }, null, "Canvas width.", "width"],
    ["video_in", null, null, null, null],
  ]);
  const gainExposed: StreamGraph = { ...withGain, nodes: withGain.nodes.map((node) => (node.name === "invert" ? { ...node, exposed_config_fields: ["gain"] } : node)) };
  const invertTakingGainAsAnInput = streamGraphCanvasContents(gainExposed, new Map([[described.node_type, described]]), null, level).nodes.find((node) => node.node_id === "invert");
  expect(invertTakingGainAsAnInput?.inputs.map((input) => [input.name, input.setting])).toEqual([
    ["width", { read: "at_setup" }],
    ["video_in", null],
    ["gain", null],
  ]);
});

test("a_node_or_link_the_running_stream_does_not_hold_yet_is_drawn_not_live_and_each_diagnostic_shows_on_what_it_names", () => {
  const graphWithAnEditNotLive: StreamGraph = {
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
  const contents = streamGraphCanvasContents(graphWithAnEditNotLive, NONE_DESCRIBED, null, null, condition);
  expect(contents.nodes.map((node) => [node.node_id, node.condition])).toEqual([
    ["camera", { look: "healthy" }],
    ["invert", { look: "failed", failed_because: "invert's code describes no node type" }],
    ["display", { look: "not_ready", not_ready_because: "Not live yet: the running stream hasn't taken this edit. Restart the playback to make it live." }],
  ]);
  expect(contents.links.map((link) => [link.link_id, link.look, link.description])).toEqual([
    ["L1", "failed", "camera.video → invert.video_in, the ports take different frames"],
    ["L2", "waiting", "invert.video_out → display.video, waiting to be wired"],
    ["L3", "waiting", "camera.video → display.video, Not live yet: the running stream hasn't taken this edit. Restart the playback to make it live."],
  ]);
});

test("an_input_that_takes_a_wire_reads_it_where_wires_are_read_through_the_port_viewer_of_the_output_wired_in_and_one_with_none_says_so", () => {
  const level = { project_folder: "/projects/demo", stream_asset: "STREAM-ASSET", level: [] };
  const wiresAt = { stream: "main-a1b2c3", graph: level };
  const graph = aStreamGraph([...GRAPH.nodes, graphNode("mixer", ["video_a", "video_b"], [])], GRAPH.links);
  const inputsOf = (contents: ReturnType<typeof streamGraphCanvasContents>, nodeName: string) => contents.nodes.find((node) => node.node_id === nodeName)?.inputs.map((input) => [input.name, input.wire]);
  const read = streamGraphCanvasContents(graph, NONE_DESCRIBED, null, level, null, wiresAt);
  expect(inputsOf(read, "invert")).toEqual([
    ["video_in", { into: { graph: level, node_id: "INVERT", input: "video_in" }, wiring: { kind: "wired", target: { stream: "main-a1b2c3", node_id: "CAMERA", port: "video" }, wired_from_words: "camera › video" } }],
  ]);
  expect(inputsOf(read, "mixer")?.[0]).toEqual(["video_a", { into: { graph: level, node_id: "MIXER", input: "video_a" }, wiring: { kind: "unwired", because: "Nothing is wired into video_a." } }]);
  expect(inputsOf(streamGraphCanvasContents(graph, NONE_DESCRIBED, null, level), "invert")).toEqual([["video_in", null]]);
});
