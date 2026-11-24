// What a real runtime answered with streamlib's sample projects open and playing, each answer kept as
// the runtime sent it under `recordings/` and read here through the readers the app uses on a real
// answer. Pulse Stage (`examples/pulse-stage`), the mock's open project: the node types it lists and
// each one described, and its stream `main`'s graph, recorded from the `tatolabd` 0.68.82 built from
// streamlib at e2c7162 with the sample playing. The sample that declares each kind of pin
// (`examples/every-pin-kind`), which `?main_graph=` shows in its place: its node types, its stream
// `main`'s graph and the refusals of `transact` a scenario replays, recorded from the `tatolabd` 0.68.82
// built from streamlib, the graph and the refusals at 6c0be0f; and once each setting became an input, its
// node types described, its stream `main`'s graph and the refusal of a link into a Graph Input's setting,
// recorded from the runtime built from streamlib at 9f9ba3244, which marks each input `takes_a_wire`.
// The mock holds no node type, graph or refusal of its own for this work, but for one warning on a link,
// one node with bundle pins, two nodes linked by a named type and a setting a link feeds, which no
// recording carries, each named as a stand-in where it is held; a recording that no longer reads fails
// the mock's load, as the app would fail to read the runtime's answer. The recordings made before
// 9f9ba3244 mark no input, and the mock serves them unmarked, as they were recorded. The machine's
// audio capture devices are the fixed listing streamlib's control-plane stub answers
// `list_audio_capture_devices` with at ece82e6aa, which names no real machine's devices.

