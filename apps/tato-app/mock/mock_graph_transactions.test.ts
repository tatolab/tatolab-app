import { expect, test } from "vitest";
import { applyMockGraphTransaction, configHoldingTheDefaultNameOfAGraphPortOrVariable, graphActionApplyingTheHistoryOperation, isAHistoryOperationTheMockMakesAgainFromTheEditInside, isAJsonObject, MockGraphEditNotApplicable, thePlacementsOfTheStream, type MockStreamGraphTarget } from "./mock_graph_transactions";
import { MOCK_RECORDED_NODE_TYPES } from "./mock_recordings";
import { nodeTypeDescriptionsByType } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { JsonValue, ListedStream, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import { mockNodeIdOf, type MockGraphNode, type MockStreamGraph } from "./mock_stream_fixtures";
import { mockStreamGraphOf } from "./mock_stream_graph_document";

const STREAM_ASSET = "a-stream-asset";
const STREAM_ID = "pulse-stage-main-1a2b3c";

function aCanvasAlone(): MockStreamGraph {
  return {
    nodes: [
      {
        name: "canvas",
        type: "imports/core-nodes/core_nodes.solid_color:SolidColor",
        state: "Running",
        config: {},
        input_ports: [],
        output_ports: [{ name: "image", family: "image", stream_facts: null, values_checked: null, pin: null, value_read: null }],
      },
    ],
    links: [],
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
  };
}

function targetsOf(graph: MockStreamGraph): ReadonlyMap<string, MockStreamGraphTarget> {
  return new Map([[STREAM_ASSET, { stream_id: STREAM_ID, graph }]]);
}

/** Every node type Pulse Stage's recording describes. */
const NODE_TYPES_DESCRIBED = [...nodeTypeDescriptionsByType(MOCK_RECORDED_NODE_TYPES.pulse_stage.described.node_types).values()];

/** The ports of the nodes this file's edits removed, as one mock runtime keeps them. */
const portsOfTheNodesRemoved = new Map<string, Pick<MockGraphNode, "input_ports" | "output_ports">>();

/** `operations` applied to `graph`, each node added with the ports the recorded description gives its type. */
function apply(graph: MockStreamGraph, operations: readonly StreamGraphAction[], ...rest: [applying?: "a_transaction" | "a_live_transaction" | "undo_or_redo", historyOperationsReplayed?: readonly JsonValue[]]) {
  return applyMockGraphTransaction(targetsOf(graph), { nodeTypesDescribed: NODE_TYPES_DESCRIBED, portsOfTheNodesRemoved }, operations, ...rest);
}

const CANVAS = mockNodeIdOf(STREAM_ID, "canvas");
/** Pulse Stage's `GlowBlur`, which reads pictures on `image`: a node type the recording describes. */
const GLOW_BLUR = "nodes.looks:GlowBlur";
/** Pulse Stage's `ClickTrack`, whose `volume` is a setting: a node type the recording describes. */
const CLICK_TRACK = "nodes.click_track:ClickTrack";
/** Pulse Stage's `ClickCue`, which reads an Integer `count` and a Boolean `downbeat`: a node type the recording describes. */
const CLICK_CUE = "nodes.beat:ClickCue";

test("a node added under `as` is wired by that label in the same transaction, and its config set by its id after", () => {
  const graph = aCanvasAlone();
  const added = apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, as: "blur" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: CANVAS, port: "image" }, target: { node: "blur", port: "image" } },
  ]);
  expect(added.transaction.added_nodes).toEqual([{ stream: STREAM_ID, node: mockNodeIdOf(STREAM_ID, "glowblur"), name: "glowblur", as: "blur" }]);
  expect(graph.links).toMatchObject([{ source_node: "canvas", source_port: "image", target_node: "glowblur", target_port: "image", state: "wired" }]);
  const blur = mockNodeIdOf(STREAM_ID, "glowblur");
  expect(added.transaction.connected_links).toEqual([{ stream: STREAM_ID, source: { node: CANVAS, port: "image" }, target: { node: blur, port: "image" }, state: "wired", error_reason: null }]);
  expect(added.history_operations[1]).toEqual({ stream: STREAM_ASSET, operation: "connect", link: { source: { node: CANVAS, port: "image" }, target: { node: blur, port: "image" } } });
  expect(added.inverse_operations).toEqual([
    { stream: STREAM_ASSET, operation: "disconnect", link: { source: { node: CANVAS, port: "image" }, target: { node: blur, port: "image" } } },
    { stream: STREAM_ASSET, operation: "remove_node", node: blur },
  ]);

  apply(graph, [{ operation: "set_node_config", stream: STREAM_ASSET, node: CANVAS, config: { width: 640 } }]);
    expect(graph.nodes[0]?.config).toEqual({ width: 640 });
});

