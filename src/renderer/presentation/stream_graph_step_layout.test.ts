import { describe, expect, it } from "vitest";
import type { StreamGraphExposedPort, StreamGraphLink, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { presentStreamGraphCanvas } from "./stream_graph_canvas_presentation";
import {
  layOutStreamGraphSteps,
  STREAM_GRAPH_PORT_ROW_HEIGHT,
  STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT,
  STREAM_GRAPH_STEP_CARD_WIDTH,
  stepNamesInFlowOrder,
  streamGraphLayoutKey,
  streamGraphPortRowCentreOffset,
  streamGraphStepCardHeight,
} from "./stream_graph_step_layout";

function wiredLink(sourceNode: string, targetNode: string, sourcePort = "video", targetPort = "video"): StreamGraphLink {
  return { id: `${sourceNode}-${targetNode}`, source_node: sourceNode, source_port: sourcePort, target_node: targetNode, target_port: targetPort, state: "wired" };
}

function graphOf(stepNames: string[], links: StreamGraphLink[], exposed: StreamGraphExposedPort[] = []): StreamGraphSummary {
  return {
    stream: "main",
    nodes: stepNames.map((name) => ({
      id: "",
      name,
      type: `nodes:${name}`,
      state: "Running",
      input_ports: [],
      output_ports: [],
      dropped_bags_by_link: {},
      refused_bags_by_output_port: {},
    })),
    links,
    exposed,
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

/** Where each link starts and ends on the laid-out canvas: its source port row's right edge to its target port row's left edge. */
function linkEnds(graph: StreamGraphSummary, arePreviewsShown: boolean) {
  const canvas = presentStreamGraphCanvas(graph);
  const positions = layOutStreamGraphSteps(canvas, arePreviewsShown);
  const stepByName = new Map(canvas.steps.map((step) => [step.name, step]));
  return canvas.links.map((link) => {
    const source = stepByName.get(link.sourceStepName)!;
    const target = stepByName.get(link.targetStepName)!;
    const sourceRow = source.inputPorts.length + source.outputPorts.findIndex((port) => port.name === link.sourcePortName);
    const targetRow = target.inputPorts.findIndex((port) => port.name === link.targetPortName);
    return {
      link,
      startX: positions.get(source.name)!.x + STREAM_GRAPH_STEP_CARD_WIDTH,
      startY: positions.get(source.name)!.y + streamGraphPortRowCentreOffset(source, sourceRow, arePreviewsShown),
      endX: positions.get(target.name)!.x,
      endY: positions.get(target.name)!.y + streamGraphPortRowCentreOffset(target, targetRow, arePreviewsShown),
    };
  });
}

describe("layOutStreamGraphSteps", () => {
  it("puts every step one column past its furthest upstream step, so every link runs left to right", () => {
    const positions = layOutStreamGraphSteps(presentStreamGraphCanvas(TEST_PATTERN_GRAPH), true);

    expect(new Set([positions.get("brightnessmeter")?.x, positions.get("displaywindow")?.x]).size).toBe(1);
    expect(positions.get("testpatternsource")!.x).toBeLessThan(positions.get("invertingeffect")!.x);
    expect(positions.get("invertingeffect")!.x).toBeLessThan(positions.get("displaywindow")!.x);
    for (const ends of linkEnds(TEST_PATTERN_GRAPH, true)) expect(ends.endX).toBeGreaterThan(ends.startX);
  });

  it("a straight chain draws straight", () => {
    const chain = graphOf(["source", "effect", "sink"], [wiredLink("source", "effect", "out", "in"), wiredLink("effect", "sink", "out", "in")]);

    for (const ends of linkEnds(chain, true)) expect(ends.endY).toBe(ends.startY);
  });

  it("a two-way fan-out sits symmetric about its source port", () => {
    const [firstLink, secondLink] = linkEnds(TEST_PATTERN_GRAPH, true).filter((ends) => ends.link.sourcePortName === "video_to_downstream");

    expect(firstLink!.startY).toBe(secondLink!.startY);
    expect((firstLink!.endY + secondLink!.endY) / 2).toBe(firstLink!.startY);
    expect(firstLink!.endY).not.toBe(secondLink!.endY);
  });

  it("stacks targets fed by the same port in the order their links list them", () => {
    const positions = layOutStreamGraphSteps(presentStreamGraphCanvas(TEST_PATTERN_GRAPH), true);

    expect(positions.get("displaywindow")!.y).toBeLessThan(positions.get("brightnessmeter")!.y);
  });

  it("makes room for a card's preview while previews show, and none while they are off", () => {
    const exposingGraph = graphOf(
      ["source", "sink"],
      [wiredLink("source", "sink")],
      [{ node: "source", port: "video", level: "private", watch_page_url: "http://127.0.0.1:4446/watch/desk/main/source/video" }],
    );
    const [source, sink] = presentStreamGraphCanvas(exposingGraph).steps;

    expect(streamGraphStepCardHeight(source!, true) - streamGraphStepCardHeight(source!, false)).toBe(STREAM_GRAPH_STEP_CARD_PREVIEW_HEIGHT + 8);
    expect(streamGraphStepCardHeight(sink!, true)).toBe(streamGraphStepCardHeight(sink!, false));
    expect(streamGraphStepCardHeight(sink!, false) - streamGraphStepCardHeight({ ...sink!, inputPorts: [] }, false)).toBe(STREAM_GRAPH_PORT_ROW_HEIGHT);
    for (const ends of linkEnds(exposingGraph, true)) expect(ends.endY).toBe(ends.startY);
  });

  it("lays out a cycle, and a source in another stream in the first column", () => {
    expect(layOutStreamGraphSteps(presentStreamGraphCanvas(graphOf(["a", "b"], [wiredLink("a", "b"), wiredLink("b", "a")])), true).size).toBe(2);
    const positions = layOutStreamGraphSteps(presentStreamGraphCanvas(graphOf(["displaywindow"], [wiredLink("camera/camerasource", "displaywindow")])), true);
    expect(positions.get("camera/camerasource")?.x).toBe(0);
  });

  it("starts the drawing at the top", () => {
    const positions = layOutStreamGraphSteps(presentStreamGraphCanvas(TEST_PATTERN_GRAPH), true);

    expect(Math.min(...[...positions.values()].map((position) => position.x))).toBe(0);
    expect(Math.min(...[...positions.values()].map((position) => position.y))).toBe(0);
  });
});

describe("stepNamesInFlowOrder", () => {
  it("reads the steps column by column, top to bottom", () => {
    expect(stepNamesInFlowOrder(presentStreamGraphCanvas(TEST_PATTERN_GRAPH))).toEqual(["testpatternsource", "invertingeffect", "displaywindow", "brightnessmeter"]);
  });
});

describe("streamGraphLayoutKey", () => {
  it("stays the same while only states and counters change, and changes with a step, a link, or the previews toggle", () => {
    const keyOf = (graph: StreamGraphSummary, arePreviewsShown = true) => streamGraphLayoutKey(presentStreamGraphCanvas(graph), arePreviewsShown);
    const sameShapeNewCounts: StreamGraphSummary = {
      ...TEST_PATTERN_GRAPH,
      nodes: TEST_PATTERN_GRAPH.nodes.map((node) => ({ ...node, state: "Pending", dropped_bags_by_link: { L: 12 } })),
    };

    expect(keyOf(sameShapeNewCounts)).toBe(keyOf(TEST_PATTERN_GRAPH));
    expect(keyOf(TEST_PATTERN_GRAPH, false)).not.toBe(keyOf(TEST_PATTERN_GRAPH));
    expect(keyOf({ ...TEST_PATTERN_GRAPH, links: TEST_PATTERN_GRAPH.links.slice(1) })).not.toBe(keyOf(TEST_PATTERN_GRAPH));
  });
});
