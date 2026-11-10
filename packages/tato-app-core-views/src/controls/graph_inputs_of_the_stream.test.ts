import type { StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { graphInputsOfTheStream } from "./graph_inputs_of_the_stream";

function node(id: string, name: string, type: string, config: StreamGraphNode["config"]): StreamGraphNode {
  return { id, name, type, state: null, failed_because: null, config, input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} };
}

test("each GraphInput the graph renders is a control, by the port and family its config declares, in the graph's order", () => {
  const graph: StreamGraphSummary = {
    stream: "gallery-main-018195",
    nodes: [
      node("a1", "intensity", "tatolab.stream:GraphInput", { port: "intensity", family: "array" }),
      node("b2", "glow", "nodes.glow:Glow", {}),
      node("c3", "settings", "tatolab.stream:GraphInput", { family: "records" }),
      node("d4", "out", "tatolab.stream:GraphOutput", { port: "video", family: "image" }),
      node("e5", "tint", "tatolab.stream:GraphInput", {}),
    ],
    links: [],
    graph_document_text: "{\n}",
  };

  expect(graphInputsOfTheStream(graph)).toEqual([
    { node_id: "a1", port_name: "intensity", family: "array" },
    { node_id: "c3", port_name: "settings", family: "records" },
    { node_id: "e5", port_name: "tint", family: null },
  ]);
});