import pulseStageListNodeTypesResult from "./recordings/pulse-stage-list-node-types-result.json?raw";
import pulseStageDescribeNodeTypesResult from "./recordings/pulse-stage-describe-node-types-result.json?raw";
import everyPinKindListNodeTypesResult from "./recordings/every-pin-kind-list-node-types-result.json?raw";
import everyPinKindDescribeNodeTypesResult from "./recordings/every-pin-kind-describe-node-types-result.json?raw";
import graphResultOfMain from "./recordings/every-pin-kind-graph-result-of-main.json?raw";
import everyPinKindDescribeNodeTypesResultWithSettingsAsInputs from "./recordings/every-pin-kind-describe-node-types-result-with-settings-as-inputs.json?raw";
import graphResultOfMainWithSettingsAsInputs from "./recordings/every-pin-kind-graph-result-of-main-with-settings-as-inputs.json?raw";
import connectRefusalForAWireIntoTheWarmthBasePortSetting from "./recordings/every-pin-kind-connect-refusal-for-a-wire-into-the-warmth-base-port-setting.json?raw";
import transactRefusalForALinkOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-a-records-output-into-a-float-input.json?raw";
import transactRefusalForAValueOfAnotherType from "./recordings/every-pin-kind-transact-refusal-for-words-as-a-float-value.json?raw";
import transactRefusalForASweepIntoAFloat from "./recordings/every-pin-kind-transact-refusal-for-a-sweep-output-into-a-float-input.json?raw";
import pulseStageGraphResultOfMain from "./recordings/pulse-stage-graph-result-of-main.json?raw";
import pipewireMachineListAudioCaptureDevicesResult from "./recordings/pipewire-machine-list-audio-capture-devices-result.json?raw";
import { projectActionRefusalOfTheContract } from "../src/main/project_transactions_on_the_wire";
import { controlContractRefusalOf, describeTheContractIssues, readControlContractValue } from "../src/main/tatolab_runtime_control_operation_call";
import { isAJsonValue } from "../src/main/json_on_the_wire";
import type { Result } from "../src/main/result";
import { exactPinOfTheDeclaredPort } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import {
  canvasNotesOfTheGraph,
  familyOfThePort,
  inputValueReadOfThePort,
  jsonObjectMembersOf,
  NODE_STUDIO_FIELDS_NONE_SET,
  pinOfThePort,
  streamFactsOfThePort,
  studioFieldsOfTheNode,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import type { ControlContractComponentName, ControlContractComponents } from "@tatolab/runtime-client/contract";
import type { DescribeNodeTypesToolResult, JsonValue, ListAudioCaptureDevicesToolResult, ListNodeTypesToolResult, NodeTypeDescription, ProjectActionRefusal, StreamGraph, StreamGraphLink, StreamGraphLinkWarning, StreamGraphNode, StreamGraphPort, StreamGraphPortPin } from "../src/shared/tatolab_backend_contract";
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

/**
 * The every-pin-kind sample's node types as the runtime at 9f9ba3244 described them, each setting an input it marks, and after
 * them each node type the earlier recording described that it did not, such as the `Flash` the sample no longer holds, as the
 * mock lists them all from the one listing recorded.
 */
function describedAfterwardsElseBefore(afterwards: DescribeNodeTypesToolResult, before: DescribeNodeTypesToolResult): DescribeNodeTypesToolResult {
  const describedAfterwards = new Set(afterwards.node_types.map((nodeType) => nodeType.node_type));
  return { ...afterwards, node_types: [...afterwards.node_types, ...before.node_types.filter((nodeType) => !describedAfterwards.has(nodeType.node_type))] };
}

/** A sample whose node types the mock holds as the runtime listed and described them. */
type MockRecordedSample = "pulse_stage" | "every_pin_kind" | "every_pin_kind_with_settings_as_inputs";

/** The node types the runtime's `list_node_types` listed for a sample, and each one as its `describe_node_types` described it while the sample's stream `main` played. */
export interface MockRecordedNodeTypes {
  listed: ListNodeTypesToolResult;
  described: DescribeNodeTypesToolResult;
}

/**
 * Each sample's node types as the runtime listed and described them: Pulse Stage's, and the every-pin-kind sample's, recorded
 * at 4b7a935 with streamlib's `tatolab-compositor` installed beside it and a `Spotlight` and an `AlphaOverCompositor` node added to
 * its playing stream, so a loaded stream describes every node type it lists.
 */
export const MOCK_RECORDED_NODE_TYPES: Readonly<Record<MockRecordedSample, MockRecordedNodeTypes>> = {
  pulse_stage: {
    listed: recordedResultOfTheContractType("pulse-stage-list-node-types-result", pulseStageListNodeTypesResult, "ListNodeTypesToolResult"),
    described: recordedResultOfTheContractType("pulse-stage-describe-node-types-result", pulseStageDescribeNodeTypesResult, "DescribeNodeTypesToolResult"),
  },
  every_pin_kind: {
    listed: recordedResultOfTheContractType("every-pin-kind-list-node-types-result", everyPinKindListNodeTypesResult, "ListNodeTypesToolResult"),
    described: recordedResultOfTheContractType("every-pin-kind-describe-node-types-result", everyPinKindDescribeNodeTypesResult, "DescribeNodeTypesToolResult"),
  },
  every_pin_kind_with_settings_as_inputs: {
    listed: recordedResultOfTheContractType("every-pin-kind-list-node-types-result", everyPinKindListNodeTypesResult, "ListNodeTypesToolResult"),
    described: describedAfterwardsElseBefore(
      recordedResultOfTheContractType("every-pin-kind-describe-node-types-result-with-settings-as-inputs", everyPinKindDescribeNodeTypesResultWithSettingsAsInputs, "DescribeNodeTypesToolResult"),
      recordedResultOfTheContractType("every-pin-kind-describe-node-types-result", everyPinKindDescribeNodeTypesResult, "DescribeNodeTypesToolResult"),
    ),
  },
};

/** The every-pin-kind sample's stream `main` as the runtime's `graph` answered it while it played. */
const RECORDED_GRAPH_OF_MAIN: StreamGraph = recordedResultOfTheContractType("every-pin-kind-graph-result-of-main", graphResultOfMain, "StreamGraphOnTheWire");

/**
 * The every-pin-kind sample's stream `main` as the runtime at 9f9ba3244 answered `graph`, each setting an input it marks: the
 * Graph Inputs `brightness`, `warmth_base`, whose `pin_type` setting chooses Float, and `caption_lines`, each linked into a node.
 */
const RECORDED_GRAPH_OF_MAIN_WITH_SETTINGS_AS_INPUTS: StreamGraph = recordedResultOfTheContractType(
  "every-pin-kind-graph-result-of-main-with-settings-as-inputs",
  graphResultOfMainWithSettingsAsInputs,
  "StreamGraphOnTheWire",
);

/** Pulse Stage's stream `main` as the runtime's `graph` answered it while it played. */
const RECORDED_PULSE_STAGE_GRAPH_OF_MAIN: StreamGraph = recordedResultOfTheContractType("pulse-stage-graph-result-of-main", pulseStageGraphResultOfMain, "StreamGraphOnTheWire");

/** `port`, as the runtime's graph serves it, held as the mock holds a port. */
function mockGraphPortOfTheRecordedPort(port: StreamGraphPort, direction: "input" | "output"): MockGraphPort {
  return {
    name: port.name,
    family: familyOfThePort(port),
    stream_facts: streamFactsOfThePort(port),
    values_checked: port.values_checked ?? null,
    pin: pinOfThePort(port),
    value_read: direction === "input" ? inputValueReadOfThePort(port) : null,
    ...(port.annotations === undefined ? {} : { annotations: port.annotations }),
    ...(port.takes_a_wire === undefined || port.takes_a_wire === null ? {} : { takes_a_wire: port.takes_a_wire }),
  };
}

/** What `port`, which the runtime read from its wire, reads once unlinked: its default, nothing while a value input has none, and no stored value at all on a stream or Trigger input. */
function valueReadOfTheUnlinkedInput(port: MockGraphPort, inputDefaults: Readonly<Record<string, JsonValue>>): MockGraphPort["value_read"] {
  if (port.name in inputDefaults) return { value: inputDefaults[port.name] ?? null, comes_from: "default" };
  return port.pin?.flow === "value" ? { value: null, comes_from: null } : null;
}

/** `node`, as the runtime's graph read it, held as the mock holds a node: under the runtime's own id, each input reading what the runtime said it read, a value the input read by default kept as its default. */
function mockGraphNodeOfTheRecordedNode(node: StreamGraphNode): MockGraphNode {
  const inputPorts = node.ports.inputs.map((port) => mockGraphPortOfTheRecordedPort(port, "input"));
  const inputDefaults: Record<string, JsonValue> = {};
  node.ports.inputs.forEach((port, index) => {
    const valueRead = inputPorts[index]?.value_read;
    if (valueRead?.comes_from === "default") inputDefaults[port.name] = valueRead.value;
    else if (port.pin_default !== null && isAJsonValue(port.pin_default)) inputDefaults[port.name] = port.pin_default;
  });
  const { components } = node;
  return {
    name: node.name,
    id_kept_through_renames: node.id,
    type: node.type,
    ...(node.kind === undefined || node.kind === null ? {} : { kind: node.kind }),
    ...(node.language === undefined || node.language === null ? {} : { language: node.language }),
    state: components.state ?? null,
    ...(components.failed_because === null ? {} : { failed_because: components.failed_because }),
    ...(components.process_raising_because === null ? {} : { process_raising_because: components.process_raising_because }),
    ...(components.not_ready_because === null ? {} : { not_ready_because: components.not_ready_because }),
    config: { ...jsonObjectMembersOf(node.config) },
    // An input the runtime read as `saved` holds that value, whether its graph document keeps it among the node's pins or, as a Graph Input's `value`, among its input values.
    pins: { ...Object.fromEntries(inputPorts.flatMap((port) => (port.value_read?.comes_from === "saved" ? [[port.name, port.value_read.value] as const] : []))), ...jsonObjectMembersOf(node.pins) },
    input_defaults: inputDefaults,
    exposed_config_fields: node.exposed_config_fields ?? [],
    // The mock reads `wire` on a linked input itself; unlinked, an input the runtime read from its wire reads its default, nothing while a value input has none, and takes no stored value as a stream or Trigger input.
    input_ports: inputPorts.map((port) => (port.value_read?.comes_from === "wire" ? { ...port, value_read: valueReadOfTheUnlinkedInput(port, inputDefaults) } : port)),
    output_ports: node.ports.outputs.map((port) => mockGraphPortOfTheRecordedPort(port, "output")),
    studio: { ...studioFieldsOfTheNode(node) },
    ...(node.fragment === undefined || node.fragment === null
      ? {}
      : { fragment: { nodes: node.fragment.nodes.map(mockGraphNodeOfTheRecordedNode), links: node.fragment.links.map(mockGraphLinkOfTheRecordedLink), groups: structuredClone(node.fragment.groups ?? []) } }),
  };
}

/** `link`, as the runtime's graph serves it, held as the mock holds a link with the marks the runtime gave it: a link served with no state is pending, as the runtime reads it. */
function mockGraphLinkOfTheRecordedLink(link: StreamGraphLink): MockGraphLink {
  return {
    id: link.id,
    source_node: link.source.node,
    source_port: link.source.port,
    target_node: link.target.node,
    target_port: link.target.port,
    state: link.state ?? "pending",
    ...(link.free_conversion === true ? { free_conversion: true } : {}),
    ...(link.warnings === undefined ? {} : { warnings: structuredClone(link.warnings) }),
  };
}

/** A fresh copy of `recorded` as the mock holds a graph, its nodes and links as the runtime's `graph` answered them. */
function mockGraphOfTheRecordedGraph(recorded: StreamGraph): MockStreamGraph {
  return {
    nodes: recorded.nodes.map(mockGraphNodeOfTheRecordedNode),
    links: recorded.links.map(mockGraphLinkOfTheRecordedLink),
    counterRates: { droppedPerSecondByLinkId: {}, refusedPerSecondByOutput: [] },
    groups: structuredClone(recorded.groups ?? []),
    notes: structuredClone([...canvasNotesOfTheGraph(recorded)]),
  };
}

/** A fresh copy of the every-pin-kind sample's stream `main` as the mock holds a graph. */
export function mockRecordedGraphOfTheEveryPinKindSample(): MockStreamGraph {
  return mockGraphOfTheRecordedGraph(RECORDED_GRAPH_OF_MAIN);
}

/** A fresh copy of the every-pin-kind sample's stream `main` as the runtime at 9f9ba3244 answered it, as the mock holds a graph. */
export function mockRecordedGraphOfTheEveryPinKindSampleWithSettingsAsInputs(): MockStreamGraph {
  return mockGraphOfTheRecordedGraph(RECORDED_GRAPH_OF_MAIN_WITH_SETTINGS_AS_INPUTS);
}

/** A fresh copy of Pulse Stage's stream `main` as the mock holds a graph. */
export function mockRecordedGraphOfThePulseStageSample(): MockStreamGraph {
  return mockGraphOfTheRecordedGraph(RECORDED_PULSE_STAGE_GRAPH_OF_MAIN);
}

function recordedRefusal(recording: string, responseText: string): ProjectActionRefusal {
  return projectActionRefusalOfTheContract(readOrFail(recording, controlContractRefusalOf(partOfTheRecordedResponse(recording, responseText, "refusal"))));
}

/** The audio inputs and output monitors a Linux machine's runtime listed over PipeWire: two inputs, the default output's monitor, then each output's own. */
export const MOCK_RECORDED_AUDIO_CAPTURE_DEVICES: ListAudioCaptureDevicesToolResult = recordedResultOfTheContractType(
  "pipewire-machine-list-audio-capture-devices-result",
  pipewireMachineListAudioCaptureDevicesResult,
  "ListAudioCaptureDevicesToolResult",
);

/** The runtime's refusal of a `connect` from the node not yet typed's Records output into a typed Float input of the sample. */
export const MOCK_RECORDED_REFUSAL_OF_A_LINK_OF_ANOTHER_TYPE: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-transact-refusal-for-a-records-output-into-a-float-input",
  transactRefusalForALinkOfAnotherType,
);

