// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { StreamGraphLink, StreamGraphNode, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import {
  outputPreviewAbsenceWords,
  streamGraphLinkLabelClauses,
  presentStreamGraphCanvas,
  stepCardCounterWords,
  streamGraphLinkTone,
} from "./stream_graph_canvas_presentation";

function graphNode(name: string, nodeType: string, overrides: Partial<StreamGraphNode> = {}): StreamGraphNode {
  return { name, type: nodeType, state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {}, ...overrides };
}

function wiredLink(id: string, [sourceNode, sourcePort]: [string, string], [targetNode, targetPort]: [string, string]): StreamGraphLink {
  return { id, source_node: sourceNode, source_port: sourcePort, target_node: targetNode, target_port: targetPort, state: "wired" };
}

/** `tatolab new`'s stream as the runtime's graph reads: an H.264 encoder's output catalogued as video and exposed publicly, the meter dropping. */
const FRONT_DOOR_GRAPH: StreamGraphSummary = {
  stream: "front-door",
  nodes: [
    graphNode("testpatternsource", "tatolab.stream:TestPatternSource", {
      output_ports: [{ name: "video", catalog_section: "binary" }],
      refused_bags_by_output_port: { video: 212 },
    }),
    graphNode("halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", {
      input_ports: [{ name: "video_from_upstream", catalog_section: null }],
      output_ports: [{ name: "video_to_downstream", catalog_section: null }],
      dropped_bags_by_link: { L1: 0 },
    }),
    graphNode("brightnessmeter", "nodes.brightness_meter:BrightnessMeter", {
      input_ports: [{ name: "video_from_upstream", catalog_section: null }],
      dropped_bags_by_link: { L2: 1840 },
    }),
    graphNode("h264encoder", "tatolab.stream:H264Encoder", {
      input_ports: [{ name: "video", catalog_section: null }],
      output_ports: [{ name: "encoded_video", catalog_section: "video" }],
    }),
  ],
  links: [
    wiredLink("L1", ["testpatternsource", "video"], ["halftonelenseffect", "video_from_upstream"]),
    wiredLink("L2", ["halftonelenseffect", "video_to_downstream"], ["brightnessmeter", "video_from_upstream"]),
    wiredLink("L3", ["halftonelenseffect", "video_to_downstream"], ["h264encoder", "video"]),
  ],
  exposed: [
    { node: "h264encoder", port: "encoded_video", level: "public", watch_page_url: "http://127.0.0.1:4446/watch/desk/front-door/h264encoder/encoded_video" },
  ],
  graph_document_text: "",
};

const stepOf = (graph: StreamGraphSummary, stepName: string) => presentStreamGraphCanvas(graph).steps.find((step) => step.name === stepName);

