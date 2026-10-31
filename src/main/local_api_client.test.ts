import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, StreamLocation } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  httpRequestBytes,
  listedStreamsFromTheListStreamsToolResult,
  LocalApiClient,
  parseHttpResponse,
  runtimeDescriptionFromTheDescribeRuntimeToolResult,
  queuedStreamActionFromTheToolResult,
  streamRenameAnswerFromTheRenameStreamToolResult,
  streamRunAnswerFromTheRunStreamToolResult,
} from "./local_api_client.js";
import type { Result } from "./result.js";

const cleanUps: (() => Promise<void>)[] = [];

/** A JSON-RPC response body recorded from a real runtime's local API. */
const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

async function fakeLocalApiServerAnswering(scriptedResponses: readonly Buffer[]): Promise<FakeLocalApiServer> {
  const server = await FakeLocalApiServer.answering(scriptedResponses);
  cleanUps.push(() => server.close());
  return server;
}

async function shortTemporarySocketPath(): Promise<string> {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  cleanUps.push(() => rm(socketDirectory, { recursive: true, force: true }));
  return path.join(socketDirectory, "local-api.sock");
}

function answerOf<T, F>(result: Result<T, F>): T {
  if (!result.ok) return expect.unreachable(JSON.stringify(result.failure));
  return result.value;
}

function failureOf<T, F>(result: Result<T, F>): F {
  if (result.ok) return expect.unreachable(`expected a failure, answered ${JSON.stringify(result.value)}`);
  return result.failure;
}

function headAndBodyOf(request: string | undefined): [string, string] {
  const headEnd = request?.indexOf("\r\n\r\n") ?? -1;
  if (request === undefined || headEnd === -1) return expect.unreachable(`not a request: ${request}`);
  return [request.slice(0, headEnd), request.slice(headEnd + 4)];
}

test("a_runtime_answering_ok_is_healthy", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "text/plain; charset=utf-8", "ok")]);

  answerOf(await server.client().checkHealth());

  const request = server.receivedRequests()[0];
  expect(request?.startsWith("GET /health HTTP/1.1\r\nHost: localhost\r\n"), request).toBe(true);
  expect(request).toContain("Connection: close\r\n");
  expect(request).not.toContain("Content-Length");
});

test("nothing_listening_names_the_socket", async () => {
  const socketPath = await shortTemporarySocketPath();

  const failure = failureOf(await new LocalApiClient(socketPath, 1_000, "0.45.0").checkHealth());

  expect(failure.failureDescription).toContain(socketPath);
});

test("a_runtime_that_never_answers_times_out", async () => {
  const socketPath = await shortTemporarySocketPath();
  const connectionsNeverAnswered: net.Socket[] = [];
  const listenerThatNeverAnswers = net.createServer((connection) => connectionsNeverAnswered.push(connection));
  await new Promise<void>((listening) => listenerThatNeverAnswers.listen(socketPath, listening));
  cleanUps.push(() => {
    connectionsNeverAnswered.forEach((connection) => connection.destroy());
    return new Promise<void>((closed) => listenerThatNeverAnswers.close(() => closed()));
  });

  const failure = failureOf(await new LocalApiClient(socketPath, 200, "0.45.0").checkHealth());

  expect(failure.failureDescription).toContain("did not answer within");
});

test("listing_streams_sends_the_headers_and_meta_the_runtime_requires", async () => {
  const server = await fakeLocalApiServerAnswering([toolResultResponse({ streams: [] })]);

  expect(answerOf(await server.client().listStreams())).toEqual([]);

  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head.startsWith("POST /mcp HTTP/1.1\r\n"), head).toBe(true);
  for (const requiredHeader of [
    "Accept: application/json, text/event-stream",
    "Content-Type: application/json",
    "MCP-Protocol-Version: 2026-07-28",
    "Mcp-Method: tools/call",
    "Mcp-Name: list_streams",
  ]) {
    expect(head, `${requiredHeader} missing`).toContain(requiredHeader);
  }
  expect(head).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
  const requestBody: unknown = JSON.parse(body);
  expect(requestBody).toMatchObject({ method: "tools/call", params: { name: "list_streams", arguments: {} } });
  expect(requestBody).toHaveProperty(["params", "_meta", "io.modelcontextprotocol/protocolVersion"], "2026-07-28");
  expect(requestBody).toHaveProperty(["params", "_meta", "io.modelcontextprotocol/clientInfo", "name"], "tatolab-app");
  expect(requestBody).toHaveProperty(["params", "_meta", "io.modelcontextprotocol/clientInfo", "version"], expect.any(String));
  expect(requestBody).toHaveProperty(["params", "_meta", "io.modelcontextprotocol/clientCapabilities"], {});
});

