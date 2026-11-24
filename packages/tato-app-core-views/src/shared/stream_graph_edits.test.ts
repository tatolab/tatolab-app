import { describe, expect, test } from "vitest";
import { studioFieldsOfTheNode, type NodeTypeDescription, type StreamGraph, type StreamGraphNode, type StreamGraphNodeStudioFields } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import {
  bundleOpenedEdits,
  cardCollapsedEdits,
  cardLetGoOverALinkEdits,
  cardsMovedEdits,
  generatorSubgraphPlacedEdits,
  nameOfTheNewGeneratorSubgraph,
  NODE_PLACED_IN_THIS_TRANSACTION,
  deletedEdits,
  doesTheGraphShowTheStudioSentAhead,
  editedStreamGraphOf,
  frameChangedEdits,
  frameRemovedEdits,
  inputsAWireReaches,
  studioFieldsSetBy,
  nodePlacedEdits,
  noteChangedEdits,
  notePlacedEdits,
  pinsWiredEdits,
  selectionFramedEdits,
  nameOfTheNewSubgraph,
  selectionCollapsedEdits,
  streamGraphActionsAtTheLevel,
  subgraphRefreshedEdits,
  subgraphUnlockedEdits,
  type EditedStreamGraph,
} from "./stream_graph_edits";

const STREAM_ASSET = "7194d1f9-721a-41e5-9cc9-7db50336a1ed";

/** A node's `studio` as the runtime renders it under the studio contract, holding `fields`. */
const studioOnTheWire = (fields: Partial<StreamGraphNodeStudioFields>): NonNullable<StreamGraphNode["studio"]> => ({ contract: 1, ...fields });

function graphNode(name: string, id: string, ports: { inputs?: [string, "image" | "array" | null][]; outputs?: [string, "image" | "array" | null][] }, studio: Partial<StreamGraphNodeStudioFields> = {}): StreamGraphNode {
  const declared = (portsOfOneSide: [string, "image" | "array" | null][] = []) =>
    portsOfOneSide.map(([name, carries]) => aGraphPort(name, carries === "image" ? { pin_type: { type: "texture" }, flow: "stream" } : carries === "array" ? { pin_type: { type: "float" } } : {}));
  return aGraphNode(name, { id, kind: "process", config: {}, inputs: declared(ports.inputs), outputs: declared(ports.outputs), studio: studioOnTheWire(studio), components: { state: "Running" } });
}

const PATTERN = graphNode("pattern", "uuid-pattern", { outputs: [["video", "image"]] }, { position: [0, 0], comment: "the source", metadata: { pinned: true } });
const HALFTONE = graphNode("halftone", "uuid-halftone", { inputs: [["level", "array"], ["frames", "image"]], outputs: [["image", "image"]] });
const DISPLAY = graphNode("display", "uuid-display", { inputs: [["video", "image"]] });

const GRAPH: StreamGraph = aStreamGraph([PATTERN, HALFTONE, DISPLAY], [aGraphLink("L1", ["pattern", "video"], ["display", "video"])], { stream: "pattern-main-d76f70", asset: STREAM_ASSET });

function edited(graph: StreamGraph = GRAPH): EditedStreamGraph {
  const editedGraph = editedStreamGraphOf(graph);
  if ("because" in editedGraph) return expect.unreachable(editedGraph.because);
  return editedGraph;
}

/** A port of a node type not yet typed, as its description describes it: its family alone. */
const untypedPort = ([name, family]: [string, "image" | "array" | null]) => ({ name, documentation: "", ...(family === null ? {} : { family: { family } }) });

const describedNodeType = (type: string, inputs: [string, "image" | "array" | null][], outputs: [string, "image" | "array" | null][]): NodeTypeDescription => ({
  node_type: type,
  described_from: "interpreter",
  documentation: "",
  inputs: inputs.map((input) => ({ ...untypedPort(input), mode: "wire_or_value" })),
  outputs: outputs.map(untypedPort),
  source: "project",
});
const BLUR = describedNodeType("nodes.blur:GaussianBlur", [["strength", "array"], ["video_in", "image"]], [["video_out", "image"]]);

