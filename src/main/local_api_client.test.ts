import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  httpRequestBytes,
  listedStreamsFromTheListStreamsToolResult,
  LocalApiClient,
  parseHttpResponse,
  runtimeDescriptionFromTheDescribeRuntimeToolResult,
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

function listedStream(name: string, state: string, projectDirectory: string, nodeCount: number | null, failedBecause: string | null): ListedStream {
  return { name, state, project_directory: projectDirectory, node_count: nodeCount, failed_because: failedBecause };
}

/** The text block a real runtime answered `list_streams` with, holding one kept stream. */
const A_REAL_LIST_STREAMS_TOOL_RESULT =
  '{\n  "streams": [\n    {\n      "name": "main",\n      "state": "kept",\n      "project_directory": "/private/tmp/tatolab-proof-projects/pattern",\n      "node_count": 4,\n      "failed_because": null\n    }\n  ]\n}';

test("a_real_list_streams_result_lists_its_streams", () => {
  expect(answerOf(listedStreamsFromTheListStreamsToolResult(A_REAL_LIST_STREAMS_TOOL_RESULT))).toEqual([
    listedStream("main", "kept", "/private/tmp/tatolab-proof-projects/pattern", 4, null),
  ]);
});

test("a_stream_in_a_state_or_with_fields_this_app_does_not_know_is_still_listed", () => {
  const toolResult = {
    streams: [
      { name: "from-a-newer-runtime", state: "migrating", project_directory: "/Users/me/newer", node_count: 1, failed_because: null, a_field_from_later: true },
      { name: "without-a-project", state: "attached" },
    ],
    a_top_level_field_from_later: [1, 2],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toEqual([
    listedStream("from-a-newer-runtime", "migrating", "/Users/me/newer", 1, null),
    listedStream("without-a-project", "attached", "", null, null),
  ]);
});

test("a_list_streams_result_naming_no_stream_name_is_refused", () => {
  expect(failureOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify({ streams: [{ state: "kept" }] })))).toContain("list_streams");
});

