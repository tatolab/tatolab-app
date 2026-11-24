import type { GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { JsonValue, StreamGraph, StreamGraphInterfacePort, StreamGraphNode, StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { expect, test } from "vitest";
import { LIFETIME_WORDS, graphInputsOfTheStream } from "./graph_inputs_of_the_stream";

function node(id: string, name: string, type: string, graphInterface: StreamGraphInterfacePort | null = null, inputs: StreamGraphPort[] = []): StreamGraphNode {
  return aGraphNode(name, { id, type, kind: "process", inputs, components: { state: "Running", ...(graphInterface === null ? {} : { graph_interface: graphInterface }) } });
}

/** The `value` input a running top-level `GraphInput` renders, of type `type`, reading `value` from where `comesFrom` says. */
function valueInput(type: "float" | "string", value: JsonValue, comesFrom: "default" | "saved" | "live" = "default", annotations: StreamGraphPort["annotations"] = {}): StreamGraphPort {
  return aGraphPort("value", null, { pin_type: { type }, flow: "value", annotations, value, value_comes_from: comesFrom });
}

/** The `lifetime` setting a `GraphInput` renders, reading `lifetime`. */
function lifetimeInput(lifetime: "kept" | "reset"): StreamGraphPort {
  return aGraphPort("lifetime", null, { pin_type: { type: "string" }, flow: "value", value: lifetime, value_comes_from: "saved" });
}

const STREAM_LEVEL: GraphAddress = { project_folder: "/projects/s06-perform", stream_asset: "0df4a7aa-1111-2222-3333-444444444444", level: [] };

function graphOf(nodes: StreamGraphNode[]): StreamGraph {
  return aStreamGraph(nodes, [], { stream: "s06-perform-main-0df4a7" });
}

test("each top-level GraphInput is listed by the port the graph renders it declaring, in the graph's order, its value read and addressed at its own value input, its lifetime from its lifetime setting", () => {
  const graph = graphOf([
    node("a1", "graphinput", "tatolab.stream:GraphInput", { direction: "input", port: "brightness", current_value: 0.8 }, [valueInput("float", 0.8, "live", { range: { minimum: 0, maximum: 1 } })]),
    node("b2", "multiply", "tatolab.ops:Multiply"),
    node("c3", "graphinput-2", "tatolab.stream:GraphInput", { direction: "input", port: "cue", current_value: "finale" }, [valueInput("string", "intro"), lifetimeInput("reset")]),
    node("d4", "out", "tatolab.stream:GraphOutput", { direction: "output", port: "video" }),
  ]);

  expect(graphInputsOfTheStream(graph, STREAM_LEVEL)).toEqual([
    {
      node_id: "a1",
      port_name: "brightness",
      value_address: { graph: STREAM_LEVEL, node_id: "a1", input: "value", member: null },
      value_pin: { pin_type: { type: "float" }, flow: "value" },
      value_annotations: { range: { minimum: 0, maximum: 1 } },
      lifetime: "kept",
    },
    {
      node_id: "c3",
      port_name: "cue",
      value_address: { graph: STREAM_LEVEL, node_id: "c3", input: "value", member: null },
      value_pin: { pin_type: { type: "string" }, flow: "value" },
      value_annotations: {},
      lifetime: "reset",
    },
  ]);
});

test("a GraphInput the graph renders no graph_interface or value input for is named by its node and addresses nothing; with no stream level known nothing is addressed", () => {
  const graph = graphOf([node("e5", "tint", "tatolab.stream:GraphInput"), node("f6", "settings", "tatolab.stream:GraphInput", null, [valueInput("string", "")])]);

  expect(graphInputsOfTheStream(graph, STREAM_LEVEL).map(({ port_name, value_address }) => ({ port_name, addressed: value_address !== null }))).toEqual([
    { port_name: "tint", addressed: false },
    { port_name: "settings", addressed: true },
  ]);
  expect(graphInputsOfTheStream(graph, null).map((graphInput) => graphInput.value_address)).toEqual([null, null]);
});

test("a lifetime reads as what happens to a live value at Stop", () => {
  expect(LIFETIME_WORDS).toEqual({ kept: "Kept at Stop", reset: "Reset at Stop" });
});