test("an edit the mock cannot apply is the sender's defect, thrown by name, and leaves every graph as it was", () => {
  const graph = aCanvasAlone();
  expect(() =>
    apply(graph, [
      { operation: "set_node_config", stream: STREAM_ASSET, node: CANVAS, config: { width: 640 } },
      { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:MicrophoneSource", as: "mic" },
    ]),
  ).toThrow(new MockGraphEditNotApplicable("the recorded node types describe no node type `tatolab.stream:MicrophoneSource`"));
  expect(graph).toEqual(aCanvasAlone());
  expect(() => apply(graph, [{ operation: "set_pin_value", stream: STREAM_ASSET, node: CANVAS, input: "level", value: 1 }])).toThrow(MockGraphEditNotApplicable);
  expect(() => apply(graph, [{ operation: "use_dependency_stream", stream: STREAM_ASSET, project: "p", dependency_stream: "d" }])).toThrow("the mock does not apply `use_dependency_stream`");
});

test("a link is made as asked, the mock judging no family or pin of its ends, a typed port added with the pin type its description states and no family", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: CLICK_CUE, as: "cue" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: CANVAS, port: "image" }, target: { node: "cue", port: "count" } },
  ]);
  expect(graph.links).toMatchObject([{ source_node: "canvas", source_port: "image", target_node: "clickcue", target_port: "count", state: "wired" }]);
  expect(graph.nodes[1]?.input_ports.map((port) => [port.name, port.family, port.pin])).toEqual([
    ["count", null, { pin_type: { type: "integer" }, flow: "value" }],
    ["downbeat", null, { pin_type: { type: "boolean" }, flow: "value" }],
  ]);
});

test("a renamed node keeps its id, and each change answers its `from` as the runtime does, its inverse swapping `from` and `to`", () => {
  const graph = aCanvasAlone();
  const renamed = apply(graph, [{ operation: "rename_node", stream: STREAM_ASSET, node: CANVAS, name: "Backdrop" }]);
  expect(renamed.transaction.operations).toEqual([{ operation: "rename_node", node: CANVAS, from: "canvas", to: "backdrop", stream: STREAM_ID }]);
  expect(renamed.inverse_operations).toEqual([{ stream: STREAM_ASSET, operation: "rename_node", node: CANVAS, from: "backdrop", to: "canvas" }]);

  const configured = apply(graph, [{ operation: "set_node_config", stream: STREAM_ASSET, node: CANVAS, config: { width: 640 } }]);
  expect(configured.history_operations).toEqual([{ stream: STREAM_ASSET, operation: "set_node_config", node: CANVAS, from: {}, to: { width: 640 } }]);
  expect(graph.nodes[0]).toMatchObject({ name: "backdrop", config: { width: 640 } });
});

test("an operation history records is turned back into the graph action that applies it, so an undo or a redo changes the mock graph", () => {
  const graph = aCanvasAlone();
  const removed = apply(graph, [{ operation: "remove_node", stream: STREAM_ASSET, node: CANVAS }]);
  expect(graph.nodes).toEqual([]);
  const restoring = removed.inverse_operations.map(graphActionApplyingTheHistoryOperation);
  expect(restoring).toEqual([{ operation: "add_node", stream: STREAM_ASSET, type: "imports/core-nodes/core_nodes.solid_color:SolidColor", name: "canvas", as: CANVAS, config: {}, pins: {} }]);
  apply(graph, restoring.flatMap((action) => (action === null ? [] : [action])), "undo_or_redo");
    expect(graph.nodes.map((node) => node.name)).toEqual(["canvas"]);
  expect(graphActionApplyingTheHistoryOperation({ operation: "import_asset", asset: {} })).toBeNull();
});