/** The runtime's refusal, as `input_takes_no_wire`, of a `connect` from `caption.result` into `warmth_base.port`, a Graph Input's setting. */
export const MOCK_RECORDED_REFUSAL_OF_A_WIRE_INTO_A_SETTING_THAT_TAKES_NONE: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-connect-refusal-for-a-wire-into-the-warmth-base-port-setting",
  connectRefusalForAWireIntoTheWarmthBasePortSetting,
);

/** The runtime's refusal of a `set_node_input_value` giving words to a typed Float input of the sample. */
export const MOCK_RECORDED_REFUSAL_OF_A_VALUE_OF_ANOTHER_TYPE: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-transact-refusal-for-words-as-a-float-value",
  transactRefusalForAValueOfAnotherType,
);

/**
 * A stand-in, since no recording of the every-pin-kind sample holds a warned link: the warning streamlib's engine test
 * `a_connected_link_carries_the_warnings_its_verdict_gives` pins for a link between two stated meanings, with its words, given to the
 * sample's link from `beat.count` into `warmth.count`, so the canvas shows a warned link as the runtime serves one.
 */
const STAND_IN_WARNING_OF_A_LINK: StreamGraphLinkWarning = { warning: "meanings_differ", output_meaning: "seconds", input_meaning: "frames", words: "the output carries `seconds` and the input takes `frames`" };

