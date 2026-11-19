// The settings of a node type not yet typed, which the runtime describes as inputs that take a value
// and no wire, read as the node is set up, and which a stream's graph lists among no node's ports:
// what each reads is the value the node's graph document holds for it, else the default its node type
// describes, else nothing.

import { fragmentOfTheNode, isAJsonValue, jsonObjectMembersOf, type NodeTypeDescription, type NodeTypeInputDescribed, type StreamGraph, type StreamGraphInputValueRead, type StreamGraphNode, type StreamInputValue } from "../studio_readings.js";

/** The settings `described` lists for `node` that the graph does not list among its input ports, in the order it lists them; none where its type has no description. */
export function settingsOfTheNodeNotAmongItsPorts(described: Pick<NodeTypeDescription, "inputs"> | undefined, node: Pick<StreamGraphNode, "ports">): NodeTypeInputDescribed[] {
  if (described === undefined) return [];
  const inputPortNames = new Set(node.ports.inputs.map((port) => port.name));
  return described.inputs.filter((input) => input.mode === "setting_only" && !inputPortNames.has(input.name));
}

/** What `setting` of `node` reads: the value its graph document holds for it, else its node type's default, else nothing. */
export function valueReadOfTheSetting(node: Pick<StreamGraphNode, "input_values">, setting: Pick<NodeTypeInputDescribed, "name" | "default_value">): StreamGraphInputValueRead {
  const saved = jsonObjectMembersOf(node.input_values)[setting.name];
  if (saved !== undefined && saved !== null) return { value: saved, comes_from: "saved" };
  if (isAJsonValue(setting.default_value) && setting.default_value !== null) return { value: setting.default_value, comes_from: "default" };
  return { value: null, comes_from: null };
}

/** What every setting of `nodes` at `level`, and of the levels inside them, reads that the graph lists among no node's ports, each node's type described in `describedByType`. */
function settingValuesOfTheLevel(nodes: readonly StreamGraphNode[], level: string[], describedByType: ReadonlyMap<string, Pick<NodeTypeDescription, "inputs">>, kept: StreamInputValue[]): void {
  for (const node of nodes) {
    for (const setting of settingsOfTheNodeNotAmongItsPorts(describedByType.get(node.type), node)) {
      kept.push({ level, node_id: node.id, input: setting.name, value_read: valueReadOfTheSetting(node, setting) });
    }
    const fragment = fragmentOfTheNode(node);
    if (fragment !== null) settingValuesOfTheLevel(fragment.nodes, [...level, node.id], describedByType, kept);
  }
}

/** What every setting of `graph` that it lists among no node's ports reads, at every level, each node's type described in `describedByType`. */
export function settingValuesOfTheGraph(graph: Pick<StreamGraph, "nodes">, describedByType: ReadonlyMap<string, Pick<NodeTypeDescription, "inputs">>): StreamInputValue[] {
  const kept: StreamInputValue[] = [];
  settingValuesOfTheLevel(graph.nodes, [], describedByType, kept);
  return kept;
}