test("a node of a type the recording does not describe, removed and added back by its undo, keeps the ports it had", () => {
  const graph = aCanvasAlone();
  const spotlightPorts = { input_ports: [{ name: "picture", family: "image" as const, stream_facts: null, values_checked: null, pin: null, value_read: null }], output_ports: [] };
  graph.nodes.push({ name: "spotlight", type: "nodes.spotlight:Spotlight", state: "Running", config: {}, ...structuredClone(spotlightPorts) });
  const spotlight = mockNodeIdOf(STREAM_ID, "spotlight");
  const removed = apply(graph, [{ operation: "remove_node", stream: STREAM_ASSET, node: spotlight }]);
  const restoring = removed.inverse_operations.map(graphActionApplyingTheHistoryOperation).flatMap((action) => (action === null ? [] : [action]));
  expect(() => applyMockGraphTransaction(targetsOf(graph), { nodeTypesDescribed: NODE_TYPES_DESCRIBED, portsOfTheNodesRemoved: new Map() }, restoring, "undo_or_redo")).toThrow(MockGraphEditNotApplicable);
  apply(graph, restoring, "undo_or_redo");
  expect(graph.nodes.find((node) => node.name === "spotlight")).toMatchObject({ type: "nodes.spotlight:Spotlight", ...spotlightPorts });
});

test("a node's studio fields are replaced whole, unknown keys kept under metadata, and a wrong-shaped position is a defect", () => {
  const graph = aCanvasAlone();
  const moved = apply(graph, [{ operation: "set_studio_fields", stream: STREAM_ASSET, node: CANVAS, studio: { position: [40, 80], pinned: true } }]);
  expect(graph.nodes[0]?.studio).toEqual({ position: [40, 80], group: null, comment: null, colour: null, collapsed: null, metadata: { pinned: true } });
  expect(moved.inverse_operations).toEqual([{ stream: STREAM_ASSET, operation: "set_studio_fields", node: CANVAS, from: { contract: 1, position: [40, 80], metadata: { pinned: true } }, to: { contract: 1 } }]);
  expect(moved.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "set_studio_fields", stream: STREAM_ASSET, node: CANVAS, studio: { contract: 1 } }]);
  expect(() => apply(graph, [{ operation: "set_studio_fields", stream: STREAM_ASSET, node: CANVAS, studio: { position: [1] } }])).toThrow(MockGraphEditNotApplicable);
});

test("a group frames its nodes until it is removed, and a note is added, changed and removed", () => {
  const graph = aCanvasAlone();
  const grouped = apply(graph, [{ operation: "add_group", stream: STREAM_ASSET, title: "Frame", nodes: [CANVAS] }]);
  const group = grouped.transaction.added_groups[0]?.group ?? "";
  expect(graph.groups).toEqual([{ id: group, title: "Frame" }]);
  expect(graph.nodes[0]?.studio?.group).toBe(group);
  const described = apply(graph, [{ operation: "set_group_fields", stream: STREAM_ASSET, group, description: "The source", colour: "#3fcf8e" }]);
  expect(graph.groups).toEqual([{ id: group, title: "Frame", description: "The source", colour: "#3fcf8e" }]);
  expect(described.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "set_group_fields", stream: STREAM_ASSET, group, title: "Frame", description: "" }]);
  const ungrouped = apply(graph, [{ operation: "remove_group", stream: STREAM_ASSET, group }]);
  expect(graph.groups).toEqual([]);
  expect(graph.nodes[0]?.studio?.group).toBeNull();
  expect(ungrouped.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "add_group", stream: STREAM_ASSET, title: "Frame", description: "The source", colour: "#3fcf8e", nodes: [CANVAS] }]);

  const noted = apply(graph, [{ operation: "add_note", stream: STREAM_ASSET, text: "Note", position: [10, 20], size: [220, 110] }]);
  const note = noted.transaction.added_notes[0]?.note ?? "";
  apply(graph, [{ operation: "set_note_fields", stream: STREAM_ASSET, note, text: "Tune here" }]);
  expect(graph.notes).toEqual([{ id: note, text: "Tune here", position: [10, 20], size: [220, 110] }]);
  const unnoted = apply(graph, [{ operation: "remove_note", stream: STREAM_ASSET, note }]);
  expect(graph.notes).toEqual([]);
  expect(unnoted.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "add_note", stream: STREAM_ASSET, text: "Tune here", position: [10, 20], size: [220, 110] }]);
  const restoring = unnoted.inverse_operations.map(graphActionApplyingTheHistoryOperation).flatMap((action) => (action === null ? [] : [action]));
  apply(graph, restoring, "undo_or_redo", unnoted.inverse_operations);
  expect(graph.notes?.map((restored) => restored.id)).toEqual([note]);
});