/** `describe_runtime`'s result as streamlib's wire-text test writes it, with and without the runtime's own log. */
const DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":"/home/u/.local/state/tatolab/logs"}';
const DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":null}';

test("describing_the_runtime_calls_describe_runtime_with_no_arguments_and_reads_its_four_fields", async () => {
  const server = await fakeLocalApiServerAnswering([toolResultResponse(JSON.parse(DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER))]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.1",
    build_id: "0.55.1+0123abc.9f8e7d",
    up_for_ms: 266_400_000,
    runtime_log_directory: "/home/u/.local/state/tatolab/logs",
  });
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: describe_runtime");
  expect(JSON.parse(body)).toMatchObject({ method: "tools/call", params: { name: "describe_runtime", arguments: {} } });
});

test("a_real_describe_runtime_result_reads_its_version_build_uptime_and_log_folder", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json")),
  ]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.2",
    build_id: "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60",
    up_for_ms: 10_007,
    runtime_log_directory: "/tmp/tatolab-proof/state/logs",
  });
});

test("a_runtime_keeping_no_own_log_describes_its_log_folder_as_null", () => {
  expect(answerOf(runtimeDescriptionFromTheDescribeRuntimeToolResult(DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER)).runtime_log_directory).toBeNull();
});

test("a_describe_runtime_result_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(runtimeDescriptionFromTheDescribeRuntimeToolResult('{"version":"0.55.1","up_for_ms":5,"runtime_log_directory":null}'))).toBe(
    "the runtime's describe_runtime result could not be read: missing field `build_id`",
  );
});

test("a_runtime_older_than_describe_runtime_refuses_it_in_its_own_words", async () => {
  const unknownToolRefusal = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "tool not found: describe_runtime" } });
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", unknownToolRefusal)]);

  expect(failureOf(await server.client().describeRuntime())).toEqual({
    failureDescription: "the runtime refused `describe_runtime` (200): tool not found: describe_runtime",
    isTheRuntimesRefusal: true,
  });
});

function listedStream(
  stream: string,
  displayName: string,
  location: StreamLocation | null,
  state: string,
  nodeCount: number | null,
  failedBecause: string | null,
  actionUnderWay: { action: string; step: string | null } | null = null,
): ListedStream {
  return {
    stream,
    display_name: displayName,
    location,
    state,
    node_count: nodeCount,
    failed_because: failedBecause,
    action: actionUnderWay?.action ?? null,
    step: actionUnderWay?.step ?? null,
  };
}

function locationOf(projectDirectory: string, streamFunction = "stream:main"): StreamLocation {
  return { project_directory: projectDirectory, stream_function: streamFunction };
}

const BACK_DOOR_TRACEBACK =
  'Traceback (most recent call last):\n  File "/tmp/tatolab-proof-projects/doorways/stream.py", line 15, in back_door\n    raise RuntimeError("the back door\'s camera is not plugged in")\nRuntimeError: the back door\'s camera is not plugged in';

test("a_real_list_streams_result_lists_a_running_a_stopped_and_a_failed_stream_by_id_and_display_name", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    listedStream("doorways-back_door-8630d0", "back_door", locationOf("/tmp/tatolab-proof-projects/doorways", "stream:back_door"), "failed", null, BACK_DOOR_TRACEBACK),
    listedStream("doorways-front_door-2ff456", "front_door", locationOf("/tmp/tatolab-proof-projects/doorways", "stream:front_door"), "running", 1, null),
    listedStream("pattern-main-d76f70", "main", locationOf("/tmp/tatolab-proof-projects/pattern"), "stopped", null, null),
  ]);
});

test("a_real_listing_after_the_runtime_restarted_lists_every_stream_it_re_loaded_running_and_the_rest_as_recorded", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-after-the-runtime-restarted.json")),
  ]);

  const listedStreams = answerOf(await server.client().listStreams());
  expect(listedStreams.map((listed) => [listed.stream, listed.state, listed.node_count])).toEqual([
    ["doorways-back_door-8630d0", "failed", null],
    ["doorways-front_door-2ff456", "running", 1],
    ["pattern-main-d76f70", "stopped", null],
  ]);
});