/** The every-pin-kind sample's graph with `STAND_IN_WARNING_OF_A_LINK` on its link from `beat.count` into `warmth.count`. */
export function mockEveryPinKindGraphWithAStandInWarnedLink(): MockStreamGraph {
  const graph = mockRecordedGraphOfTheEveryPinKindSample();
  return {
    ...graph,
    links: graph.links.map((link) => (link.source_node === "beat" && link.source_port === "count" && link.target_node === "warmth" && link.target_port === "count" ? { ...link, warnings: [STAND_IN_WARNING_OF_A_LINK] } : link)),
  };
}

/** The members of `STAND_IN_BUNDLE_NODE`'s bundles: a level for each side, read as a Float each. */
const STAND_IN_BUNDLE_PIN: StreamGraphPortPin = {
  pin_type: { type: "bundle", members: [{ name: "left", member_type: { type: "float" } }, { name: "right", member_type: { type: "float" } }] },
  flow: "value",
};

/**
 * A stand-in, since no product node type, sample or Python authoring surface declares a bundle pin yet: a node of a type no
 * project lists, `nodes.mixer:LevelMixer`, with a bundle input `levels` and a bundle output `meters`, each of a Float `left` and
 * `right`. Its `levels.left` holds a saved value and `levels.right` reads its default, and its card keeps `levels` open.
 */
