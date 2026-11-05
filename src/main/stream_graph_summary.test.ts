import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamGraphDeclaredPort, StreamGraphLink, StreamGraphNode } from "../shared/tatolab_backend_contract.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";

const RELEASE_ORIGIN = "http://127.0.0.1:4446";

const summaryOfTheGraphToolResultAtTheReleaseOrigin = (requestedStream: string, graphText: string) =>
  streamGraphSummaryFromTheGraphToolResult(requestedStream, graphText, RELEASE_ORIGIN);

/** What a real runtime answered `GET /api/graph?stream=main` with, the same document its `graph {stream: "main"}` tool renders, for a stream of a test pattern, an inverting effect, a brightness meter and a display window. */
const aRealGraphOfOneStream = () => readFile(new URL("./test-fixtures/local-api-graph-of-the-stream-main.json", import.meta.url), "utf8");

const uncataloguedPorts = (...portNames: string[]): StreamGraphDeclaredPort[] => portNames.map((name) => ({ name, family: null, catalog_section: null }));

function node(
  name: string,
  nodeType: string,
  state: string | null,
  counters: Pick<StreamGraphNode, "dropped_bags_by_link" | "refused_bags_by_output_port"> = { dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
  ports: Pick<StreamGraphNode, "input_ports" | "output_ports"> = { input_ports: [], output_ports: [] },
  nodeId = "",
  config: StreamGraphNode["config"] = {},
): StreamGraphNode {
  return { id: nodeId, name, type: nodeType, state, config, ...ports, ...counters };
}

function link(id: string, [sourceNode, sourcePort]: [string, string], [targetNode, targetPort]: [string, string], state: string): StreamGraphLink {
  return { id, source_node: sourceNode, source_port: sourcePort, target_node: targetNode, target_port: targetPort, state };
}

test("a_real_graph_reads_as_its_nodes_links_counters_and_exposed_ports_beside_its_own_text", async () => {
  const graphText = await aRealGraphOfOneStream();

  expect(summaryOfTheGraphToolResultAtTheReleaseOrigin("main", graphText)).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [
        node(
          "testpatternsource",
          "tatolab.stream:TestPatternSource",
          "Running",
          { dropped_bags_by_link: {}, refused_bags_by_output_port: { video: 0 } },
          { input_ports: [], output_ports: uncataloguedPorts("video") },
          "Pe9fffgi3l6sg3m4molzy4pov",
        ),
        node(
          "invertingeffect",
          "nodes.inverting_effect:InvertingEffect",
          "Running",
          { dropped_bags_by_link: { Lj17fu4mdczivji99oua37i06: 0 }, refused_bags_by_output_port: { video_to_downstream: 0 } },
          { input_ports: uncataloguedPorts("video_from_upstream"), output_ports: uncataloguedPorts("video_to_downstream") },
          "Pgwl3rys4jaz8k9g6pqxxv8kd",
        ),
        node(
          "brightnessmeter",
          "nodes.brightness_meter:BrightnessMeter",
          "Running",
          { dropped_bags_by_link: { Lizkqmkmmu5ldam8dbymcc4bc: 0 }, refused_bags_by_output_port: {} },
          { input_ports: uncataloguedPorts("video_from_upstream"), output_ports: [] },
          "Pak2of8mm6v631e1f30cw7zjo",
        ),
        node(
          "displaywindow",
          "tatolab.stream:DisplayWindow",
          "Running",
          { dropped_bags_by_link: { Lv5ujotcx5rnh9f4s6xewjot9: 0 }, refused_bags_by_output_port: {} },
          { input_ports: uncataloguedPorts("video"), output_ports: [] },
          "Pk79b96s4d8fumlitkntmn5dg",
          { title: "Tatolab", scaling: "fit" },
        ),
      ],
      links: [
        link("Lj17fu4mdczivji99oua37i06", ["testpatternsource", "video"], ["invertingeffect", "video_from_upstream"], "wired"),
        link("Lv5ujotcx5rnh9f4s6xewjot9", ["invertingeffect", "video_to_downstream"], ["displaywindow", "video"], "wired"),
        link("Lizkqmkmmu5ldam8dbymcc4bc", ["invertingeffect", "video_to_downstream"], ["brightnessmeter", "video_from_upstream"], "wired"),
      ],
      exposed: [
        {
          node: "invertingeffect",
          port: "video_to_downstream",
          level: "private",
          watch_page_url: "http://127.0.0.1:4446/watch/jonathanf-macbook/main/invertingeffect/video_to_downstream",
        },
      ],
      graph_document_text: graphText,
    },
  });
});

