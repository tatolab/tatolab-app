// A stream's Graph Inputs as Controls lists them: each top-level `GraphInput` node the runtime's
// `graph` renders back, by the port it declares, the family it carries and the value it carries now,
// with the control that writes that value through `write_graph_input`.

import type { JsonValue, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The node type a stream declares one of its input ports with. */
export const GRAPH_INPUT_NODE_TYPE = "tatolab.stream:GraphInput";

/** The families of the Inputs a client writes; an Image or Packets Input carries only what the graph wires into it. */
const FAMILIES_A_CLIENT_WRITES: readonly string[] = ["array", "channels", "records"];

/** `[lowest, highest]` from a `GraphInput`'s `range` config: the span a control moves its number in. */
export interface GraphInputRange {
  readonly lowest: number;
  readonly highest: number;
}

/** How Controls writes an Input: a number on a slider within its range, a number typed, a bool switched, JSON typed, or not at all. */
export type GraphInputControlKind = "slider" | "number" | "toggle" | "json" | "not_written";

/** One input port a stream declares with a top-level `GraphInput` node. */
export interface GraphInputOfTheStream {
  readonly node_id: string;
  /** The Input's name, which `write_graph_input` takes. */
  readonly port_name: string;
  /** As the runtime spells it; `null` while the node states none. */
  readonly family: string | null;
  /** What it carries now, the last value written, else its `default`; `null` where the graph renders none and its config declares no `default`. */
  readonly current_value: JsonValue | null;
  readonly range: GraphInputRange | null;
  readonly control: GraphInputControlKind;
}

/** Each top-level Graph Input `graph` declares, in the order the graph lists its nodes. */
export function graphInputsOfTheStream(graph: StreamGraphSummary): GraphInputOfTheStream[] {
  return graph.nodes
    .filter((node) => node.type === GRAPH_INPUT_NODE_TYPE)
    .map((node) => {
      const { port, family, range } = node.config;
      const declaredDefault = node.config["default"] ?? null;
      const declared = node.graph_interface;
      const familyDeclared = declared?.family ?? (typeof family === "string" ? family : null);
      const currentValue = declared?.current_value ?? declaredDefault;
      const rangeDeclared = graphInputRangeFrom(range);
      return {
        node_id: node.id,
        port_name: declared?.port ?? (typeof port === "string" && port !== "" ? port : node.name),
        family: familyDeclared,
        current_value: currentValue,
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
  if (family === null || !FAMILIES_A_CLIENT_WRITES.includes(family)) return "not_written";
  if (family === "records") return "json";
  if (family === "channels" && typeof declaredDefault === "boolean") return "toggle";
  if (declaredDefault !== null && typeof declaredDefault !== "number") return "json";
  return range === null ? "number" : "slider";
}

/** Why no control writes an Input of `family`, which carries only what its graph wires into it. */
export function whyNoControlWritesTheInput(family: string | null): string {
  return `This ${family === null ? "Input of no family" : `${family} Input`} carries only what the graph wires into it, so no control writes it.`;
}