/** A node type as its description lists it once each setting is an input: its port `video_in`, then its settings, each with no family, `gain` taking a wire and `layers`, a field of a node type not yet typed, none. */
const A_SETTING = { mode: "setting_only", read: "at_setup" } as const;
const BLUR_LISTING_ITS_SETTINGS: NodeTypeDescription = {
  ...describedNodeType("nodes.blur:GaussianBlur", [["video_in", "image"]], [["video_out", "image"]]),
  inputs: [
    { name: "video_in", documentation: "the picture", family: { family: "image" }, mode: "wire_only" },
    { name: "gain", documentation: "How loud.", pin_type: { kind: "is", pin_type: { type: "float" } }, flow: "value", ...A_SETTING, takes_a_wire: true },
    { name: "layers", documentation: "", ...A_SETTING, takes_a_wire: false },
  ],
};

test("a_graph_with_no_stream_asset_or_a_node_without_a_uuid_cannot_be_edited_and_says_why", () => {
  expect(editedStreamGraphOf({ ...GRAPH, asset: null })).toEqual({ because: "The runtime's graph names no stream asset, so an edit has no stream to name." });
  expect(editedStreamGraphOf({ ...GRAPH, nodes: [{ ...PATTERN, id: "" }] })).toEqual({ because: "The runtime's graph gives pattern no UUID, so an edit cannot name it." });
});

describe("moving_cards", () => {
  test("each_moved_card_replaces_its_studio_whole_keeping_every_other_field_and_a_card_left_where_it_was_asks_nothing", () => {
    expect(
      cardsMovedEdits(edited(), [
        { node_id: "pattern", position: { x: 40.4, y: -12.6 }, frame_id: null },
        { node_id: "halftone", position: { x: 300, y: 20 }, frame_id: null },
      ]),
    ).toEqual([
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [40, -13], comment: "the source", metadata: { pinned: true } } },
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-halftone", studio: { position: [300, 20] } },
    ]);
    expect(cardsMovedEdits(edited(), [{ node_id: "pattern", position: { x: 0.2, y: 0 }, frame_id: null }])).toEqual([]);
  });

  test("a_card_let_go_in_a_frame_joins_its_group_and_one_let_go_outside_leaves_it_in_the_same_studio_edit", () => {
    const group = "4b6c1e0a-2f1d-4a57-9b36-0d5e7c1a9f42";
    const grouped = edited({ ...GRAPH, nodes: [{ ...PATTERN, studio: { ...PATTERN.studio, group } }, HALFTONE, DISPLAY], groups: [{ id: group, title: "Inputs" }] });
    expect(
      cardsMovedEdits(grouped, [
        { node_id: "halftone", position: { x: 300, y: 20 }, frame_id: group },
        { node_id: "pattern", position: { x: 0, y: 0 }, frame_id: null },
      ]),
    ).toEqual([
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-halftone", studio: { position: [300, 20], group } },
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [0, 0], comment: "the source", metadata: { pinned: true } } },
    ]);
    expect(cardsMovedEdits(grouped, [{ node_id: "pattern", position: { x: 0, y: 0 }, frame_id: group }])).toEqual([]);
  });
});

test("a_wire_drawn_between_pins_connects_them_by_node_uuid", () => {
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video", member: null }, { node_id: "halftone", pin: "frames", member: null })).toEqual([
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
  ]);
});

test("a_wire_to_a_card_the_graph_no_longer_holds_asks_nothing_rather_than_naming_it_by_its_name", () => {
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video", member: null }, { node_id: "gone", pin: "frames", member: null })).toEqual([]);
});

test("the_studio_sent_ahead_for_a_node_inside_a_subgraph_is_shown_once_the_subgraph_holds_it", () => {
  const sentAhead = { ...studioFieldsOfTheNode(HALFTONE), collapsed: true };
  const subgraphHolding = (studio: StreamGraphNode["studio"]): StreamGraph => ({
    ...GRAPH,
    nodes: [PATTERN, { ...graphNode("look", "uuid-look", {}), type: "tatolab.project:StreamFragment", kind: "fragment", fragment: { nodes: [{ ...HALFTONE, studio }], links: [], groups: [] } }],
  });
  expect(doesTheGraphShowTheStudioSentAhead(subgraphHolding(HALFTONE.studio), "uuid-halftone", sentAhead)).toBe(false);
  expect(doesTheGraphShowTheStudioSentAhead(subgraphHolding(studioOnTheWire(sentAhead)), "uuid-halftone", sentAhead)).toBe(true);
});

