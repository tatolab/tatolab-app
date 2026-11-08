import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamGraphDeclaredPort, StreamGraphLink, StreamGraphNode } from "../shared/tatolab_backend_contract.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";

/** What a real runtime answered `GET /api/graph?stream=main` with, the same document its `graph {stream: "main"}` tool renders, for a stream of a test pattern, an inverting effect, a brightness meter and a display window. */
const aRealGraphOfOneStream = () => readFile(new URL("./test-fixtures/local-api-graph-of-the-stream-main.json", import.meta.url), "utf8");

const portsStatingNoStreamFacts = (...portNames: string[]): StreamGraphDeclaredPort[] => portNames.map((name) => ({ name, family: null, stream_facts: null, values_checked: null }));

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

test("a_real_graph_reads_as_its_nodes_links_and_counters_beside_its_own_text", async () => {
  const graphText = await aRealGraphOfOneStream();

  expect(streamGraphSummaryFromTheGraphToolResult("main", graphText)).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [
        node(
          "testpatternsource",
          "tatolab.stream:TestPatternSource",
          "Running",
          { dropped_bags_by_link: {}, refused_bags_by_output_port: { video: 0 } },
          { input_ports: [], output_ports: portsStatingNoStreamFacts("video") },
          "Pe9fffgi3l6sg3m4molzy4pov",
        ),
        node(
          "invertingeffect",
          "nodes.inverting_effect:InvertingEffect",
          "Running",
          { dropped_bags_by_link: { Lj17fu4mdczivji99oua37i06: 0 }, refused_bags_by_output_port: { video_to_downstream: 0 } },
          { input_ports: portsStatingNoStreamFacts("video_from_upstream"), output_ports: portsStatingNoStreamFacts("video_to_downstream") },
          "Pgwl3rys4jaz8k9g6pqxxv8kd",
        ),
        node(
          "brightnessmeter",
          "nodes.brightness_meter:BrightnessMeter",
          "Running",
          { dropped_bags_by_link: { Lizkqmkmmu5ldam8dbymcc4bc: 0 }, refused_bags_by_output_port: {} },
          { input_ports: portsStatingNoStreamFacts("video_from_upstream"), output_ports: [] },
          "Pak2of8mm6v631e1f30cw7zjo",
        ),
        node(
          "displaywindow",
          "tatolab.stream:DisplayWindow",
          "Running",
          { dropped_bags_by_link: { Lv5ujotcx5rnh9f4s6xewjot9: 0 }, refused_bags_by_output_port: {} },
          { input_ports: portsStatingNoStreamFacts("video"), output_ports: [] },
          "Pk79b96s4d8fumlitkntmn5dg",
          { title: "Tatolab", scaling: "fit" },
        ),
      ],
      links: [
        link("Lj17fu4mdczivji99oua37i06", ["testpatternsource", "video"], ["invertingeffect", "video_from_upstream"], "wired"),
        link("Lv5ujotcx5rnh9f4s6xewjot9", ["invertingeffect", "video_to_downstream"], ["displaywindow", "video"], "wired"),
        link("Lizkqmkmmu5ldam8dbymcc4bc", ["invertingeffect", "video_to_downstream"], ["brightnessmeter", "video_from_upstream"], "wired"),
      ],
      graph_document_text: graphText,
    },
  });
});

test("a_port_the_runtime_lists_without_a_name_refuses_the_graph_and_a_catalog_entry_without_a_section_names_none", () => {
  const graphWith = (outputs: unknown[]) =>
    streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify({ nodes: [{ name: "a", ports: { inputs: [], outputs } }] }));

  const withoutASection = graphWith([{ name: "out", catalog_entry: { entry: {} } }]);
  expect(withoutASection.ok && withoutASection.value.nodes[0]?.output_ports).toEqual(portsStatingNoStreamFacts("out"));
  expect(graphWith([{ description: "no name" }]).ok).toBe(false);
});

