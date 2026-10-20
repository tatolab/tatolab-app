// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamGraphLink, StreamGraphNode } from "../../src/backend/tatolab_backend_contract.js";
import { streamGraphSummaryFromTheGraphJson } from "./stream_graph_summary.js";

/** What a real runtime answered `GET /api/graph?stream=main` with, for a stream of a test pattern, an inverting effect, a brightness meter and a display window. */
const aRealGraphOfOneStream = () => readFile(new URL("../../src-tauri/test-fixtures/local-api-graph-of-the-stream-main.json", import.meta.url), "utf8");

function node(name: string, nodeType: string, state: string | null): StreamGraphNode {
  return { name, type: nodeType, state };
}

function link([sourceNode, sourcePort]: [string, string], [targetNode, targetPort]: [string, string], state: string): StreamGraphLink {
  return { source_node: sourceNode, source_port: sourcePort, target_node: targetNode, target_port: targetPort, state };
}

test("a_real_graph_reads_as_its_nodes_links_and_exposed_ports", async () => {
  expect(streamGraphSummaryFromTheGraphJson("main", await aRealGraphOfOneStream())).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [
        node("testpatternsource", "tatolab.stream:TestPatternSource", "Running"),
        node("invertingeffect", "nodes.inverting_effect:InvertingEffect", "Running"),
        node("brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "Running"),
        node("displaywindow", "tatolab.stream:DisplayWindow", "Running"),
      ],
      links: [
        link(["testpatternsource", "video"], ["invertingeffect", "video_from_upstream"], "wired"),
        link(["invertingeffect", "video_to_downstream"], ["displaywindow", "video"], "wired"),
        link(["invertingeffect", "video_to_downstream"], ["brightnessmeter", "video_from_upstream"], "wired"),
      ],
      exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }],
    },
  });
});

test("a_link_from_another_stream_names_its_source_by_that_stream", () => {
  const graph = {
    stream: "recorder",
    nodes: [
      { id: "P1", type: "tatolab.stream:Mp4Writer", name: "mp4writer", ports: { inputs: [], outputs: [] }, components: { state: "Running" } },
    ],
    links: [
      {
        id: "L1",
        source: { stream: "camera", node: "camerasource", port: "video" },
        target: { node: "mp4writer", port: "video" },
        capacity: 4,
        state: "awaiting_remote",
        awaiting_remote_reason: "the stream `camera` is not loaded",
        components: { state: "AwaitingRemote" },
      },
    ],
    exposed: [],
    machine: "jonathanf-macbook",
  };

  const summary = streamGraphSummaryFromTheGraphJson("recorder", JSON.stringify(graph));

  expect(summary.ok && summary.value.links).toEqual([link(["camera/camerasource", "video"], ["mp4writer", "video"], "awaiting_remote")]);
});

test("a_graph_missing_its_optional_keys_or_carrying_unknown_ones_still_reads", () => {
  const graph = {
    nodes: [
      { name: "from-a-newer-runtime", a_key_from_later: 1 },
      { name: "a-state-of-another-type", type: "nodes.x:X", components: { state: 7 } },
    ],
    links: [{ source: { node: "a", port: "out" }, target: { node: "b", port: "in" } }],
    exposed: [{ node: "a", port: "out" }],
    a_top_level_key_from_later: {},
  };

  expect(streamGraphSummaryFromTheGraphJson("main", JSON.stringify(graph))).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [node("from-a-newer-runtime", "", null), node("a-state-of-another-type", "nodes.x:X", null)],
      links: [link(["a", "out"], ["b", "in"], "pending")],
      exposed: [{ node: "a", port: "out", level: "private" }],
    },
  });
});

test("a_graph_that_is_not_json_is_refused_naming_the_stream", () => {
  const summary = streamGraphSummaryFromTheGraphJson("main", "not json");

  expect(summary.ok).toBe(false);
  expect(!summary.ok && summary.failure).toContain("`main`");
});

test("a graph whose node names no name is refused naming the stream", () => {
  const summary = streamGraphSummaryFromTheGraphJson("main", JSON.stringify({ nodes: [{ type: "nodes.x:X" }] }));

  expect(!summary.ok && summary.failure).toBe("the runtime's graph of `main` could not be read: missing field `name`");
});
