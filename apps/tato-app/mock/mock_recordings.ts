// What a real runtime answered with streamlib's sample project that declares each kind of pin
// (`examples/every-pin-kind`) open and playing, each answer kept as the runtime sent it under
// `recordings/` and read here through the readers the app uses on a real answer: the node types the
// project lists and each one described, its stream `main`'s graph, and the refusals of `transact` a
// scenario replays. The mock holds no node type, graph or refusal of its own for this work; a recording
// that no longer reads fails the mock's load, as the app would fail to read the runtime's answer. They
// were recorded from the `tatolabd` 0.68.82 built from streamlib, the sample played until its `glow` node
// had written frames: the graph and the refusals at 6c0be0f, the node types listed and described at
// 4b7a935, with streamlib's `tatolab-compositor` installed beside the sample and a `Spotlight` and an
// `AlphaOverCompositor` node added to the playing stream, so a loaded stream describes every node type
// the project lists.

import listNodeTypesResult from "./recordings/every-pin-kind-list-node-types-result.json?raw";
import describeNodeTypesResult from "./recordings/every-pin-kind-describe-node-types-result.json?raw";
import graphResultOfMain from "./recordings/every-pin-kind-graph-result-of-main.json?raw";
import transactRefusalForALinkOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-a-records-output-into-a-float-input.json?raw";
import transactRefusalForAValueOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-words-as-a-float-value.json?raw";
import { projectActionRefusalOfTheContract } from "../src/main/project_transactions_on_the_wire";
import { controlContractRefusalOf, describeTheContractIssues, readControlContractValue } from "../src/main/tatolab_runtime_control_operation_call";
import type { Result } from "../src/main/result";
import {
  canvasNotesOfTheGraph,
  familyOfThePort,
  inputValueReadOfThePort,
  jsonObjectMembersOf,
  pinOfThePort,
  streamFactsOfThePort,
  studioFieldsOfTheNode,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import type { ControlContractComponentName, ControlContractComponents } from "@tatolab/runtime-client/contract";
import type { DescribeNodeTypesToolResult, ListNodeTypesToolResult, ProjectActionRefusal, StreamGraph, StreamGraphLink, StreamGraphNode, StreamGraphPort } from "../src/shared/tatolab_backend_contract";
import type { MockGraphLink, MockGraphNode, MockGraphPort, MockStreamGraph } from "./mock_stream_fixtures";

/** A recording the readers cannot read: the recording, or the reader, has drifted from the runtime. */
class MockRecordingUnreadable extends Error {
  override readonly name = "MockRecordingUnreadable";
}

function readOrFail<Read>(recording: string, read: Result<Read, string>): Read {
  if (!read.ok) throw new MockRecordingUnreadable(`the recording ${recording} does not read: ${read.failure}`);
  return read.value;
}

/** What a recorded JSON-RPC response of `POST /control` holds: its `result`, or its `error`'s `data`. */
function partOfTheRecordedResponse(recording: string, responseText: string, part: "result" | "refusal"): unknown {
  const response: unknown = JSON.parse(responseText);
  if (typeof response !== "object" || response === null) throw new MockRecordingUnreadable(`the recording ${recording} is no JSON-RPC response`);
  if (part === "result" && "result" in response) return response.result;
  if (part === "refusal" && "error" in response && typeof response.error === "object" && response.error !== null && "data" in response.error) return response.error.data;
  throw new MockRecordingUnreadable(`the recording ${recording} answers no ${part}`);
}

/** The `result` a recorded response holds, read by the runtime client's checker as the contract type `typeName`. */
function recordedResultOfTheContractType<TypeName extends ControlContractComponentName>(recording: string, responseText: string, typeName: TypeName): ControlContractComponents[TypeName] {
  const recorded = readControlContractValue(typeName, partOfTheRecordedResponse(recording, responseText, "result"));
  if (!recorded.read) throw new MockRecordingUnreadable(`the recording ${recording} does not read: ${describeTheContractIssues(recorded.issues, typeName)}`);
  return recorded.value;
}

/** The node types the runtime's `list_node_types` listed for the sample project. */
export const MOCK_RECORDED_NODE_TYPES_LISTED: ListNodeTypesToolResult = recordedResultOfTheContractType("every-pin-kind-list-node-types-result", listNodeTypesResult, "ListNodeTypesToolResult");

/** Every node type the sample project lists, as the runtime's `describe_node_types` described it while the sample's stream `main` played. */
export const MOCK_RECORDED_NODE_TYPES_DESCRIBED: DescribeNodeTypesToolResult = recordedResultOfTheContractType("every-pin-kind-describe-node-types-result", describeNodeTypesResult, "DescribeNodeTypesToolResult");

/** The sample's stream `main` as the runtime's `graph` answered it while it played. */
const RECORDED_GRAPH_OF_MAIN: StreamGraph = recordedResultOfTheContractType("every-pin-kind-graph-result-of-main", graphResultOfMain, "StreamGraphOnTheWire");

/** `port`, as the runtime's graph serves it, held as the mock holds a port. */
function mockGraphPortOfTheRecordedPort(port: StreamGraphPort, direction: "input" | "output"): MockGraphPort {
  return {
    name: port.name,
    family: familyOfThePort(port),
    stream_facts: streamFactsOfThePort(port),
    values_checked: port.values_checked ?? null,
    pin: pinOfThePort(port),
    value_read: direction === "input" ? inputValueReadOfThePort(port) : null,
  };
}

/** `node`, as the runtime's graph read it, held as the mock holds a node: under the runtime's own id, each input reading what the runtime said it read, a value the input read by default kept as its default. */
function mockGraphNodeOfTheRecordedNode(node: StreamGraphNode): MockGraphNode {
  const inputPorts = node.ports.inputs.map((port) => mockGraphPortOfTheRecordedPort(port, "input"));
  const inputDefaults = Object.fromEntries(inputPorts.flatMap((port) => (port.value_read?.comes_from === "default" ? [[port.name, port.value_read.value] as const] : [])));
  const { components } = node;
  return {
    name: node.name,
    id_kept_through_renames: node.id,
    type: node.type,
    ...(node.kind === undefined || node.kind === null ? {} : { kind: node.kind }),
    state: components.state ?? null,
    ...(components.failed_because === null ? {} : { failed_because: components.failed_because }),
    ...(components.process_raising_because === null ? {} : { process_raising_because: components.process_raising_because }),
    ...(components.not_ready_because === null ? {} : { not_ready_because: components.not_ready_because }),
    config: { ...jsonObjectMembersOf(node.config) },
    pins: { ...jsonObjectMembersOf(node.pins) },
    input_defaults: inputDefaults,
    exposed_config_fields: node.exposed_config_fields ?? [],
    // The mock reads `wire` on a linked input itself; unlinked, an input the runtime read from its wire reads its default, or nothing while it has none.
    input_ports: inputPorts.map((port) =>
      port.value_read?.comes_from === "wire" ? { ...port, value_read: port.name in inputDefaults ? { value: inputDefaults[port.name] ?? null, comes_from: "default" } : { value: null, comes_from: null } } : port,
    ),
    output_ports: node.ports.outputs.map((port) => mockGraphPortOfTheRecordedPort(port, "output")),
    studio: { ...studioFieldsOfTheNode(node) },
  };
}

/** `link`, as the runtime's graph serves it, held as the mock holds a link: a link served with no state is pending, as the runtime reads it. */
function mockGraphLinkOfTheRecordedLink(link: StreamGraphLink): MockGraphLink {
  return { id: link.id, source_node: link.source.node, source_port: link.source.port, target_node: link.target.node, target_port: link.target.port, state: link.state ?? "pending" };
}

/** A fresh copy of the sample's stream `main` as the mock holds a graph, its nodes and links as the runtime's `graph` answered them. */
export function mockRecordedGraphOfTheEveryPinKindSample(): MockStreamGraph {
  return {
    nodes: RECORDED_GRAPH_OF_MAIN.nodes.map(mockGraphNodeOfTheRecordedNode),
    links: RECORDED_GRAPH_OF_MAIN.links.map(mockGraphLinkOfTheRecordedLink),
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
    groups: structuredClone(RECORDED_GRAPH_OF_MAIN.groups ?? []),
    notes: structuredClone([...canvasNotesOfTheGraph(RECORDED_GRAPH_OF_MAIN)]),
  };
}

function recordedRefusal(recording: string, responseText: string): ProjectActionRefusal {
  return projectActionRefusalOfTheContract(readOrFail(recording, controlContractRefusalOf(partOfTheRecordedResponse(recording, responseText, "refusal"))));
}

/** The runtime's refusal of a `connect` from the node not yet typed's Records output into a typed Float input of the sample. */
export const MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-transact-refusal-for-a-records-output-into-a-float-input",
  transactRefusalForALinkOfAnotherType,
);

/** The runtime's refusal of a `set_node_input_value` giving words to a typed Float input of the sample. */
export const MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-transact-refusal-for-words-as-a-float-value",
  transactRefusalForAValueOfAnotherType,
);