describe("editing_inside_a_subgraph", () => {
  test("each_action_names_the_level_and_the_streams_own_level_names_none", () => {
    const wired = pinsWiredEdits(edited(), { node_id: "pattern", pin: "video", member: null }, { node_id: "halftone", pin: "frames", member: null });
    expect(streamGraphActionsAtTheLevel(wired, [])).toEqual(wired);
    expect(streamGraphActionsAtTheLevel(wired, ["uuid-look", "uuid-inner"])).toEqual([
      { operation: "connect", stream: STREAM_ASSET, level: ["uuid-look", "uuid-inner"], source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
    ]);
  });

  test("a_note_or_a_subgraph_placed_from_code_is_not_sent_inside_a_subgraph_and_says_why", () => {
    expect(streamGraphActionsAtTheLevel(notePlacedEdits(edited(), { x: 0, y: 0 }), ["uuid-look"])).toEqual({
      because: "The runtime keeps a note only on the stream's own level, not inside a subgraph.",
    });
    expect(streamGraphActionsAtTheLevel(generatorSubgraphPlacedEdits(edited(), "generators.looks:soft_look", { x: 0, y: 0 }), ["uuid-look"])).toEqual({
      because: "The runtime places a subgraph from code or from another stream only on the stream's own level.",
    });
  });
});

test("the_studio_sent_ahead_is_shown_once_the_graph_holds_each_field_it_set_even_beside_a_field_another_edit_set", () => {
  const sentAhead = { ...studioFieldsOfTheNode(PATTERN), collapsed: true };
  const graphShowing = (studio: Partial<StreamGraphNodeStudioFields>) => ({ ...GRAPH, nodes: [{ ...PATTERN, studio: studioOnTheWire(studio) }, HALFTONE, DISPLAY] });
  expect(doesTheGraphShowTheStudioSentAhead(GRAPH, "uuid-pattern", sentAhead)).toBe(false);
  expect(doesTheGraphShowTheStudioSentAhead(graphShowing(sentAhead), "uuid-pattern", sentAhead)).toBe(true);
  expect(doesTheGraphShowTheStudioSentAhead(graphShowing({ ...sentAhead, colour: "#ff0000" }), "uuid-pattern", sentAhead)).toBe(true);
});

describe("placing_a_node", () => {
  test("a_node_placed_with_tab_is_added_at_the_pointer_under_the_label_later_operations_name_it_by", () => {
    expect(nodePlacedEdits(edited(), BLUR.node_type, { x: 120.6, y: 80 }, null)).toEqual([
      { operation: "add_node", stream: STREAM_ASSET, type: "nodes.blur:GaussianBlur", studio: { position: [121, 80] }, as: "placed" },
    ]);
  });

  test("a_node_placed_off_an_output_wire_links_the_wire_to_the_port_the_runtime_answered_it_fits_in_the_same_transaction", () => {
    expect(nodePlacedEdits(edited(), BLUR.node_type, { x: 0, y: 0 }, { looseWire: { node_id: "pattern", pin: "video", member: null, side: "output" }, port: "video_in" })).toEqual([
      { operation: "add_node", stream: STREAM_ASSET, type: "nodes.blur:GaussianBlur", studio: { position: [0, 0] }, as: "placed" },
      { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "placed", port: "video_in" } },
    ]);
  });

  test("a_node_placed_off_an_input_wire_feeds_it_from_the_port_the_runtime_answered_fits", () => {
    expect(nodePlacedEdits(edited(), BLUR.node_type, { x: 0, y: 0 }, { looseWire: { node_id: "display", pin: "video", member: null, side: "input" }, port: "video_out" })[1]).toEqual({
      operation: "connect",
      stream: STREAM_ASSET,
      source: { node: "placed", port: "video_out" },
      target: { node: "uuid-display", port: "video" },
    });
  });

  test("a_node_placed_off_a_wire_of_a_node_the_graph_names_no_id_for_is_placed_unlinked", () => {
    expect(nodePlacedEdits(edited(), BLUR.node_type, { x: 0, y: 0 }, { looseWire: { node_id: "gone", pin: "video", member: null, side: "output" }, port: "video_in" })).toEqual([
      { operation: "add_node", stream: STREAM_ASSET, type: "nodes.blur:GaussianBlur", studio: { position: [0, 0] }, as: "placed" },
    ]);
  });

  test("an_input_a_wire_reaches_is_one_the_runtime_says_takes_a_wire_a_setting_among_them_and_one_it_says_nothing_of", () => {
    expect(inputsAWireReaches(BLUR_LISTING_ITS_SETTINGS).map((input) => input.name)).toEqual(["video_in", "gain"]);
  });
});