test("a_real_listing_names_the_action_and_step_of_a_stream_preparing_or_stopping", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-preparing-on-its-starting-step.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-stopping.json")),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    listedStream("pattern-main-d76f70", "main", locationOf("/tmp/tatolab-proof-projects/pattern"), "preparing", 4, null, {
      action: "Rnd53mwtsrixjyxk7h3jfq5j5-2",
      step: "starting",
    }),
  ]);
  expect(answerOf(await server.client().listStreams())).toEqual([
    listedStream("pattern-main-d76f70", "main", locationOf("/tmp/tatolab-proof-projects/pattern"), "stopping", 4, null, {
      action: "Rnd53mwtsrixjyxk7h3jfq5j5-3",
      step: "stopping",
    }),
  ]);
});

test("a_stream_waiting_in_its_projects_queue_is_listed_with_its_action_and_no_step", () => {
  const toolResult = {
    streams: [
      {
        stream: "pattern-main-d76f70",
        display_name: "main",
        location: { project_directory: "/tmp/p", stream_function: "stream:main" },
        state: "stopping",
        node_count: 4,
        failed_because: null,
        action: "Rabc-4",
        step: null,
      },
    ],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toEqual([
    listedStream("pattern-main-d76f70", "main", locationOf("/tmp/p"), "stopping", 4, null, { action: "Rabc-4", step: null }),
  ]);
});

test("a_stream_in_a_state_or_with_fields_this_app_does_not_know_is_still_listed", () => {
  const toolResult = {
    streams: [
      {
        stream: "newer-main-1a2b3c",
        display_name: "main",
        location: { project_directory: "/Users/me/newer", stream_function: "stream:main", a_field_from_later: 1 },
        state: "migrating",
        node_count: 1,
        failed_because: null,
        a_field_from_later: true,
      },
    ],
    a_top_level_field_from_later: [1, 2],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toEqual([
    listedStream("newer-main-1a2b3c", "main", locationOf("/Users/me/newer"), "migrating", 1, null),
  ]);
});

test("a_record_an_earlier_runtime_wrote_is_listed_without_a_location", () => {
  const toolResult = {
    streams: [{ stream: "camera", display_name: "camera", location: null, state: "failed", node_count: null, failed_because: "recorded by an earlier runtime; run it again" }],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toEqual([
    listedStream("camera", "camera", null, "failed", null, "recorded by an earlier runtime; run it again"),
  ]);
});

test("a_list_streams_result_naming_no_stream_id_or_display_name_is_refused", () => {
  expect(failureOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify({ streams: [{ display_name: "main", location: null, state: "running" }] })))).toBe(
    "the runtime's list_streams result could not be read: missing field `stream`",
  );
  expect(failureOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify({ streams: [{ stream: "a-main-1a2b3c", location: null, state: "running" }] })))).toBe(
    "the runtime's list_streams result could not be read: missing field `display_name`",
  );
  expect(failureOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify({ streams: [{ stream: "a-main-1a2b3c", display_name: "main", location: "/a", state: "running" }] })))).toBe(
    "the runtime's list_streams result could not be read: `location` is not an object",
  );
});

test("the_machine_name_comes_from_the_machine_wide_graph", async () => {
  const graph = { machine: "jonathanf-macbook", streams: [{ stream: "main", nodes: [], links: [], exposed: [], machine: "jonathanf-macbook" }] };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(graph))]);

  expect(answerOf(await server.client().machineName())).toBe("jonathanf-macbook");
  expect(server.receivedRequests()[0]?.startsWith("GET /api/graph HTTP/1.1\r\n")).toBe(true);
});

test("a_refused_rest_request_carries_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("500 Internal Server Error", "application/json", '{"error":"graph export failed: the engine is shutting down"}'),
  ]);

  expect(failureOf(await server.client().machineName()).failureDescription).toBe("graph export failed: the engine is shutting down");
});

test("a_json_rpc_refusal_is_reported_with_its_message", async () => {
  const refusal = { jsonrpc: "2.0", id: 1, error: { code: -32020, message: "Missing MCP-Protocol-Version header" } };
  const server = await fakeLocalApiServerAnswering([httpResponse("400 Bad Request", "application/json", JSON.stringify(refusal))]);

  const failure = failureOf(await server.client().listStreams());

  expect(failure.failureDescription).toContain("400");
  expect(failure.failureDescription).toContain("Missing MCP-Protocol-Version header");
});

test("a_tool_that_ran_and_failed_is_reported_with_its_text", async () => {
  const body = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "the stream action did not finish" }], isError: true } };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(body))]);

  expect(failureOf(await server.client().listStreams()).failureDescription).toBe("the stream action did not finish");
});