test("a collapsed node is saved as a stream the subgraph places, wired through its Graph Input, and its undo unlocks it, wiring the node back", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, as: "blur" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: CANVAS, port: "image" }, target: { node: "blur", port: "image" } },
  ]);
  const blur = mockNodeIdOf(STREAM_ID, "glowblur");

  const collapsed = apply(graph, [{ operation: "collapse_selection_into_subgraph", stream: STREAM_ASSET, nodes: [blur], name: "Output" }]);
  expect(graph.nodes.map((node) => node.name)).toEqual(["canvas", "output"]);
  const placing = graph.nodes[1] ?? expect.unreachable("no subgraph");
  const placedStream = assetPlacedBy(placing);
  expect(placing).toMatchObject({ type: "tatolab.project:StreamFragment", config: { stream: { asset: placedStream } } });
  expect(graph.links).toMatchObject([{ source_node: "canvas", source_port: "image", target_node: "output", target_port: "glowblur-image" }]);
  expect(placing.fragment?.nodes.map((node) => node.name)).toEqual(["glowblur", "glowblur-image"]);
  expect(placing.input_ports.map((port) => [port.name, port.family])).toEqual([["glowblur-image", "image"]]);
  expect(collapsed.history_operations).toMatchObject([
    { operation: "create_stream_document", stream: placedStream, path: "streams/output.graph.json" },
    { operation: "fold_into_fragment", stream: STREAM_ASSET, placed_stream: placedStream },
  ]);
  const created = collapsed.history_operations[0];
  expect(thePlacementsOfTheStream(placedStream, targetsOf(graph))).toEqual({ holdingStreams: [STREAM_ASSET], document: isAJsonObject(created) ? created["document"] : null });

  const undo = collapsed.inverse_operations.filter((operation) => !isAHistoryOperationTheMockMakesAgainFromTheEditInside(operation)).map(graphActionApplyingTheHistoryOperation);
  expect(undo).toEqual([{ operation: "unlock_subgraph", stream: STREAM_ASSET, fragment: mockNodeIdOf(STREAM_ID, "output") }]);
  apply(graph, undo.flatMap((action) => (action === null ? [] : [action])));
  expect(graph.nodes.map((node) => node.name)).toEqual(["canvas", "glowblur"]);
  expect(graph.links).toMatchObject([{ source_node: "canvas", source_port: "image", target_node: "glowblur", target_port: "image" }]);
});

test("a node takes a setting as the input its description lists, fed by a Graph Input of the family asked, and its undo puts it back", () => {
  const graph = aCanvasAlone();
  apply(graph, [{ operation: "add_node", stream: STREAM_ASSET, type: CLICK_TRACK, as: "click" }]);
  const click = mockNodeIdOf(STREAM_ID, "clicktrack");
  const exposed = apply(graph, [
    { operation: "set_exposed_config_fields", stream: STREAM_ASSET, node: click, exposed_config_fields: ["volume"] },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", name: "clicktrack_volume", config: { port: "clicktrack_volume", family: "channels" }, as: "graph_input" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "graph_input", port: "value" }, target: { node: click, port: "volume" } },
  ]);
  const clickNode = graph.nodes.find((node) => node.name === "clicktrack") ?? expect.unreachable("no click track");
  expect(clickNode.exposed_config_fields).toEqual(["volume"]);
  expect(clickNode.input_ports.map((port) => port.name)).toEqual(["cue", "volume"]);
  expect(graph.nodes.find((node) => node.name === "clicktrack_volume")).toMatchObject({ state: null, input_ports: [], output_ports: [{ name: "value", family: "channels" }] });
  expect(graph.links).toMatchObject([{ source_node: "clicktrack_volume", target_node: "clicktrack", target_port: "volume", state: "wired" }]);
  expect(exposed.inverse_operations.map((operation) => graphActionApplyingTheHistoryOperation(operation)?.operation)).toEqual(["disconnect", "remove_node", "set_exposed_config_fields"]);
});