test("deleting_disconnects_the_selected_links_removes_the_nodes_and_notes_and_leaves_a_removed_nodes_links_to_go_with_it", () => {
  expect(deletedEdits(edited(), { node_ids: [], link_ids: ["L1"], note_ids: [] })).toEqual([
    { operation: "disconnect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-display", port: "video" } },
  ]);
  expect(deletedEdits(edited(), { node_ids: ["display"], link_ids: ["L1"], note_ids: ["note-1"] })).toEqual([
    { operation: "remove_node", stream: STREAM_ASSET, node: "uuid-display" },
    { operation: "remove_note", stream: STREAM_ASSET, note: "note-1" },
  ]);
});

test("a_card_let_go_over_a_link_is_spliced_in_by_its_first_ports_of_the_links_pin_type_and_one_without_them_asks_nothing", () => {
  expect(cardLetGoOverALinkEdits(edited(), new Map(), "halftone", "L1")).toEqual([
    { operation: "disconnect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-display", port: "video" } },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-halftone", port: "image" }, target: { node: "uuid-display", port: "video" } },
  ]);
  const meterOnly = edited({ ...GRAPH, nodes: [...GRAPH.nodes, graphNode("meter", "uuid-meter", { inputs: [["level", "array"]] })] });
  expect(cardLetGoOverALinkEdits(meterOnly, new Map(), "meter", "L1")).toEqual([]);
});

test("a_card_let_go_over_a_link_is_spliced_in_by_its_first_input_of_the_links_pin_type_that_takes_a_wire", () => {
  const setting = aGraphPort("source_frames", { pin_type: { type: "texture" }, flow: "stream", takes_a_wire: false });
  const withASettingFirst = aGraphNode("lens", { id: "uuid-lens", kind: "process", config: {}, inputs: [setting, aGraphPort("frames", { takes_a_wire: true })], outputs: [aGraphPort("image", { pin_type: { type: "texture" }, flow: "stream" })], components: { state: "Running" } });
  expect(cardLetGoOverALinkEdits(edited({ ...GRAPH, nodes: [...GRAPH.nodes, withASettingFirst] }), new Map(), "lens", "L1")[1]).toEqual({
    operation: "connect",
    stream: STREAM_ASSET,
    source: { node: "uuid-pattern", port: "video" },
    target: { node: "uuid-lens", port: "frames" },
  });
  const takingNoWire = aGraphNode("still", { id: "uuid-still", kind: "process", config: {}, inputs: [setting], outputs: [aGraphPort("image", { pin_type: { type: "texture" }, flow: "stream" })], components: { state: "Running" } });
  expect(cardLetGoOverALinkEdits(edited({ ...GRAPH, nodes: [...GRAPH.nodes, takingNoWire] }), new Map(), "still", "L1")).toEqual([]);

  const unmarked = aGraphNode("lens", { id: "uuid-lens", kind: "process", config: {}, inputs: [aGraphPort("source_frames", { pin_type: { type: "texture" }, flow: "stream" }), aGraphPort("frames", { pin_type: { type: "texture" }, flow: "stream" })], outputs: [aGraphPort("image", { pin_type: { type: "texture" }, flow: "stream" })], components: { state: "Running" } });
  const lensDescribed: NodeTypeDescription = { ...describedNodeType("nodes.lens:Node", [], []), inputs: [{ name: "source_frames", documentation: "", family: { family: "image" }, ...A_SETTING, takes_a_wire: false }] };
  expect(cardLetGoOverALinkEdits(edited({ ...GRAPH, nodes: [...GRAPH.nodes, unmarked] }), new Map([["nodes.lens:Node", lensDescribed]]), "lens", "L1")[1]).toMatchObject({ target: { node: "uuid-lens", port: "frames" } });
});

test("framing_the_selection_makes_one_labelled_group_of_its_nodes", () => {
  expect(selectionFramedEdits(edited(), ["pattern", "halftone"])).toEqual([{ operation: "add_group", stream: STREAM_ASSET, title: "Frame", nodes: ["uuid-pattern", "uuid-halftone"] }]);
  expect(selectionFramedEdits(edited(), [])).toEqual([]);
});

