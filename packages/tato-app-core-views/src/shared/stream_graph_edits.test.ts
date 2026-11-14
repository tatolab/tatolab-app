import { describe, expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type NodeCatalogEntry, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  canANodeTypeTakeTheLooseWire,
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

function graphNode(name: string, id: string, ports: { inputs?: [string, "image" | "array" | null][]; outputs?: [string, "image" | "array" | null][] }, studio = NODE_STUDIO_FIELDS_NONE_SET): StreamGraphNode {
  const declared = (portsOfOneSide: [string, "image" | "array" | null][] = []) => portsOfOneSide.map(([name, family]) => ({ name, family, stream_facts: null, values_checked: null }));
  return {
    id,
    name,
    type: `nodes.${name}:Node`,
    state: "Running",
    failed_because: null,
    process_raising_because: null,
    config: {},
    pins: {},
    exposed_config_fields: [],
    input_ports: declared(ports.inputs),
    output_ports: declared(ports.outputs),
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    studio,
    fragment: null, graph_interface: null,
  };
}

const PATTERN = graphNode("pattern", "uuid-pattern", { outputs: [["video", "image"]] }, { ...NODE_STUDIO_FIELDS_NONE_SET, position: [0, 0], comment: "the source", metadata: { pinned: true } });
const HALFTONE = graphNode("halftone", "uuid-halftone", { inputs: [["level", "array"], ["frames", "image"]], outputs: [["image", "image"]] });
const DISPLAY = graphNode("display", "uuid-display", { inputs: [["video", "image"]] });

const GRAPH: StreamGraphSummary = {
  stream: "pattern-main-d76f70",
  stream_asset: STREAM_ASSET,
  nodes: [PATTERN, HALFTONE, DISPLAY],
  links: [{ id: "L1", source_node: "pattern", source_port: "video", target_node: "display", target_port: "video", state: "wired" }],
  groups: [],
  notes: [],
  graph_document_text: "{}",
};

function edited(graph: StreamGraphSummary = GRAPH): EditedStreamGraph {
  const editedGraph = editedStreamGraphOf(graph);
  if ("because" in editedGraph) return expect.unreachable(editedGraph.because);
  return editedGraph;
}

const catalogEntry = (type: string, inputs: [string, "image" | "array" | null][], outputs: [string, "image" | "array" | null][]): NodeCatalogEntry => ({
  type,
  description: "",
  category: null,
  config_schema: null,
  inputs: inputs.map(([name, family]) => ({ name, description: "", family })),
  outputs: outputs.map(([name, family]) => ({ name, description: "", family })),
});
const BLUR = catalogEntry("nodes.blur:GaussianBlur", [["strength", "array"], ["video_in", "image"]], [["video_out", "image"]]);

test("a_graph_with_no_stream_asset_or_a_node_without_a_uuid_cannot_be_edited_and_says_why", () => {
  expect(editedStreamGraphOf({ ...GRAPH, stream_asset: null })).toEqual({ because: "The runtime's graph names no stream asset, so an edit has no stream to name." });
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
    const grouped = edited({ ...GRAPH, nodes: [{ ...PATTERN, studio: { ...PATTERN.studio, group } }, HALFTONE, DISPLAY], groups: [{ id: group, title: "Inputs", description: null, colour: null }] });
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
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video" }, { node_id: "halftone", pin: "frames" })).toEqual([
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
  ]);
});

test("a_wire_to_a_card_the_graph_no_longer_holds_asks_nothing_rather_than_naming_it_by_its_name", () => {
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video" }, { node_id: "gone", pin: "frames" })).toEqual([]);
});

test("the_studio_sent_ahead_for_a_node_inside_a_subgraph_is_shown_once_the_subgraph_holds_it", () => {
  const sentAhead = { ...HALFTONE.studio, collapsed: true };
  const subgraphHolding = (studio: StreamGraphNode["studio"]): StreamGraphSummary => ({
    ...GRAPH,
    nodes: [PATTERN, { ...graphNode("look", "uuid-look", {}), fragment: { kind: "placed_stream", nodes: [{ ...HALFTONE, studio }], links: [], groups: [] } }],
  });
  expect(doesTheGraphShowTheStudioSentAhead(subgraphHolding(HALFTONE.studio), "uuid-halftone", sentAhead)).toBe(false);
  expect(doesTheGraphShowTheStudioSentAhead(subgraphHolding(sentAhead), "uuid-halftone", sentAhead)).toBe(true);
});