test("a Graph Input, Graph Output or Set Variable added with no name takes the next free one, and a Get Variable reads the last setter's", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { family: "channels" } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { family: "records" } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { port: "brightness", family: "channels" } },
  ]);
  expect(graph.nodes.filter((node) => node.type === "tatolab.stream:GraphInput").map((node) => node.config["port"])).toEqual(["input1", "input2", "brightness"]);

  graph.nodes.push(
    { name: "graphoutput", type: "tatolab.stream:GraphOutput", state: null, config: { port: "Output1", family: "image" }, input_ports: [], output_ports: [] },
    { name: "setvariable", type: "tatolab.stream:SetVariable", state: null, config: { variable: "var1" }, input_ports: [], output_ports: [] },
    { name: "setvariable-2", type: "tatolab.stream:SetVariable", state: null, config: { variable: "blur" }, input_ports: [], output_ports: [] },
  );
  const named = (type: string) => configHoldingTheDefaultNameOfAGraphPortOrVariable(type, {}, graph.nodes);
  expect(named("tatolab.stream:GraphOutput")).toEqual({ port: "output2" });
  expect(named("tatolab.stream:SetVariable")).toEqual({ variable: "var2" });
  expect(named("tatolab.stream:GetVariable")).toEqual({ variable: "blur" });
  expect(configHoldingTheDefaultNameOfAGraphPortOrVariable("tatolab.stream:GetVariable", {}, [])).toEqual({});
  expect(named(GLOW_BLUR)).toEqual({});
});

test("a Graph Input added with no family carries none, a link leaving it so", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", as: "graph_input" },
    { operation: "add_node", stream: STREAM_ASSET, type: CLICK_CUE, as: "cue" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "graph_input", port: "value" }, target: { node: "cue", port: "count" } },
  ]);
  expect(graph.nodes.find((node) => node.type === "tatolab.stream:GraphInput")).toMatchObject({ config: { port: "input1" }, output_ports: [{ name: "value", family: null }] });
});

/** The stream asset `placing`, a Stream Fragment node, places. */
function assetPlacedBy(placing: MockGraphNode): string {
  const placed = placing.config["stream"];
  return isAJsonObject(placed) && typeof placed["asset"] === "string" ? placed["asset"] : expect.unreachable("the node places no stream");
}

/** `aCanvasAlone` with its source saved as the stream `look`, which `look` and `look-again` both place, each wired to a blur through the stream's one port. */
function aLookPlacedTwice(): { graph: MockStreamGraph; placedStream: string; look: string } {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, as: "blur" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: CANVAS, port: "image" }, target: { node: "blur", port: "image" } },
    { operation: "collapse_selection_into_subgraph", stream: STREAM_ASSET, name: "look", nodes: [CANVAS] },
  ]);
  const look = graph.nodes.find((node) => node.name === "look") ?? expect.unreachable("no look");
  graph.nodes.push({ ...structuredClone(look), name: "look-again" });
  graph.nodes.push({ name: "glowblur-2", type: GLOW_BLUR, state: "Running", config: {}, input_ports: [{ name: "image", family: "image", stream_facts: null, values_checked: null, pin: null, value_read: null }], output_ports: [] });
  graph.links.push({ id: "Lagain", source_node: "look-again", source_port: "canvas-image", target_node: "glowblur-2", target_port: "image", state: "wired" });
  return { graph, placedStream: assetPlacedBy(look), look: mockNodeIdOf(STREAM_ID, "look") };
}

test("an edit at a placed stream's level reaches every placement, is recorded on that stream, and its undo, naming that stream, undoes it at both", () => {
  const { graph, placedStream, look } = aLookPlacedTwice();
  const added = apply(graph, [{ operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, name: "preview", level: [look] }]);
  const insideOf = (name: string) => graph.nodes.find((node) => node.name === name)?.fragment?.nodes.map((node) => node.name);
  expect(insideOf("look")).toEqual(["canvas", "canvas-image", "preview"]);
  expect(insideOf("look-again")).toEqual(["canvas", "canvas-image", "preview"]);
  expect(added.history_operations).toMatchObject([{ stream: placedStream, operation: "add_node", node: { name: "preview" } }]);

  const undo = added.inverse_operations.map(graphActionApplyingTheHistoryOperation);
  expect(undo).toEqual([{ operation: "remove_node", stream: placedStream, node: mockNodeIdOf(STREAM_ID, "preview") }]);
  apply(graph, undo.flatMap((action) => (action === null ? [] : [action])), "undo_or_redo");
    expect(insideOf("look")).toEqual(["canvas", "canvas-image"]);
  expect(insideOf("look-again")).toEqual(["canvas", "canvas-image"]);
});

