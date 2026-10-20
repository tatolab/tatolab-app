// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { ListedStream, StreamGraphLink, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import {
  explainExposureLevel,
  exposedOutputAddress,
  nodeClassName,
  outputToSuggestExposing,
  portsOfGraphNodes,
  presentNodeKind,
  presentStreamStory,
  readableExposedPorts,
  summarizeGraphHealth,
  terminalCommandsForStream,
} from "./stream_overview_presentation";

function listedStream(name: string, state: string, nodeCount: number | null, projectDirectory = "/Users/ada/streams/pattern"): ListedStream {
  return { name, state, project_directory: projectDirectory, node_count: nodeCount, failed_because: null };
}

function wiredLink(source: string, sourcePort: string, target: string, targetPort: string, state = "wired"): StreamGraphLink {
  return { source_node: source, source_port: sourcePort, target_node: target, target_port: targetPort, state };
}

const TEST_PATTERN_GRAPH: StreamGraphSummary = {
  stream: "main",
  nodes: [
    { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: "Running" },
    { name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running" },
    { name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Running" },
    { name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", state: "Running" },
  ],
  links: [
    wiredLink("testpatternsource", "video", "invertingeffect", "video_from_upstream"),
    wiredLink("invertingeffect", "video_to_downstream", "displaywindow", "video"),
    wiredLink("invertingeffect", "video_to_downstream", "brightnessmeter", "video_from_upstream"),
  ],
  exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }],
};

function storyText(stream: ListedStream): string {
  const story = presentStreamStory(stream);
  return story.leadPhrase + story.rest.map((part) => (typeof part === "string" ? part : part.code)).join("");
}

describe("presentStreamStory", () => {
  it("tells each state's story in the spec's words", () => {
    expect(storyText(listedStream("main", "kept", 4))).toBe(
      "Running, and kept. Tatolab loads it again every time the runtime starts, until you stop it.",
    );
    expect(storyText(listedStream("demo", "attached", 4))).toBe(
      "Running, attached to the terminal that started it. It stops when that tatolab run or tatolab dev ends.",
    );
    expect(storyText(listedStream("p", "stopped", null))).toBe(
      "Stopped. Tatolab remembers it but won't load it until you start it again. Its graph and logs come back when it runs.",
    );
    expect(storyText(listedStream("l", "failed", null))).toBe(
      "Failed at its last start. Tatolab skips it each time the runtime starts, until you retry it.",
    );
    expect(storyText(listedStream("x", "awaiting_restart", 2))).toBe(
      "Awaiting restart. This version of Tatolab doesn't know this state yet.",
    );
  });

  it("shows a kept or attached stream with no graph yet as loading, with a spinner", () => {
    for (const state of ["kept", "attached"]) {
      const story = presentStreamStory(listedStream("main", state, null));
      expect(story.leadPhrase).toBe("Loading.");
      expect(story.isInProgress).toBe(true);
    }
    expect(presentStreamStory(listedStream("main", "kept", 4)).isInProgress).toBe(false);
  });

  it("sets the attached story's commands in mono", () => {
    const codeParts = presentStreamStory(listedStream("demo", "attached", 4)).rest.filter((part) => typeof part !== "string");
    expect(codeParts).toEqual([{ code: "tatolab run" }, { code: "tatolab dev" }]);
  });
});

describe("terminalCommandsForStream", () => {
  const commandsOf = (stream: ListedStream) => terminalCommandsForStream(stream).map(({ command }) => command);

  it("offers a kept stream's logs, stop and reload from its project", () => {
    expect(terminalCommandsForStream(listedStream("main", "kept", 4))).toEqual([
      { command: "tatolab logs --stream main -f", description: "Follow its logs" },
      { command: "tatolab stop main", description: "Stop it, and keep it stopped" },
      { command: "cd ~/streams/pattern && tatolab run -d", description: "Load your edits" },
    ]);
  });

  it("offers an attached stream's logs and stop, a loading stream's logs, and start and rm when not loaded", () => {
    expect(commandsOf(listedStream("attached-demo", "attached", 4))).toEqual([
      "tatolab logs --stream attached-demo -f",
      "tatolab stop attached-demo",
    ]);
    expect(commandsOf(listedStream("main", "kept", null))).toEqual(["tatolab logs --stream main -f"]);
    expect(terminalCommandsForStream(listedStream("pattern-two", "stopped", null))).toEqual([
      { command: "tatolab start pattern-two", description: "Load it again" },
      { command: "tatolab rm pattern-two", description: "Forget it for good" },
    ]);
    expect(terminalCommandsForStream(listedStream("lobby-recorder", "failed", null))).toEqual([
      { command: "tatolab start lobby-recorder", description: "Retry it" },
      { command: "tatolab rm lobby-recorder", description: "Forget it for good" },
    ]);
  });

  it("quotes a project path the shell would split", () => {
    expect(commandsOf(listedStream("main", "kept", 4, "/Users/ada/My Streams/pattern"))[2]).toBe(
      'cd ~/"My Streams/pattern" && tatolab run -d',
    );
  });
});

describe("explainExposureLevel", () => {
  it("says who reads each level, in the platform's words", () => {
    expect(explainExposureLevel("private", "macos", "main")).toEqual({
      levelWord: "Private",
      explanation: "Readable by other streams and tools on this Mac.",
    });
    expect(explainExposureLevel("private", "linux", "main").explanation).toBe(
      "Readable by other streams and tools on this computer.",
    );
    expect(explainExposureLevel("public", "macos", "main").explanation).toBe(
      "Readable on this Mac now; other machines read it once sharing arrives.",
    );
    expect(explainExposureLevel("internal", "macos", "main").explanation).toBe("Only main's own nodes read it.");
  });

  it("shows a level newer than this app as its word alone", () => {
    expect(explainExposureLevel("tailnet", "macos", "main")).toEqual({ levelWord: "Tailnet", explanation: null });
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
      exposed: [...TEST_PATTERN_GRAPH.exposed, { node: "testpatternsource", port: "video", level: "internal" }],
    };
    expect(readableExposedPorts(graph).map((exposedPort) => exposedPort.port)).toEqual(["video_to_downstream"]);
  });
});