test("a_port_the_runtime_lists_without_a_name_refuses_the_graph_and_a_catalog_entry_without_a_section_names_none", () => {
  const graphWith = (outputs: unknown[]) =>
    summaryOfTheGraphToolResultAtTheReleaseOrigin("main", JSON.stringify({ nodes: [{ name: "a", ports: { inputs: [], outputs } }] }));

  const withoutASection = graphWith([{ name: "out", catalog_entry: { entry: {} } }]);
  expect(withoutASection.ok && withoutASection.value.nodes[0]?.output_ports).toEqual(uncataloguedPorts("out"));
  expect(graphWith([{ description: "no name" }]).ok).toBe(false);
});

test("an_internal_port_has_no_preview_page_and_a_graph_naming_no_machine_has_none", () => {
  const exposedPorts = (graph: object) => {
    const summary = summaryOfTheGraphToolResultAtTheReleaseOrigin("two words", JSON.stringify(graph));
    return summary.ok ? summary.value.exposed.map((exposedPort) => exposedPort.watch_page_url) : expect.unreachable(summary.failure);
  };
  const exposed = [
    { node: "encoder", port: "encoded_video", level: "public" },
    { node: "effect", port: "video_to_downstream", level: "internal" },
  ];

  expect(exposedPorts({ machine: "desk", exposed })).toEqual(["http://127.0.0.1:4446/watch/desk/two%20words/encoder/encoded_video", null]);
  expect(exposedPorts({ exposed })).toEqual([null, null]);
});

test("a_count_the_runtime_did_not_write_as_a_number_is_left_out", () => {
  const graph = {
    nodes: [{ name: "a", components: { metrics: { dropped_bags_by_link: { L1: 12, L2: "many", L3: -1 }, refused_bags_by_output_port: [] } } }],
  };

  const summary = summaryOfTheGraphToolResultAtTheReleaseOrigin("main", JSON.stringify(graph));

  expect(summary.ok && summary.value.nodes[0]).toEqual(node("a", "", null, { dropped_bags_by_link: { L1: 12 }, refused_bags_by_output_port: {} }));
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

  const summary = summaryOfTheGraphToolResultAtTheReleaseOrigin("recorder", JSON.stringify(graph));

  expect(summary.ok && summary.value.links).toEqual([link("L1", ["camera/camerasource", "video"], ["mp4writer", "video"], "awaiting_remote")]);
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

  const graphText = JSON.stringify(graph);

  expect(summaryOfTheGraphToolResultAtTheReleaseOrigin("main", graphText)).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [node("from-a-newer-runtime", "", null), node("a-state-of-another-type", "nodes.x:X", null)],
      links: [link("", ["a", "out"], ["b", "in"], "pending")],
      exposed: [{ node: "a", port: "out", level: "private", watch_page_url: null }],
      graph_document_text: graphText,
    },
  });
});

test("a_graph_that_is_not_json_is_refused_naming_the_stream", () => {
  const summary = summaryOfTheGraphToolResultAtTheReleaseOrigin("main", "not json");

  expect(summary.ok).toBe(false);
  expect(!summary.ok && summary.failure).toContain("`main`");
});

test("a graph whose node names no name is refused naming the stream", () => {
  const summary = summaryOfTheGraphToolResultAtTheReleaseOrigin("main", JSON.stringify({ nodes: [{ type: "nodes.x:X" }] }));

  expect(!summary.ok && summary.failure).toBe("the runtime's graph of `main` could not be read: missing field `name`");
});

test("a_port_the_graph_names_a_family_of_reads_as_that_family", () => {
  const graphText = JSON.stringify({
    stream: "main",
    nodes: [{ id: "P1", name: "camerasource", type: "tatolab.stream:CameraSource", ports: { inputs: [], outputs: [{ name: "video", family: "Image" }] } }],
    links: [],
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphText, "http://127.0.0.1:4446");
  expect(graph.ok && graph.value.nodes[0]?.output_ports).toEqual([{ name: "video", family: "image", catalog_section: null }]);
});
