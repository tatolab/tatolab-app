import { expect, test } from "vitest";
import { applyMockGraphTransaction, configHoldingTheDefaultNameOfAGraphPortOrVariable, graphActionApplyingTheHistoryOperation, isAHistoryOperationTheMockMakesAgainFromTheEditInside, isAJsonObject, thePlacementsOfTheStream, type MockStreamGraphTarget } from "./mock_graph_transactions";
import { mockNodeIdOf, type MockGraphNode, type MockStreamGraph } from "./mock_stream_fixtures";

const STREAM_ASSET = "a-stream-asset";
const STREAM_ID = "pattern-main-1a2b3c";

function aTestPatternAlone(): MockStreamGraph {
  return {
    nodes: [
      {
        name: "testpatternsource",
        type: "tatolab.stream:TestPatternSource",
        state: "Running",
        config: {},
        input_ports: [],
        output_ports: [{ name: "video", family: "image", stream_facts: null, values_checked: null }],
      },
    ],
    links: [],
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
  };
}

function targetsOf(graph: MockStreamGraph): ReadonlyMap<string, MockStreamGraphTarget> {
  return new Map([[STREAM_ASSET, { stream_id: STREAM_ID, graph }]]);
}

const TEST_PATTERN = mockNodeIdOf(STREAM_ID, "testpatternsource");

test("a node added under `as` is wired by that label in the same transaction, and its config set by its id after", () => {
  const graph = aTestPatternAlone();
  const added = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: TEST_PATTERN, port: "video" }, target: { node: "window", port: "video" } },
  ]);
  if (added.kind !== "applied") return expect.unreachable(added.refusal.runtime_words);
  expect(added.transaction.added_nodes).toEqual([{ stream: STREAM_ID, node: mockNodeIdOf(STREAM_ID, "displaywindow"), name: "displaywindow", as: "window" }]);
  expect(graph.links).toMatchObject([{ source_node: "testpatternsource", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" }]);
  const window = mockNodeIdOf(STREAM_ID, "displaywindow");
  expect(added.transaction.connected_links).toEqual([{ stream: STREAM_ID, source: { node: TEST_PATTERN, port: "video" }, target: { node: window, port: "video" }, state: "wired", error_reason: null }]);
  expect(added.history_operations[1]).toEqual({ stream: STREAM_ASSET, operation: "connect", link: { source: { node: TEST_PATTERN, port: "video" }, target: { node: window, port: "video" } } });
  expect(added.inverse_operations).toEqual([
    { stream: STREAM_ASSET, operation: "disconnect", link: { source: { node: TEST_PATTERN, port: "video" }, target: { node: window, port: "video" } } },
    { stream: STREAM_ASSET, operation: "remove_node", node: window },
  ]);

  const configured = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_node_config", stream: STREAM_ASSET, node: TEST_PATTERN, config: { width: 640 } }]);
  expect(configured.kind).toBe("applied");
  expect(graph.nodes[0]?.config).toEqual({ width: 640 });
});

test("a refused operation leaves every graph as it was, naming the operation, the link and the runtime's words", () => {
  const graph = aTestPatternAlone();
  const refused = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "set_node_config", stream: STREAM_ASSET, node: TEST_PATTERN, config: { width: 640 } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:MicrophoneSource", as: "mic" },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "mic", port: "audio" }, target: { node: "window", port: "video" } },
  ]);
  expect(refused).toMatchObject({ kind: "refused", refusal: { action: "transact", refused_operation_index: 3, refused_link: { source: { node: "mic", port: "audio" }, target: { node: "window", port: "video" } } } });
  expect(graph).toEqual(aTestPatternAlone());
});

test("a pin value is refused on an input the node lacks, and an action the mock does not model is refused by name", () => {
  const graph = aTestPatternAlone();
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_pin_value", stream: STREAM_ASSET, node: TEST_PATTERN, input: "level", value: 1 }])).toMatchObject({
    kind: "refused",
    refusal: { refused_node: TEST_PATTERN, refused_field: "level", runtime_words: "Processor 'testpatternsource' has no input port named 'level'" },
  });
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "use_dependency_stream", stream: STREAM_ASSET, project: "p", dependency_stream: "d" }])).toMatchObject({
    kind: "refused",
    refusal: { runtime_words: "the mock runtime does not apply `use_dependency_stream`" },
  });
});