test("listing_streams_lists_every_stream_whatever_its_state", async () => {
  const server = await fakeLocalApiServerAnswering([
    toolResultResponse({
      streams: [
        { name: "camera-preview", state: "attached", project_directory: "/Users/me/camera", node_count: 3, failed_because: null },
        { name: "encoder", state: "kept", project_directory: "/Users/me/encoder", node_count: null, failed_because: null },
        { name: "paused", state: "stopped", project_directory: "/Users/me/paused", node_count: null, failed_because: null },
        {
          name: "crashy",
          state: "failed",
          project_directory: "/Users/me/crashy",
          node_count: null,
          failed_because: "implicated in the runtime's last two crashes in a row",
        },
      ],
    }),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    listedStream("camera-preview", "attached", "/Users/me/camera", 3, null),
    listedStream("encoder", "kept", "/Users/me/encoder", null, null),
    listedStream("paused", "stopped", "/Users/me/paused", null, null),
    listedStream("crashy", "failed", "/Users/me/crashy", null, "implicated in the runtime's last two crashes in a row"),
  ]);
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

test("reading_log_records_asks_the_logs_tool_for_the_page_after_a_sequence_number", async () => {
  const server = await fakeLocalApiServerAnswering([
    toolResultResponse({
      stream: "main",
      stream_instance: "4",
      records: [{ sequence: 8, record: { level: "info", message: "hello" } }],
      next_after: 8,
      records_no_longer_held: 0,
    }),
  ]);

  const page = answerOf(await server.client().readStreamLogRecords("main", 7, 500));

  expect(page.stream_instance).toBe("4");
  expect(page.next_after).toBe(8);
  expect(page.records[0]?.message).toBe("hello");
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: logs");
  expect(JSON.parse(body)).toMatchObject({ params: { name: "logs", arguments: { stream: "main", after: 7, count: 500 } } });
});

test("a_log_read_the_runtime_refuses_carries_its_own_words", async () => {
  const refusal = "logs failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const body = { jsonrpc: "2.0", id: 1, result: { resultType: "complete", content: [{ type: "text", text: refusal }], isError: true } };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(body))]);

  expect(failureOf(await server.client().readStreamLogRecords("nope", 0, 500)).failureDescription).toBe(refusal);
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

test("a_stream_action_calls_the_runtimes_tool_of_the_same_name_with_the_stream", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-answer-for-the-kept-stream-test-pattern.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-answer-for-the-stopped-stream-test-pattern.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-stream-answer-for-the-kept-stream-lobby-recorder.json")),
  ]);

  expect(answerOf(await server.client().runStreamAction("stop_stream", "test-pattern"))).toBeNull();
  expect(answerOf(await server.client().runStreamAction("start_stream", "test-pattern"))).toBeNull();
  expect(answerOf(await server.client().runStreamAction("remove_stream", "lobby-recorder"))).toBeNull();

  const toolCalls = server.receivedRequests().map((request) => {
    const [head, body] = headAndBodyOf(request);
    const toolName = /Mcp-Name: (\S+)/.exec(head)?.[1];
    expect(JSON.parse(body)).toMatchObject({ params: { name: toolName } });
    return [toolName, JSON.parse(body).params.arguments];
  });
  expect(toolCalls).toEqual([
    ["stop_stream", { stream: "test-pattern" }],
    ["start_stream", { stream: "test-pattern" }],
    ["remove_stream", { stream: "lobby-recorder" }],
  ]);
});

test("a_stop_the_runtime_could_not_record_answers_its_reason", async () => {
  const notRecordedBecause = "the kept record of `camera` could not be written: Permission denied (os error 13)";
  const server = await fakeLocalApiServerAnswering([
    toolResultResponse({ stream: "camera", stopped: true, kept: true, not_recorded_because: notRecordedBecause }),
  ]);

  expect(answerOf(await server.client().runStreamAction("stop_stream", "camera"))).toBe(notRecordedBecause);
});

test("a_stream_action_the_runtime_refuses_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-refusal-for-the-stopped-stream-test-pattern.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-refusal-for-the-failed-stream-lobby-recorder.json")),
  ]);

  expect(failureOf(await server.client().runStreamAction("stop_stream", "test-pattern")).failureDescription).toBe(
    "Runtime error: the kept stream `test-pattern` is already stopped; `start` loads it again",
  );
  expect(failureOf(await server.client().runStreamAction("start_stream", "lobby-recorder")).failureDescription).toMatch(
    /^Invalid configuration: the kept stream `lobby-recorder` was not loaded: its interpreter .* is gone; run `uv sync` in /,
  );
});

test("a_stream_action_waits_past_the_polling_limit_for_the_runtime_to_finish_it", async () => {
  const server = await FakeLocalApiServer.answering(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-answer-for-the-stopped-stream-test-pattern.json")),
    ],
    300,
  );
  cleanUps.push(() => server.close());
  const clientWithAShortPollingLimit = new LocalApiClient(server.localApiSocketPath, 100, "0.45.0");

  expect(failureOf(await clientWithAShortPollingLimit.checkHealth()).failureDescription).toMatch(/did not answer within 100ms$/);
  expect(answerOf(await clientWithAShortPollingLimit.runStreamAction("start_stream", "test-pattern"))).toBeNull();
});

test("running_a_project_calls_run_stream_kept_and_reads_its_answer_and_compile_warnings", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-answer-for-the-new-project-hello.json")),
    httpResponse(
      "200 OK",
      "application/json",
      await recordedResponseBody("local-api-run-stream-answer-for-the-project-warned-whose-stream-py-writes-a-line-to-stderr.json"),
    ),
  ]);

  expect(answerOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/hello", streamFunction: null, streamName: "hello" }))).toEqual({
    stream: "hello",
    stream_instance: "1",
    kept: true,
    project_directory: "/private/tmp/tatolab-proof/projects/hello",
    node_count: 4,
    replaced_the_kept_record: false,
    compile_warnings: [],
  });
  expect(
    answerOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/warned", streamFunction: "stream.py:main", streamName: null }))
      .compile_warnings,
  ).toEqual(["this project's stream.py writes this line to its standard error"]);

  const toolArguments = server.receivedRequests().map((request) => JSON.parse(headAndBodyOf(request)[1]).params.arguments);
  expect(toolArguments).toEqual([
    { project_directory: "/tmp/tatolab-proof/projects/hello", name: "hello", keep: true },
    { project_directory: "/tmp/tatolab-proof/projects/warned", stream_function: "stream.py:main", keep: true },
  ]);
});