test("reading_a_projects_log_asks_the_logs_tool_for_the_project_narrowed_to_a_stream_and_reads_each_records_action_and_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json")),
  ]);

  const page = answerOf(await server.client().readProjectLogRecords("/tmp/tatolab-proof-projects/pattern", { stream: "pattern-main-d76f70", action: null }, null, 4));

  expect(page.project_directory).toBe("/tmp/tatolab-proof-projects/pattern");
  expect(page.next_after).toBe("1:7830");
  expect(page.records_no_longer_held).toBe(false);
  expect(page.records.map((record) => [record.stream, record.action, record.message])).toEqual([
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "Loading the stream `pattern-main-d76f70` from /tmp/tatolab-proof-projects/pattern"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "node type described in the stream's processor interpreter registered"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "node type described in the stream's processor interpreter registered"],
    ["pattern-main-d76f70", "Rnd53mwtsrixjyxk7h3jfq5j5-2", "[start] Starting the stream `pattern-main-d76f70`"],
  ]);
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: logs");
  expect(JSON.parse(body).params.arguments).toEqual({ project_directory: "/tmp/tatolab-proof-projects/pattern", stream: "pattern-main-d76f70", count: 4 });
});

test("reading_on_from_a_cursor_narrowed_to_an_action_sends_the_cursor_and_the_action_and_no_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-logs-tool-result-of-the-project-doorways-narrowed-to-one-load-first-12.json")),
  ]);

  const page = answerOf(
    await server.client().readProjectLogRecords("/tmp/tatolab-proof-projects/doorways", { stream: null, action: "Rnd53mwtsrixjyxk7h3jfq5j5-7" }, "1:0", 12),
  );

  expect(page.records).toHaveLength(12);
  expect(new Set(page.records.map((record) => record.action))).toEqual(new Set(["Rnd53mwtsrixjyxk7h3jfq5j5-7"]));
  expect(JSON.parse(headAndBodyOf(server.receivedRequests()[0])[1]).params.arguments).toEqual({
    project_directory: "/tmp/tatolab-proof-projects/doorways",
    action: "Rnd53mwtsrixjyxk7h3jfq5j5-7",
    after: "1:0",
    count: 12,
  });
});

test("a_log_read_the_runtime_refuses_carries_its_own_words", async () => {
  const refusal = "`project_directory` must be an absolute path; got `relative`";
  const body = { jsonrpc: "2.0", id: 1, result: { resultType: "complete", content: [{ type: "text", text: refusal }], isError: true } };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(body))]);

  expect(failureOf(await server.client().readProjectLogRecords("relative", { stream: null, action: null }, null, 500)).failureDescription).toBe(refusal);
});

/** The JSON-RPC response carrying `toolResultText` as the tool's one text block, exactly as written. */
function toolResultResponseOfText(toolResultText: string, isError = false): Buffer {
  const body = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: toolResultText }], isError } };
  return httpResponse("200 OK", "application/json", JSON.stringify(body));
}

test("describing_a_stream_graph_calls_the_graph_tool_and_keeps_its_text_as_the_runtime_wrote_it", async () => {
  const graphText = await recordedResponseBody("local-api-graph-of-the-stream-main.json");
  const server = await fakeLocalApiServerAnswering([toolResultResponseOfText(graphText)]);

  const summary = answerOf(await server.client().describeStreamGraph("main", "http://127.0.0.1:4446"));

  expect(summary.stream).toBe("main");
  expect(summary.graph_document_text).toBe(graphText);
  expect(summary.graph_document_text).toContain('"config_checksum": 15071898633716066277');
  expect(summary.exposed[0]?.watch_page_url).toBe("http://127.0.0.1:4446/watch/jonathanf-macbook/main/invertingeffect/video_to_downstream");
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: graph\r\n");
  expect(JSON.parse(body).params.arguments).toEqual({ stream: "main" });
});

