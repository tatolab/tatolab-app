// What a real runtime answered with streamlib's sample project that declares each kind of pin
// (`examples/every-pin-kind`) open and playing, each answer kept as the runtime sent it under
// `recordings/` and read here through the readers the app uses on a real answer: the node catalog of
// its stream `main`, that stream's graph, and the refusals of `transact` a scenario replays. The mock
// holds no node type, graph or refusal of its own for this work; a recording that no longer reads
// fails the mock's load, as the app would fail to read the runtime's answer.

import registryAnswerOfMain from "./recordings/every-pin-kind-registry-answer-of-main.json?raw";
import graphResultOfMain from "./recordings/every-pin-kind-graph-result-of-main.json?raw";
import transactRefusalForALinkOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-a-records-output-into-a-float-input.json?raw";
import transactRefusalForAValueOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-words-as-a-float-value.json?raw";
import { nodeCatalogFromTheRegistryAnswer } from "../src/main/node_catalog";
import { projectActionRefusalOfTheContract } from "../src/main/project_transactions_on_the_wire";
import { streamGraphSummaryFromTheGraphToolResult } from "../src/main/stream_graph_summary";
import { controlContractRefusalOf } from "../src/main/tatolab_runtime_control_operation_call";
import type { Result } from "../src/main/result";
import type { NodeCatalogEntry, ProjectActionRefusal, StreamGraphNode, StreamGraphSummary } from "../src/shared/tatolab_backend_contract";
import type { MockGraphNode, MockStreamGraph } from "./mock_stream_fixtures";

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

/** The stream the sample's recordings were made from, as the runtime named it. */
const RECORDED_STREAM = "main";

/** Every node type the runtime's registry listed for the sample's stream `main`, read as the app reads `GET /api/registry?stream=`. */
export const MOCK_RECORDED_NODE_CATALOG: readonly NodeCatalogEntry[] = readOrFail("every-pin-kind-registry-answer-of-main", nodeCatalogFromTheRegistryAnswer(RECORDED_STREAM, registryAnswerOfMain)).node_types;

/** The sample's stream `main` as the runtime's `graph` answered it while it played, read as the app reads it. */
const RECORDED_GRAPH_OF_MAIN: StreamGraphSummary = readOrFail(
  "every-pin-kind-graph-result-of-main",
  streamGraphSummaryFromTheGraphToolResult(RECORDED_STREAM, JSON.stringify(partOfTheRecordedResponse("every-pin-kind-graph-result-of-main", graphResultOfMain, "result"))),
);

/** `node`, as the runtime's graph read it, held as the mock holds a node: under the runtime's own id, each input reading what the runtime said it read, a value the input read by default kept as its default. */
function mockGraphNodeOfTheRecordedNode(node: StreamGraphNode): MockGraphNode {
  const inputDefaults = Object.fromEntries(node.input_ports.flatMap((port) => (port.value_read?.comes_from === "default" ? [[port.name, port.value_read.value] as const] : [])));
  return {
    name: node.name,
    id_kept_through_renames: node.id,
    type: node.type,
    ...(node.kind === null ? {} : { kind: node.kind }),
    state: node.state,
    ...(node.failed_because === null ? {} : { failed_because: node.failed_because }),
    ...(node.process_raising_because === null ? {} : { process_raising_because: node.process_raising_because }),
    ...(node.not_ready_because === null ? {} : { not_ready_because: node.not_ready_because }),
    config: node.config,
    pins: node.pins,
    input_defaults: inputDefaults,
    exposed_config_fields: node.exposed_config_fields,
    // The mock reads `wire` on a linked input itself; unlinked, an input the runtime read from its wire reads its default, or nothing while it has none.
    input_ports: node.input_ports.map((port) =>
      port.value_read?.comes_from === "wire" ? { ...port, value_read: port.name in inputDefaults ? { value: inputDefaults[port.name] ?? null, comes_from: "default" } : { value: null, comes_from: null } } : port,
    ),
    output_ports: node.output_ports,
    studio: node.studio,
  };
}

/** A fresh copy of the sample's stream `main` as the mock holds a graph, its nodes and links as the runtime's `graph` answered them. */
export function mockRecordedGraphOfTheEveryPinKindSample(): MockStreamGraph {
  return {
    nodes: RECORDED_GRAPH_OF_MAIN.nodes.map(mockGraphNodeOfTheRecordedNode),
    links: structuredClone(RECORDED_GRAPH_OF_MAIN.links),
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
    groups: structuredClone(RECORDED_GRAPH_OF_MAIN.groups),
    notes: structuredClone(RECORDED_GRAPH_OF_MAIN.notes),
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