test("a_note_is_placed_at_the_point_and_its_change_sets_only_the_fields_that_changed", () => {
  expect(notePlacedEdits(edited(), { x: 10, y: 20 })).toEqual([{ operation: "add_note", stream: STREAM_ASSET, text: "Note", position: [10, 20], size: [220, 110] }]);
  expect(noteChangedEdits(edited(), "note-1", { text: "Tune here" })).toEqual([{ operation: "set_note_fields", stream: STREAM_ASSET, note: "note-1", text: "Tune here" }]);
  expect(noteChangedEdits(edited(), "note-1", { position: { x: 1, y: 2 }, size: { width: 300.4, height: 90 } })).toEqual([
    { operation: "set_note_fields", stream: STREAM_ASSET, note: "note-1", position: [1, 2], size: [300, 90] },
  ]);
});

test("a_frame_changed_sets_only_the_fields_that_differ_trimmed_and_a_blank_title_or_nothing_changed_asks_nothing", () => {
  const group = "21d9c0ee-a01d-40a0-ad61-bd05476819e7";
  const framed = edited({ ...GRAPH, groups: [{ id: group, title: "Frame", colour: "#6f9bff" }] });
  expect(frameChangedEdits(framed, group, { title: "  Titles " })).toEqual([{ operation: "set_group_fields", stream: STREAM_ASSET, group, title: "Titles" }]);
  expect(frameChangedEdits(framed, group, { title: "   " })).toEqual([]);
  expect(frameChangedEdits(framed, group, { title: "Frame" })).toEqual([]);
  expect(frameChangedEdits(framed, group, { description: " The camera " })).toEqual([{ operation: "set_group_fields", stream: STREAM_ASSET, group, description: "The camera" }]);
  expect(frameChangedEdits(framed, group, { description: "" })).toEqual([]);
  expect(frameChangedEdits(framed, group, { colour: "#3fcf8e" })).toEqual([{ operation: "set_group_fields", stream: STREAM_ASSET, group, colour: "#3fcf8e" }]);
  expect(frameChangedEdits(framed, group, { colour: "#6f9bff" })).toEqual([]);
  expect(frameChangedEdits(framed, "another-group", { title: "Titles" })).toEqual([]);
});

test("a_frame_removed_takes_out_its_group_and_one_the_graph_does_not_hold_asks_nothing", () => {
  const group = "21d9c0ee-a01d-40a0-ad61-bd05476819e7";
  const framed = edited({ ...GRAPH, groups: [{ id: group, title: "Frame" }] });
  expect(frameRemovedEdits(framed, group)).toEqual([{ operation: "remove_group", stream: STREAM_ASSET, group }]);
  expect(frameRemovedEdits(framed, "another-group")).toEqual([]);
});

test("a_card_collapsed_keeps_its_other_studio_fields_and_one_already_so_asks_nothing", () => {
  expect(cardCollapsedEdits(edited(), "pattern", true)).toEqual([
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [0, 0], comment: "the source", collapsed: true, metadata: { pinned: true } } },
  ]);
  expect(cardCollapsedEdits(edited(), "halftone", false)).toEqual([
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-halftone", studio: { collapsed: false } },
  ]);
  const collapsed = edited({ ...GRAPH, nodes: [{ ...DISPLAY, studio: studioOnTheWire({ collapsed: true }) }] });
  expect(cardCollapsedEdits(collapsed, "display", true)).toEqual([]);
});

test("a_bundle_opened_is_kept_by_side_in_its_nodes_metadata_beside_what_else_it_holds_the_key_left_out_once_none_is_open_and_one_already_so_asks_nothing", () => {
  const opened = bundleOpenedEdits(edited(), "pattern", "output", "video", true);
  expect(opened).toEqual([
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [0, 0], comment: "the source", metadata: { pinned: true, open_bundles: { inputs: [], outputs: ["video"] } } } },
  ]);
  const openedAhead = editedStreamGraphOf(GRAPH, studioFieldsSetBy(opened));
  if ("because" in openedAhead) return expect.unreachable(openedAhead.because);
  expect(bundleOpenedEdits(openedAhead, "pattern", "output", "video", true)).toEqual([]);
  expect(bundleOpenedEdits(openedAhead, "pattern", "output", "video", false)).toEqual([
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [0, 0], comment: "the source", metadata: { pinned: true } } },
  ]);
  expect(bundleOpenedEdits(edited(), "gone", "input", "levels", true)).toEqual([]);
});

