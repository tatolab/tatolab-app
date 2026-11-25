import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationResponseOfTheResultText, failureOf, fakeLocalApiServerAnswering, headAndBodyOf, recordedResponseBody } from "./runtime_operations_test_support.js";
import { describeStreamGraph, readProjectLogRecords } from "./runtime_operations.js";
import { bagsDroppedOnTheLink, bagsRefusedOnTheOutputPort, pinOfThePort, streamFactsOfThePort } from "@tatolab/tato-app-view-sdk/studio_readings";

afterEach(cleanUpWhatTheTestStarted);

test("reading_a_projects_log_asks_the_logs_tool_for_the_project_narrowed_to_a_stream_and_reads_each_records_action_and_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json")),
  ]);

  const page = answerOf(await server.run(readProjectLogRecords("/tmp/tatolab-proof-projects/pattern", { stream: "pattern-main-d76f70", action: null }, null, null)));

  expect(page.project_directory).toBe("/tmp/tatolab-proof-projects/pattern");
  expect(page.next_after).toBe("1:7830");
  expect(page.records_no_longer_held).toBe(false);
  expect(page.records.map((record) => [record.stream, record.action, record.message])).toEqual([
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "Loading the stream `pattern-main-d76f70` from /tmp/tatolab-proof-projects/pattern"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "node type described in the stream's processor interpreter registered"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "node type described in the stream's processor interpreter registered"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "[start] Starting the stream `pattern-main-d76f70`"],
  ]);
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("logs");
  expect(JSON.parse(body).params).toEqual({ project_directory: "/tmp/tatolab-proof-projects/pattern", stream: "pattern-main-d76f70", count: 500 });
});

test("reading_on_from_a_cursor_until_another_narrowed_to_an_action_sends_both_cursors_and_the_action_and_no_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-logs-tool-result-of-the-project-doorways-narrowed-to-one-load-first-12.json")),
  ]);

  const page = answerOf(
    await server.run(readProjectLogRecords("/tmp/tatolab-proof-projects/doorways", { stream: null, action: "Rnd53mwtsrixjyxk7h3jfq5j5-7" }, "1:0", "1:1000000")),
  );

  expect(page.records).toHaveLength(12);
  expect(new Set(page.records.map((record) => record.action))).toEqual(new Set(["Rnd53mwtsrixjyxk7h3jfq5j5-7"]));
  expect(JSON.parse(headAndBodyOf(server.receivedRequests()[0])[1]).params).toEqual({
    project_directory: "/tmp/tatolab-proof-projects/doorways",
    action: "Rnd53mwtsrixjyxk7h3jfq5j5-7",
    after: "1:0",
    until: "1:1000000",
    count: 500,
  });
});

test("a_log_read_the_runtime_refuses_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-logs-of-a-project-directory-that-is-not-absolute.json")),
  ]);

  expect(failureOf(await server.run(readProjectLogRecords("relative", { stream: null, action: null }, null, null)))).toMatchObject({
    _tag: "RuntimeRefused",
    words: "`project_directory` must be an absolute path; got `relative`",
  });
});