test("a_count_the_runtime_did_not_write_as_a_number_is_left_out", () => {
  const graph = {
    nodes: [{ name: "a", components: { metrics: { dropped_bags_by_link: { L1: 12, L2: "many", L3: -1 }, refused_bags_by_output_port: [] } } }],
  };

  const summary = streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify(graph));

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
    machine: "jonathanf-macbook",
  };

  const summary = streamGraphSummaryFromTheGraphToolResult("recorder", JSON.stringify(graph));

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

  expect(streamGraphSummaryFromTheGraphToolResult("main", graphText)).toEqual({
    ok: true,
    value: {
      stream: "main",
      nodes: [node("from-a-newer-runtime", "", null), node("a-state-of-another-type", "nodes.x:X", null)],
      links: [link("", ["a", "out"], ["b", "in"], "pending")],
      graph_document_text: graphText,
    },
  });
});

test("a_graph_that_is_not_json_is_refused_naming_the_stream", () => {
  const summary = streamGraphSummaryFromTheGraphToolResult("main", "not json");

  expect(summary.ok).toBe(false);
  expect(!summary.ok && summary.failure).toContain("`main`");
});

test("a graph whose node names no name is refused naming the stream", () => {
  const summary = streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify({ nodes: [{ type: "nodes.x:X" }] }));

  expect(!summary.ok && summary.failure).toBe("the runtime's graph of `main` could not be read: missing field `name`");
});

test("a_port_the_graph_names_a_family_of_reads_as_that_family", () => {
  const graphText = JSON.stringify({
    stream: "main",
    nodes: [{ id: "P1", name: "camerasource", type: "tatolab.stream:CameraSource", ports: { inputs: [], outputs: [{ name: "video", family: "Image" }] } }],
    links: [],
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphText);
  expect(graph.ok && graph.value.nodes[0]?.output_ports).toEqual([{ name: "video", family: "image", stream_facts: null, values_checked: null }]);
});

test("a_port_reads_as_the_family_its_family_declaration_names_as_the_runtime_renders_it", () => {
  const graphText = JSON.stringify({
    stream: "main",
    nodes: [
      {
        id: "P1",
        name: "detector",
        type: "nodes.detector:Detector",
        ports: { inputs: [{ name: "video", family: { family: "image" } }], outputs: [{ name: "faces", family: { family: "records" } }, { name: "levels", family: { family: "channels", rate: 48000 } }] },
      },
    ],
    links: [],
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphText);
  expect(graph.ok && graph.value.nodes[0]?.output_ports.map((port) => port.family)).toEqual(["records", "channels"]);
  expect(graph.ok && graph.value.nodes[0]?.input_ports.map((port) => port.family)).toEqual(["image"]);
});

test("an_output_reads_the_stream_facts_and_the_unchecked_mark_the_runtime_renders_on_it", () => {
  const graphText = JSON.stringify({
    stream: "main",
    nodes: [
      {
        id: "P1",
        name: "declaresitsframerateandwritesrecords",
        type: "stream:DeclaresItsFrameRateAndWritesRecords",
        ports: {
          inputs: [],
          outputs: [
            { name: "video", family: { family: "image" }, stream_facts: { family: "image", frame_rate: { numerator: 30000, denominator: 1001 } } },
            { name: "records", family: { family: "records" }, values_checked: false },
            {
              name: "encoded",
              family: { family: "packets" },
              stream_facts: { family: "packets", rfc6381_codec: "opus", sample_rate: 48000, channel_count: 2, codec_configuration_hex: "4f7075734865616401023801" },
            },
            { name: "odd", family: { family: "image" }, stream_facts: { family: "light_field", rays: 9 } },
          ],
        },
      },
    ],
    links: [],
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphText);
  expect(graph.ok && graph.value.nodes[0]?.output_ports).toEqual([
    {
      name: "video",
      family: "image",
      stream_facts: { family: "image", frame_rate: { numerator: 30000, denominator: 1001 }, content_light_level: null, mastering_display_colour_volume: null },
      values_checked: null,
    },
    { name: "records", family: "records", stream_facts: null, values_checked: false },
    {
      name: "encoded",
      family: "packets",
      stream_facts: { family: "packets", rfc6381_codec: "opus", coded_width: null, coded_height: null, sample_rate: 48000, channel_count: 2, codec_configuration_byte_length: 12 },
      values_checked: null,
    },
    { name: "odd", family: "image", stream_facts: null, values_checked: null },
  ]);
});
