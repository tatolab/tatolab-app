import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { StreamGraphDeclaredPort, StreamGraphLink, StreamGraphNode } from "../shared/tatolab_backend_contract.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";

/** What a real runtime answered `GET /api/graph?stream=main` with, the same document its `graph {stream: "main"}` tool renders, for a stream of a test pattern, an inverting effect, a brightness meter and a display window. */
const aRealGraphOfOneStream = () => readFile(new URL("./test-fixtures/local-api-graph-of-the-stream-main.json", import.meta.url), "utf8");

/** What a real runtime's `graph {stream: "rive-overlay-main-34a4e1"}` tool answered for a test pattern feeding a halftone effect, a brightness meter, and a manual Python node whose `start()` raised. */
const aRealGraphOfAStreamWithANodeWhoseStartRaised = () =>
  readFile(new URL("./test-fixtures/local-api-graph-of-a-stream-with-a-node-whose-start-raised.json", import.meta.url), "utf8");

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
  return { id: nodeId, name, type: nodeType, state, failed_because: null, process_raising_because: null, config, ...ports, ...counters, pins: {}, studio: NODE_STUDIO_FIELDS_NONE_SET, fragment: null };
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
      stream_asset: null,
      groups: [],
      notes: [],
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
      stream_asset: null,
      groups: [],
      notes: [],
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

test("a_node_reads_why_it_failed_from_its_components_word_for_word_and_null_while_it_has_not_failed", async () => {
  const graphText = await aRealGraphOfAStreamWithANodeWhoseStartRaised();

  const summary = streamGraphSummaryFromTheGraphToolResult("rive-overlay-main-34a4e1", graphText);

  expect(summary.ok && summary.value.nodes.map((graphNode) => [graphNode.name, graphNode.state, graphNode.failed_because])).toEqual([
    ["testpatternsource", "Running", null],
    ["halftonelenseffect", "Running", null],
    ["brightnessmeter", "Running", null],
    ["riveoverlay", "Error", "start() raised: no Rive file at ./missing.riv"],
  ]);
});