test("a_run_the_runtime_refuses_is_its_own_refusal_and_one_that_never_answers_is_not", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-refusal-for-the-name-hello-a-kept-stream-holds.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-refusal-for-the-project-no-venv-without-its-venv.json")),
  ]);
  const runOfHelloAgain = { projectDirectory: "/tmp/tatolab-proof/projects/hello-again", streamFunction: null, streamName: "hello" };

  expect(failureOf(await server.client().runStream(runOfHelloAgain))).toEqual({
    failureDescription:
      "Stream graph error: the stream name `hello` is held by a kept stream from /private/tmp/tatolab-proof/projects/hello; load this one under another name with `--name`",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/no-venv", streamFunction: null, streamName: "no-venv" }))).toEqual({
    failureDescription: "Invalid configuration: /tmp/tatolab-proof/projects/no-venv has no .venv/bin/python; run `uv sync` in /tmp/tatolab-proof/projects/no-venv",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().runStream(runOfHelloAgain)).isTheRuntimesRefusal).toBe(false);
});

test("a_compile_the_runtime_refuses_carries_its_traceback_as_its_own_refusal", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse(
      "200 OK",
      "application/json",
      await recordedResponseBody("local-api-run-stream-refusal-for-the-kept-project-hello-whose-stream-py-no-longer-compiles.json"),
    ),
  ]);

  const refusal = failureOf(await server.client().runStream({ projectDirectory: "/tmp/tatolab-proof/projects/hello", streamFunction: null, streamName: "hello" }));
  expect(refusal.isTheRuntimesRefusal).toBe(true);
  expect(refusal.failureDescription).toMatch(/^Runtime error: the stream function in \/tmp\/tatolab-proof\/projects\/hello failed to compile: /);
  expect(refusal.failureDescription).toContain("SyntaxError: invalid syntax");
});

test("a_run_stream_answer_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(streamRunAnswerFromTheRunStreamToolResult('{"stream":"hello","stream_instance":"1","kept":"yes"}'))).toBe(
    "the runtime's run_stream result could not be read: `kept` is not true or false",
  );
});

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_description_its_streams_their_graphs_and_logs_and_its_machine_name", async () => {
  const client = new LocalApiClient(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000, "0.45.0");

  answerOf(await client.checkHealth());
  const runtimeDescription = answerOf(await client.describeRuntime());
  expect(runtimeDescription.build_id.startsWith(`${runtimeDescription.version}+`)).toBe(true);
  expect(runtimeDescription.up_for_ms).toBeGreaterThan(0);
  const streams = answerOf(await client.listStreams());
  expect(answerOf(await client.machineName())).not.toBe("");
  for (const loadedStream of streams.filter((listedStream) => listedStream.node_count !== null)) {
    const graph = answerOf(await client.describeStreamGraph(loadedStream.name, "http://127.0.0.1:4446"));
    expect(graph.stream).toBe(loadedStream.name);
    expect(graph.graph_document_text.startsWith("{\n")).toBe(true);
    expect(answerOf(await client.readStreamLogRecords(loadedStream.name, 0, 500)).stream).toBe(loadedStream.name);
  }

  const expectedStreamCount = process.env["TATOLAB_APP_LIVE_EXPECTED_STREAM_COUNT"];
  if (expectedStreamCount !== undefined) expect(streams.length).toBe(Number(expectedStreamCount));
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
