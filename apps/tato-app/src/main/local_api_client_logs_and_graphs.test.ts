import { afterEach, expect, test } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse } from "./fake_local_api_server.js";
import { answerOf, cleanUpWhatTheTestStarted, controlOperationResponseOfTheResultText, failureOf, fakeLocalApiServerAnswering, headAndBodyOf, recordedResponseBody } from "./local_api_client_test_support.js";

afterEach(cleanUpWhatTheTestStarted);

test("reading_a_projects_log_asks_the_logs_tool_for_the_project_narrowed_to_a_stream_and_reads_each_records_action_and_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json")),
  ]);

  const page = answerOf(await server.client().readProjectLogRecords("/tmp/tatolab-proof-projects/pattern", { stream: "pattern-main-d76f70", action: null }, null, null, 4));

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
  expect(JSON.parse(body).params).toEqual({ project_directory: "/tmp/tatolab-proof-projects/pattern", stream: "pattern-main-d76f70", count: 4 });
});

test("reading_on_from_a_cursor_until_another_narrowed_to_an_action_sends_both_cursors_and_the_action_and_no_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-logs-tool-result-of-the-project-doorways-narrowed-to-one-load-first-12.json")),
  ]);

  const page = answerOf(
    await server.client().readProjectLogRecords("/tmp/tatolab-proof-projects/doorways", { stream: null, action: "Rnd53mwtsrixjyxk7h3jfq5j5-7" }, "1:0", "1:1000000", 12),
  );

  expect(page.records).toHaveLength(12);
  expect(new Set(page.records.map((record) => record.action))).toEqual(new Set(["Rnd53mwtsrixjyxk7h3jfq5j5-7"]));
  expect(JSON.parse(headAndBodyOf(server.receivedRequests()[0])[1]).params).toEqual({
    project_directory: "/tmp/tatolab-proof-projects/doorways",
    action: "Rnd53mwtsrixjyxk7h3jfq5j5-7",
    after: "1:0",
    until: "1:1000000",
    count: 12,
  });
});

test("a_log_read_the_runtime_refuses_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-logs-of-a-project-directory-that-is-not-absolute.json")),
  ]);

  expect(failureOf(await server.client().readProjectLogRecords("relative", { stream: null, action: null }, null, null, 500))).toEqual({
    failureDescription: "`project_directory` must be an absolute path; got `relative`",
    isTheRuntimesRefusal: true,
  });
});

test("describing_a_stream_graph_calls_the_graph_tool_and_keeps_its_text_as_the_runtime_wrote_it", async () => {
  const graphText = await recordedResponseBody("local-api-graph-of-the-stream-main.json");
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheResultText(graphText)]);

  const summary = answerOf(await server.client().describeStreamGraph("main"));

  expect(summary.stream).toBe("main");
  expect(summary.graph_document_text).toBe(graphText.trimEnd());
  expect(summary.graph_document_text).toContain('"config_checksum": 15071898633716066277');
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("graph");
  expect(JSON.parse(body).params).toEqual({ stream: "main" });
});

test("a_real_graph_tool_result_reads_with_its_counters_and_verbatim_text", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-tool-result-of-the-stream-front-door.json")),
  ]);

  const summary = answerOf(await server.client().describeStreamGraph("front-door"));

  expect(summary.nodes.map((node) => [node.name, node.type, node.state])).toEqual([
    ["testpatternsource", "tatolab.stream:TestPatternSource", "Running"],
    ["halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "Running"],
    ["brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "Running"],
    ["h264encoder", "tatolab.stream:H264Encoder", "Running"],
  ]);
  expect(summary.nodes.map((node) => [node.name, node.input_ports, node.output_ports])).toEqual([
    ["testpatternsource", [], [{ name: "video", family: null, stream_facts: null, values_checked: null, pin: null }]],
    ["halftonelenseffect", [{ name: "video_from_upstream", family: null, stream_facts: null, values_checked: null, pin: null }], [{ name: "video_to_downstream", family: null, stream_facts: null, values_checked: null, pin: null }]],
    ["brightnessmeter", [{ name: "video_from_upstream", family: null, stream_facts: null, values_checked: null, pin: null }], []],
    ["h264encoder", [{ name: "video", family: null, stream_facts: null, values_checked: null, pin: null }], [{ name: "encoded_video", family: null, stream_facts: null, values_checked: null, pin: null }]],
  ]);
  expect(summary.nodes[1]?.dropped_bags_by_link).toEqual({ Lt12wev5nhhd2ankv0rrz1w3v: 0 });
  expect(summary.nodes[3]?.refused_bags_by_output_port).toEqual({ encoded_video: 0 });
  expect(summary.links.map((link) => link.id)).toContain("Lt12wev5nhhd2ankv0rrz1w3v");
  expect(JSON.parse(summary.graph_document_text).stream).toBe("front-door");
});

test("a_real_graph_tool_result_reads_each_outputs_stream_facts_and_the_records_unchecked_mark", async () => {
  const stream = "suite-stream-project-1-a_declaring_source_and_a_replacin-98bc63";
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-tool-result-of-a-stream-stating-stream-facts.json")),
  ]);

  const summary = answerOf(await server.client().describeStreamGraph(stream));

  expect(summary.nodes.map((node) => [node.name, node.input_ports, node.output_ports])).toEqual([
    [
      "declarer",
      [],
      [
        {
          name: "video",
          family: "image",
          stream_facts: { family: "image", frame_rate: { numerator: 30, denominator: 1 }, content_light_level: null, mastering_display_colour_volume: null },
          values_checked: null,
          pin: null,
        },
        { name: "records", family: "records", stream_facts: null, values_checked: false, pin: null },
      ],
    ],
    [
      "replacer",
      [],
      [
        {
          name: "encoded",
          family: "packets",
          stream_facts: { family: "packets", rfc6381_codec: "avc1.64001f", coded_width: 1280, coded_height: 720, sample_rate: null, channel_count: null, codec_configuration_byte_length: null },
          values_checked: null,
          pin: null,
        },
      ],
    ],
    ["reportsitsupstreamsstreamfacts", [{ name: "encoded_from_upstream", family: "packets", stream_facts: null, values_checked: null, pin: null }], []],
  ]);
});

test("a_real_graph_reads_the_pin_type_and_flow_each_typed_port_carries_and_an_untyped_port_as_before", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-result-of-pins-linking-a-texture-output-to-a-texture-input.json")),
  ]);

  const summary = answerOf(await server.client().describeStreamGraph("pins-main-cbc98f"));

  const aTexture = { pin_type: { type: "texture" }, flow: "stream" };
  expect(summary.nodes.map((node) => [node.name, node.input_ports, node.output_ports])).toEqual([
    ["arraytoimage", [{ name: "array", family: "array", stream_facts: null, values_checked: null, pin: null }], [{ name: "image", family: "image", stream_facts: null, values_checked: null, pin: aTexture }]],
    ["imagetoarray", [{ name: "image", family: "image", stream_facts: null, values_checked: null, pin: aTexture }], [{ name: "array", family: "array", stream_facts: null, values_checked: null, pin: null }]],
  ]);
  expect(summary.links.map((link) => [link.source_node, link.source_port, link.target_node, link.target_port])).toEqual([["arraytoimage", "image", "imagetoarray", "image"]]);
});

test("a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json")),
  ]);

  expect(failureOf(await server.client().describeStreamGraph("front-door")).failureDescription).toBe(
    "graph failed: Resource not found: no stream named `front-door` is loaded in this runtime. Loaded: none",
  );
});