test("a_node_whose_components_carry_no_failed_because_reads_null", () => {
  const graph = { nodes: [{ name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", components: { state: "Running" } }] };

  const summary = streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify(graph));

  expect(summary.ok && summary.value.nodes[0]?.failed_because).toBeNull();
});

/** A graph document as the runtime's studio contract writes it: the stream asset, a node's `studio` under contract 1, one written before the contract as a free map, one under the contract with keys of the wrong shape, an unlinked input's value, a labelled group, and a canvas note under the document's own `studio`. */
const A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES = {
  asset: "1a6c8434-651e-4c86-ae72-620f991fcf90",
  stream: "look-main-98bc63",
  nodes: [
    {
      id: "f95a8518-acf8-5fff-a7a7-4657efedbb22",
      name: "camera",
      type: "tatolab.stream:CameraSource",
      studio: { contract: 1, position: [40, -12.5], group: "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421", comment: "the front door", colour: "#3b82f6", collapsed: true, metadata: { pinned: true } },
    },
    { id: "4b37b30b-f092-5712-be47-f4a41d9d6a10", name: "halftone", type: "nodes.halftone:HalftoneLensEffect", studio: { group: "sources", position: "far left", comment: "kept", x: 4, metadata: 7 } },
    { id: "5c48c41c-0103-4f2a-8e6b-2a3b4c5d6e7f", name: "meter", type: "nodes.meter:BrightnessMeter", studio: { contract: 1, position: "far left", collapsed: "yes" }, pins: { level: { value: 0.5 }, threshold: 2 } },
  ],
  links: [],
  groups: [
    { id: "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421", title: "Inputs", description: "What the look reads", colour: "#3b82f6" },
    { id: "7d1e2f3a-0000-4000-8000-000000000001", title: "Bare" },
  ],
  studio: { contract: 1, notes: [{ id: "9e8d7c6b-5a49-4382-a170-0f1e2d3c4b5a", text: "Tune the dots here", position: [300, 80], size: [220, 90] }] },
  machine: "studio-mac",
};

test("a_real_graph_reads_its_stream_asset", async () => {
  const recordedResponse: { result: { content: { text: string }[] } } = JSON.parse(
    await readFile(new URL("./test-fixtures/local-api-graph-tool-result-of-a-stream-stating-stream-facts.json", import.meta.url), "utf8"),
  );
  const graphToolResultText = recordedResponse.result.content[0]?.text ?? expect.unreachable("the recorded graph holds no tool result text");

  const summary = streamGraphSummaryFromTheGraphToolResult("suite-stream-project-1-a_declaring_source_and_a_replacin-98bc63", graphToolResultText);

  expect(summary.ok && summary.value.stream_asset).toBe("1a6c8434-651e-4c86-ae72-620f991fcf90");
});

test("a_recorded_graph_reads_studio_fields_written_under_the_contract_a_group_written_into_its_nodes_a_pin_value_and_a_canvas_note", async () => {
  const recordedResponse: { result: { content: { text: string }[] } } = JSON.parse(
    await readFile(new URL("./test-fixtures/local-api-graph-tool-result-of-a-stream-holding-studio-fields-a-group-and-a-note.json", import.meta.url), "utf8"),
  );
  const graphToolResultText = recordedResponse.result.content[0]?.text ?? expect.unreachable("the recorded graph holds no tool result text");

  const summary = streamGraphSummaryFromTheGraphToolResult("studio-fields-main-bb0c95", graphToolResultText);

  if (!summary.ok) return expect.unreachable(summary.failure);
  const group = "21d9c0ee-a01d-40a0-ad61-bd05476819e7";
  expect(summary.value.stream_asset).toBe("465d6f89-5f61-43ee-99e0-ad46fb979935");
  expect(summary.value.nodes.map((graphNode) => [graphNode.name, graphNode.id, graphNode.studio, graphNode.pins])).toEqual([
    ["testpatternsource", "df33b674-0693-411f-99ce-c3e87c6f053c", NODE_STUDIO_FIELDS_NONE_SET, {}],
    ["testpatternsource-2", "fe2d6234-0c56-4250-ac26-3d0d17b26e5e", { position: [40, 20], group, comment: "c", colour: "#3b82f6", collapsed: true, metadata: { k: 1 } }, {}],
    ["add", "a1461e65-164d-4d11-8075-f3b84a4ebdb4", { ...NODE_STUDIO_FIELDS_NONE_SET, group }, { a: 2 }],
  ]);
  expect(summary.value.groups).toEqual([{ id: group, title: "Inputs", description: "d", colour: "#3b82f6" }]);
  expect(summary.value.notes).toEqual([{ id: "762070bf-4080-4d5b-b54e-0c4c4a0b2258", text: "n", position: [300, 80], size: [220, 90] }]);
});

test("a_graph_reads_each_nodes_studio_fields_as_the_runtime_does_its_pins_its_groups_and_its_canvas_notes", () => {
  const summary = streamGraphSummaryFromTheGraphToolResult("look-main-98bc63", JSON.stringify(A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES));

  expect(summary.ok && summary.value.stream_asset).toBe("1a6c8434-651e-4c86-ae72-620f991fcf90");
  expect(summary.ok && summary.value.nodes.map((graphNode) => graphNode.studio)).toEqual([
    { position: [40, -12.5], group: "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421", comment: "the front door", colour: "#3b82f6", collapsed: true, metadata: { pinned: true } },
    { ...NODE_STUDIO_FIELDS_NONE_SET, comment: "kept", metadata: { group: "sources", position: "far left", x: 4, metadata: 7 } },
    NODE_STUDIO_FIELDS_NONE_SET,
  ]);
  expect(summary.ok && summary.value.nodes.map((graphNode) => graphNode.pins)).toEqual([{}, {}, { level: { value: 0.5 }, threshold: 2 }]);
  expect(summary.ok && summary.value.groups).toEqual([
    { id: "2c6a1f7e-93b4-4d0a-8e15-b6f0c3a9d421", title: "Inputs", description: "What the look reads", colour: "#3b82f6" },
    { id: "7d1e2f3a-0000-4000-8000-000000000001", title: "Bare", description: null, colour: null },
  ]);
  expect(summary.ok && summary.value.notes).toEqual([{ id: "9e8d7c6b-5a49-4382-a170-0f1e2d3c4b5a", text: "Tune the dots here", position: [300, 80], size: [220, 90] }]);
});

test("a_note_the_runtime_would_refuse_is_left_out_and_the_rest_of_the_graph_still_reads", () => {
  const goodNote = { id: "n2", text: "kept", position: [1, 2], size: [3, 4] };
  const graph = { ...A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES, studio: { contract: 1, notes: [{ id: "n1", text: "", position: [1], size: [2, 2] }, { id: "n3", position: [1, 2], size: [2, 2] }, goodNote] } };

  const summary = streamGraphSummaryFromTheGraphToolResult("look-main-98bc63", JSON.stringify(graph));

  expect(summary.ok && summary.value.notes).toEqual([goodNote]);
  expect(summary.ok && summary.value.nodes.length).toBe(A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES.nodes.length);
});

test("a_group_in_any_uuid_form_the_runtime_parses_reads_and_a_studio_under_a_contract_this_app_does_not_read_is_a_free_map", () => {
  const graphWithStudios = (studios: unknown[]) => ({ ...A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES, nodes: A_GRAPH_HOLDING_STUDIO_FIELDS_GROUPS_AND_NOTES.nodes.map((node, index) => ({ ...node, studio: studios[index] ?? {} })) });

  const summary = streamGraphSummaryFromTheGraphToolResult(
    "look-main-98bc63",
    JSON.stringify(graphWithStudios([{ group: "21d9c0eea01d40a0ad61bd05476819e7" }, { group: "{21D9C0EE-A01D-40A0-AD61-BD05476819E7}" }, { contract: 2, anchor: [1, 2], comment: "c" }])),
  );

  expect(summary.ok && summary.value.nodes.map((graphNode) => graphNode.studio)).toEqual([
    { ...NODE_STUDIO_FIELDS_NONE_SET, group: "21d9c0eea01d40a0ad61bd05476819e7" },
    { ...NODE_STUDIO_FIELDS_NONE_SET, group: "{21D9C0EE-A01D-40A0-AD61-BD05476819E7}" },
    { ...NODE_STUDIO_FIELDS_NONE_SET, comment: "c", metadata: { contract: 2, anchor: [1, 2] } },
  ]);
});

test("a_subgraph_node_holds_its_fragments_nodes_links_and_groups_read_as_the_streams_are_and_its_kind_from_its_type", () => {
  const fragment = {
    nodes: [
      { id: "in-id", name: "in", type: "tatolab.stream:GraphInput", ports: { inputs: [], outputs: [{ name: "value" }] }, components: {} },
      { id: "blur-id", name: "blur", type: "nodes.blur:Blur", components: { state: "Running" } },
    ],
    links: [{ id: "L1", source: { node: "in", port: "value" }, target: { node: "blur", port: "video_in" }, state: "wired" }],
    groups: [{ id: "g", title: "Inside" }],
  };
  const graph = {
    nodes: [
      { id: "look-id", name: "look", type: "tatolab.project:AuthoredFragment", kind: "fragment", fragment },
      { id: "levels-id", name: "levels", type: "generators.mics:mic_levels", kind: "fragment", fragment: { nodes: [], links: [] } },
      { id: "lobby-id", name: "lobby", type: "tatolab.project:StreamFragment", kind: "fragment" },
      { id: "cam-id", name: "camera", type: "nodes.camera:Camera", kind: "process" },
    ],
  };

  const summary = streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify(graph));

  expect(summary.ok && summary.value.nodes.map((graphNode) => graphNode.fragment)).toEqual([
    {
      kind: "authored",
      nodes: [node("in", "tatolab.stream:GraphInput", null, undefined, { input_ports: [], output_ports: portsStatingNoStreamFacts("value") }, "in-id"), node("blur", "nodes.blur:Blur", "Running", undefined, undefined, "blur-id")],
      links: [link("L1", ["in", "value"], ["blur", "video_in"], "wired")],
      groups: [{ id: "g", title: "Inside", description: null, colour: null }],
    },
    { kind: "generated", nodes: [], links: [], groups: [] },
    { kind: "placed_stream", nodes: [], links: [], groups: [] },
    null,
  ]);
  expect(streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify({ nodes: [{ name: "bad", fragment: "nodes" }] })).ok).toBe(false);
});