function standInBundleNode(): MockGraphNode {
  return {
    name: "mixer",
    type: "nodes.mixer:LevelMixer",
    kind: "process",
    state: "Running",
    config: {},
    pins: { levels: { left: 0.25 } },
    input_defaults: {},
    exposed_config_fields: [],
    input_ports: [
      {
        name: "levels",
        family: "channels",
        stream_facts: null,
        values_checked: null,
        pin: STAND_IN_BUNDLE_PIN,
        value_read: null,
        member_reads: [
          { member: "left", value_read: { value: 0.25, comes_from: "saved" }, default_value: 0.5 },
          { member: "right", value_read: { value: 0.5, comes_from: "default" }, default_value: 0.5 },
        ],
      },
    ],
    output_ports: [{ name: "meters", family: "channels", stream_facts: null, values_checked: null, pin: STAND_IN_BUNDLE_PIN, value_read: null }],
    studio: { ...NODE_STUDIO_FIELDS_NONE_SET, metadata: { open_bundles: { inputs: ["levels"], outputs: [] } } },
  };
}

/** The every-pin-kind sample's graph with the stand-in `mixer` beside it, `warmth.result` linked into the member `right` of its `levels`. */
export function mockEveryPinKindGraphWithAStandInBundleNode(): MockStreamGraph {
  const graph = mockRecordedGraphOfTheEveryPinKindSample();
  return {
    ...graph,
    nodes: [...graph.nodes, standInBundleNode()],
    links: [...graph.links, { id: "Lmockstandinmemberlink0001", source_node: "warmth", source_port: "result", target_node: "mixer", target_port: "levels", target_member: "right", state: "wired" }],
  };
}

/** The pin of the sample's own named type, `nodes.sweep:Sweep`, which `sweep.py` declares. */
const STAND_IN_SWEEP_PIN: StreamGraphPortPin = { pin_type: { type: "named", named_pin_type: "nodes.sweep:Sweep" }, flow: "value" };

/** The UUIDs the sample's graph document gives `sweep` and `sweep_position`. */
const SAMPLE_SWEEP_NODE = "3e8b1c47-9d2a-4f60-b5e8-1a7c4d9f2e36";
const SAMPLE_SWEEP_POSITION_NODE = "7b5d2e91-4c3f-4a8e-9b1d-6f0e2c8a5d47";

/**
 * A stand-in, since the recordings were made before the every-pin-kind sample declared its named type: the sample's `sweep`, a
 * `SweepAt` writing a `Sweep`, linked into `sweep_position`, a `SweepPosition` reading it back, as the sample's stream holds them.
 */
