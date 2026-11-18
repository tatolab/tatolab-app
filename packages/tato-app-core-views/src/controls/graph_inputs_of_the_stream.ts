// A stream's inputs as Perform lists them: each top-level `GraphInput` the runtime's `graph` renders
// back, by the port it declares and the family it carries, with its own `value` input, where Perform
// sets its value with `set_node_input_value` as every surface sets a node's, and the control Perform
// draws there while the control table has none for it.

import { valueAddressOfTheInput, type GraphAddress, type InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { JsonValue, StreamGraphPortPin, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The node type a stream declares one of its input ports with. */
export const GRAPH_INPUT_NODE_TYPE = "tatolab.stream:GraphInput";

/** The input of a `GraphInput` that holds the value it carries, a setting that takes no wire. */
export const GRAPH_INPUT_VALUE_INPUT = "value";

/** Whether a value set live on an Input is kept across Stop, or reset at Stop, as the `GraphInput`'s `lifetime` setting says. */
export type GraphInputLifetime = "kept" | "reset";

/** The families of the Inputs a client writes; an Image or Packets Input carries only what the graph wires into it. */
const FAMILIES_A_CLIENT_WRITES: readonly string[] = ["array", "channels", "records"];

/** Whether a Graph Input of `family` is one a client writes; one of no family yet is not known to be. */
export function isAFamilyAClientWrites(family: string | null): boolean {
  return family !== null && FAMILIES_A_CLIENT_WRITES.includes(family);
}

/** `[lowest, highest]` from a `GraphInput`'s `range` config: the span a control moves its number in. */
export interface GraphInputRange {
  readonly lowest: number;
  readonly highest: number;
}

/** How Perform sets an Input the control table has no control for: a number on a slider within its range, a number typed, a bool switched, JSON typed, or not at all. */
export type GraphInputControlKind = "slider" | "number" | "toggle" | "json" | "not_written";

/** One input port a stream declares with a top-level `GraphInput` node. */
export interface GraphInputOfTheStream {
  readonly node_id: string;
  /** The Input's name, as the stream declares it. */
  readonly port_name: string;
  /** As the runtime spells it; `null` while the node states none. */
  readonly family: string | null;
  /** Where the value of its `value` input is kept, which Perform and the node share; `null` where the runtime serves no such input that holds a value, as for an Input of a family no client writes. */
  readonly value_address: InputAddress | null;
  /** The exact type and flow of its `value` input; `null` while the runtime serves none. */
  readonly value_pin: StreamGraphPortPin | null;
  readonly lifetime: GraphInputLifetime;
  readonly range: GraphInputRange | null;
  readonly control: GraphInputControlKind;
}

/** Each top-level Graph Input `graph` declares, in the order the graph lists its nodes, its value addressed at `valuesAt`, the stream's own level; `null` addresses none. */
export function graphInputsOfTheStream(graph: StreamGraphSummary, valuesAt: GraphAddress | null): GraphInputOfTheStream[] {
  return graph.nodes
    .filter((node) => node.type === GRAPH_INPUT_NODE_TYPE)
    .map((node) => {
      const { port, family, range, lifetime } = node.config;
      // A document saved before the Input's value was an input holds it as `default`; one saved since, as `value`.
      const declaredDefault = node.config["default"] ?? node.config[GRAPH_INPUT_VALUE_INPUT] ?? null;
      const declared = node.graph_interface;
      const familyDeclared = declared?.family ?? (typeof family === "string" ? family : null);
      const rangeDeclared = graphInputRangeFrom(range);
      const valueInput = node.input_ports.find((input) => input.name === GRAPH_INPUT_VALUE_INPUT);
      return {
        node_id: node.id,
        port_name: declared?.port ?? (typeof port === "string" && port !== "" ? port : node.name),
        family: familyDeclared,
        value_address: valueInput === undefined ? null : valueAddressOfTheInput(valuesAt, node.id, valueInput),
        value_pin: valueInput?.pin ?? null,
        lifetime: lifetime === "reset" ? "reset" : "kept",
        range: rangeDeclared,
        control: controlForTheInput(familyDeclared, declaredDefault, rangeDeclared),
      };
    });
}

/** The span a `range` config states, `null` unless it is two finite numbers, the lowest first. */
function graphInputRangeFrom(range: JsonValue | undefined): GraphInputRange | null {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [lowest, highest] = range;
  if (typeof lowest !== "number" || typeof highest !== "number" || !Number.isFinite(lowest) || !Number.isFinite(highest) || highest <= lowest) return null;
  return { lowest, highest };
}

/** The control that writes an Input of `family` as its config declares it, by its `default` and its `range`, whatever value was written to it since. */
function controlForTheInput(family: string | null, declaredDefault: JsonValue | null, range: GraphInputRange | null): GraphInputControlKind {
  if (!isAFamilyAClientWrites(family)) return "not_written";
  if (family === "records") return "json";
  if (family === "channels" && typeof declaredDefault === "boolean") return "toggle";
  if (declaredDefault !== null && typeof declaredDefault !== "number") return "json";
  return range === null ? "number" : "slider";
}

/** Why no control writes an Input of `family`, which carries only what its graph wires into it. */
export function whyNoControlWritesTheInput(family: string | null): string {
  return `This ${family === null ? "Input of no family" : `${family} Input`} carries only what the graph wires into it, so no control writes it.`;
}
