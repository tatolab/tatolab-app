import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphInterfacePort, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { graphInputsOfTheStream, whyNoControlWritesTheInput } from "./graph_inputs_of_the_stream";

function node(id: string, name: string, type: string, config: StreamGraphNode["config"], graphInterface: StreamGraphInterfacePort | null = null): StreamGraphNode {
  return { id, name, type, state: "Running", failed_because: null, process_raising_because: null, config, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null, graph_interface: graphInterface };
}

function graphOf(nodes: StreamGraphNode[]): StreamGraphSummary {
  return { stream: "s06-perform-main-0df4a7", stream_asset: null, groups: [], notes: [], nodes, links: [], graph_document_text: "{\n}" };
}

test("each top-level GraphInput is a control, by the port, family and value the graph renders it declaring, in the graph's order", () => {
  const graph = graphOf([
    node("a1", "graphinput", "tatolab.stream:GraphInput", { port: "brightness", family: "channels", default: 0.5, range: [0, 1] }, { direction: "input", port: "brightness", family: "channels", current_value: 0.8 }),
    node("b2", "multiply", "tatolab.ops:Multiply", {}),
    node("c3", "graphinput-2", "tatolab.stream:GraphInput", { port: "cue", family: "records", default: { scene: "intro" } }, { direction: "input", port: "cue", family: "records", current_value: { scene: "finale" } }),
    node("d4", "out", "tatolab.stream:GraphOutput", { port: "video", family: "image" }, { direction: "output", port: "video", family: "image", current_value: null }),
  ]);

  expect(graphInputsOfTheStream(graph)).toEqual([
    { node_id: "a1", port_name: "brightness", family: "channels", current_value: 0.8, range: { lowest: 0, highest: 1 }, control: "slider" },
    { node_id: "c3", port_name: "cue", family: "records", current_value: { scene: "finale" }, range: null, control: "json" },
  ]);
});

test("a GraphInput the graph renders no graph_interface for is read from its config, carrying its default", () => {
  const graph = graphOf([
    node("e5", "graphinput-3", "tatolab.stream:GraphInput", { port: "tint", family: "array", default: [1, 0.5, 0.25], range: [0, 1] }),
    node("f6", "settings", "tatolab.stream:GraphInput", { family: "records" }),
  ]);

  expect(graphInputsOfTheStream(graph)).toEqual([
    { node_id: "e5", port_name: "tint", family: "array", current_value: [1, 0.5, 0.25], range: { lowest: 0, highest: 1 }, control: "json" },
    { node_id: "f6", port_name: "settings", family: "records", current_value: null, range: null, control: "json" },
  ]);
});

test("each Input's control follows what its config declares: a ranged number a slider, an unranged one a typed number, a Channels bool a switch, a list or a record JSON, an Image or Packets Input or one of no family none", () => {
  const controlsOf = (configs: StreamGraphNode["config"][]) => graphInputsOfTheStream(graphOf(configs.map((config, index) => node(`n${index}`, `graphinput-${index}`, "tatolab.stream:GraphInput", config)))).map((graphInput) => graphInput.control);

  expect(
    controlsOf([
      { port: "gain", family: "array", default: 2, range: [0, 10] },
      { port: "gain_unranged", family: "array", default: 2 },
      { port: "level", family: "channels", range: [0, 1] },
      { port: "strobe", family: "channels", default: false },
      { port: "samples", family: "channels", default: { samples: [[0]], sample_rate: 48000 } },
      { port: "backwards", family: "channels", default: 0.5, range: [1, 0] },
      { port: "video", family: "image" },
      { port: "packets", family: "packets" },
      { port: "loose" },
      { port: "tint", family: "array", default: [1, 0.5, 0.25], range: [0, 1] },
    ]),
  ).toEqual(["slider", "number", "slider", "toggle", "json", "number", "not_written", "not_written", "not_written", "json"]);
});

test("a value written since never changes an Input's control: a ranged Channels Input written a bool stays a slider", () => {
  const graph = graphOf([
    node("a1", "graphinput", "tatolab.stream:GraphInput", { port: "brightness", family: "channels", default: 0.5, range: [0, 1] }, { direction: "input", port: "brightness", family: "channels", current_value: true }),
  ]);

  expect(graphInputsOfTheStream(graph).map((graphInput) => [graphInput.current_value, graphInput.control])).toEqual([[true, "slider"]]);
});

test("an Input no control writes says why, by its family", () => {
  expect(whyNoControlWritesTheInput("packets")).toBe("This packets Input carries only what the graph wires into it, so no control writes it.");
  expect(whyNoControlWritesTheInput("image")).toBe("This image Input carries only what the graph wires into it, so no control writes it.");
  expect(whyNoControlWritesTheInput(null)).toBe("This Input of no family carries only what the graph wires into it, so no control writes it.");
});
