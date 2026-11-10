// A stream's Graph Inputs as Controls lists them: each `GraphInput` node the runtime's `graph` renders
// back, by the port it declares and the family it carries, in the graph's order.

import type { StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The node type a stream declares one of its input ports with. */
export const GRAPH_INPUT_NODE_TYPE = "tatolab.stream:GraphInput";

/** One input port a stream declares with a `GraphInput` node. */
export interface GraphInputOfTheStream {
  readonly node_id: string;
  /** The port's name from the node's `port` config, or the node's name while it states none. */
  readonly port_name: string;
  /** The family from the node's `family` config, as the runtime spells it; `null` while it states none. */
  readonly family: string | null;
}

/** Each Graph Input `graph` declares, in the order the graph lists its nodes. */
export function graphInputsOfTheStream(graph: StreamGraphSummary): GraphInputOfTheStream[] {
  return graph.nodes
    .filter((node) => node.type === GRAPH_INPUT_NODE_TYPE)
    .map((node) => {
      const { port, family } = node.config;
      return { node_id: node.id, port_name: typeof port === "string" && port !== "" ? port : node.name, family: typeof family === "string" ? family : null };
    });
}