function standInSweepNodes(): readonly MockGraphNode[] {
  const floatPort = (name: string, value: number): MockGraphPort => ({ name, family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "float" }, flow: "value" }, value_read: { value, comes_from: "default" } });
  return [
    {
      name: "sweep",
      id_kept_through_renames: SAMPLE_SWEEP_NODE,
      type: "nodes.sweep:SweepAt",
      kind: "process",
      state: "Running",
      config: {},
      pins: {},
      input_defaults: { position: 0.5, width: 0.1 },
      exposed_config_fields: [],
      input_ports: [floatPort("position", 0.5), floatPort("width", 0.1)],
      output_ports: [{ name: "result", family: "channels", stream_facts: null, values_checked: null, pin: STAND_IN_SWEEP_PIN, value_read: null }],
      studio: { ...NODE_STUDIO_FIELDS_NONE_SET },
    },
    {
      name: "sweep_position",
      id_kept_through_renames: SAMPLE_SWEEP_POSITION_NODE,
      type: "nodes.sweep:SweepPosition",
      kind: "process",
      state: "Running",
      config: {},
      pins: {},
      input_defaults: {},
      exposed_config_fields: [],
      input_ports: [{ name: "sweep", family: "channels", stream_facts: null, values_checked: null, pin: STAND_IN_SWEEP_PIN, value_read: { value: null, comes_from: null } }],
      output_ports: [{ name: "result", family: "channels", stream_facts: null, values_checked: null, pin: { pin_type: { type: "float" }, flow: "value" }, value_read: null }],
      studio: { ...NODE_STUDIO_FIELDS_NONE_SET },
    },
  ];
}

/** The every-pin-kind sample's graph with the stand-in `sweep` beside it, its `result` linked into `sweep_position.sweep`. */
export function mockEveryPinKindGraphWithAStandInNamedTypeLink(): MockStreamGraph {
  const graph = mockRecordedGraphOfTheEveryPinKindSample();
  return {
    ...graph,
    nodes: [...graph.nodes, ...standInSweepNodes()],
    links: [...graph.links, { id: "Lmockstandinnamedtypelink01", source_node: "sweep", source_port: "result", target_node: "sweep_position", target_port: "sweep", state: "wired" }],
  };
}

/**
 * A stand-in, since no recording describes the sample's `SweepPosition`: the conversion `sweep.py` states from its named type to a
 * Float, described as the runtime describes the sample's other function nodes, so the mock can place it.
 */
export const MOCK_STAND_IN_SWEEP_POSITION_DESCRIBED: NodeTypeDescription = {
  node_type: "nodes.sweep:SweepPosition",
  source: "project",
  described_from: "interpreter",
  documentation: "Where a band is across the picture, read from the sample's own named type.",
  category: "Every pin kind",
  kind: "function",
  declared_at: { path: "nodes/sweep.py", line: 74 },
  inputs: [{ name: "sweep", documentation: "", pin_type: { kind: "is", pin_type: STAND_IN_SWEEP_PIN.pin_type }, flow: "value", mode: "wire_only", takes_a_wire: true, lifetime: "kept" }],
  outputs: [{ name: "result", documentation: "", pin_type: { kind: "is", pin_type: { type: "float" } }, flow: "value" }],
};

/**
 * The runtime's refusal of a `connect` from `sweep.result` into `beat.beats_per_minute`, a link only the sample's `SweepPosition`
 * bridges, its `suggested_call` the `transact` that places it, the stream named by its id.
 */
const MOCK_RECORDED_REFUSAL_OF_A_SWEEP_INTO_A_FLOAT: ProjectActionRefusal = recordedRefusal(
  "every-pin-kind-transact-refusal-for-a-sweep-output-into-a-float-input",
  transactRefusalForASweepIntoAFloat,
);

/** `refusal` with each operation of its suggested `transact` on the stream the mock lists as `streamId`, wherever the runtime that gave it listed its own. */
function withTheSuggestedTransactOnTheStream(refusal: ProjectActionRefusal, streamId: string): ProjectActionRefusal {
  const operations = refusal.suggested_call?.operation === "transact" ? refusal.suggested_call.params.operations : undefined;
  if (refusal.suggested_call === null || !Array.isArray(operations)) return refusal;
  return {
    ...refusal,
    suggested_call: {
      ...refusal.suggested_call,
      params: {
        ...refusal.suggested_call.params,
        operations: operations.map((operation) => (typeof operation === "object" && operation !== null && !Array.isArray(operation) && "stream" in operation ? { ...operation, stream: streamId } : operation)),
      },
    },
  };
}