describe("editing_inside_a_subgraph", () => {
  test("each_action_names_the_level_and_the_streams_own_level_names_none", () => {
    const wired = pinsWiredEdits(edited(), { node_id: "pattern", pin: "video" }, { node_id: "halftone", pin: "frames" });
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
  const sentAhead = { ...PATTERN.studio, collapsed: true };
  const graphShowing = (studio: StreamGraphNode["studio"]) => ({ ...GRAPH, nodes: [{ ...PATTERN, studio }, HALFTONE, DISPLAY] });
  expect(doesTheGraphShowTheStudioSentAhead(GRAPH, "uuid-pattern", sentAhead)).toBe(false);
  expect(doesTheGraphShowTheStudioSentAhead(graphShowing(sentAhead), "uuid-pattern", sentAhead)).toBe(true);
  expect(doesTheGraphShowTheStudioSentAhead(graphShowing({ ...sentAhead, colour: "#ff0000" }), "uuid-pattern", sentAhead)).toBe(true);
});

describe("placing_a_node", () => {
  test("a_node_placed_with_tab_is_added_at_the_pointer_under_the_label_later_operations_name_it_by", () => {
    expect(nodePlacedEdits(edited(), BLUR, { x: 120.6, y: 80 }, null)).toEqual([
      { operation: "add_node", stream: STREAM_ASSET, type: "nodes.blur:GaussianBlur", studio: { position: [121, 80] }, as: "placed" },
    ]);
  });

  test("a_node_placed_off_an_output_wire_links_it_to_the_first_input_of_that_family_in_the_same_transaction", () => {
    expect(nodePlacedEdits(edited(), BLUR, { x: 0, y: 0 }, { node_id: "pattern", pin: "video", side: "output", family: "image" })).toEqual([
      { operation: "add_node", stream: STREAM_ASSET, type: "nodes.blur:GaussianBlur", studio: { position: [0, 0] }, as: "placed" },
      { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "placed", port: "video_in" } },
    ]);
  });

  test("a_node_placed_off_an_input_wire_feeds_it_from_its_first_output_of_that_family", () => {
    expect(nodePlacedEdits(edited(), BLUR, { x: 0, y: 0 }, { node_id: "display", pin: "video", side: "input", family: "image" })[1]).toEqual({
      operation: "connect",
      stream: STREAM_ASSET,
      source: { node: "placed", port: "video_out" },
      target: { node: "uuid-display", port: "video" },
    });
  });

  test("a_type_with_no_port_of_the_wires_family_cannot_take_the_wire", () => {
    expect(canANodeTypeTakeTheLooseWire(BLUR, { side: "output", family: "image" })).toBe(true);
    expect(canANodeTypeTakeTheLooseWire(catalogEntry("nodes.meter:Meter", [["level", "array"]], []), { side: "output", family: "image" })).toBe(false);
    expect(canANodeTypeTakeTheLooseWire(catalogEntry("nodes.meter:Meter", [["level", "array"]], []), { side: "input", family: "array" })).toBe(false);
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

test("a_card_let_go_over_a_link_is_spliced_in_by_its_first_ports_of_the_links_family_and_one_without_them_asks_nothing", () => {
  expect(cardLetGoOverALinkEdits(edited(), "halftone", "L1")).toEqual([
    { operation: "disconnect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-display", port: "video" } },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-halftone", port: "image" }, target: { node: "uuid-display", port: "video" } },
  ]);
  const meterOnly = edited({ ...GRAPH, nodes: [...GRAPH.nodes, graphNode("meter", "uuid-meter", { inputs: [["level", "array"]] })] });
  expect(cardLetGoOverALinkEdits(meterOnly, "meter", "L1")).toEqual([]);
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
  const framed = edited({ ...GRAPH, groups: [{ id: group, title: "Frame", description: null, colour: "#6f9bff" }] });
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
  const framed = edited({ ...GRAPH, groups: [{ id: group, title: "Frame", description: null, colour: null }] });
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
  const collapsed = edited({ ...GRAPH, nodes: [{ ...DISPLAY, studio: { ...NODE_STUDIO_FIELDS_NONE_SET, collapsed: true } }] });
  expect(cardCollapsedEdits(collapsed, "display", true)).toEqual([]);
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