test("renaming a placed stream's Graph Output port carries the links onto that port at every placement, and removing the node takes them out", () => {
  const { graph, placedStream, look } = aLookPlacedTwice();
  const graphOutput = mockNodeIdOf(STREAM_ID, "canvas-image");
  const renamed = apply(graph, [{ operation: "set_node_config", stream: STREAM_ASSET, node: graphOutput, config: { port: "picture", family: "image" }, level: [look] }]);
  expect(graph.nodes.find((node) => node.name === "look-again")?.output_ports.map((port) => port.name)).toEqual(["picture"]);
  expect(graph.links.map((link) => [link.source_node, link.source_port, link.target_node])).toEqual([
    ["look", "picture", "glowblur"],
    ["look-again", "picture", "glowblur-2"],
  ]);
  expect(renamed.history_operations.at(-1)).toMatchObject({ stream: STREAM_ASSET, operation: "carry_the_links_onto_the_ports_of_a_placed_stream", placed_stream: placedStream });

  const unlockedGraph = structuredClone(graph);
  apply(unlockedGraph, [{ operation: "unlock_subgraph", stream: STREAM_ASSET, fragment: look }]);
  expect(unlockedGraph.links.map((link) => [link.source_node, link.source_port, link.target_node])).toContainEqual(["canvas", "image", "glowblur"]);

  apply(graph, [{ operation: "remove_node", stream: STREAM_ASSET, node: graphOutput, level: [look] }]);
  expect(graph.links).toEqual([]);
  expect(graph.nodes.find((node) => node.name === "look")?.output_ports).toEqual([]);
});

test("an edit at the level of a generated subgraph, or of an import's placed stream, is a defect naming why", () => {
  const graph = aCanvasAlone();
  graph.nodes.push({ name: "glow", type: "nodes.looks:glow_look", state: null, config: {}, input_ports: [], output_ports: [], fragment: { nodes: [], links: [], groups: [] } });
  graph.nodes.push({ name: "grain", type: "tatolab.project:StreamFragment", state: null, config: { stream: { asset: "grain-asset", from: "an-import" } }, input_ports: [], output_ports: [], fragment: { nodes: [], links: [], groups: [] } });
  const glow = mockNodeIdOf(STREAM_ID, "glow");
  expect(() => apply(graph, [{ operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, level: [glow] }])).toThrow("unlock it with unlock_subgraph");
  expect(() => apply(graph, [{ operation: "add_node", stream: STREAM_ASSET, type: GLOW_BLUR, level: [mockNodeIdOf(STREAM_ID, "grain")] }])).toThrow("places a stream of the import");
});

test("a value set by either operation is the value its input reads, live on the running node alone, saved on its pins too, a live value taken off back to the saved one, and the saved one taken off back to its default", () => {
  const graph = aCanvasAlone();
  graph.nodes[0] = {
    ...graph.nodes[0],
    input_defaults: { level: 1 },
    input_ports: [{ name: "level", family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "float" }, flow: "value" }, value_read: { value: 1, comes_from: "default" } }],
  };
  const level = () => graph.nodes[0]?.input_ports[0]?.value_read;
  const pins = () => graph.nodes[0]?.pins;
  const setLevel = (action: "set_pin_value" | "set_node_input_value", value: number | null, applying: "a_transaction" | "a_live_transaction" = "a_transaction") =>
    apply(graph, [{ operation: action, stream: STREAM_ASSET, node: CANVAS, input: "level", value }], applying);

  setLevel("set_pin_value", 0.5);
  expect([level(), pins()]).toEqual([{ value: 0.5, comes_from: "saved" }, { level: 0.5 }]);
  setLevel("set_node_input_value", 0.25, "a_live_transaction");
  expect([level(), pins()]).toEqual([{ value: 0.25, comes_from: "live" }, { level: 0.5 }]);
  setLevel("set_node_input_value", 0.75);
  expect([level(), pins()]).toEqual([{ value: 0.75, comes_from: "saved" }, { level: 0.75 }]);
  setLevel("set_node_input_value", 0.25, "a_live_transaction");
  setLevel("set_node_input_value", null, "a_live_transaction");
  expect([level(), pins()]).toEqual([{ value: 0.75, comes_from: "saved" }, { level: 0.75 }]);
  setLevel("set_pin_value", null);
  expect([level(), pins()]).toEqual([{ value: 1, comes_from: "default" }, {}]);
});