test("a_wire_drawn_to_or_from_a_member_names_the_member_and_a_link_at_a_member_is_deleted_by_it", () => {
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video", member: "luma" }, { node_id: "halftone", pin: "level", member: "low" })).toEqual([
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video", member: "luma" }, target: { node: "uuid-halftone", port: "level", member: "low" } },
  ]);
  const memberLinked = edited({ ...GRAPH, links: [{ ...aGraphLink("L2", ["pattern", "video"], ["halftone", "level"]), target: { node: "halftone", port: "level", member: "low" } }] });
  expect(deletedEdits(memberLinked, { node_ids: [], link_ids: ["L2"], note_ids: [] })).toEqual([
    { operation: "disconnect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "level", member: "low" } },
  ]);
});

test("a_second_studio_edit_sent_before_the_graph_shows_the_first_builds_on_it_instead_of_undoing_it", () => {
  const collapsing = cardCollapsedEdits(edited(), "halftone", true);
  const sentAhead = studioFieldsSetBy(collapsing);
  const editedAhead = editedStreamGraphOf(GRAPH, sentAhead);
  if ("because" in editedAhead) return expect.unreachable(editedAhead.because);
  expect(cardsMovedEdits(editedAhead, [{ node_id: "halftone", position: { x: 10, y: 20 }, frame_id: null }])).toEqual([
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-halftone", studio: { position: [10, 20], collapsed: true } },
  ]);
  expect(cardCollapsedEdits(editedAhead, "halftone", true)).toEqual([]);
});

describe("subgraphs", () => {
  const LEVELS = { ...graphNode("levels", "uuid-levels", { outputs: [["level", "array"]] }), type: "generators.mics:mic_levels", config: { mic_count: 2 }, fragment: { kind: "generated" as const, nodes: [], links: [], groups: [] } };
  const LOOK = { ...graphNode("subgraph", "uuid-look", {}), type: "tatolab.project:StreamFragment", fragment: { kind: "placed_stream" as const, nodes: [], links: [], groups: [] } };

  test("a_collapsed_selection_names_its_nodes_by_uuid_and_takes_the_first_free_subgraph_name", () => {
    expect(selectionCollapsedEdits(edited(), ["pattern", "halftone", "gone"], nameOfTheNewSubgraph(GRAPH))).toEqual([
      { operation: "collapse_selection_into_subgraph", stream: STREAM_ASSET, nodes: ["uuid-pattern", "uuid-halftone"], name: "subgraph" },
    ]);
    expect(nameOfTheNewSubgraph({ nodes: [LOOK, { ...LOOK, name: "subgraph-2" }] })).toBe("subgraph-3");
    expect(selectionCollapsedEdits(edited(), ["gone"], "subgraph")).toEqual([]);
  });

  test("unlock_names_the_subgraph_by_uuid_and_refresh_runs_its_generator_again_under_its_name_with_its_settings", () => {
    const graph = edited({ ...GRAPH, nodes: [...GRAPH.nodes, LEVELS, LOOK] });
    expect(subgraphUnlockedEdits(graph, "subgraph")).toEqual([{ operation: "unlock_subgraph", stream: STREAM_ASSET, fragment: "uuid-look" }]);
    expect(subgraphRefreshedEdits(graph, "levels")).toEqual([{ operation: "import_graph_generator", stream: STREAM_ASSET, generator: "generators.mics:mic_levels", name: "levels", config: { mic_count: 2 } }]);
    expect(subgraphRefreshedEdits(graph, "subgraph")).toEqual([]);
  });
});

test("a_graph_generator_is_placed_under_a_name_no_node_holds_with_its_card_where_asked_in_one_transaction", () => {
  const LEVELS = { ...graphNode("mic_levels", "uuid-levels", {}), type: "generators.mics:mic_levels", fragment: { kind: "generated" as const, nodes: [], links: [], groups: [] } };
  expect(nameOfTheNewGeneratorSubgraph(GRAPH, "generators.mics:mic_levels")).toBe("mic_levels");
  expect(nameOfTheNewGeneratorSubgraph({ nodes: [...GRAPH.nodes, LEVELS] }, "generators.mics:mic_levels")).toBe("mic_levels-2");
  expect(generatorSubgraphPlacedEdits(edited({ ...GRAPH, nodes: [...GRAPH.nodes, LEVELS] }), "generators.mics:mic_levels", { x: 120.4, y: 80.6 })).toEqual([
    { operation: "import_graph_generator", stream: STREAM_ASSET, generator: "generators.mics:mic_levels", name: "mic_levels-2", as: NODE_PLACED_IN_THIS_TRANSACTION },
    { operation: "set_studio_fields", stream: STREAM_ASSET, node: NODE_PLACED_IN_THIS_TRANSACTION, studio: { position: [120, 81] } },
  ]);
});