test("a_real_graph_tool_result_reads_with_its_counters_preview_page_and_verbatim_text", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-graph-tool-result-of-the-stream-front-door.json")),
  ]);

  const summary = answerOf(await server.client().describeStreamGraph("front-door", "http://127.0.0.1:4446"));

  expect(summary.nodes.map((node) => [node.name, node.type, node.state])).toEqual([
    ["testpatternsource", "tatolab.stream:TestPatternSource", "Running"],
    ["halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "Running"],
    ["brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "Running"],
    ["h264encoder", "tatolab.stream:H264Encoder", "Running"],
  ]);
  expect(summary.nodes.map((node) => [node.name, node.input_ports, node.output_ports])).toEqual([
    ["testpatternsource", [], [{ name: "video", catalog_section: "binary" }]],
    ["halftonelenseffect", [{ name: "video_from_upstream", catalog_section: null }], [{ name: "video_to_downstream", catalog_section: null }]],
    ["brightnessmeter", [{ name: "video_from_upstream", catalog_section: null }], []],
    ["h264encoder", [{ name: "video", catalog_section: null }], [{ name: "encoded_video", catalog_section: "video" }]],
  ]);
  expect(summary.nodes[1]?.dropped_bags_by_link).toEqual({ Lt12wev5nhhd2ankv0rrz1w3v: 0 });
  expect(summary.nodes[3]?.refused_bags_by_output_port).toEqual({ encoded_video: 0 });
  expect(summary.links.map((link) => link.id)).toContain("Lt12wev5nhhd2ankv0rrz1w3v");
  expect(summary.exposed).toEqual([
    {
      node: "h264encoder",
      port: "encoded_video",
      level: "public",
      watch_page_url: "http://127.0.0.1:4446/watch/jonathanf-macbook/front-door/h264encoder/encoded_video",
    },
  ]);
  expect(JSON.parse(summary.graph_document_text).stream).toBe("front-door");
});

test("a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json")),
  ]);

  expect(failureOf(await server.client().describeStreamGraph("front-door", "http://127.0.0.1:4446")).failureDescription).toBe(
    "graph failed: Resource not found: no stream named `front-door` is loaded in this runtime. Loaded: none",
  );
});

test("a_stream_action_queues_the_runtimes_tool_of_the_same_name_with_the_stream_and_answers_the_action_it_queued", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-answer-for-the-running-stream-pattern-main.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-answer-for-the-stopped-stream-pattern-main.json")),
  ]);

  expect(answerOf(await server.client().runStreamAction("stop_stream", "pattern-main-d76f70"))).toBe("Rnd53mwtsrixjyxk7h3jfq5j5-3");
  expect(answerOf(await server.client().runStreamAction("start_stream", "pattern-main-d76f70"))).toBe("Rnd53mwtsrixjyxk7h3jfq5j5-5");
  expect(toolCallsReceivedBy(server)).toEqual([
    ["stop_stream", { stream: "pattern-main-d76f70" }],
    ["start_stream", { stream: "pattern-main-d76f70" }],
  ]);
});

test("a_stream_action_the_runtime_refuses_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-refusal-for-the-stopped-stream-pattern-main.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-refusal-for-the-running-stream-pattern-main.json")),
  ]);

  expect(failureOf(await server.client().runStreamAction("stop_stream", "pattern-main-d76f70"))).toEqual({
    failureDescription: "Runtime error: the stream `pattern-main-d76f70` is already stopped; `start` loads it again",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().runStreamAction("start_stream", "pattern-main-d76f70")).failureDescription).toBe(
    "Runtime error: the stream `pattern-main-d76f70` is already loaded in this runtime, recorded by the runtime; only a stopped or failed stream starts",
  );
});

test("a_stream_action_answers_within_the_ordinary_request_timeout_or_reads_as_not_answering", async () => {
  const server = await FakeLocalApiServer.answering(
    [httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-answer-for-the-running-stream-pattern-main.json"))],
    300,
  );
  cleanUps.push(() => server.close());
  const clientWithAShortRequestTimeout = new LocalApiClient(server.localApiSocketPath, 100, "0.45.0");

  expect(failureOf(await clientWithAShortRequestTimeout.runStreamAction("stop_stream", "pattern-main-d76f70"))).toEqual({
    failureDescription: `POST /mcp to ${server.localApiSocketPath} did not answer within 100ms`,
    isTheRuntimesRefusal: false,
  });
});

test("a_stream_action_answer_naming_no_action_is_refused_naming_it", () => {
  expect(failureOf(queuedStreamActionFromTheToolResult("stop_stream", '{"stream":"pattern-main-d76f70"}'))).toBe(
    "the runtime's stop_stream result could not be read: missing field `action`",
  );
});

test("removing_a_project_queues_remove_project_with_its_folder_and_a_project_the_runtime_holds_no_stream_of_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json")),
  ]);

  expect(answerOf(await server.client().removeProject("/tmp/tatolab-proof-projects/doorways"))).toBe("Rnd53mwtsrixjyxk7h3jfq5j5-8");
  expect(failureOf(await server.client().removeProject("/tmp/tatolab-proof-projects/doorways")).failureDescription).toBe(
    "Resource not found: this runtime holds no stream of the project in /tmp/tatolab-proof-projects/doorways, so there is none to remove. Loaded: pattern-main-d76f70. Recorded: pattern-main-d76f70",
  );
  expect(toolCallsReceivedBy(server)).toEqual([
    ["remove_project", { project_directory: "/tmp/tatolab-proof-projects/doorways" }],
    ["remove_project", { project_directory: "/tmp/tatolab-proof-projects/doorways" }],
  ]);
});

