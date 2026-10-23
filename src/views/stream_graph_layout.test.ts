// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { StreamGraphLink, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { graphNodesInFlowOrder, layOutStreamGraph, measureNodeHeight } from "./stream_graph_layout";

function wiredLink(sourceNode: string, targetNode: string, sourcePort = "video", targetPort = "video"): StreamGraphLink {
  return { id: "L1", source_node: sourceNode, source_port: sourcePort, target_node: targetNode, target_port: targetPort, state: "wired" };
}

function graphOf(nodeNames: string[], links: StreamGraphLink[]): StreamGraphSummary {
  return {
    stream: "main",
    nodes: nodeNames.map((name) => ({ name, type: `nodes:${name}`, state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} })),
    links,
    exposed: [],
    graph_document_text: "",
  };
}

const TEST_PATTERN_GRAPH = graphOf(
  ["testpatternsource", "invertingeffect", "brightnessmeter", "displaywindow"],
  [
    wiredLink("testpatternsource", "invertingeffect", "video", "video_from_upstream"),
    wiredLink("invertingeffect", "displaywindow", "video_to_downstream", "video"),
    wiredLink("invertingeffect", "brightnessmeter", "video_to_downstream", "video_from_upstream"),
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
    const nodeByName = new Map(layout.nodes.map((node) => [node.name, node]));
    for (const layoutLink of layout.links) {
      const sourceNode = nodeByName.get(layoutLink.link.source_node)!;
      expect(layoutLink.startX).toBe(sourceNode.x + sourceNode.width);
      expect(layoutLink.endX).toBe(nodeByName.get(layoutLink.link.target_node)!.x);
      expect(layoutLink.endX).toBeGreaterThan(layoutLink.startX);
    }
  });

  it("a straight chain draws straight", () => {
    const layout = layOutStreamGraph(
      graphOf(["source", "effect", "sink"], [wiredLink("source", "effect", "out", "in"), wiredLink("effect", "sink", "out", "in")]),
      null,
    );
    for (const layoutLink of layout.links) expect(layoutLink.endY).toBe(layoutLink.startY);
  });

  it("a two-way fan-out sits symmetric about its source port", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    const fanOutLinks = layout.links.filter((layoutLink) => layoutLink.link.source_port === "video_to_downstream");
    expect(fanOutLinks).toHaveLength(2);
    const [firstLink, secondLink] = fanOutLinks;
    expect(firstLink.startY).toBe(secondLink.startY);
    expect((firstLink.endY + secondLink.endY) / 2).toBe(firstLink.startY);
    expect(firstLink.endY).not.toBe(secondLink.endY);
  });

  it("stacks targets fed by the same port in the order their links list them", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    const nodeByName = new Map(layout.nodes.map((node) => [node.name, node]));
    expect(nodeByName.get("displaywindow")!.y).toBeLessThan(nodeByName.get("brightnessmeter")!.y);
  });

  it("a node's height follows its port count", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    const heightByName = Object.fromEntries(layout.nodes.map((node) => [node.name, node.height]));
    expect(heightByName.testpatternsource).toBe(measureNodeHeight(1, false));
    expect(heightByName.invertingeffect).toBe(measureNodeHeight(2, false));
    expect(heightByName.invertingeffect - heightByName.testpatternsource).toBe(22);
  });

  it("adds a foot under a node whose state needs a word", () => {
    const graph = {
      ...TEST_PATTERN_GRAPH,
      nodes: TEST_PATTERN_GRAPH.nodes.map((node) => (node.name === "displaywindow" ? { ...node, state: "Error" } : node)),
    };
    const displayWindow = layOutStreamGraph(graph, null).nodes.find((node) => node.name === "displaywindow")!;
    expect(displayWindow.hasFoot).toBe(true);
    expect(displayWindow.height).toBe(measureNodeHeight(1, true));
  });

  it("gives every node in a column its widest node's width, at least 216", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    const widths = layout.nodes.filter((node) => node.column === 2).map((node) => node.width);
    expect(new Set(widths).size).toBe(1);
    for (const node of layout.nodes) expect(node.width).toBeGreaterThanOrEqual(216);
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
    expect(outsideNode?.outputs).toEqual([{ port: "video", exposureLevel: null }]);
  });

  it("lays out a cycle without looping", () => {
    const layout = layOutStreamGraph(graphOf(["a", "b"], [wiredLink("a", "b"), wiredLink("b", "a")]), null);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.links).toHaveLength(2);
  });

  it("gives an exposed output its level", () => {
    const layout = layOutStreamGraph(
      { ...TEST_PATTERN_GRAPH, exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private", watch_page_url: null }] },
      null,
    );
    const exposingNode = layout.nodes.find((node) => node.name === "invertingeffect");
    expect(exposingNode?.outputs).toEqual([{ port: "video_to_downstream", exposureLevel: "private" }]);
  });

  it("makes room for the Watch eye on a readable output row only when asked", () => {
    const graph: StreamGraphSummary = {
      ...TEST_PATTERN_GRAPH,
      exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private", watch_page_url: null }],
    };
    const widthOf = (layoutOptions: { reservesWatchIconOnReadableOutputs?: boolean }) =>
      layOutStreamGraph(graph, null, layoutOptions).nodes.find((node) => node.name === "invertingeffect")!.width;
    expect(widthOf({ reservesWatchIconOnReadableOutputs: true })).toBeGreaterThan(widthOf({}));
  });

  it("starts the drawing at the top-left corner", () => {
    const layout = layOutStreamGraph(TEST_PATTERN_GRAPH, null);
    expect(Math.min(...layout.nodes.map((node) => node.x))).toBe(0);
    expect(Math.min(...layout.nodes.map((node) => node.y))).toBe(0);
    expect(layout.height).toBe(Math.ceil(Math.max(...layout.nodes.map((node) => node.y + node.height))));
  });
});

describe("graphNodesInFlowOrder", () => {
  it("reads the nodes column by column, top to bottom", () => {
    const flowOrder = graphNodesInFlowOrder(layOutStreamGraph(TEST_PATTERN_GRAPH, null)).map((node) => node.name);
    expect(flowOrder).toEqual(["testpatternsource", "invertingeffect", "displaywindow", "brightnessmeter"]);
  });
});
