import { describe, expect, it } from "vitest";
import type { StreamGraphExposedPort, StreamGraphLink, StreamGraphNode, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import {
  choosePreviewedOutput,
  droppingLinksOf,
  exposedOutputAddress,
  isEachNodeStateShown,
  presentExposureLevel,
  presentStreamSteps,
  previewableOutputsOf,
  readableExposedPorts,
} from "./stream_overview_presentation";

function wiredLink(source: string, sourcePort: string, target: string, targetPort: string, state = "wired"): StreamGraphLink {
  return { id: "L1", source_node: source, source_port: sourcePort, target_node: target, target_port: targetPort, state };
}

const TEST_PATTERN_GRAPH: StreamGraphSummary = {
  stream: "main",
  nodes: [
    { id: "", name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
    { id: "", name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
    { id: "", name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
    { id: "", name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
  ],
  links: [
    wiredLink("testpatternsource", "video", "invertingeffect", "video_from_upstream"),
    wiredLink("invertingeffect", "video_to_downstream", "displaywindow", "video"),
    wiredLink("invertingeffect", "video_to_downstream", "brightnessmeter", "video_from_upstream"),
  ],
  exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private", watch_page_url: null }],
  graph_document_text: "",
};

describe("presentExposureLevel", () => {
  it("words a private output This machine and a public one Public, and keeps a newer level's own word", () => {
    expect(["internal", "private", "public", "on_the_mesh"].map((level) => presentExposureLevel(level).label)).toEqual([
      "Internal",
      "This machine",
      "Public",
      "On the mesh",
    ]);
    expect(presentExposureLevel("on_the_mesh")).toEqual({ label: "On the mesh", meaning: null });
  });
});

describe("exposedOutputAddress", () => {
  it("addresses an output by machine, stream, node and port, with the machine apart", () => {
    expect(exposedOutputAddress("jonathanf-macbook", "main", { node: "invertingeffect", port: "video_to_downstream" })).toEqual({
      machineSegment: "jonathanf-macbook/",
      streamPath: "main/invertingeffect/video_to_downstream",
      fullAddress: "jonathanf-macbook/main/invertingeffect/video_to_downstream",
    });
  });

  it("starts at the stream while the machine has no name", () => {
    expect(exposedOutputAddress(null, "main", { node: "a", port: "b" }).fullAddress).toBe("main/a/b");
  });
});

describe("readableExposedPorts", () => {
  it("leaves out ports exposed at internal", () => {
    const graph = {
      ...TEST_PATTERN_GRAPH,
      exposed: [...TEST_PATTERN_GRAPH.exposed, { node: "testpatternsource", port: "video", level: "internal", watch_page_url: null }],
    };
    expect(readableExposedPorts(graph).map((exposedPort) => exposedPort.port)).toEqual(["video_to_downstream"]);
  });
});


function stepNode(name: string, nodeType: string, state: string | null, counters: Partial<Pick<StreamGraphNode, "dropped_bags_by_link" | "refused_bags_by_output_port">> = {}): StreamGraphNode {
  return { id: "", name, type: nodeType, state, input_ports: [], output_ports: [], dropped_bags_by_link: counters.dropped_bags_by_link ?? {}, refused_bags_by_output_port: counters.refused_bags_by_output_port ?? {} };
}

function exposedPort(node: string, port: string, level: string): StreamGraphExposedPort {
  return { node, port, level, watch_page_url: level === "internal" ? null : `http://127.0.0.1:4446/watch/desk/main/${node}/${port}` };
}

/** A sample stream whose meter is falling behind: the meter's link dropped 1,840 messages and the effect refused 212. */
const DROPPING_GRAPH: StreamGraphSummary = {
  stream: "main",
  nodes: [
    stepNode("testpatternsource", "tatolab.stream:TestPatternSource", "Running", { refused_bags_by_output_port: { video: 0 } }),
    stepNode("halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "Running", {
      dropped_bags_by_link: { L1: 0 },
      refused_bags_by_output_port: { video_to_downstream: 212 },
    }),
    stepNode("brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "Running", { dropped_bags_by_link: { L2: 1840 } }),
    stepNode("h264encoder", "tatolab.stream:H264Encoder", "Pending", { dropped_bags_by_link: { L3: 12 } }),
  ],
  links: [
    { id: "L1", source_node: "testpatternsource", source_port: "video", target_node: "halftonelenseffect", target_port: "video_from_upstream", state: "wired" },
    { id: "L2", source_node: "halftonelenseffect", source_port: "video_to_downstream", target_node: "brightnessmeter", target_port: "video_from_upstream", state: "wired" },
    { id: "L3", source_node: "halftonelenseffect", source_port: "video_to_downstream", target_node: "h264encoder", target_port: "video", state: "wired" },
  ],
  exposed: [exposedPort("halftonelenseffect", "video_to_downstream", "internal"), exposedPort("h264encoder", "encoded_video", "public"), exposedPort("brightnessmeter", "levels", "private")],
  graph_document_text: "",
};

const PIPELINE_ORDER = ["testpatternsource", "halftonelenseffect", "brightnessmeter", "h264encoder"];

describe("presentStreamSteps", () => {
  it("lists each node in pipeline order with its state and the counters above zero", () => {
    expect(presentStreamSteps(DROPPING_GRAPH, PIPELINE_ORDER, "loaded", true)).toEqual([
      { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", stateWord: "Running", stateEmphasis: "plain", counters: [] },
      {
        name: "halftonelenseffect",
        type: "nodes.halftone_lens_effect:HalftoneLensEffect",
        stateWord: "Running",
        stateEmphasis: "plain",
        counters: [{ countText: "212", word: "refused" }],
      },
      {
        name: "brightnessmeter",
        type: "nodes.brightness_meter:BrightnessMeter",
        stateWord: "Running",
        stateEmphasis: "plain",
        counters: [{ countText: "1,840", word: "dropped" }],
      },
      { name: "h264encoder", type: "tatolab.stream:H264Encoder", stateWord: "Starting", stateEmphasis: "starting", counters: [{ countText: "12", word: "dropped" }] },
    ]);
  });

  it("reads every step of a graph from the last load as not loaded, without its counters, or starting once it is loaded again", () => {
    const steps = presentStreamSteps(DROPPING_GRAPH, PIPELINE_ORDER, "as_of_the_last_load", false);
    expect(steps.map((step) => [step.stateWord, step.stateEmphasis, step.counters])).toEqual(Array(4).fill(["Not loaded", "quiet", []]));
    const reloadingSteps = presentStreamSteps(DROPPING_GRAPH, PIPELINE_ORDER, "as_of_the_last_load", true);
    expect(reloadingSteps.map((step) => [step.stateWord, step.stateEmphasis])).toEqual(Array(4).fill(["Starting", "starting"]));
  });

  it("words an errored step as in error, a newer state as the runtime spells it, and a step the order misses last", () => {
    const graph = { ...DROPPING_GRAPH, nodes: [stepNode("a", "nodes.a:A", "Error"), stepNode("b", "weird", "Rewiring"), stepNode("c", "tatolab.stream:C", null)] };
    expect(presentStreamSteps(graph, ["b", "a"], "loaded", true).map((step) => [step.name, step.stateWord, step.stateEmphasis])).toEqual([
      ["b", "Rewiring", "plain"],
      ["a", "In error", "failure"],
      ["c", "Running", "plain"],
    ]);
  });
});

describe("isEachNodeStateShown", () => {
  it("shows the nodes' states only once they differ or one is in error", () => {
    expect(isEachNodeStateShown(presentStreamSteps(TEST_PATTERN_GRAPH, [], "loaded", true))).toBe(false);
    expect(isEachNodeStateShown(presentStreamSteps(DROPPING_GRAPH, PIPELINE_ORDER, "loaded", true))).toBe(true);
    expect(isEachNodeStateShown([{ stateWord: "In error", stateEmphasis: "failure" }])).toBe(true);
    expect(isEachNodeStateShown([])).toBe(false);
  });
});

describe("droppingLinksOf", () => {
  it("names each link whose target dropped messages, most first, and none when nothing dropped", () => {
    expect(droppingLinksOf(DROPPING_GRAPH)).toEqual([
      { linkId: "L2", sourceWords: "halftonelenseffect", targetWords: "brightnessmeter", droppedCountText: "1,840", isOne: false },
      { linkId: "L3", sourceWords: "halftonelenseffect", targetWords: "h264encoder", droppedCountText: "12", isOne: false },
    ]);
    expect(droppingLinksOf(TEST_PATTERN_GRAPH)).toEqual([]);
  });

  it("names the ports of two dropping links between the same two nodes, and words one message", () => {
    const graph: StreamGraphSummary = {
      ...DROPPING_GRAPH,
      nodes: [stepNode("mixer", "nodes.mixer:Mixer", "Running", { dropped_bags_by_link: { La: 3, Lb: 1 } })],
      links: [
        { id: "La", source_node: "camera", source_port: "video", target_node: "mixer", target_port: "left", state: "wired" },
        { id: "Lb", source_node: "camera", source_port: "preview", target_node: "mixer", target_port: "right", state: "wired" },
      ],
    };
    expect(droppingLinksOf(graph)).toEqual([
      { linkId: "La", sourceWords: "camera.video", targetWords: "mixer.left", droppedCountText: "3", isOne: false },
      { linkId: "Lb", sourceWords: "camera.preview", targetWords: "mixer.right", droppedCountText: "1", isOne: true },
    ]);
  });
});

describe("previewable outputs", () => {
  it("lists the private and public outputs, never an internal one even with a preview page, and previews the first unless another is chosen", () => {
    const graphWithAnInternalPreviewPage = { ...DROPPING_GRAPH, exposed: DROPPING_GRAPH.exposed.map((output) => ({ ...output, watch_page_url: "http://127.0.0.1:4446/watch/x" })) };
    expect(previewableOutputsOf(graphWithAnInternalPreviewPage).map((output) => output.port)).toEqual(["encoded_video", "levels"]);
    expect(previewableOutputsOf(DROPPING_GRAPH).map((output) => output.port)).toEqual(["encoded_video", "levels"]);
    expect(choosePreviewedOutput(DROPPING_GRAPH, null)?.port).toBe("encoded_video");
    expect(choosePreviewedOutput(DROPPING_GRAPH, { node: "brightnessmeter", port: "levels" })?.port).toBe("levels");
    expect(choosePreviewedOutput(DROPPING_GRAPH, { node: "halftonelenseffect", port: "video_to_downstream" })?.port).toBe("encoded_video");
    expect(choosePreviewedOutput(TEST_PATTERN_GRAPH, null)).toBeNull();
  });
});

