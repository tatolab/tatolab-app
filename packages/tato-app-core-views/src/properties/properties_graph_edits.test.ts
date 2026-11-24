import type { JsonValue, StreamGraphLink, StreamGraphNode, StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
import { aGraphLink, aGraphNode, aGraphPort } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { expect, test } from "vitest";
import {
  canAGraphInputFeedThePin,
  linkDrivingTheInputTakenOut,
  linkedEndsOfThePort,
  nodeIdInShort,
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

test("an input of a type that stores no value, or a List, is one no Graph Input feeds", () => {
  expect(canAGraphInputFeedThePin({ pin_type: { type: "float" } })).toBe(true);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "menu", option_names: ["left", "right"] } })).toBe(true);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "trigger" } })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "texture" } })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: { type: "list_of", element_type: { type: "float" } } })).toBe(false);
  expect(canAGraphInputFeedThePin({ pin_type: undefined })).toBe(false);
});

test("taking out the link that drives an input disconnects it by both nodes' UUIDs", () => {
  const camera = aNode("camera", [], [aPort("frames", "image")]);
  const glow = aNode("glow", [aPort("video", "image")], []);
  expect(linkDrivingTheInputTakenOut("asset", { node: camera, port: "frames" }, glow, "video")).toEqual([
    { operation: "disconnect", stream: "asset", source: { node: "id-camera", port: "frames" }, target: { node: "id-glow", port: "video" } },
  ]);
});