/** The runtime's refusal of a `connect` from `sweep.result` into `beat.beats_per_minute`, its suggested `transact` on the stream the mock lists as `streamId`. */
export function mockRecordedRefusalOfASweepIntoAFloat(streamId: string): ProjectActionRefusal {
  return withTheSuggestedTransactOnTheStream(MOCK_RECORDED_REFUSAL_OF_A_SWEEP_INTO_A_FLOAT, streamId);
}

/** The node type of the built-in `TensorToAudio`, whose settings the runtime at 9f9ba3244 describes as read at setup and taking a wire. */
const TENSOR_TO_AUDIO_NODE_TYPE = "tatolab.stream:TensorToAudio";

/** `TensorToAudio` as the runtime at 9f9ba3244 described it. */
function recordedTensorToAudioDescribed(): NodeTypeDescription {
  const described = MOCK_RECORDED_NODE_TYPES.every_pin_kind_with_settings_as_inputs.described.node_types.find((nodeType) => nodeType.node_type === TENSOR_TO_AUDIO_NODE_TYPE);
  if (described === undefined || "not_described_because" in described) throw new MockRecordingUnreadable(`the recording every-pin-kind-describe-node-types-result-with-settings-as-inputs describes no ${TENSOR_TO_AUDIO_NODE_TYPE}`);
  return described;
}

/**
 * A stand-in, since no recording holds a setting a link feeds: a `TensorToAudio` placed as `tensortoaudio`, its ports and each
 * one's mark as the runtime at 9f9ba3244 described its node type, each value input reading its default.
 */
function standInNodeWithAWiredSetting(): MockGraphNode {
  const described = recordedTensorToAudioDescribed();
  const portOf = (port: NodeTypeDescription["outputs"][number]): MockGraphPort => {
    const family = familyOfThePort(port);
    return { name: port.name, family, stream_facts: null, values_checked: family === "records" ? false : null, pin: exactPinOfTheDeclaredPort(port), value_read: null };
  };
  const inputDefaults = Object.fromEntries(described.inputs.flatMap((input) => (input.default_value === undefined || input.default_value === null || !isAJsonValue(input.default_value) ? [] : [[input.name, input.default_value] as const])));
  return {
    name: "tensortoaudio",
    type: TENSOR_TO_AUDIO_NODE_TYPE,
    kind: "process",
    state: "Running",
    config: {},
    pins: {},
    input_defaults: inputDefaults,
    exposed_config_fields: [],
    input_ports: described.inputs.map((input) => ({
      ...portOf(input),
      value_read: input.name in inputDefaults ? { value: inputDefaults[input.name] ?? null, comes_from: "default" } : null,
      ...(input.takes_a_wire === undefined ? {} : { takes_a_wire: input.takes_a_wire }),
    })),
    output_ports: described.outputs.map(portOf),
    studio: { ...NODE_STUDIO_FIELDS_NONE_SET },
  };
}

/**
 * The every-pin-kind sample's graph as recorded once each setting became an input, with `flash`, a process node the earlier
 * recording held whose Integer `flashes` is a value, beside it, and the stand-in `tensortoaudio`, `flash.flashes` linked into its
 * `sample_rate`.
 */
export function mockEveryPinKindGraphWithAStandInWiredSetting(): MockStreamGraph {
  const graph = mockRecordedGraphOfTheEveryPinKindSampleWithSettingsAsInputs();
  const flash = mockRecordedGraphOfTheEveryPinKindSample().nodes.find((node) => node.name === "flash");
  if (flash === undefined) throw new MockRecordingUnreadable("the recording every-pin-kind-graph-result-of-main holds no flash");
  return {
    ...graph,
    nodes: [...graph.nodes, flash, standInNodeWithAWiredSetting()],
    links: [...graph.links, { id: "Lmockstandinwiredsetting01", source_node: "flash", source_port: "flashes", target_node: "tensortoaudio", target_port: "sample_rate", state: "wired" }],
  };
}
