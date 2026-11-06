import { describe, expect, it } from "vitest";
import type { StreamGraphSummary } from "../../view_host/studio_view_contract";
import { exposedOutputTheViewerPlays, poppedOutViewerTargetOf } from "./viewer_view_type";

function graphExposing(exposed: StreamGraphSummary["exposed"]): StreamGraphSummary {
  return { stream: "show-main-0a1b2c", nodes: [], links: [], exposed, graph_document_text: "" };
}

const ENCODER_OUTPUT = { node: "h264encoder", port: "encoded_video", level: "public", watch_page_url: "http://127.0.0.1:4446/watch/m/show-main-0a1b2c/h264encoder/encoded_video" };
const EFFECT_OUTPUT = { node: "halftonelenseffect", port: "video_to_downstream", level: "private", watch_page_url: "http://127.0.0.1:4446/watch/m/show-main-0a1b2c/halftonelenseffect/video_to_downstream" };
const INTERNAL_OUTPUT = { node: "brightnessmeter", port: "readings", level: "internal", watch_page_url: null };

describe("the output the Viewer plays", () => {
  it("is the stream's first previewed output, or the selected node's where it exposes one", () => {
    const graph = graphExposing([INTERNAL_OUTPUT, ENCODER_OUTPUT, EFFECT_OUTPUT]);
    expect(exposedOutputTheViewerPlays(graph, { kind: "nothing" })).toBe(ENCODER_OUTPUT);
    expect(exposedOutputTheViewerPlays(graph, { kind: "node", stream: graph.stream, node: "halftonelenseffect" })).toBe(EFFECT_OUTPUT);
    expect(exposedOutputTheViewerPlays(graph, { kind: "node", stream: graph.stream, node: "brightnessmeter" })).toBe(ENCODER_OUTPUT);
    expect(exposedOutputTheViewerPlays(graph, { kind: "node", stream: "another-stream", node: "halftonelenseffect" })).toBe(ENCODER_OUTPUT);
  });

  it("is none where the stream exposes nothing the runtime previews", () => {
    expect(exposedOutputTheViewerPlays(graphExposing([INTERNAL_OUTPUT]), null)).toBeNull();
    expect(exposedOutputTheViewerPlays(graphExposing([]), null)).toBeNull();
  });
});

describe("what Pop out pins a Viewer window to", () => {
  const streamTab = { stream: "show-main-0a1b2c", project_name: "show", display_name: "show /main" };

  it("is the stream tab shown, and the node selected in it", () => {
    expect(poppedOutViewerTargetOf(streamTab, { kind: "node", stream: streamTab.stream, node: "halftonelenseffect" })).toEqual({ ...streamTab, node: "halftonelenseffect" });
  });

  it("names no node while nothing of that stream is selected", () => {
    expect(poppedOutViewerTargetOf(streamTab, { kind: "node", stream: "another-stream", node: "halftonelenseffect" })).toEqual({ ...streamTab, node: null });
    expect(poppedOutViewerTargetOf(streamTab, { kind: "stream", stream: streamTab.stream, project_folder: "/show" })).toEqual({ ...streamTab, node: null });
    expect(poppedOutViewerTargetOf(streamTab, null)).toEqual({ ...streamTab, node: null });
  });
});