describe("presentStreamGraphCanvas", () => {
  it("draws every step the graph reports, with its origin and state word", () => {
    const steps = presentStreamGraphCanvas(FRONT_DOOR_GRAPH).steps;

    expect(steps.map((step) => [step.name, step.origin, step.stateWord])).toEqual([
      ["testpatternsource", "Built-in", "Running"],
      ["halftonelenseffect", "Python", "Running"],
      ["brightnessmeter", "Python", "Running"],
      ["h264encoder", "Built-in", "Running"],
    ]);
  });

  it("draws a step's declared ports, the data kind its catalog section names, and an input the kind of the output linked into it", () => {
    const encoder = stepOf(FRONT_DOOR_GRAPH, "h264encoder");

    expect(encoder?.inputPorts).toEqual([{ name: "video", dataKind: "data" }]);
    expect(encoder?.outputPorts.map((port) => [port.name, port.dataKind, port.exposureLevel])).toEqual([["encoded_video", "video", "public"]]);
    const graphWithAVideoSource: StreamGraphSummary = {
      ...FRONT_DOOR_GRAPH,
      nodes: FRONT_DOOR_GRAPH.nodes.map((node) => (node.name === "testpatternsource" ? { ...node, output_ports: [{ name: "video", catalog_section: "video" }] } : node)),
    };
    expect(stepOf(graphWithAVideoSource, "halftonelenseffect")?.inputPorts).toEqual([{ name: "video_from_upstream", dataKind: "video" }]);
  });

  it("draws a port only a link or an exposure names after the declared ones", () => {
    const graph: StreamGraphSummary = {
      ...FRONT_DOOR_GRAPH,
      nodes: [graphNode("source", "tatolab.stream:TestPatternSource"), graphNode("sink", "nodes.sink:Sink")],
      links: [wiredLink("L1", ["source", "video"], ["sink", "video_from_upstream"])],
      exposed: [{ node: "source", port: "thumbnails", level: "private", watch_page_url: null }],
    };

    expect(stepOf(graph, "source")?.outputPorts.map((port) => port.name)).toEqual(["video", "thumbnails"]);
    expect(stepOf(graph, "sink")?.inputPorts.map((port) => port.name)).toEqual(["video_from_upstream"]);
  });

  it("an output the stream does not expose is internal and has no preview; an exposed one previews its watch page in the card", () => {
    const effect = stepOf(FRONT_DOOR_GRAPH, "halftonelenseffect");
    const encoder = stepOf(FRONT_DOOR_GRAPH, "h264encoder");

    expect(effect?.outputPorts[0]).toMatchObject({ exposureLevel: "internal", preview: { kind: "absent", absence: "internal" } });
    expect(effect?.cardPreview).toBeNull();
    expect(encoder?.cardPreview).toMatchObject({ output: { name: "encoded_video" }, watchPageUrl: FRONT_DOOR_GRAPH.exposed[0]?.watch_page_url });
  });

  it("an exposed output in a graph that names no machine has no preview page", () => {
    const graph = { ...FRONT_DOOR_GRAPH, exposed: [{ node: "h264encoder", port: "encoded_video", level: "public", watch_page_url: null }] };

    expect(stepOf(graph, "h264encoder")?.outputPorts[0]?.preview).toEqual({ kind: "absent", absence: "no_preview_page" });
    expect(outputPreviewAbsenceWords("no_preview_page")).toContain("names no machine");
  });

  it("counts what a step dropped on its links in and what its outputs refused, and each link's drops on its target", () => {
    const canvas = presentStreamGraphCanvas(FRONT_DOOR_GRAPH);

    expect(stepOf(FRONT_DOOR_GRAPH, "brightnessmeter")?.droppedInCount).toBe(1840);
    expect(stepOf(FRONT_DOOR_GRAPH, "testpatternsource")?.refusedCount).toBe(212);
    expect(canvas.links.map((link) => [link.linkId, link.droppedCount])).toEqual([
      ["L1", 0],
      ["L2", 1840],
      ["L3", 0],
    ]);
  });

  it("draws a link's source in another stream as a card of its own with the linked output and no level", () => {
    const graph: StreamGraphSummary = {
      ...FRONT_DOOR_GRAPH,
      nodes: [graphNode("mp4writer", "tatolab.stream:Mp4Writer", { input_ports: [{ name: "video", catalog_section: null }] })],
      links: [{ ...wiredLink("L1", ["camera/camerasource", "video"], ["mp4writer", "video"]), state: "awaiting_remote" }],
      exposed: [],
    };
    const canvas = presentStreamGraphCanvas(graph);

    expect(canvas.steps.map((step) => [step.name, step.isInAnotherStream, step.stateWord])).toEqual([
      ["mp4writer", false, "Running"],
      ["camera/camerasource", true, "In another stream"],
    ]);
    expect(canvas.steps[1]?.outputPorts).toMatchObject([{ name: "video", exposureLevel: null, preview: { kind: "absent", absence: "in_another_stream" } }]);
    expect(canvas.links[0]).toMatchObject({ look: "pending", stateSentence: "Waiting for camera/camerasource to be exposed" });
  });

  it("a step in error reads In error", () => {
    const graph = { ...FRONT_DOOR_GRAPH, nodes: FRONT_DOOR_GRAPH.nodes.map((node) => (node.name === "h264encoder" ? { ...node, state: "Error" } : node)) };

    expect(stepOf(graph, "h264encoder")).toMatchObject({ stateWord: "In error", stateEmphasis: "failure" });
  });
});

describe("streamGraphLinkTone", () => {
  const [effectInLink, droppingLink] = presentStreamGraphCanvas(FRONT_DOOR_GRAPH).links;

  it("a link that dropped messages is amber while counters show, whatever is selected", () => {
    expect(droppingLink && streamGraphLinkTone(droppingLink, "brightnessmeter", true)).toBe("dropping");
    expect(droppingLink && streamGraphLinkTone(droppingLink, null, true)).toBe("dropping");
  });

  it("a link touching the selected step is blue, and neutral otherwise", () => {
    expect(effectInLink && streamGraphLinkTone(effectInLink, "halftonelenseffect", true)).toBe("selected");
    expect(effectInLink && streamGraphLinkTone(effectInLink, "h264encoder", true)).toBe("neutral");
    expect(droppingLink && streamGraphLinkTone(droppingLink, "brightnessmeter", false)).toBe("selected");
  });
});

describe("a failed link", () => {
  const failedDroppingLink = { ...presentStreamGraphCanvas(FRONT_DOOR_GRAPH).links[1]!, look: "error" as const, stateSentence: "This link failed" };

  it("reads failed before dropping or selected, and says so beside its drops without a hover", () => {
    expect(streamGraphLinkTone(failedDroppingLink, "brightnessmeter", true)).toBe("failed");
    expect(streamGraphLinkLabelClauses(failedDroppingLink, true)).toEqual([
      { words: "This link failed", emphasis: "failure" },
      { words: "1,840 dropped", emphasis: "warning" },
    ]);
    expect(streamGraphLinkLabelClauses(failedDroppingLink, false)).toEqual([{ words: "This link failed", emphasis: "failure" }]);
  });
});

describe("stepCardCounterWords", () => {
  it("names only the counters above zero, with their digits grouped", () => {
    expect(stepCardCounterWords({ droppedInCount: 0, refusedCount: 0 })).toEqual([]);
    expect(stepCardCounterWords({ droppedInCount: 1840, refusedCount: 0 })).toEqual(["1,840 dropped in"]);
    expect(stepCardCounterWords({ droppedInCount: 12, refusedCount: 212 })).toEqual(["12 dropped in", "212 refused"]);
  });
});
