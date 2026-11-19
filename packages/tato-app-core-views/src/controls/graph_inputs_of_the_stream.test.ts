import type { GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { NODE_STUDIO_FIELDS_NONE_SET, type JsonValue, type StreamGraphDeclaredPort, type StreamGraphInterfacePort, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { LIFETIME_WORDS, graphInputsOfTheStream, whyNoControlWritesTheInput, whyNothingSetsTheInput } from "./graph_inputs_of_the_stream";

function node(id: string, name: string, type: string, config: StreamGraphNode["config"], graphInterface: StreamGraphInterfacePort | null = null): StreamGraphNode {
  return { id, name, type, kind: "process", state: "Running", failed_because: null, process_raising_because: null, not_ready_because: null, config, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, exposed_config_fields: [], studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null, graph_interface: graphInterface };
}

/** The `value` input a running top-level `GraphInput` renders, reading `value` from where `comesFrom` says. */
function valueInput(value: JsonValue, comesFrom: "default" | "saved" | "live" = "default"): StreamGraphDeclaredPort {
  return { name: "value", family: null, stream_facts: null, values_checked: null, pin: null, value_read: { value, comes_from: comesFrom } };
}

const STREAM_LEVEL: GraphAddress = { project_folder: "/projects/s06-perform", stream_asset: "0df4a7aa-1111-2222-3333-444444444444", level: [] };

function graphOf(nodes: StreamGraphNode[]): StreamGraphSummary {
  return { stream: "s06-perform-main-0df4a7", stream_asset: null, groups: [], notes: [], nodes, links: [], graph_document_text: "{\n}" };
}

test("each top-level GraphInput is listed by the port and family the graph renders it declaring, in the graph's order, its value addressed at its own value input", () => {
  const graph = graphOf([
    { ...node("a1", "graphinput", "tatolab.stream:GraphInput", { port: "brightness", family: "channels", default: 0.5, range: [0, 1] }, { direction: "input", port: "brightness", family: "channels", current_value: 0.8 }), input_ports: [valueInput(0.8, "live")] },
    node("b2", "multiply", "tatolab.ops:Multiply", {}),
    { ...node("c3", "graphinput-2", "tatolab.stream:GraphInput", { port: "cue", family: "records", default: { scene: "intro" }, lifetime: "reset" }, { direction: "input", port: "cue", family: "records", current_value: { scene: "finale" } }), input_ports: [valueInput({ scene: "intro" })] },
    node("d4", "out", "tatolab.stream:GraphOutput", { port: "video", family: "image" }, { direction: "output", port: "video", family: "image", current_value: null }),
  ]);

  expect(graphInputsOfTheStream(graph, STREAM_LEVEL)).toEqual([
    { node_id: "a1", port_name: "brightness", family: "channels", value_address: { graph: STREAM_LEVEL, node_id: "a1", input: "value" }, value_pin: null, value_annotations: {}, lifetime: "kept", range: { lowest: 0, highest: 1 }, control: "slider" },
    { node_id: "c3", port_name: "cue", family: "records", value_address: { graph: STREAM_LEVEL, node_id: "c3", input: "value" }, value_pin: null, value_annotations: {}, lifetime: "reset", range: null, control: "json" },
  ]);
});

test("a GraphInput the graph renders no graph_interface or value input for is read from its config, and nothing sets it; with no stream level known nothing is addressed", () => {
  const graph = graphOf([
    node("e5", "graphinput-3", "tatolab.stream:GraphInput", { port: "tint", family: "array", default: [1, 0.5, 0.25], range: [0, 1] }),
    { ...node("f6", "settings", "tatolab.stream:GraphInput", { family: "records" }), input_ports: [valueInput(null)] },
  ]);

  expect(graphInputsOfTheStream(graph, STREAM_LEVEL)).toEqual([
    { node_id: "e5", port_name: "tint", family: "array", value_address: null, value_pin: null, value_annotations: {}, lifetime: "kept", range: { lowest: 0, highest: 1 }, control: "json" },
    { node_id: "f6", port_name: "settings", family: "records", value_address: { graph: STREAM_LEVEL, node_id: "f6", input: "value" }, value_pin: null, value_annotations: {}, lifetime: "kept", range: null, control: "json" },
  ]);
  expect(graphInputsOfTheStream(graph, null).map((graphInput) => graphInput.value_address)).toEqual([null, null]);
});

test("each Input's control follows what its config declares: a ranged number a slider, an unranged one a typed number, a Channels bool a switch, a list or a record JSON, an Image or Packets Input or one of no family none", () => {
  const controlsOf = (configs: StreamGraphNode["config"][]) => graphInputsOfTheStream(graphOf(configs.map((config, index) => node(`n${index}`, `graphinput-${index}`, "tatolab.stream:GraphInput", config))), STREAM_LEVEL).map((graphInput) => graphInput.control);

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

test("a value set since never changes an Input's control: a ranged Channels Input reading a bool stays a slider, and one saved as `value` is guessed from it", () => {
  const graph = graphOf([
    { ...node("a1", "graphinput", "tatolab.stream:GraphInput", { port: "brightness", family: "channels", default: 0.5, range: [0, 1] }), input_ports: [valueInput(true, "live")] },
    node("b2", "graphinput-2", "tatolab.stream:GraphInput", { port: "strobe", family: "channels", value: false }),
  ]);

  expect(graphInputsOfTheStream(graph, STREAM_LEVEL).map((graphInput) => graphInput.control)).toEqual(["slider", "toggle"]);
});

test("an Input no control writes says why, by its family", () => {
  expect(whyNoControlWritesTheInput("packets")).toBe("This packets Input carries only what the graph wires into it, so no control writes it.");
  expect(whyNoControlWritesTheInput("image")).toBe("This image Input carries only what the graph wires into it, so no control writes it.");
  expect(whyNoControlWritesTheInput(null)).toBe("This Input of no family carries only what the graph wires into it, so no control writes it.");
});

test("a lifetime reads as what happens to a live value at Stop, and an Input nothing sets says why, by whether a client writes its family", () => {
  expect(LIFETIME_WORDS).toEqual({ kept: "Kept at Stop", reset: "Reset at Stop" });
  expect(whyNothingSetsTheInput({ family: "image", control: "not_written" })).toBe("This image Input carries only what the graph wires into it, so no control writes it.");
  expect(whyNothingSetsTheInput({ family: "channels", control: "slider" })).toBe("Nothing sets this Input until its stream's graph serves its value.");
});