test("renaming_a_stream_calls_rename_stream_with_its_id_and_the_display_name_and_a_refusal_is_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-rename-stream-answer-for-the-stream-heat-map-main-8eda1f-renamed-heat-map.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-rename-stream-refusal-for-a-display-name-that-shows-nothing.json")),
  ]);

  expect(answerOf(await server.client().renameStream("heat-map-main-8eda1f", "Heat map"))).toBeUndefined();
  expect(failureOf(await server.client().renameStream("heat-map-main-8eda1f", "   "))).toEqual({
    failureDescription: `Invalid configuration: "   " cannot be a stream's display name: it shows nothing; a display name is any text with something to show`,
    isTheRuntimesRefusal: true,
  });
  expect(server.receivedRequests().map((request) => [/Mcp-Name: (\S+)/.exec(headAndBodyOf(request)[0])?.[1], JSON.parse(headAndBodyOf(request)[1]).params.arguments])).toEqual([
    ["rename_stream", { stream: "heat-map-main-8eda1f", display_name: "Heat map" }],
    ["rename_stream", { stream: "heat-map-main-8eda1f", display_name: "   " }],
  ]);
});

test("a_rename_stream_answer_missing_its_display_name_is_refused_naming_it", () => {
  expect(failureOf(streamRenameAnswerFromTheRenameStreamToolResult('{"stream":"heat-map-main-8eda1f"}'))).toBe(
    "the runtime's rename_stream result could not be read: missing field `display_name`",
  );
});

test("running_a_project_calls_run_stream_without_keep_and_reads_its_id_display_name_location_and_compile_warnings", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-answer-for-the-new-project-hello.json")),
    httpResponse(
      "200 OK",
      "application/json",
      await recordedResponseBody("local-api-run-stream-answer-for-the-project-warned-whose-stream-py-writes-a-line-to-stderr.json"),
    ),
  ]);

  expect(answerOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/hello", streamFunction: null, displayName: null }))).toEqual({
    stream: "hello-main-8d60ef",
    display_name: "main",
    stream_instance: "1",
    location: { project_directory: "/private/tmp/tatolab-proof/projects/hello", stream_function: "stream:main" },
    node_count: 4,
    replaced_a_recorded_stream: false,
    compile_warnings: [],
  });
  expect(
    answerOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/warned", streamFunction: "stream.py:main", displayName: null }))
      .compile_warnings,
  ).toEqual(["this project's stream.py writes this line to its standard error"]);

  const toolArguments = server.receivedRequests().map((request) => JSON.parse(headAndBodyOf(request)[1]).params.arguments);
  expect(toolArguments).toEqual([
    { project_directory: "/tmp/tatolab-proof/projects/hello" },
    { project_directory: "/tmp/tatolab-proof/projects/warned", stream_function: "stream.py:main" },
  ]);
});

test("running_a_recorded_project_again_under_a_display_name_replaces_its_stream_under_the_same_id", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-answer-for-the-recorded-project-hello-run-again-as-hello.json")),
  ]);

  expect(answerOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/hello", streamFunction: null, displayName: "hello" }))).toMatchObject({
    stream: "hello-main-8d60ef",
    display_name: "hello",
    replaced_a_recorded_stream: true,
  });
  expect(JSON.parse(headAndBodyOf(server.receivedRequests()[0] ?? "")[1]).params.arguments).toEqual({ project_directory: "/tmp/tatolab-proof/projects/hello", name: "hello" });
});

test("a_run_the_runtime_refuses_is_its_own_refusal_and_one_that_never_answers_is_not", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-refusal-for-the-project-no-venv-without-its-venv.json")),
  ]);
  const runOfNoVenv = { projectDirectory: "/tmp/tatolab-proof/projects/no-venv", streamFunction: null, displayName: null };

  expect(failureOf(await server.client().runStream(runOfNoVenv))).toEqual({
    failureDescription: "Invalid configuration: /tmp/tatolab-proof/projects/no-venv has no .venv/bin/python; run `uv sync` in /tmp/tatolab-proof/projects/no-venv",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().runStream(runOfNoVenv)).isTheRuntimesRefusal).toBe(false);
});