test("a renamed node keeps its id, and each change answers its `from` as the runtime does, its inverse swapping `from` and `to`", () => {
  const graph = aTestPatternAlone();
  const renamed = applyMockGraphTransaction(targetsOf(graph), [{ operation: "rename_node", stream: STREAM_ASSET, node: TEST_PATTERN, name: "Pattern" }]);
  if (renamed.kind !== "applied") return expect.unreachable(renamed.refusal.runtime_words);
  expect(renamed.transaction.operations).toEqual([{ operation: "rename_node", node: TEST_PATTERN, from: "testpatternsource", to: "pattern", stream: STREAM_ID }]);
  expect(renamed.inverse_operations).toEqual([{ stream: STREAM_ASSET, operation: "rename_node", node: TEST_PATTERN, from: "pattern", to: "testpatternsource" }]);

  const configured = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_node_config", stream: STREAM_ASSET, node: TEST_PATTERN, config: { width: 640 } }]);
  if (configured.kind !== "applied") return expect.unreachable(configured.refusal.runtime_words);
  expect(configured.history_operations).toEqual([{ stream: STREAM_ASSET, operation: "set_node_config", node: TEST_PATTERN, from: {}, to: { width: 640 } }]);
  expect(graph.nodes[0]).toMatchObject({ name: "pattern", config: { width: 640 } });
});

test("an operation history records is turned back into the graph action that applies it, so an undo or a redo changes the mock graph", () => {
  const graph = aTestPatternAlone();
  const removed = applyMockGraphTransaction(targetsOf(graph), [{ operation: "remove_node", stream: STREAM_ASSET, node: TEST_PATTERN }]);
  if (removed.kind !== "applied") return expect.unreachable(removed.refusal.runtime_words);
  expect(graph.nodes).toEqual([]);
  const restoring = removed.inverse_operations.map(graphActionApplyingTheHistoryOperation);
  expect(restoring).toEqual([{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:TestPatternSource", name: "testpatternsource", as: TEST_PATTERN, config: {}, pins: {} }]);
  const restored = applyMockGraphTransaction(targetsOf(graph), restoring.flatMap((action) => (action === null ? [] : [action])), "undo_or_redo");
  expect(restored.kind).toBe("applied");
  expect(graph.nodes.map((node) => node.name)).toEqual(["testpatternsource"]);
  expect(graphActionApplyingTheHistoryOperation({ operation: "import_asset", asset: {} })).toBeNull();
});

test("a node's studio fields are replaced whole, unknown keys kept under metadata, and a wrong-shaped position is refused", () => {
  const graph = aTestPatternAlone();
  const moved = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_studio_fields", stream: STREAM_ASSET, node: TEST_PATTERN, studio: { position: [40, 80], pinned: true } }]);
  if (moved.kind !== "applied") return expect.unreachable(moved.refusal.runtime_words);
  expect(graph.nodes[0]?.studio).toEqual({ position: [40, 80], group: null, comment: null, colour: null, collapsed: null, metadata: { pinned: true } });
  expect(moved.inverse_operations).toEqual([{ stream: STREAM_ASSET, operation: "set_studio_fields", node: TEST_PATTERN, from: { contract: 1, position: [40, 80], metadata: { pinned: true } }, to: { contract: 1 } }]);
  expect(moved.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "set_studio_fields", stream: STREAM_ASSET, node: TEST_PATTERN, studio: { contract: 1 } }]);
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_studio_fields", stream: STREAM_ASSET, node: TEST_PATTERN, studio: { position: [1] } }])).toMatchObject({
    kind: "refused",
    refusal: { refused_node: TEST_PATTERN, refused_field: "position" },
  });
});