test("describing_a_stream_graph_calls_the_graph_tool_and_passes_on_the_answer_the_contract_types", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-result-of-the-stream-test-pattern-halftone-lens-main.json")),
  ]);

  const graph = answerOf(await server.run(describeStreamGraph("test-pattern-halftone-lens-main-66e784")));

  expect([graph.stream, graph.asset, graph.machine]).toEqual(["test-pattern-halftone-lens-main-66e784", "0eaf9ee2-0f73-4154-a3f6-a99c261b850d", "vm"]);
  expect(graph.nodes.map((node) => [node.name, node.type, node.kind, node.components.state])).toEqual([
    ["testpatternsource", "tatolab.testpattern:TestPatternSource", "process", "Running"],
    ["halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "process", "Running"],
    ["brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "process", "Running"],
  ]);
  const pinTypeNameOf = (port: { pin_type?: { type: string } }) => port.pin_type?.type ?? null;
  expect(graph.nodes.map((node) => [node.name, node.ports.inputs.map(pinTypeNameOf), node.ports.outputs.map(pinTypeNameOf)])).toEqual([
    ["testpatternsource", ["integer", "integer"], ["texture"]],
    ["halftonelenseffect", ["texture"], ["texture"]],
    ["brightnessmeter", ["texture"], []],
  ]);
  expect(graph.links.map((link) => [link.id, link.source, link.target, link.state])).toEqual([
    ["Lkkcuvv7fdbrxfldbt4aplias", { node: "testpatternsource", port: "video" }, { node: "halftonelenseffect", port: "video_from_upstream" }, "wired"],
    ["Lyvkliv1xmn40t5aul4rwtr76", { node: "halftonelenseffect", port: "video_to_downstream" }, { node: "brightnessmeter", port: "video_from_upstream" }, "wired"],
  ]);
  const [source, halftone] = graph.nodes;
  if (source === undefined || halftone === undefined) return expect.unreachable("the stream holds its source and its halftone");
  expect(bagsDroppedOnTheLink(halftone, "Lkkcuvv7fdbrxfldbt4aplias")).toBe(0);
  expect(bagsRefusedOnTheOutputPort(source, "video")).toBe(0);
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("graph");
  expect(JSON.parse(body).params).toEqual({ stream: "test-pattern-halftone-lens-main-66e784" });
});

test("a_graph_answer_the_contract_does_not_type_fails_as_not_the_contracts_answer", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheResultText('{"stream":"main","nodes":[],"links":[]}')]);

  expect(failureOf(await server.run(describeStreamGraph("main")))).toMatchObject({ _tag: "ContractMismatch", direction: "answer" });
});

test("a_real_graph_reads_the_pin_type_and_flow_each_typed_port_carries_and_an_untyped_port_as_untyped", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-result-of-pins-linking-a-texture-output-to-a-texture-input.json")),
  ]);

  const graph = answerOf(await server.run(describeStreamGraph("pins-main-cbc98f")));

  const aTexture = { pin_type: { type: "texture" }, flow: "stream" };
  expect(graph.nodes.map((node) => [node.name, node.ports.inputs.map(pinOfThePort), node.ports.outputs.map(pinOfThePort)])).toEqual([
    ["arraytoimage", [null], [aTexture]],
    ["imagetoarray", [aTexture], [null]],
  ]);
  expect(graph.links.map((link) => [link.source.node, link.source.port, link.target.node, link.target.port])).toEqual([["arraytoimage", "image", "imagetoarray", "image"]]);
});

/** `streamFacts` with its `family` key deleted, as a runtime that names stream facts by their pin type alone serves them. */
function withoutItsFamily(streamFacts: unknown): unknown {
  if (typeof streamFacts !== "object" || streamFacts === null || Array.isArray(streamFacts)) return streamFacts;
  return Object.fromEntries(Object.entries(streamFacts).filter(([key]) => key !== "family"));
}

test("a_real_graphs_stream_facts_read_by_their_pin_type_with_their_family_deleted_and_a_float_output_states_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-result-of-facts-main-with-texture-encoded-video-and-float-outputs.json")),
  ]);

  const graph = answerOf(await server.run(describeStreamGraph("facts-main-c8b289")));

  expect(graph.nodes.map((node) => [node.name, node.ports.outputs.map((port) => streamFactsOfThePort({ stream_facts: withoutItsFamily(port.stream_facts) }))])).toEqual([
    ["testpatternsource", [null]],
    [
      "h264encoder",
      [{ facts_of: "encoded_units", type: "encoded_video", rfc6381_codec: "avc1.640020", coded_width: 1280, coded_height: 720, sample_rate: null, channel_count: null, codec_configuration_byte_length: null }],
    ],
    ["declared_rate", [{ facts_of: "pictures", type: "texture", frame_rate: { numerator: 30, denominator: 1 }, content_light_level: null, mastering_display_colour_volume: null }]],
    ["counter", [null]],
  ]);
});

test("a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json")),
  ]);

  expect(failureOf(await server.run(describeStreamGraph("front-door"))).words).toBe(
    "graph failed: Resource not found: no stream named `front-door` is loaded in this runtime. Loaded: none",
  );
});