/** The graph text of a recorded `graph` tool response under `test-fixtures/`. */
async function recordedGraphToolResultText(fixtureName: string): Promise<string> {
  const recordedResponse: { result: { content: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureName}`, import.meta.url), "utf8"));
  return recordedResponse.result.content[0]?.text ?? expect.unreachable("the recorded graph holds no tool result text");
}

test("a_recorded_graph_reads_a_collapsed_selection_as_an_authored_fragment_holding_its_nodes_and_the_interface_nodes_the_collapse_made", async () => {
  const summary = streamGraphSummaryFromTheGraphToolResult("fx-main-5fef64", await recordedGraphToolResultText("local-api-graph-tool-result-of-a-stream-holding-an-authored-fragment.json"));

  if (!summary.ok) return expect.unreachable(summary.failure);
  const subgraph = summary.value.nodes.find((graphNode) => graphNode.name === "look") ?? expect.unreachable("no subgraph node");
  expect(subgraph.type).toBe("tatolab.project:AuthoredFragment");
  expect(subgraph.fragment?.kind).toBe("authored");
  expect(subgraph.fragment?.nodes.map((graphNode) => [graphNode.name, graphNode.type, graphNode.fragment])).toEqual([
    ["look-in", "nodes.invert:Invert", null],
    ["look-in-video-in", "tatolab.stream:GraphInput", null],
    ["look-in-video-out", "tatolab.stream:GraphOutput", null],
  ]);
  expect(subgraph.fragment?.links.map((link) => [link.source_node, link.source_port, link.target_node, link.target_port])).toEqual([
    ["look-in-video-in", "value", "look-in", "video_in"],
    ["look-in", "video_out", "look-in-video-out", "value"],
  ]);
  expect(subgraph.fragment?.groups).toEqual([]);
  expect(summary.value.links.map((link) => [link.source_node, link.source_port, link.target_node, link.target_port])).toEqual([
    ["testpatternsource", "video", "look", "look-in-video-in"],
    ["look", "look-in-video-out", "sink", "video_in"],
  ]);
  expect(summary.value.nodes.filter((graphNode) => graphNode.name !== "look").every((graphNode) => graphNode.fragment === null)).toBe(true);
});

test("a_recorded_graph_reads_a_graph_generators_output_as_a_generated_fragment_named_by_the_generator", async () => {
  const summary = streamGraphSummaryFromTheGraphToolResult("lib-main-045632", await recordedGraphToolResultText("local-api-graph-tool-result-of-a-stream-holding-a-generator-fragment.json"));

  if (!summary.ok) return expect.unreachable(summary.failure);
  const subgraph = summary.value.nodes.find((graphNode) => graphNode.name === "bars") ?? expect.unreachable("no generated subgraph");
  expect(subgraph.type).toBe("generators.looks:bars");
  expect(subgraph.config).toEqual({ width: 480 });
  expect(subgraph.fragment?.kind).toBe("generated");
  expect(subgraph.fragment?.nodes.map((graphNode) => [graphNode.name, graphNode.type])).toEqual([["bars", "tatolab.testpattern:TestPatternSource"]]);
  expect(subgraph.fragment?.links).toEqual([]);
});

test("a_running_node_reads_what_its_process_keeps_raising_word_for_word_and_null_once_it_runs_cleanly", () => {
  const raisedBecause = "process() raised RuntimeError: broke on purpose (nodes/invert.py, line 29)";
  const graph = {
    nodes: [
      { name: "invert", type: "nodes.invert:Invert", components: { state: "Running", failed_because: null, process_raising_because: raisedBecause } },
      { name: "display", type: "tatolab.stream:Display", components: { state: "Running", failed_because: null, process_raising_because: null } },
    ],
  };

  const summary = streamGraphSummaryFromTheGraphToolResult("main", JSON.stringify(graph));

  expect(summary.ok && summary.value.nodes.map((graphNode) => [graphNode.name, graphNode.state, graphNode.process_raising_because])).toEqual([
    ["invert", "Running", raisedBecause],
    ["display", "Running", null],
  ]);
});
