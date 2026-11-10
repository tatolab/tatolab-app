import { describe, expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type NodeCatalogEntry, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  canANodeTypeTakeTheLooseWire,
  cardLetGoOverALinkEdits,
  cardsMovedEdits,
  deletedEdits,
  editedStreamGraphOf,
  nodePlacedEdits,
  noteChangedEdits,
  notePlacedEdits,
  pinsWiredEdits,
  selectionFramedEdits,
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
    config: {},
    pins: {},
    input_ports: declared(ports.inputs),
    output_ports: declared(ports.outputs),
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    studio,
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
        { node_id: "pattern", position: { x: 40.4, y: -12.6 } },
        { node_id: "halftone", position: { x: 300, y: 20 } },
      ]),
    ).toEqual([
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-pattern", studio: { position: [40, -13], comment: "the source", metadata: { pinned: true } } },
      { operation: "set_studio_fields", stream: STREAM_ASSET, node: "uuid-halftone", studio: { position: [300, 20] } },
    ]);
    expect(cardsMovedEdits(edited(), [{ node_id: "pattern", position: { x: 0.2, y: 0 } }])).toEqual([]);
  });
});

test("a_wire_drawn_between_pins_connects_them_by_node_uuid", () => {
  expect(pinsWiredEdits(edited(), { node_id: "pattern", pin: "video" }, { node_id: "halftone", pin: "frames" })).toEqual([
    { operation: "connect", stream: STREAM_ASSET, source: { node: "uuid-pattern", port: "video" }, target: { node: "uuid-halftone", port: "frames" } },
  ]);
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
