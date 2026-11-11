import { describe, expect, it } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeVisualizerSubjectOf, stateKeepingThePlayedNodeFromWriting } from "./node_visualizer_subject";

const STREAM = "show-main-0a1b2c";

function nodeWithOutputs(name: string, outputPorts: StreamGraphNode["output_ports"]): StreamGraphNode {
  return { id: `id-${name}`, name, type: "Processor", state: "Running", failed_because: null, process_raising_because: null, config: {}, input_ports: [], output_ports: outputPorts, dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null, graph_interface: null };
}

const CAMERA = nodeWithOutputs("camera", [{ name: "video", family: "image", stream_facts: null, values_checked: null }]);
const METER = nodeWithOutputs("brightnessmeter", [
  { name: "readings", family: "records", stream_facts: null, values_checked: false },
  { name: "preview", family: "image", stream_facts: null, values_checked: null },
]);
const LFO = nodeWithOutputs("lfo", [{ name: "result", family: "array", stream_facts: null, values_checked: null }]);
const DISPLAY = nodeWithOutputs("displaywindow", []);

const GRAPH: StreamGraphSummary = {
  stream: STREAM,
  nodes: [CAMERA, METER, LFO, DISPLAY],
  links: [{ id: "camera-to-display", source_node: "camera", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" }],
  stream_asset: null,
  groups: [],
  notes: [],
  graph_document_text: "",
};

describe("what the Node visualizer shows", () => {
  it("is nothing while no node of the stream is selected", () => {
    expect(nodeVisualizerSubjectOf(GRAPH, null)).toEqual({ kind: "nothing_selected" });
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "nothing" })).toEqual({ kind: "nothing_selected" });
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "node", stream: "another-stream", node: "camera" })).toEqual({ kind: "nothing_selected" });
  });

  it("is the selected node's first Image port, whatever order its ports come in, or else its first port of any family, linked or not", () => {
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "node", stream: STREAM, node: "brightnessmeter" })).toEqual({ kind: "port", port: { node_id: "id-brightnessmeter", node_name: "brightnessmeter", port: "preview" } });
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "node", stream: STREAM, node: "lfo" })).toEqual({ kind: "port", port: { node_id: "id-lfo", node_name: "lfo", port: "result" } });
  });

  it("is the selected node itself when it has no output, never a port of another node", () => {
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "node", stream: STREAM, node: "displaywindow" })).toEqual({ kind: "node_without_output", node: DISPLAY });
  });
});

describe("the state keeping a played node from writing", () => {
  const cameraPort = { node_id: "id-camera", node_name: "camera", port: "video" };

  it("is none while the node runs, or while the graph names no state", () => {
    expect(stateKeepingThePlayedNodeFromWriting(GRAPH, cameraPort)).toBeNull();
    expect(stateKeepingThePlayedNodeFromWriting({ ...GRAPH, nodes: [{ ...CAMERA, state: null }] }, cameraPort)).toBeNull();
  });

  it("is the runtime's state for a node stopped, failed or not started yet", () => {
    for (const state of ["Stopped", "Error", "Pending", "Idle", "Paused"]) expect(stateKeepingThePlayedNodeFromWriting({ ...GRAPH, nodes: [{ ...CAMERA, state }] }, cameraPort)).toBe(state);
  });
});
