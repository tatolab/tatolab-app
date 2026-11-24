import type { JsonValue, StreamGraphLink, StreamGraphNode, StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
import { aGraphLink, aGraphNode, aGraphPort } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { expect, test } from "vitest";
import {
  canAGraphInputFeedThePin,
  configValueFromTheWordsTyped,
  linkDrivingTheInputTakenOut,
  linkedEndsOfThePort,
  listWithARecordAdded,
  listWithoutTheRecord,
  listWithTheRecordFieldSet,
  nodeIdInShort,
  pinValueFromTheWordsTyped,
  promoteToGraphInput,
} from "./properties_graph_edits";

function aPort(name: string, family: PortFamily | null): StreamGraphPort {
  return aGraphPort(name, family);
}

function aNode(name: string, inputs: StreamGraphPort[], outputs: StreamGraphPort[]): StreamGraphNode {
  return aGraphNode(name, { id: `id-${name}`, type: `tatolab.ops:${name}`, kind: "function", config: {}, inputs, outputs, components: { state: "Running" } });
}

function aLink(source: StreamGraphNode, sourcePort: string, target: StreamGraphNode, targetPort: string): StreamGraphLink {
  return aGraphLink(`${source.name}.${sourcePort}->${target.name}.${targetPort}`, [source.name, sourcePort], [target.name, targetPort]);
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

test("a port's linked ends name the node and port on the other side", () => {
  const intoInvert = linkedEndsOfThePort(graph, invert, "input", "video_in");
  const outOfInvert = linkedEndsOfThePort(graph, invert, "output", "video_out");
  expect(intoInvert.map((linkedEnd) => [linkedEnd.node.name, linkedEnd.port])).toEqual([["camera", "video"]]);
  expect(outOfInvert.map((linkedEnd) => [linkedEnd.node.name, linkedEnd.port])).toEqual([["meter", "frames"]]);
  expect(linkedEndsOfThePort(graph, meter, "input", "gain")).toEqual([]);
});

test("the heading's short node id reads as the panel shows it", () => {
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

/** The transaction a promotion sends: the Graph Input added, each of its settings set as an input value, in order, then its link into the input. */
function promotionOf(name: string, settings: [string, JsonValue][], target: { node: string; port: string }): unknown[] {
  return [
    { operation: "add_node", stream: "asset", type: "tatolab.stream:GraphInput", name, as: "graph_input" },
    ...settings.map(([input, value]) => ({ operation: "set_node_input_value", stream: "asset", node: "graph_input", input, value })),
    { operation: "connect", stream: "asset", source: { node: "graph_input", port: "value" }, target },
  ];
}

test("promoting an input is one transaction: a new Graph Input named for the node and input, its port and the input's type set as its settings, the value the input shows saved as its `value`, wired into it", () => {
  const glow = { id: "id-glow", name: "glow" };
  const amount = aGraphPort("amount", "channels", { pin_type: { type: "float" }, flow: "value", value: 0.7, value_comes_from: "saved" });
  expect(promoteToGraphInput("asset", { node: glow, input: amount, valueShown: 0.3, isOnTheStreamsOwnLevel: true, nodeNamesTaken: new Set(["glow"]) })).toEqual(
    promotionOf("glow_amount", [["port", "glow_amount"], ["pin_type", { type: "float" }], ["value", 0.3]], { node: "id-glow", port: "amount" }),
  );
});

test("a promotion takes the first free name, and below a stream's own level sets no value and no annotation", () => {
  const glow = { id: "id-glow", name: "glow" };
  const amount = aGraphPort("amount", "channels", { pin_type: { type: "float" }, flow: "value", annotations: { control: "dial" }, value: 0.7, value_comes_from: "saved" });
  expect(promoteToGraphInput("asset", { node: glow, input: amount, valueShown: 0.7, isOnTheStreamsOwnLevel: false, nodeNamesTaken: new Set(["glow", "glow_amount", "glow_amount_2"]) })).toEqual(
    promotionOf("glow_amount_3", [["port", "glow_amount_3"], ["pin_type", { type: "float" }]], { node: "id-glow", port: "amount" }),
  );
});

test("promoting an input states its annotations its type takes as the Graph Input's settings, a range only where it states both ends", () => {
  const caption = { id: "id-caption", name: "caption" };
  const lines = aGraphPort("lines", "channels", {
    pin_type: { type: "integer" },
    flow: "value",
    annotations: { range: { minimum: 1, maximum: 8 }, step: 1, unit: "lines", meaning: "count", control: "dial", project_asset: null },
    value: 2,
    value_comes_from: "saved",
  });
  expect(promoteToGraphInput("asset", { node: caption, input: lines, valueShown: 3, isOnTheStreamsOwnLevel: true, nodeNamesTaken: new Set(["caption"]) })).toEqual(
    promotionOf(
      "caption_lines",
      [["port", "caption_lines"], ["pin_type", { type: "integer" }], ["range", [1, 8]], ["step", 1], ["unit", "lines"], ["meaning", "count"], ["control", "dial"], ["value", 3]],
      { node: "id-caption", port: "lines" },
    ),
  );

  const anchor = aGraphPort("anchor", "channels", { pin_type: { type: "vector", component_count: "two" }, flow: "value", annotations: { range: { minimum: -1 }, step: 0.1, unit: "frames", control: "xy_pad" } });
  expect(promoteToGraphInput("asset", { node: caption, input: anchor, valueShown: [0, -0.5], isOnTheStreamsOwnLevel: true, nodeNamesTaken: new Set() })).toEqual(
    promotionOf("caption_anchor", [["port", "caption_anchor"], ["pin_type", { type: "vector", component_count: "two" }], ["control", "xy_pad"], ["value", [0, -0.5]]], { node: "id-caption", port: "anchor" }),
  );
});

test("an input of a type that stores no value, a List, or a String naming a project asset is one no Graph Input feeds", () => {
  expect(canAGraphInputFeedThePin({ pin_type: { type: "float" }, annotations: {} })).toBe(true);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "menu", option_names: ["left", "right"] }, annotations: {} })).toBe(true);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "trigger" }, annotations: {} })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "texture" }, annotations: {} })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "list_of", element_type: { type: "float" } }, annotations: {} })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "string" }, annotations: { project_asset: {} } })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: undefined, annotations: {} })).toBe(false);
});

test("taking out the link that drives an input disconnects it by both nodes' UUIDs", () => {
  const camera = aNode("camera", [], [aPort("frames", "image")]);
  const glow = aNode("glow", [aPort("video", "image")], []);
  expect(linkDrivingTheInputTakenOut("asset", { node: camera, port: "frames" }, glow, "video")).toEqual([
    { operation: "disconnect", stream: "asset", source: { node: "id-camera", port: "frames" }, target: { node: "id-glow", port: "video" } },
  ]);
});