test("a_compile_the_runtime_refuses_carries_its_traceback_as_its_own_refusal", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse(
      "200 OK",
      "application/json",
      await recordedResponseBody("local-api-run-stream-refusal-for-the-recorded-project-hello-whose-stream-py-no-longer-compiles.json"),
    ),
  ]);

  const refusal = failureOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/hello", streamFunction: null, displayName: null }));
  expect(refusal.isTheRuntimesRefusal).toBe(true);
  expect(refusal.failureDescription).toMatch(/^Runtime error: the stream function in \/tmp\/tatolab-proof\/projects\/hello failed to compile: /);
  expect(refusal.failureDescription).toContain("SyntaxError: invalid syntax");
});

test("a_run_stream_answer_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(streamRunAnswerFromTheRunStreamToolResult('{"stream":"hello-main-8d60ef","display_name":"main","stream_instance":"1"}'))).toBe(
    "the runtime's run_stream result could not be read: missing field `location`",
  );
});

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_description_its_streams_their_graphs_and_logs_its_machine_name_and_its_relays", async () => {
  const client = new LocalApiClient(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000, "0.45.0");

  answerOf(await client.checkHealth());
  const runtimeDescription = answerOf(await client.describeRuntime());
  expect(runtimeDescription.build_id.startsWith(`${runtimeDescription.version}+`)).toBe(true);
  expect(runtimeDescription.up_for_ms).toBeGreaterThan(0);
  const streams = answerOf(await client.listStreams());
  expect(answerOf(await client.machineName())).not.toBe("");
  for (const loadedStream of streams.filter((listedStream) => listedStream.node_count !== null)) {
    const graph = answerOf(await client.describeStreamGraph(loadedStream.stream, "http://127.0.0.1:4446"));
    expect(graph.stream).toBe(loadedStream.stream);
    expect(graph.graph_document_text.startsWith("{\n")).toBe(true);
  }
  for (const projectDirectory of new Set(streams.flatMap((listedStream) => (listedStream.location === null ? [] : [listedStream.location.project_directory])))) {
    const projectStreams = streams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
    const wholeLog = answerOf(await client.readProjectLogRecords(projectDirectory, { stream: null, action: null }, null, 500));
    expect(wholeLog.project_directory).toBe(projectDirectory);
    expect(wholeLog.records.length).toBeGreaterThan(0);
    for (const projectStream of projectStreams) {
      const streamLog = answerOf(await client.readProjectLogRecords(projectDirectory, { stream: projectStream.stream, action: null }, null, 500));
      expect(streamLog.records.every((record) => record.stream === projectStream.stream)).toBe(true);
    }
  }

  const expectedStreamCount = process.env["TATOLAB_APP_LIVE_EXPECTED_STREAM_COUNT"];
  if (expectedStreamCount !== undefined) expect(streams.length).toBe(Number(expectedStreamCount));

  const relaysDescription = answerOf(await client.describeRelays());
  expect(relaysDescription.relays.filter((relay) => relay.built_in).map((relay) => relay.relay_id)).toEqual(["local-loopback", "local-every-interface"]);
  expect(relaysDescription.adapters.map((adapter) => adapter.kind)).toEqual(expect.arrayContaining(["local", "cloudflare", "moqpro"]));
  for (const adapter of relaysDescription.adapters) {
    expect(adapter.display_name).not.toBeNull();
    expect(adapter.display_icon_data_uri?.startsWith("data:image/")).toBe(true);
  }
  expect(failureOf(await client.removeRelay("local-loopback"))).toEqual({
    failureDescription: "the relay `local-loopback` is built in and is never removed",
    isTheRuntimesRefusal: true,
  });
});

/** The tool name and arguments of each MCP request `server` read, in order. */
function toolCallsReceivedBy(server: FakeLocalApiServer): [string | undefined, unknown][] {
  return server.receivedRequests().map((request) => {
    const [head, body] = headAndBodyOf(request);
    const toolName = /Mcp-Name: (\S+)/.exec(head)?.[1];
    const requestBody: { params: { name: string; arguments: unknown } } = JSON.parse(body);
    expect(requestBody.params.name).toBe(toolName);
    return [toolName, requestBody.params.arguments];
  });
}