test("a group frames its nodes until it is removed, and a note is added, changed and removed", () => {
  const graph = aTestPatternAlone();
  const grouped = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_group", stream: STREAM_ASSET, title: "Frame", nodes: [TEST_PATTERN] }]);
  if (grouped.kind !== "applied") return expect.unreachable(grouped.refusal.runtime_words);
  const group = grouped.transaction.added_groups[0]?.group ?? "";
  expect(graph.groups).toEqual([{ id: group, title: "Frame", description: null, colour: null }]);
  expect(graph.nodes[0]?.studio?.group).toBe(group);
  const described = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_group_fields", stream: STREAM_ASSET, group, description: "The source", colour: "#3fcf8e" }]);
  if (described.kind !== "applied") return expect.unreachable(described.refusal.runtime_words);
  expect(graph.groups).toEqual([{ id: group, title: "Frame", description: "The source", colour: "#3fcf8e" }]);
  expect(described.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "set_group_fields", stream: STREAM_ASSET, group, title: "Frame", description: "" }]);
  const ungrouped = applyMockGraphTransaction(targetsOf(graph), [{ operation: "remove_group", stream: STREAM_ASSET, group }]);
  if (ungrouped.kind !== "applied") return expect.unreachable(ungrouped.refusal.runtime_words);
  expect(graph.groups).toEqual([]);
  expect(graph.nodes[0]?.studio?.group).toBeNull();
  expect(ungrouped.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "add_group", stream: STREAM_ASSET, title: "Frame", description: "The source", colour: "#3fcf8e", nodes: [TEST_PATTERN] }]);

  const noted = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_note", stream: STREAM_ASSET, text: "Note", position: [10, 20], size: [220, 110] }]);
  if (noted.kind !== "applied") return expect.unreachable(noted.refusal.runtime_words);
  const note = noted.transaction.added_notes[0]?.note ?? "";
  expect(applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_note_fields", stream: STREAM_ASSET, note, text: "Tune here" }]).kind).toBe("applied");
  expect(graph.notes).toEqual([{ id: note, text: "Tune here", position: [10, 20], size: [220, 110] }]);
  const unnoted = applyMockGraphTransaction(targetsOf(graph), [{ operation: "remove_note", stream: STREAM_ASSET, note }]);
  if (unnoted.kind !== "applied") return expect.unreachable(unnoted.refusal.runtime_words);
  expect(graph.notes).toEqual([]);
  expect(unnoted.inverse_operations.map(graphActionApplyingTheHistoryOperation)).toEqual([{ operation: "add_note", stream: STREAM_ASSET, text: "Tune here", position: [10, 20], size: [220, 110] }]);
  const restoring = unnoted.inverse_operations.map(graphActionApplyingTheHistoryOperation).flatMap((action) => (action === null ? [] : [action]));
  expect(applyMockGraphTransaction(targetsOf(graph), restoring, "undo_or_redo", unnoted.inverse_operations).kind).toBe("applied");
  expect(graph.notes?.map((restored) => restored.id)).toEqual([note]);
});

test("a collapsed node is saved as a stream the subgraph places, wired through its Graph Input, and its undo unlocks it, wiring the node back", () => {
  const graph = aTestPatternAlone();
  const built = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: TEST_PATTERN, port: "video" }, target: { node: "window", port: "video" } },
  ]);
  if (built.kind !== "applied") return expect.unreachable(built.refusal.runtime_words);
  const window = mockNodeIdOf(STREAM_ID, "displaywindow");

  const collapsed = applyMockGraphTransaction(targetsOf(graph), [{ operation: "collapse_selection_into_subgraph", stream: STREAM_ASSET, nodes: [window], name: "Output" }]);
  if (collapsed.kind !== "applied") return expect.unreachable(collapsed.refusal.runtime_words);
  expect(graph.nodes.map((node) => node.name)).toEqual(["testpatternsource", "output"]);
  const placing = graph.nodes[1] ?? expect.unreachable("no subgraph");
  const placedStream = assetPlacedBy(placing);
  expect(placing).toMatchObject({ type: "tatolab.project:StreamFragment", config: { stream: { asset: placedStream } }, fragment: { kind: "placed_stream" } });
  expect(graph.links).toMatchObject([{ source_node: "testpatternsource", source_port: "video", target_node: "output", target_port: "displaywindow-video" }]);
  expect(placing.fragment?.nodes.map((node) => node.name)).toEqual(["displaywindow", "displaywindow-video"]);
  expect(placing.input_ports.map((port) => [port.name, port.family])).toEqual([["displaywindow-video", "image"]]);
  expect(collapsed.history_operations).toMatchObject([
    { operation: "create_stream_document", stream: placedStream, path: "streams/output.graph.json" },
    { operation: "fold_into_fragment", stream: STREAM_ASSET, placed_stream: placedStream },
  ]);
  const created = collapsed.history_operations[0];
  expect(thePlacementsOfTheStream(placedStream, targetsOf(graph))).toEqual({ holdingStreams: [STREAM_ASSET], document: isAJsonObject(created) ? created["document"] : null });

  const undo = collapsed.inverse_operations.filter((operation) => !isAHistoryOperationTheMockMakesAgainFromTheEditInside(operation)).map(graphActionApplyingTheHistoryOperation);
  expect(undo).toEqual([{ operation: "unlock_subgraph", stream: STREAM_ASSET, fragment: mockNodeIdOf(STREAM_ID, "output") }]);
  const unlocked = applyMockGraphTransaction(targetsOf(graph), undo.flatMap((action) => (action === null ? [] : [action])));
  if (unlocked.kind !== "applied") return expect.unreachable(unlocked.refusal.runtime_words);
  expect(graph.nodes.map((node) => node.name)).toEqual(["testpatternsource", "displaywindow"]);
  expect(graph.links).toMatchObject([{ source_node: "testpatternsource", source_port: "video", target_node: "displaywindow", target_port: "video" }]);
});