describe("node types", () => {
  it("calls tatolab.stream types built-in, any other module:Class type Python, and a type with no colon nothing", () => {
    expect(presentNodeKind("tatolab.stream:TestPatternSource")).toBe("Built-in");
    expect(presentNodeKind("nodes.inverting_effect:InvertingEffect")).toBe("Python");
    expect(presentNodeKind("SomethingNew")).toBeNull();
  });

  it("reads the class after the colon, or the whole type", () => {
    expect(nodeClassName("nodes.inverting_effect:InvertingEffect")).toBe("InvertingEffect");
    expect(nodeClassName("SomethingNew")).toBe("SomethingNew");
  });
});

describe("summarizeGraphHealth", () => {
  it("counts all running and wired plainly", () => {
    expect(summarizeGraphHealth(TEST_PATTERN_GRAPH)).toEqual({
      nodesClause: "4 nodes running",
      linksClause: "3 links wired",
      errorClause: null,
    });
  });

  it("counts a part of the whole when anything is not running or wired, and names nodes in error", () => {
    const graph: StreamGraphSummary = {
      ...TEST_PATTERN_GRAPH,
      nodes: TEST_PATTERN_GRAPH.nodes.map((node, index) => (index === 1 ? { ...node, state: "Error" } : node)),
      links: TEST_PATTERN_GRAPH.links.map((link, index) => (index === 0 ? { ...link, state: "error" } : link)),
    };
    expect(summarizeGraphHealth(graph)).toEqual({
      nodesClause: "3 of 4 nodes running",
      linksClause: "2 of 3 links wired",
      errorClause: "1 node in error",
    });
  });

  it("drops the links clause when there are no links, and reads a node with no state as running", () => {
    expect(
      summarizeGraphHealth({ stream: "s", nodes: [{ name: "a", type: "t", state: null }], links: [], exposed: [] }),
    ).toEqual({ nodesClause: "1 node running", linksClause: null, errorClause: null });
  });
});

describe("portsOfGraphNodes", () => {
  it("reads inputs from links in and outputs from links out, each once in order of first appearance", () => {
    const ports = portsOfGraphNodes(TEST_PATTERN_GRAPH);
    expect(ports.get("testpatternsource")).toEqual({ inputs: [], outputs: [{ port: "video", exposureLevel: null }] });
    expect(ports.get("invertingeffect")).toEqual({
      inputs: ["video_from_upstream"],
      outputs: [{ port: "video_to_downstream", exposureLevel: "private" }],
    });
    expect(ports.get("displaywindow")).toEqual({ inputs: ["video"], outputs: [] });
  });

  it("adds an exposed port no link uses, and gives a link end in another stream its ports", () => {
    const ports = portsOfGraphNodes({
      stream: "viewer",
      nodes: [{ name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Running" }],
      links: [wiredLink("camerasource", "video", "displaywindow", "video")],
      exposed: [{ node: "displaywindow", port: "presented", level: "public" }],
    });
    expect(ports.get("displaywindow")?.outputs).toEqual([{ port: "presented", exposureLevel: "public" }]);
    expect(ports.get("camerasource")).toEqual({ inputs: [], outputs: [{ port: "video", exposureLevel: null }] });
  });
});

describe("outputToSuggestExposing", () => {
  it("picks the output that feeds the most links", () => {
    expect(outputToSuggestExposing(TEST_PATTERN_GRAPH)).toEqual({ node: "invertingeffect", port: "video_to_downstream" });
  });

  it("takes the first in link order on a tie, skips sources in another stream, and is null with no links", () => {
    expect(
      outputToSuggestExposing({
        stream: "s",
        nodes: [
          { name: "a", type: "t", state: null },
          { name: "b", type: "t", state: null },
        ],
        links: [wiredLink("elsewhere", "out", "a", "in"), wiredLink("a", "out", "b", "in")],
        exposed: [],
      }),
    ).toEqual({ node: "a", port: "out" });
    expect(outputToSuggestExposing({ ...TEST_PATTERN_GRAPH, links: [] })).toBeNull();
  });
});
