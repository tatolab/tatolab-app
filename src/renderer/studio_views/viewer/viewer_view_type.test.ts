import { describe, expect, it } from "vitest";
import type { StreamGraphNode, StreamGraphSummary } from "../../view_host/studio_view_contract";
import { outputPortTheViewerPlays, poppedOutViewerTargetOf, portTheViewerPlays } from "./viewer_view_type";

const STREAM = "show-main-0a1b2c";

function nodeWithOutputs(name: string, outputPorts: StreamGraphNode["output_ports"]): StreamGraphNode {
  return { id: `id-${name}`, name, type: "Processor", state: "Running", config: {}, input_ports: [], output_ports: outputPorts, dropped_bags_by_link: {}, refused_bags_by_output_port: {} };
}

const CAMERA = nodeWithOutputs("camera", [{ name: "video", family: "image", catalog_section: "video" }]);
const EFFECT = nodeWithOutputs("halftonelenseffect", [{ name: "video_to_downstream", family: "image", catalog_section: "video" }]);
const METER = nodeWithOutputs("brightnessmeter", [{ name: "readings", family: "records", catalog_section: null }]);

const GRAPH: StreamGraphSummary = {
  stream: STREAM,
  nodes: [CAMERA, EFFECT, METER],
  links: [{ id: "camera-to-effect", source_node: "camera", source_port: "video", target_node: "halftonelenseffect", target_port: "video_in", state: "wired" }],
  exposed: [],
  graph_document_text: "",
};

describe("the output port the Viewer plays", () => {
  it("is the stream's first Image port that feeds nothing on, while no node of the stream is selected", () => {
    expect(outputPortTheViewerPlays(GRAPH, { kind: "nothing" })).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
    expect(outputPortTheViewerPlays(GRAPH, { kind: "node", stream: "another-stream", node: "camera" })).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
  });

  it("is the selected node's, of whatever family", () => {
    expect(outputPortTheViewerPlays(GRAPH, { kind: "node", stream: STREAM, node: "camera" })).toEqual({ node_id: "id-camera", node_name: "camera", port: "video" });
    expect(outputPortTheViewerPlays(GRAPH, { kind: "node", stream: STREAM, node: "brightnessmeter" })).toEqual({ node_id: "id-brightnessmeter", node_name: "brightnessmeter", port: "readings" });
  });

  it("is a port of another family where the stream has no Image port, and none where it has no output", () => {
    expect(outputPortTheViewerPlays({ ...GRAPH, nodes: [METER] }, null)).toEqual({ node_id: "id-brightnessmeter", node_name: "brightnessmeter", port: "readings" });
    expect(outputPortTheViewerPlays({ ...GRAPH, nodes: [] }, null)).toBeNull();
  });

  it("is the port chosen for this stream while the graph still has it, over the selection", () => {
    const chosenTheCamera = { chosen_port: { stream: STREAM, node_id: "id-camera", port: "video" } };
    expect(portTheViewerPlays(GRAPH, { kind: "node", stream: STREAM, node: "brightnessmeter" }, chosenTheCamera)).toEqual({ node_id: "id-camera", node_name: "camera", port: "video" });
    expect(portTheViewerPlays({ ...GRAPH, nodes: [EFFECT, METER] }, null, chosenTheCamera)).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
    expect(portTheViewerPlays(GRAPH, null, { chosen_port: { ...chosenTheCamera.chosen_port, stream: "another-stream" } })).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
  });
});

describe("what Pop out pins a Viewer window to", () => {
  const streamTab = { stream: STREAM, project_name: "show", display_name: "show /main" };

  it("is the stream tab shown, and the node selected in it", () => {
    expect(poppedOutViewerTargetOf(streamTab, { kind: "node", stream: streamTab.stream, node: "halftonelenseffect" })).toEqual({ ...streamTab, node: "halftonelenseffect" });
  });

  it("names no node while nothing of that stream is selected", () => {
    expect(poppedOutViewerTargetOf(streamTab, { kind: "node", stream: "another-stream", node: "halftonelenseffect" })).toEqual({ ...streamTab, node: null });
    expect(poppedOutViewerTargetOf(streamTab, { kind: "stream", stream: streamTab.stream, project_folder: "/show" })).toEqual({ ...streamTab, node: null });
    expect(poppedOutViewerTargetOf(streamTab, null)).toEqual({ ...streamTab, node: null });
  });
});
