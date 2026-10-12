import { describe, expect, it } from "vitest";
import type { StreamGraphLink, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { layOutStreamGraph } from "./stream_graph_layout";

function wiredLink(sourceNode: string, targetNode: string): StreamGraphLink {
  return { source_node: sourceNode, source_port: "video", target_node: targetNode, target_port: "video", state: "wired" };
}

function graphOf(nodeNames: string[], links: StreamGraphLink[]): StreamGraphSummary {
  return {
    stream: "main",
    nodes: nodeNames.map((name) => ({ name, type: `nodes:${name}`, state: "Running" })),
    links,
    exposed: [],
  };
}

const TEST_PATTERN_GRAPH = graphOf(
  ["testpatternsource", "invertingeffect", "brightnessmeter", "displaywindow"],
  [
    wiredLink("testpatternsource", "invertingeffect"),
    wiredLink("invertingeffect", "displaywindow"),
    wiredLink("invertingeffect", "brightnessmeter"),
  ],
);

describe("layOutStreamGraph", () => {
  it("puts every node one column past its furthest upstream node", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    const columnByName = Object.fromEntries(layout.nodes.map((node) => [node.name, node.column]));
    expect(columnByName).toEqual({ testpatternsource: 0, invertingeffect: 1, brightnessmeter: 2, displaywindow: 2 });
  });

  it("runs every link from a source's right edge to a target's left edge", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    for (const layoutLink of layout.links) expect(layoutLink.endX).toBeGreaterThan(layoutLink.startX);
  });

  it("widens the column gaps to fill a wide canvas and narrows them for a narrow one", () => {
    const usualWidth = layOutStreamGraph(TEST_PATTERN_GRAPH, null).width;
    expect(layOutStreamGraph(TEST_PATTERN_GRAPH, 2000).width).toBeGreaterThan(usualWidth);
    expect(layOutStreamGraph(TEST_PATTERN_GRAPH, 300).width).toBeLessThan(usualWidth);
  });

  it("draws a link's source in another stream as a node outside this stream", () => {
    const layout = layOutStreamGraph(graphOf(["displaywindow"], [wiredLink("camerasource", "displaywindow")]), null);
    const outsideNode = layout.nodes.find((node) => node.name === "camerasource");
    expect(outsideNode?.isInThisStream).toBe(false);
    expect(outsideNode?.column).toBe(0);
  });

  it("lays out a cycle without looping", () => {
    const layout = layOutStreamGraph(graphOf(["a", "b"], [wiredLink("a", "b"), wiredLink("b", "a")]), null);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.links).toHaveLength(2);
  });

  it("marks the node an exposed port belongs to", () => {
    const layout = layOutStreamGraph(
      { ...TEST_PATTERN_GRAPH, exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }] },
      null,
    );
    const exposingNode = layout.nodes.find((node) => node.name === "invertingeffect");
    expect(exposingNode?.exposedPorts.map((exposedPort) => exposedPort.port)).toEqual(["video_to_downstream"]);
  });
});
