// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream } from "../../src/backend/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import { httpRequestBytes, listedStreamsFromTheListStreamsToolResult, LocalApiClient, parseHttpResponse } from "./local_api_client.js";
import type { Result } from "./result.js";

const cleanUps: (() => Promise<void>)[] = [];

/** A JSON-RPC response body recorded from a real runtime's local API. */
const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`../test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

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

test("describing_a_stream_graph_names_the_stream_percent_encoded", async () => {
  const graph = {
    stream: "two words&more",
    nodes: [{ id: "P1", type: "tatolab.stream:TestPatternSource", name: "testpatternsource", components: { state: "Running" } }],
    links: [],
    exposed: [],
    machine: "jonathanf-macbook",
  };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(graph))]);

  const summary = answerOf(await server.client().describeStreamGraph("two words&more"));

  expect(summary.stream).toBe("two words&more");
  expect(summary.nodes[0]?.state).toBe("Running");
  expect(server.receivedRequests()[0]?.startsWith("GET /api/graph?stream=two%20words%26more HTTP/1.1\r\n"), server.receivedRequests()[0]).toBe(true);
});

test("a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("404 Not Found", "application/json", '{"error":"Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main"}'),
  ]);

  expect(failureOf(await server.client().describeStreamGraph("nope")).failureDescription).toBe(
    "Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main",
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

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src-electron/src/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_streams_their_graphs_and_logs_and_its_machine_name", async () => {
  const client = new LocalApiClient(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000, "0.45.0");

  answerOf(await client.checkHealth());
  const streams = answerOf(await client.listStreams());
  expect(answerOf(await client.machineName())).not.toBe("");
  for (const loadedStream of streams.filter((listedStream) => listedStream.node_count !== null)) {
    expect(answerOf(await client.describeStreamGraph(loadedStream.name)).stream).toBe(loadedStream.name);
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