test("a Trigger input is fired by a live set with no value, which stores nothing, and refused a value, a commit, or a link feeding it, as the runtime refuses them", () => {
  const graph = aCanvasAlone();
  const [canvas] = graph.nodes;
  if (canvas === undefined) throw new Error("the graph holds no canvas");
  canvas.input_ports = [{ name: "flash", family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "trigger" }, flow: "trigger" }, value_read: null }];
  const fire = (value: number | null, applying: "a_transaction" | "a_live_transaction" = "a_live_transaction") =>
    apply(graph, [{ operation: "set_node_input_value", stream: STREAM_ASSET, node: CANVAS, input: "flash", value }], applying);

  const fired = fire(null);
  expect([fired.history_operations, fired.inverse_operations, canvas.input_ports[0]?.value_read, canvas.pins]).toEqual([[], [], null, undefined]);
  expect(() => fire(1)).toThrow(/is a Trigger, which carries an event and no value/);
  expect(() => fire(null, "a_transaction")).toThrow(/holds no value to save/);
  graph.links.push({ id: "Lflashfeed0000000000000001", source_node: "canvas", source_port: "image", target_node: "canvas", target_port: "flash", state: "wired" });
  expect(() => fire(null)).toThrow(/is a Trigger a link feeds/);
});

/** The listing of the stream `apply` edits, as `list_streams` lists it while it plays. */
const LISTED: ListedStream = {
  stream: STREAM_ID,
  display_name: "main",
  location: null,
  state: "running",
  node_count: null,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  condition: null,
  action: null,
  step: null,
};

test("a Graph Input that chooses a pin type carries it on its value ports, serving the annotations its settings state on its value input, which reads the value it saves", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: CLICK_CUE, as: "cue" },
    {
      operation: "add_node",
      stream: STREAM_ASSET,
      type: "tatolab.stream:GraphInput",
      name: "clickcue_count",
      config: { port: "clickcue_count", pin_type: { type: "integer" }, family: "channels", range: [1, 8], step: 1, control: "dial", value: 4 },
      as: "graph_input",
    },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "graph_input", port: "value" }, target: { node: "cue", port: "count" } },
  ]);
  const rendered = mockStreamGraphOf(LISTED, "mock-machine", graph, { hasSettled: true, secondsSinceSettled: 0 }, true);
  const graphInput = rendered.nodes.find((node) => node.name === "clickcue_count") ?? expect.unreachable("no Graph Input");

  expect(graphInput.ports.inputs).toMatchObject([
    { name: "value", pin_type: { type: "integer" }, flow: "value", annotations: { range: { minimum: 1, maximum: 8 }, step: 1, control: "dial" }, value: 4, value_comes_from: "saved" },
  ]);
  expect(graphInput.ports.outputs).toMatchObject([{ name: "value", pin_type: { type: "integer" }, flow: "value", family: { family: "channels" } }]);
  expect(graphInput.ports.outputs[0]).not.toHaveProperty("annotations");
});

test("a running top-level Graph Input of no type declares the value its config saves as `value`, and none from a `default` in its config", () => {
  const graph = aCanvasAlone();
  apply(graph, [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", name: "brightness", config: { port: "brightness", family: "channels", value: 0.8, default: 0.2 } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", name: "contrast", config: { port: "contrast", family: "channels", default: 0.2 } },
  ]);
  for (const node of graph.nodes) node.state = "Running";
  const rendered = mockStreamGraphOf(LISTED, "mock-machine", graph, { hasSettled: true, secondsSinceSettled: 0 }, true);
  const interfaceOf = (name: string) => rendered.nodes.find((node) => node.name === name)?.components.graph_interface;

  expect(interfaceOf("brightness")).toEqual({ direction: "input", port: "brightness", family: "channels", current_value: 0.8 });
  expect(interfaceOf("contrast")).toEqual({ direction: "input", port: "contrast", family: "channels" });
});
