// A stream's inputs as Perform lists them: each top-level `GraphInput` the runtime's `graph` renders
// back, by the port it declares, with its own `value` input, where Perform sets its value with
// `set_node_input_value` as every surface sets a node's. The control table picks that input's control
// by the pin type the Graph Input chose and the annotations `graph` serves on it, such as the
// `control` it names.

import type { GraphAddress, InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import { graphInterfacePortOfTheNode, inputValueReadOfThePort, type StreamGraph, type StreamGraphPortPin } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeInputs } from "../shared/node_pins_of_the_graph";

/** The node type a stream declares one of its input ports with. */
export const GRAPH_INPUT_NODE_TYPE = "tatolab.stream:GraphInput";

/** The input of a `GraphInput` that holds the value it carries, a setting that takes no wire. */
export const GRAPH_INPUT_VALUE_INPUT = "value";

/** The setting of a `GraphInput` that says whether a value set live on it is kept across Stop. */
const GRAPH_INPUT_LIFETIME_INPUT = "lifetime";

/** Whether a value set live on an Input is kept across Stop, or reset at Stop, as the `GraphInput`'s `lifetime` setting says. */
export type GraphInputLifetime = "kept" | "reset";

/** One input port a stream declares with a top-level `GraphInput` node. */
export interface GraphInputOfTheStream {
  readonly node_id: string;
  /** The Input's name, as the stream declares it. */
  readonly port_name: string;
  /** Where the value of its `value` input is kept, which Perform and the node share; `null` where the runtime serves no such input that holds a value, as for an Input of a type no client sets. */
  readonly value_address: InputAddress | null;
  /** The exact type and flow of its `value` input; `null` while the runtime serves none. */
  readonly value_pin: StreamGraphPortPin | null;
  /** What `graph` serves as the annotations of its `value` input, those its settings state, as every surface reads a node's inputs. */
  readonly value_annotations: PinAnnotations;
  readonly lifetime: GraphInputLifetime;
}

/** Each top-level Graph Input `graph` declares, in the order the graph lists its nodes, its `value` input read as every surface reads a node's inputs and addressed at `valuesAt`, the stream's own level; `null` addresses none. */
export function graphInputsOfTheStream(graph: StreamGraph, valuesAt: GraphAddress | null): GraphInputOfTheStream[] {
  return graph.nodes
    .filter((node) => node.type === GRAPH_INPUT_NODE_TYPE)
    .map((node) => {
      const valueInput = nodeInputs(graph, node, undefined, valuesAt, null).find((input) => input.name === GRAPH_INPUT_VALUE_INPUT);
      const lifetimePort = node.ports.inputs.find((port) => port.name === GRAPH_INPUT_LIFETIME_INPUT);
      const lifetime = lifetimePort === undefined ? null : inputValueReadOfThePort(lifetimePort)?.value;
      return {
        node_id: node.id,
        port_name: graphInterfacePortOfTheNode(node)?.port ?? node.name,
        value_address: valueInput?.value_address ?? null,
        value_pin: valueInput?.pin ?? null,
        value_annotations: valueInput?.annotations ?? {},
        lifetime: lifetime === "reset" ? "reset" : "kept",
      };
    });
}

/** The lifetime of a value set live on an Input, in words. */
export const LIFETIME_WORDS: Readonly<Record<GraphInputLifetime, string>> = { kept: "Kept at Stop", reset: "Reset at Stop" };

/** Why Perform sets nothing on an Input that holds no value it can address: one of a type no client sets carries only what its graph wires into it. */
export const WHY_NOTHING_SETS_THE_INPUT = "This Input carries only what the graph wires into it, so no control sets it.";
