import { describe, expect, it } from "vitest";
import type { StreamGraph, StreamGraphNode, StreamGraphPort } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphLink, aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { nodeVisualizerSubjectOf, stateKeepingThePlayedNodeFromWriting } from "./node_visualizer_subject";

const STREAM = "show-main-0a1b2c";

function nodeWithOutputs(name: string, outputs: StreamGraphPort[]): StreamGraphNode {
  return aGraphNode(name, { id: `id-${name}`, type: "Processor", kind: "process", outputs, components: { state: "Running" } });
}

const CAMERA = nodeWithOutputs("camera", [aGraphPort("video", { pin_type: { type: "texture" }, flow: "stream" })]);
const METER = nodeWithOutputs("brightnessmeter", [aGraphPort("readings", { values_checked: false }), aGraphPort("preview", { pin_type: { type: "texture" }, flow: "stream" })]);
const LFO = nodeWithOutputs("lfo", [aGraphPort("result")]);
const DISPLAY = nodeWithOutputs("displaywindow", []);

const GRAPH: StreamGraph = aStreamGraph([CAMERA, METER, LFO, DISPLAY], [aGraphLink("camera-to-display", ["camera", "video"], ["displaywindow", "video"])], { stream: STREAM });

describe("what the Node visualizer shows", () => {
  it("is nothing while no node of the stream is selected", () => {
    expect(nodeVisualizerSubjectOf(GRAPH, null)).toEqual({ kind: "nothing_selected" });
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "nothing" })).toEqual({ kind: "nothing_selected" });
    expect(nodeVisualizerSubjectOf(GRAPH, { kind: "node", stream: "another-stream", node: "camera" })).toEqual({ kind: "nothing_selected" });
  });

  it("is the selected node's first Texture output, whatever order its ports come in, or else its first output of any type, linked or not", () => {
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
    expect(stateKeepingThePlayedNodeFromWriting({ ...GRAPH, nodes: [{ ...CAMERA, components: { ...CAMERA.components, state: null } }] }, cameraPort)).toBeNull();
  });

  it("is the runtime's state for a node stopped, failed or not started yet", () => {
    for (const state of ["Stopped", "Error", "Pending", "Idle", "Paused"] satisfies NonNullable<StreamGraphNode["components"]["state"]>[]) {
      expect(stateKeepingThePlayedNodeFromWriting({ ...GRAPH, nodes: [{ ...CAMERA, components: { ...CAMERA.components, state } }] }, cameraPort)).toBe(state);
    }
  });
});
