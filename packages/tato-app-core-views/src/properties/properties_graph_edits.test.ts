import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphDeclaredPort, type StreamGraphLink, type StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import {
  configValueFromTheWordsTyped,
  disconnectTheLink,
  linkedEndsOfThePort,
  nodeIdInShort,
  pinValueFromTheWordsTyped,
  portsToConnect,
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
    state: "Running",
    failed_because: null,
    config: {},
    input_ports: inputs,
    output_ports: outputs,
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    pins: {},
    studio: NODE_STUDIO_FIELDS_NONE_SET,
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

test("an output's Connect menu lists the other nodes' inputs not linked yet, its family's first, others saying why they can't join", () => {
  const choices = portsToConnect("stream-asset", graph, camera, "output", aPort("level", "channels"));
  expect(choices.map(({ words, cannotBecause, choiceKey }) => ({ words, cannotBecause, choiceKey }))).toEqual([
    { words: "Meter › gain", cannotBecause: null, choiceKey: "id-meter:gain" },
  ]);
  expect(choices[0]?.connecting).toEqual({ operation: "connect", stream: "stream-asset", source: { node: "id-camera", port: "level" }, target: { node: "id-meter", port: "gain" } });
});

test("an input's Connect menu lists every other node's outputs, never its own, a linked one included", () => {
  const choices = portsToConnect("stream-asset", graph, meter, "input", aPort("frames", "image"));
  expect(choices.map(({ words, cannotBecause }) => [words, cannotBecause])).toEqual([
    ["Camera › video", null],
    ["Invert › video_out", null],
    ["Camera › level", "Channels, can't connect"],
  ]);
  expect(choices[0]?.connecting).toEqual({ operation: "connect", stream: "stream-asset", source: { node: "id-camera", port: "video" }, target: { node: "id-meter", port: "frames" } });
});

test("the Connect menu's note and the heading's short node id read as the panel shows them", () => {
  expect(portsToConnectNote("input", "Main", "Image")).toBe("Outputs in Main that carry Image");
  expect(portsToConnectNote("output", "Main", "Channels")).toBe("Inputs in Main that take Channels");
  expect(nodeIdInShort("ea646832-0f5f-45f4-bd5c-6b5b50a0b70a")).toBe("ea64…b70a");
  expect(nodeIdInShort("short-id")).toBe("short-id");
});
