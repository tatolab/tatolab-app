// The graphs `?main_graph=` names `main` to hold in place of Pulse Stage's own graph: the one recorded
// from streamlib's every-pin-kind sample, that graph with a stand-in warned link, a stand-in node with bundle
// pins, two stand-in nodes linked by the sample's named type or a stand-in Graph Input whose setting chooses
// its type, and the large graph of the canvas measurements.

import { largeMockStreamGraph } from "./mock_large_stream_graph";
import { MOCK_RECORDED_NODE_TYPES, MOCK_STAND_IN_SWEEP_POSITION_DESCRIBED, mockEveryPinKindGraphWithAStandInBundleNode, mockEveryPinKindGraphWithAStandInNamedTypeLink, mockEveryPinKindGraphWithAStandInTypeChoosingInput, mockEveryPinKindGraphWithAStandInWarnedLink, mockRecordedGraphOfTheEveryPinKindSample } from "./mock_recordings";
import type { MockRecordedNodeTypes } from "./mock_recordings";
import type { MockStreamGraph } from "./mock_stream_fixtures";
import type { NodeTypeDescription } from "../src/shared/tatolab_backend_contract";

/** What `?main_graph=` names `main` to hold in place of Pulse Stage's own graph. */
export type MockMainGraph = "every_pin_kind" | "every_pin_kind_with_a_warned_link" | "every_pin_kind_with_a_bundle" | "every_pin_kind_with_a_named_type" | "every_pin_kind_with_a_type_choosing_input" | "large";

/** A fresh copy of each graph `?main_graph=` names. */
const MOCK_MAIN_GRAPH_MADE: Record<MockMainGraph, () => MockStreamGraph> = {
  every_pin_kind: mockRecordedGraphOfTheEveryPinKindSample,
  every_pin_kind_with_a_warned_link: mockEveryPinKindGraphWithAStandInWarnedLink,
  every_pin_kind_with_a_bundle: mockEveryPinKindGraphWithAStandInBundleNode,
  every_pin_kind_with_a_named_type: mockEveryPinKindGraphWithAStandInNamedTypeLink,
  every_pin_kind_with_a_type_choosing_input: mockEveryPinKindGraphWithAStandInTypeChoosingInput,
  large: largeMockStreamGraph,
};

/** The graph `?main_graph=` names, `null` when it names none. */
export function mockMainGraphNamed(mainGraphInTheQuery: string | null): MockMainGraph | null {
  return Object.keys(MOCK_MAIN_GRAPH_MADE).find((mainGraph): mainGraph is MockMainGraph => mainGraph === mainGraphInTheQuery) ?? null;
}

/** What `made` makes of a fresh copy of each graph `?main_graph=` names. */
export function mapEachMockMainGraph<Made>(made: (graph: MockStreamGraph) => Made): Record<MockMainGraph, Made> {
  return {
    every_pin_kind: made(MOCK_MAIN_GRAPH_MADE.every_pin_kind()),
    every_pin_kind_with_a_warned_link: made(MOCK_MAIN_GRAPH_MADE.every_pin_kind_with_a_warned_link()),
    every_pin_kind_with_a_bundle: made(MOCK_MAIN_GRAPH_MADE.every_pin_kind_with_a_bundle()),
    every_pin_kind_with_a_named_type: made(MOCK_MAIN_GRAPH_MADE.every_pin_kind_with_a_named_type()),
    every_pin_kind_with_a_type_choosing_input: made(MOCK_MAIN_GRAPH_MADE.every_pin_kind_with_a_type_choosing_input()),
    large: made(MOCK_MAIN_GRAPH_MADE.large()),
  };
}

/** The node types the open project lists while `main` holds `mainGraph`, as the runtime recorded them: the every-pin-kind sample's under each of its graphs, else Pulse Stage's. */
export function recordedNodeTypesOfTheMainGraph(mainGraph: MockMainGraph | null): MockRecordedNodeTypes {
  return MOCK_RECORDED_NODE_TYPES[mainGraph !== null && mainGraph.startsWith("every_pin_kind") ? "every_pin_kind" : "pulse_stage"];
}

/** Each node type described while `main` holds `mainGraph`: those the runtime recorded, and beside the sample's named type a stand-in, its `SweepPosition`, so a refusal's suggested edit can place it. */
export function nodeTypesDescribedWhileMainHolds(mainGraph: MockMainGraph | null): NodeTypeDescription[] {
  const recorded = recordedNodeTypesOfTheMainGraph(mainGraph).described.node_types.flatMap((nodeType) => ("not_described_because" in nodeType ? [] : [nodeType]));
  return mainGraph === "every_pin_kind_with_a_named_type" ? [...recorded, MOCK_STAND_IN_SWEEP_POSITION_DESCRIBED] : recorded;
}
