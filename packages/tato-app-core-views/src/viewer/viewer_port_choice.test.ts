import { describe, expect, it } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type StreamGraphNode, type StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { outputPortTheViewerPlays, portTheViewerPlays, viewerChosenPortOf } from "./viewer_port_choice";

const STREAM = "show-main-0a1b2c";

function nodeWithOutputs(name: string, outputPorts: StreamGraphNode["output_ports"]): StreamGraphNode {
  return { id: `id-${name}`, name, type: "Processor", state: "Running", failed_because: null, process_raising_because: null, config: {}, input_ports: [], output_ports: outputPorts, dropped_bags_by_link: {}, refused_bags_by_output_port: {}, pins: {}, studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null };
}

const CAMERA = nodeWithOutputs("camera", [{ name: "video", family: "image", stream_facts: null, values_checked: null }]);
const EFFECT = nodeWithOutputs("halftonelenseffect", [{ name: "video_to_downstream", family: "image", stream_facts: null, values_checked: null }]);
const METER = nodeWithOutputs("brightnessmeter", [{ name: "readings", family: "records", stream_facts: null, values_checked: false }]);

const GRAPH: StreamGraphSummary = {
  stream: STREAM,
  nodes: [CAMERA, EFFECT, METER],
  links: [{ id: "camera-to-effect", source_node: "camera", source_port: "video", target_node: "halftonelenseffect", target_port: "video_in", state: "wired" }],
  stream_asset: null,
  groups: [],
  notes: [],
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

  it("is an Image port over a port whose family the runtime does not serve, such as an encoder's output", () => {
    const ENCODER = nodeWithOutputs("h264encoder", [{ name: "encoded_video", family: null, stream_facts: null, values_checked: null }]);
    const graphWithAnEncoder: StreamGraphSummary = {
      ...GRAPH,
      nodes: [CAMERA, EFFECT, ENCODER],
      links: [...GRAPH.links, { id: "effect-to-encoder", source_node: "halftonelenseffect", source_port: "video_to_downstream", target_node: "h264encoder", target_port: "video_in", state: "wired" }],
    };
    expect(outputPortTheViewerPlays(graphWithAnEncoder, null)).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
  });

  it("is a port of another family where the stream has no Image port, and none where it has no output", () => {
    expect(outputPortTheViewerPlays({ ...GRAPH, nodes: [METER] }, null)).toEqual({ node_id: "id-brightnessmeter", node_name: "brightnessmeter", port: "readings" });
    expect(outputPortTheViewerPlays({ ...GRAPH, nodes: [] }, null)).toBeNull();
  });

  it("is the port chosen for this stream while the graph still has it, over the selection", () => {
    const chosenTheCamera = { stream: STREAM, node_id: "id-camera", port: "video" };
    expect(portTheViewerPlays(GRAPH, { kind: "node", stream: STREAM, node: "brightnessmeter" }, chosenTheCamera)).toEqual({ node_id: "id-camera", node_name: "camera", port: "video" });
    expect(portTheViewerPlays({ ...GRAPH, nodes: [EFFECT, METER] }, null, chosenTheCamera)).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
    expect(portTheViewerPlays(GRAPH, null, { ...chosenTheCamera, stream: "another-stream" })).toEqual({ node_id: "id-halftonelenseffect", node_name: "halftonelenseffect", port: "video_to_downstream" });
  });
});

describe("the port a Viewer area keeps", () => {
  it("is its chosen_port setting, and follows the selection for anything that is not a port", () => {
    expect(viewerChosenPortOf({ chosen_port: { stream: STREAM, node_id: "id-camera", port: "video" } })).toEqual({ stream: STREAM, node_id: "id-camera", port: "video" });
    expect(viewerChosenPortOf({ chosen_port: null })).toBeNull();
    expect(viewerChosenPortOf({ chosen_port: { stream: STREAM, node_id: 7, port: "video" } })).toBeNull();
    expect(viewerChosenPortOf(null)).toBeNull();
  });
});