test("a Python node takes a number config field as a Channels input fed by a Graph Input, its undo puts it back, and a native node is refused", () => {
  const graph = aTestPatternAlone();
  graph.nodes.push({ name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running", config: {}, input_ports: [{ name: "video_from_upstream", family: "image", stream_facts: null, values_checked: null }], output_ports: [] });
  const inverter = mockNodeIdOf(STREAM_ID, "invertingeffect");
  const exposed = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "set_exposed_config_fields", stream: STREAM_ASSET, node: inverter, exposed_config_fields: ["strength"] },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", name: "invertingeffect_strength", config: { port: "invertingeffect_strength", family: "channels", range: [0, 1] }, as: "graph_input" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: "graph_input", port: "value" }, target: { node: inverter, port: "strength" } },
  ]);
  if (exposed.kind !== "applied") return expect.unreachable(exposed.refusal.runtime_words);
  const inverterNode = graph.nodes.find((node) => node.name === "invertingeffect") ?? expect.unreachable("no inverter");
  expect(inverterNode.exposed_config_fields).toEqual(["strength"]);
  expect(inverterNode.input_ports.map((port) => [port.name, port.family])).toEqual([["video_from_upstream", "image"], ["strength", "channels"]]);
  expect(graph.nodes.find((node) => node.name === "invertingeffect_strength")).toMatchObject({ state: null, output_ports: [{ name: "value", family: "channels" }] });
  expect(graph.links).toMatchObject([{ source_node: "invertingeffect_strength", target_node: "invertingeffect", target_port: "strength", state: "wired" }]);
  expect(exposed.inverse_operations.map((operation) => graphActionApplyingTheHistoryOperation(operation)?.operation)).toEqual(["disconnect", "remove_node", "set_exposed_config_fields"]);

  const refusedOnANativeNode = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_exposed_config_fields", stream: STREAM_ASSET, node: TEST_PATTERN, exposed_config_fields: ["fps"] }]);
  expect(refusedOnANativeNode.kind === "refused" && refusedOnANativeNode.refusal.runtime_words).toContain("Only a Python node exposes a config field");
  const refusedFamily = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", name: "level", config: { port: "level", family: "Channels" } }]);
  expect(refusedFamily.kind === "refused" && refusedFamily.refusal.runtime_words).toContain('names family "Channels", and a family is one of image, array, channels, packets, records');
});

test("a Graph Input, Graph Output or Set Variable added with no name takes the next free one, and a Get Variable reads the last setter's", () => {
  const graph = aTestPatternAlone();
  const added = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { family: "channels" } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { family: "records" } },
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", config: { port: "brightness", family: "channels" } },
  ]);
  if (added.kind !== "applied") return expect.unreachable(added.refusal.runtime_words);
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
  expect(named("tatolab.stream:DisplayWindow")).toEqual({});
});