test("describing_the_relays_reads_the_adapter_catalog_then_list_relays", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-relay-adapters-answer-of-a-test-root-runtime.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-relays-tool-result-of-a-test-root-runtime-at-start.json")),
  ]);

  const relaysDescription = answerOf(await server.client().describeRelays());

  expect(relaysDescription.adapters.map((adapter) => adapter.kind)).toEqual(["local", "cloudflare", "moqpro", "test-secret-holder"]);
  expect(relaysDescription.relays.map((relay) => [relay.relay_id, relay.settings])).toEqual([
    ["local-loopback", { port: 14443 }],
    ["local-every-interface", { port: 14445 }],
  ]);
  const [catalogRequest, listRequest] = server.receivedRequests();
  expect(catalogRequest?.startsWith("GET /api/relay-adapters HTTP/1.1\r\n"), catalogRequest).toBe(true);
  expect(listRequest).toContain("Mcp-Name: list_relays");
});

test("a_relay_catalog_the_runtime_refuses_carries_its_own_words_and_lists_nothing", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("404 Not Found", "application/json", '{"error":"no route /api/relay-adapters"}')]);

  expect(failureOf(await server.client().describeRelays()).failureDescription).toBe("no route /api/relay-adapters");
  expect(server.receivedRequests()).toHaveLength(1);
});

test("adding_configuring_and_removing_a_relay_call_the_runtimes_tools_of_those_names", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-relay-answer-for-a-test-secret-holder.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-configure-relay-answer-for-local-every-interface-on-port-14447.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-relay-answer-for-cloudflare-1.json")),
  ]);

  expect(answerOf(await server.client().addRelay("test-secret-holder", { token: "typed-in-the-test", label: "desk" }))).toBe("test-secret-holder-1");
  answerOf(await server.client().configureRelay("local-every-interface", { port: 14447 }));
  answerOf(await server.client().removeRelay("cloudflare-1"));

  expect(toolCallsReceivedBy(server)).toEqual([
    ["add_relay", { adapter: "test-secret-holder", settings: { token: "typed-in-the-test", label: "desk" } }],
    ["configure_relay", { relay_id: "local-every-interface", settings: { port: 14447 } }],
    ["remove_relay", { relay_id: "cloudflare-1" }],
  ]);
});

test("a_relay_change_the_runtime_refuses_is_its_own_refusal_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-relay-refusal-for-the-built-in-local-adapter.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-relay-refusal-for-a-moqpro-project-id-holding-a-slash.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-configure-relay-refusal-for-the-unknown-setting-bind.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-relay-refusal-for-the-built-in-local-every-interface.json")),
  ]);

  expect(failureOf(await server.client().addRelay("local", {}))).toEqual({
    failureDescription:
      "no `local` relay is added: the local relay is built in: its listeners `local-loopback` and `local-every-interface` are on every machine, and where a listener binds is never a setting",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().addRelay("moqpro", { project_id: "desk/a", signing_key: "typed-in-the-test" })).failureDescription).toBe(
    "the settings of the relay `moqpro-1` are refused: `project_id` `desk/a` is not a moq.pro project id: one path segment, non-empty, with no `/`",
  );
  expect(failureOf(await server.client().configureRelay("local-loopback", { bind: "0.0.0.0" })).failureDescription).toBe(
    "the settings of the relay `local-loopback` are refused: unknown field `bind`, expected `port`",
  );
  expect(failureOf(await server.client().removeRelay("local-every-interface")).failureDescription).toBe(
    "the relay `local-every-interface` is built in and is never removed",
  );
});

test("a_relay_change_that_never_answers_names_the_tool_and_never_the_settings_it_carried", async () => {
  const server = await fakeLocalApiServerAnswering([]);

  const failure = failureOf(await server.client().addRelay("cloudflare", { relay_url: "https://relay.example/typed-in-the-test" }));

  expect(failure.isTheRuntimesRefusal).toBe(false);
  expect(failure.failureDescription).toContain("POST /mcp");
  expect(failure.failureDescription).not.toContain("typed-in-the-test");
});

test("a_request_carries_a_content_length_exactly_when_it_carries_a_body", () => {
  expect(httpRequestBytes("POST", "/mcp", [], null).toString("utf8")).toBe("POST /mcp HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
  expect(httpRequestBytes("GET", "/health", [], Buffer.alloc(0)).toString("utf8")).toBe(
    "GET /health HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  );
});

test("a_truncated_body_is_malformed", () => {
  expect(failureOf(parseHttpResponse(Buffer.from("HTTP/1.1 200 OK\r\ncontent-length: 10\r\n\r\nok")))).toContain("2 of its 10 bytes");
  expect(parseHttpResponse(Buffer.from("HTTP/1.1 200 OK\r\n")).ok).toBe(false);
});
