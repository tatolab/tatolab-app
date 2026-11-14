import { NODE_STUDIO_FIELDS_NONE_SET, type JsonValue, type StreamGraphDeclaredPort, type StreamGraphLink, type StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { portsThatCanJoinByNodeId } from "../shared/ports_that_can_join";
import type { ConfigFormField } from "./config_form_fields";
import {
  configFieldsToExposeAsGraphInputs,
  configValueFromTheWordsTyped,
  disconnectTheLink,
  exposeTheConfigFieldAsAGraphInput,
  linkedEndsOfThePort,
  listWithARecordAdded,
  listWithoutTheRecord,
  listWithTheRecordFieldSet,
  nodeIdInShort,
  pinValueFromTheWordsTyped,
  portsToConnect,
  connectingThePortPicked,
  whyThePortTakesNoOtherTarget,
  portsToConnectNote,
  resetTheConfigField,
  setTheConfigField,
} from "./properties_graph_edits";

function aPort(name: string, family: StreamGraphDeclaredPort["family"]): StreamGraphDeclaredPort {
  return { name, family, stream_facts: null, values_checked: null };
}

function aNode(name: string, inputs: StreamGraphDeclaredPort[], outputs: StreamGraphDeclaredPort[]): StreamGraphNode {
  return {
    id: `id-${name}`,
    name,
    type: `tatolab.ops:${name}`,
    kind: "function",
    state: "Running",
    failed_because: null,
    process_raising_because: null,
    not_ready_because: null,
    config: {},
    input_ports: inputs,
    output_ports: outputs,
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    pins: {},
    exposed_config_fields: [],
    studio: NODE_STUDIO_FIELDS_NONE_SET,
    fragment: null, graph_interface: null,
  };
}

function aLink(source: StreamGraphNode, sourcePort: string, target: StreamGraphNode, targetPort: string): StreamGraphLink {
  return { id: `${source.name}.${sourcePort}->${target.name}.${targetPort}`, source_node: source.name, source_port: sourcePort, target_node: target.name, target_port: targetPort, state: "wired" };
}

const camera = aNode("camera", [], [aPort("video", "image"), aPort("level", "channels")]);
const invert = aNode("invert", [aPort("video_in", "image")], [aPort("video_out", "image")]);
const meter = aNode("meter", [aPort("frames", "image"), aPort("gain", "channels")], []);
const graph = { nodes: [camera, invert, meter], links: [aLink(camera, "video", invert, "video_in"), aLink(invert, "video_out", meter, "frames")] };

test("words typed into a number field read as a number, a whole number where the field takes one, and say why when they are not", () => {
  const wholeNumberField = { control: { kind: "number", is_whole_number: true, minimum: null, maximum: null }, is_nullable: false } as const;
  expect(configValueFromTheWordsTyped(wholeNumberField, " 24 ")).toEqual({ kind: "value", value: 24 });
  expect(configValueFromTheWordsTyped(wholeNumberField, "2.5")).toEqual({ kind: "not_a_value", because: "2.5 is not a whole number." });
  expect(configValueFromTheWordsTyped(wholeNumberField, "fast")).toEqual({ kind: "not_a_value", because: "fast is not a number." });
  expect(configValueFromTheWordsTyped(wholeNumberField, "")).toEqual({ kind: "not_a_value", because: "A number is needed." });
  expect(configValueFromTheWordsTyped({ ...wholeNumberField, is_nullable: true }, "")).toEqual({ kind: "value", value: null });
});

test("words typed into a JSON field read as JSON, and text fields keep the words as typed", () => {
  expect(configValueFromTheWordsTyped({ control: { kind: "json" }, is_nullable: false }, '{"a": [1]}')).toEqual({ kind: "value", value: { a: [1] } });
  expect(configValueFromTheWordsTyped({ control: { kind: "json" }, is_nullable: false }, "{a")).toEqual({ kind: "not_a_value", because: "{a is not JSON." });
  expect(configValueFromTheWordsTyped({ control: { kind: "text" }, is_nullable: false }, " 12 ")).toEqual({ kind: "value", value: " 12 " });
});

test("an unlinked input's value reads as JSON where the words are JSON, else as the words", () => {
  expect(pinValueFromTheWordsTyped("0.5")).toBe(0.5);
  expect(pinValueFromTheWordsTyped("true")).toBe(true);
  expect(pinValueFromTheWordsTyped("hello")).toBe("hello");
});

test("setting a config field sends the whole config with the field changed, and a reset sends it without the field", () => {
  const configEditedFrom = { width: 1280, height: 720 };
  expect(setTheConfigField("stream-asset", "node-id", configEditedFrom, "height", 360)).toEqual({ operation: "set_node_config", stream: "stream-asset", node: "node-id", config: { width: 1280, height: 360 } });
  expect(resetTheConfigField("stream-asset", "node-id", configEditedFrom, "width")).toEqual({ operation: "set_node_config", stream: "stream-asset", node: "node-id", config: { height: 720 } });
  expect(configEditedFrom).toEqual({ width: 1280, height: 720 });
});

test("a port's linked ends name the node and port on the other side, and disconnecting one names both ends by id the way round the link runs", () => {
  const intoInvert = linkedEndsOfThePort(graph, invert, "input", "video_in");
  const outOfInvert = linkedEndsOfThePort(graph, invert, "output", "video_out");
  expect(intoInvert.map((linkedEnd) => [linkedEnd.node.name, linkedEnd.port])).toEqual([["camera", "video"]]);
  expect(outOfInvert.map((linkedEnd) => [linkedEnd.node.name, linkedEnd.port])).toEqual([["meter", "frames"]]);
  expect(linkedEndsOfThePort(graph, meter, "input", "gain")).toEqual([]);

  const [cameraEnd] = intoInvert;
  const [meterEnd] = outOfInvert;
  if (cameraEnd === undefined || meterEnd === undefined) return expect.unreachable("both ends are linked");
  expect(disconnectTheLink("stream-asset", invert, "input", "video_in", cameraEnd)).toEqual({
    operation: "disconnect",
    stream: "stream-asset",
    source: { node: "id-camera", port: "video" },
    target: { node: "id-invert", port: "video_in" },
  });
  expect(disconnectTheLink("stream-asset", invert, "output", "video_out", meterEnd)).toEqual({
    operation: "disconnect",
    stream: "stream-asset",
    source: { node: "id-invert", port: "video_out" },
    target: { node: "id-meter", port: "frames" },
  });
});

test("an output's target picker lists the other nodes' inputs not linked yet, its family's first, others saying why they can't join", () => {
  const choices = portsToConnect("stream-asset", graph, camera, "output", aPort("level", "channels"), null);
  expect(choices.map(({ nodeTitle, port, cannotBecause, choiceKey }) => ({ nodeTitle, port, cannotBecause, choiceKey }))).toEqual([
    { nodeTitle: "Meter", port: "gain", cannotBecause: null, choiceKey: "id-meter:gain" },
  ]);
  expect(choices[0]?.connecting).toEqual([{ operation: "connect", stream: "stream-asset", source: { node: "id-camera", port: "level" }, target: { node: "id-meter", port: "gain" } }]);
});

test("an input's target picker lists every other node's outputs but the one it is linked with, never its own", () => {
  const choices = portsToConnect("stream-asset", graph, meter, "input", aPort("frames", "image"), null);
  expect(choices.map(({ nodeTitle, port, cannotBecause }) => [`${nodeTitle} › ${port}`, cannotBecause])).toEqual([
    ["Camera › video", null],
    ["Camera › level", "Channels, can't connect"],
  ]);
  expect(choices[0]?.connecting).toEqual([{ operation: "connect", stream: "stream-asset", source: { node: "id-camera", port: "video" }, target: { node: "id-meter", port: "frames" } }]);
});

test("choosing another port in a linked picker moves the link as one transaction, the port it is linked with left out", () => {
  const [linkedEnd] = linkedEndsOfThePort(graph, meter, "input", "frames");
  expect(linkedEnd?.node.id).toBe("id-invert");
  const choices = portsToConnect("stream-asset", graph, meter, "input", aPort("frames", "image"), linkedEnd ?? null);
  expect(choices.map(({ nodeTitle, port }) => `${nodeTitle} › ${port}`)).toEqual(["Camera › video", "Camera › level"]);
  expect(choices[0]?.connecting).toEqual([
    { operation: "disconnect", stream: "stream-asset", source: { node: "id-invert", port: "video_out" }, target: { node: "id-meter", port: "frames" } },
    { operation: "connect", stream: "stream-asset", source: { node: "id-camera", port: "video" }, target: { node: "id-meter", port: "frames" } },
  ]);
});

test("a port picked in the Stream graph joins as its picker's choice would, or says why it can't", () => {
  const [linkedEnd] = linkedEndsOfThePort(graph, meter, "input", "frames");
  expect(connectingThePortPicked("stream-asset", graph, meter, "input", aPort("frames", "image"), linkedEnd ?? null, { node: "id-camera", port: "video" })).toEqual({
    kind: "connecting",
    connecting: portsToConnect("stream-asset", graph, meter, "input", aPort("frames", "image"), linkedEnd ?? null)[0]?.connecting,
  });
  expect(connectingThePortPicked("stream-asset", graph, meter, "input", aPort("frames", "image"), null, { node: "id-camera", port: "level" })).toEqual({ kind: "cannot_join", because: "Camera › level can't join frames: Channels, can't connect." });
  expect(connectingThePortPicked("stream-asset", graph, meter, "input", aPort("frames", "image"), linkedEnd ?? null, { node: "id-invert", port: "video_out" }).kind).toBe("cannot_join");
});

test("the Stream graph lights each node with a port of the family that can join, an input's not by the output it is linked with, an output's only by inputs not linked yet", () => {
  expect([...portsThatCanJoinByNodeId(graph, meter, "input", aPort("frames", "image"))]).toEqual([["id-camera", ["video"]]]);
  expect([...portsThatCanJoinByNodeId(graph, camera, "output", aPort("video", "image"))]).toEqual([]);
  expect([...portsThatCanJoinByNodeId(graph, camera, "output", aPort("level", "channels"))]).toEqual([["id-meter", ["gain"]]]);
});

test("a Graph Input naming no family can join an input of any family, and any output can join a Graph Output naming none", () => {
  const waitingInput: StreamGraphNode = { ...aNode("input1", [], [aPort("value", null)]), type: "tatolab.stream:GraphInput", graph_interface: { direction: "input", port: "input1", family: null, current_value: null } };
  const waitingOutput: StreamGraphNode = { ...aNode("output1", [aPort("value", null)], []), type: "tatolab.stream:GraphOutput", graph_interface: { direction: "output", port: "output1", family: null, current_value: null } };
  const graphWaiting = { nodes: [camera, invert, meter, waitingInput, waitingOutput], links: graph.links };
  expect([...portsThatCanJoinByNodeId(graphWaiting, waitingInput, "output", aPort("value", null))]).toEqual([
    ["id-meter", ["gain"]],
    ["id-output1", ["value"]],
  ]);
  expect([...portsThatCanJoinByNodeId(graphWaiting, waitingOutput, "input", aPort("value", null))]).toEqual([
    ["id-camera", ["video", "level"]],
    ["id-invert", ["video_out"]],
    ["id-input1", ["value"]],
  ]);
});

test("an input takes one target picker, an output any number", () => {
  expect(whyThePortTakesNoOtherTarget("input", 0, 0)).toBeNull();
  expect(whyThePortTakesNoOtherTarget("input", 1, 0)).toBe("An input takes one link. Choose another output in its picker.");
  expect(whyThePortTakesNoOtherTarget("input", 0, 1)).not.toBeNull();
  expect(whyThePortTakesNoOtherTarget("output", 2, 1)).toBeNull();
});

test("the Connect menu's note and the heading's short node id read as the panel shows them", () => {
  expect(portsToConnectNote("input", "Main", "Image")).toBe("Outputs in Main that carry Image");
  expect(portsToConnectNote("output", "Main", "Channels")).toBe("Inputs in Main that take Channels");
  expect(nodeIdInShort("ea646832-0f5f-45f4-bd5c-6b5b50a0b70a")).toBe("ea64…b70a");
  expect(nodeIdInShort("short-id")).toBe("short-id");
});

test("an entry of a list of records is edited, reset, added and removed with the rest of the list kept", () => {
  const layers: JsonValue = [{}, { x: 640, y: 360, opacity: 0.5 }];
  const second = { x: 640, y: 360, opacity: 0.5 };
  expect(listWithTheRecordFieldSet(layers, 1, second, "opacity", 0.25)).toEqual([{}, { x: 640, y: 360, opacity: 0.25 }]);
  expect(listWithTheRecordFieldSet(layers, 0, {}, "x", 10)).toEqual([{ x: 10 }, second]);
  expect(listWithTheRecordFieldSet(layers, 1, second, "y", undefined)).toEqual([{}, { x: 640, opacity: 0.5 }]);
  expect(listWithARecordAdded(layers, {})).toEqual([{}, second, {}]);
  expect(listWithARecordAdded(null, { x: 0 })).toEqual([{ x: 0 }]);
  expect(listWithoutTheRecord(layers, 0, {})).toEqual([second]);
  expect(layers).toEqual([{}, { x: 640, y: 360, opacity: 0.5 }]);
});

test("an entry's field keeps being set while a drag changes that field live, and whatever order the runtime gives the entry's keys", () => {
  const layersWhileOpacityIsDragged: JsonValue = [{ opacity: 0.4, y: 360, x: 640 }];
  expect(listWithTheRecordFieldSet(layersWhileOpacityIsDragged, 0, { x: 640, y: 360, opacity: 0 }, "opacity", 0.5)).toEqual([{ y: 360, x: 640, opacity: 0.5 }]);
  expect(listWithTheRecordFieldSet(layersWhileOpacityIsDragged, 0, { x: 0, y: 360, opacity: 0 }, "opacity", 0.5)).toBeNull();
  expect(listWithoutTheRecord(layersWhileOpacityIsDragged, 0, { x: 640, y: 360, opacity: 0.4 })).toEqual([]);
  expect(listWithoutTheRecord(layersWhileOpacityIsDragged, 0, { x: 640, y: 360, opacity: 0 })).toBeNull();
  const layersHoldingACrop: JsonValue = [{ crop: { right: 10, left: 0 }, points: [1, 2] }];
  expect(listWithTheRecordFieldSet(layersHoldingACrop, 0, { points: [1, 2], crop: { left: 0, right: 10 } }, "opacity", 1)).toEqual([{ crop: { right: 10, left: 0 }, points: [1, 2], opacity: 1 }]);
  expect(listWithTheRecordFieldSet(layersHoldingACrop, 0, { points: [2, 1], crop: { left: 0, right: 10 } }, "opacity", 1)).toBeNull();
});

test("an edit of an entry the list has moved on from changes nothing", () => {
  const layersAfterTheFirstWasRemoved: JsonValue = [{ x: 640, y: 360, opacity: 0.5 }];
  expect(listWithoutTheRecord(layersAfterTheFirstWasRemoved, 0, {})).toBeNull();
  expect(listWithTheRecordFieldSet(layersAfterTheFirstWasRemoved, 1, { x: 640, y: 360, opacity: 0.5 }, "x", 0)).toBeNull();
});

function aConfigFormField(key: string, control: ConfigFormField["control"]): ConfigFormField {
  return { key, description: null, control, value: null, value_source: "default", is_required: false, is_nullable: false };
}

test("a node offers each number and on-off config field it does not yet take as an input to expose as a Graph Input", () => {
  const strength = aConfigFormField("strength", { kind: "number", is_whole_number: false, minimum: 0, maximum: 1 });
  const enabled = aConfigFormField("enabled", { kind: "toggle" });
  const label = aConfigFormField("label", { kind: "text" });
  const blend = aConfigFormField("blend", { kind: "choice", choices: ["over", "add"] });
  expect(configFieldsToExposeAsGraphInputs({ exposed_config_fields: [] }, [strength, enabled, label, blend]).map((field) => field.key)).toEqual(["strength", "enabled"]);
  expect(configFieldsToExposeAsGraphInputs({ exposed_config_fields: ["strength"] }, [strength, enabled, label]).map((field) => field.key)).toEqual(["enabled"]);
});

test("exposing a config field is one transaction: the node takes it as an input, fed by a new Channels Graph Input moving in the field's range", () => {
  const glow = { id: "id-glow", name: "glow", exposed_config_fields: ["enabled"] };
  expect(exposeTheConfigFieldAsAGraphInput("asset", glow, aConfigFormField("strength", { kind: "number", is_whole_number: false, minimum: 0, maximum: 1 }))).toEqual([
    { operation: "set_exposed_config_fields", stream: "asset", node: "id-glow", exposed_config_fields: ["enabled", "strength"] },
    { operation: "add_node", stream: "asset", type: "tatolab.stream:GraphInput", name: "glow_strength", config: { port: "glow_strength", family: "channels", range: [0, 1] }, as: "graph_input" },
    { operation: "connect", stream: "asset", source: { node: "graph_input", port: "value" }, target: { node: "id-glow", port: "strength" } },
  ]);
  expect(exposeTheConfigFieldAsAGraphInput("asset", glow, aConfigFormField("gain", { kind: "number", is_whole_number: false, minimum: null, maximum: 4 }))[1]).toMatchObject({ config: { port: "glow_gain", family: "channels" } });
  expect(exposeTheConfigFieldAsAGraphInput("asset", glow, aConfigFormField("gain", { kind: "number", is_whole_number: false, minimum: null, maximum: 4 }))[1]).not.toHaveProperty("config.range");
});