test("a Graph Input added with no family carries none until a link gives it the family of the port it feeds, and loses it again when unlinked", () => {
  const graph = aTestPatternAlone();
  graph.nodes.push({ name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running", config: {}, input_ports: [{ name: "strength", family: "channels", stream_facts: null, values_checked: null }], output_ports: [] });
  const added = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:GraphInput", as: "graph_input" }]);
  if (added.kind !== "applied") return expect.unreachable(added.refusal.runtime_words);
  const graphInput = () => graph.nodes.find((node) => node.type === "tatolab.stream:GraphInput") ?? expect.unreachable("no Graph Input");
  expect(graphInput()).toMatchObject({ config: { port: "input1" }, output_ports: [{ name: "value", family: null }] });

  const graphInputId = mockNodeIdOf(STREAM_ID, graphInput().name);
  const inverter = mockNodeIdOf(STREAM_ID, "invertingeffect");
  const linked = applyMockGraphTransaction(targetsOf(graph), [{ operation: "connect", stream: STREAM_ASSET, source: { node: graphInputId, port: "value" }, target: { node: inverter, port: "strength" } }]);
  if (linked.kind !== "applied") return expect.unreachable(linked.refusal.runtime_words);
  expect(graphInput().output_ports[0]?.family).toBe("channels");
  expect(graphInput().config).toEqual({ port: "input1" });

  const unlinked = applyMockGraphTransaction(targetsOf(graph), [{ operation: "disconnect", stream: STREAM_ASSET, source: { node: graphInputId, port: "value" }, target: { node: inverter, port: "strength" } }]);
  if (unlinked.kind !== "applied") return expect.unreachable(unlinked.refusal.runtime_words);
  expect(graphInput().output_ports[0]?.family).toBeNull();
});

/** The stream asset `placing`, a Stream Fragment node, places. */
function assetPlacedBy(placing: MockGraphNode): string {
  const placed = placing.config["stream"];
  return isAJsonObject(placed) && typeof placed["asset"] === "string" ? placed["asset"] : expect.unreachable("the node places no stream");
}

/** `aTestPatternAlone` with its source saved as the stream `look`, which `look` and `look-again` both place, each wired to a display window through the stream's one port. */
function aLookPlacedTwice(): { graph: MockStreamGraph; placedStream: string; look: string } {
  const graph = aTestPatternAlone();
  const collapsed = applyMockGraphTransaction(targetsOf(graph), [
    { operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", as: "window" },
    { operation: "connect", stream: STREAM_ASSET, source: { node: TEST_PATTERN, port: "video" }, target: { node: "window", port: "video" } },
    { operation: "collapse_selection_into_subgraph", stream: STREAM_ASSET, name: "look", nodes: [TEST_PATTERN] },
  ]);
  if (collapsed.kind !== "applied") return expect.unreachable(collapsed.refusal.runtime_words);
  const look = graph.nodes.find((node) => node.name === "look") ?? expect.unreachable("no look");
  graph.nodes.push({ ...structuredClone(look), name: "look-again" });
  graph.nodes.push({ name: "displaywindow-2", type: "tatolab.stream:DisplayWindow", state: "Running", config: {}, input_ports: [{ name: "video", family: "image", stream_facts: null, values_checked: null }], output_ports: [] });
  graph.links.push({ id: "Lagain", source_node: "look-again", source_port: "testpatternsource-video", target_node: "displaywindow-2", target_port: "video", state: "wired" });
  return { graph, placedStream: assetPlacedBy(look), look: mockNodeIdOf(STREAM_ID, "look") };
}

test("an edit at a placed stream's level reaches every placement, is recorded on that stream, and its undo, naming that stream, undoes it at both", () => {
  const { graph, placedStream, look } = aLookPlacedTwice();
  const added = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", name: "preview", level: [look] }]);
  if (added.kind !== "applied") return expect.unreachable(added.refusal.runtime_words);
  const insideOf = (name: string) => graph.nodes.find((node) => node.name === name)?.fragment?.nodes.map((node) => node.name);
  expect(insideOf("look")).toEqual(["testpatternsource", "testpatternsource-video", "preview"]);
  expect(insideOf("look-again")).toEqual(["testpatternsource", "testpatternsource-video", "preview"]);
  expect(added.history_operations).toMatchObject([{ stream: placedStream, operation: "add_node", node: { name: "preview" } }]);

  const undo = added.inverse_operations.map(graphActionApplyingTheHistoryOperation);
  expect(undo).toEqual([{ operation: "remove_node", stream: placedStream, node: mockNodeIdOf(STREAM_ID, "preview") }]);
  const undone = applyMockGraphTransaction(targetsOf(graph), undo.flatMap((action) => (action === null ? [] : [action])), "undo_or_redo");
  expect(undone.kind).toBe("applied");
  expect(insideOf("look")).toEqual(["testpatternsource", "testpatternsource-video"]);
  expect(insideOf("look-again")).toEqual(["testpatternsource", "testpatternsource-video"]);
});

test("renaming a placed stream's Graph Output port carries the links onto that port at every placement, and removing the node takes them out", () => {
  const { graph, placedStream, look } = aLookPlacedTwice();
  const graphOutput = mockNodeIdOf(STREAM_ID, "testpatternsource-video");
  const renamed = applyMockGraphTransaction(targetsOf(graph), [{ operation: "set_node_config", stream: STREAM_ASSET, node: graphOutput, config: { port: "picture", family: "image" }, level: [look] }]);
  if (renamed.kind !== "applied") return expect.unreachable(renamed.refusal.runtime_words);
  expect(graph.nodes.find((node) => node.name === "look-again")?.output_ports.map((port) => port.name)).toEqual(["picture"]);
  expect(graph.links.map((link) => [link.source_node, link.source_port, link.target_node])).toEqual([
    ["look", "picture", "displaywindow"],
    ["look-again", "picture", "displaywindow-2"],
  ]);
  expect(renamed.history_operations.at(-1)).toMatchObject({ stream: STREAM_ASSET, operation: "carry_the_links_onto_the_ports_of_a_placed_stream", placed_stream: placedStream });

  const unlockedGraph = structuredClone(graph);
  expect(applyMockGraphTransaction(targetsOf(unlockedGraph), [{ operation: "unlock_subgraph", stream: STREAM_ASSET, fragment: look }]).kind).toBe("applied");
  expect(unlockedGraph.links.map((link) => [link.source_node, link.source_port, link.target_node])).toContainEqual(["testpatternsource", "video", "displaywindow"]);

  const removed = applyMockGraphTransaction(targetsOf(graph), [{ operation: "remove_node", stream: STREAM_ASSET, node: graphOutput, level: [look] }]);
  if (removed.kind !== "applied") return expect.unreachable(removed.refusal.runtime_words);
  expect(graph.links).toEqual([]);
  expect(graph.nodes.find((node) => node.name === "look")?.output_ports).toEqual([]);
});

test("an edit at the level of a generated subgraph, or of an import's placed stream, is refused in the runtime's words", () => {
  const graph = aTestPatternAlone();
  graph.nodes.push({ name: "halftone-look", type: "generators.looks:halftone_look", state: null, config: {}, input_ports: [], output_ports: [], fragment: { kind: "generated", nodes: [], links: [], groups: [] } });
  graph.nodes.push({ name: "grain", type: "tatolab.project:StreamFragment", state: null, config: { stream: { asset: "grain-asset", from: "an-import" } }, input_ports: [], output_ports: [], fragment: { kind: "placed_stream", nodes: [], links: [], groups: [] } });
  const halftoneLook = mockNodeIdOf(STREAM_ID, "halftone-look");
  const refused = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", level: [halftoneLook] }]);
  if (refused.kind !== "refused") return expect.unreachable("the generated subgraph's inside took the edit");
  expect(refused.refusal).toMatchObject({ refused_operation_index: 0, refused_node: halftoneLook });
  expect(refused.refusal.runtime_words).toContain("unlock it with unlock_subgraph");
  const refusedInTheImport = applyMockGraphTransaction(targetsOf(graph), [{ operation: "add_node", stream: STREAM_ASSET, type: "tatolab.stream:DisplayWindow", level: [mockNodeIdOf(STREAM_ID, "grain")] }]);
  expect(refusedInTheImport.kind === "refused" && refusedInTheImport.refusal.runtime_words).toContain("places a stream of the import");
});
