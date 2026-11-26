// What a mock value source carries: a node the runtime serves as a value source, as it serves a
// view node, publishes on each output the value its input of the same name is set to, each time it
// is set, and nothing while that input reads none. The mock carries an Array value of numbers and a
// Records value; it checks no value, so one the runtime would refuse is carried as unreadable.

import type { JsonValue, PortViewerMessageReading, PortViewerTarget, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import type { MockStreamGraphTarget } from "./mock_graph_transactions";
import { mockGraphNodeIdOf, type MockGraphNode } from "./mock_stream_fixtures";

/** The Array attribute a number or nested lists of numbers are carried as, as the runtime names it. */
const VALUE_SOURCE_ARRAY_ATTRIBUTE_NAME = "values";

/** The shape of `value`, a number or nested lists of numbers of one length at each depth, and its numbers in order; `null` for any other value. */
function shapeAndNumbersOf(value: JsonValue): { shape: number[]; numbers: number[] } | null {
  if (typeof value === "number") return { shape: [1], numbers: [value] };
  if (!Array.isArray(value)) return null;
  if (value.every((element) => typeof element === "number")) return { shape: [value.length], numbers: value };
  const parts = value.map(shapeAndNumbersOf);
  const [first] = parts;
  if (first === undefined || first === null || parts.some((part) => part === null || JSON.stringify(part.shape) !== JSON.stringify(first.shape))) return null;
  return { shape: [value.length, ...first.shape], numbers: parts.flatMap((part) => part?.numbers ?? []) };
}

/** `value` as a port viewer reads it off an output of `family`; `null` for a family the mock carries no value on. */
function messageCarrying(family: MockGraphNode["output_ports"][number]["family"], value: JsonValue): PortViewerMessageReading | null {
  if (family === "records") return { message: "records_message", record: value };
  if (family !== "array") return null;
  const carried = shapeAndNumbersOf(value);
  if (carried === null) return { message: "unreadable", described_as: "array_frame", because: "The mock carries an Array value as a number or nested lists of numbers." };
  const { shape, numbers } = carried;
  return {
    message: "array_frame",
    attributes: [
      {
        name: VALUE_SOURCE_ARRAY_ATTRIBUTE_NAME,
        dtype: "float64",
        shape,
        residency: "cpu",
        statistics: { element_count: numbers.length, minimum: Math.min(...numbers), maximum: Math.max(...numbers), mean: numbers.reduce((sum, number) => sum + number, 0) / numbers.length },
      },
    ],
  };
}

/** Whether `node`'s output `port` carries what its input of the same name is set to. */
export function isAnOutputOfAValueSource(node: MockGraphNode, port: string): boolean {
  return node.is_a_value_source === true && node.output_ports.some((output) => output.name === port) && node.input_ports.some((input) => input.name === port && input.value_read !== null);
}

/** What `node`'s output `port` carries now, a value source's: the value its input of that name reads; `null` while it reads none, or for an output that is not a value source's. */
export function mockMessageOnTheOutputOfAValueSource(node: MockGraphNode, port: string): PortViewerMessageReading | null {
  if (!isAnOutputOfAValueSource(node, port)) return null;
  const value = node.input_ports.find((input) => input.name === port)?.value_read?.value ?? null;
  const family = node.output_ports.find((output) => output.name === port)?.family ?? null;
  return value === null ? null : messageCarrying(family, value);
}

/** An output of a value source and the message a set of its input published on it. */
export interface MockMessagePublished {
  readonly target: PortViewerTarget;
  readonly reading: PortViewerMessageReading;
}

/** What each value `actions` set on a value source's input published on its output of that name, in a stream a target of the open project names; nothing for any other set. */
export function mockMessagesPublishedBy(actions: readonly StreamGraphAction[], graphTargets: ReadonlyMap<string, MockStreamGraphTarget>): MockMessagePublished[] {
  return actions.flatMap((action) => {
    if (action.operation !== "set_node_input_value" || (action.level ?? []).length > 0) return [];
    const graphTarget = graphTargets.get(action.stream);
    if (graphTarget === undefined) return [];
    const { stream_id: streamId } = graphTarget;
    const node = graphTarget.graph.nodes.find((candidate) => mockGraphNodeIdOf(streamId, candidate) === action.node || candidate.name === action.node);
    const reading = node === undefined ? null : mockMessageOnTheOutputOfAValueSource(node, action.input);
    return node === undefined || reading === null ? [] : [{ target: { stream: streamId, node_id: mockGraphNodeIdOf(streamId, node), port: action.input }, reading }];
  });
}
