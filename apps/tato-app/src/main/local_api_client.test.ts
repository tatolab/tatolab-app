import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, StreamActionDescription, StreamActionFollowed, StreamLocation } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  httpRequestBytes,
  listedStreamsFromTheListStreamsToolResult,
  LocalApiClient,
  parseHttpResponse,
  runtimeDescriptionFromTheDescribeRuntimeToolResult,
  queuedStreamActionFromTheToolResult,
  streamRenameAnswerFromTheRenameStreamToolResult,
} from "./local_api_client.js";
import type { Result } from "./result.js";
import {
  projectCreationQueuedFromTheCreateProjectToolResult,
  streamActionCancelAnswerFromTheCancelStreamActionToolResult,
  streamActionDescriptionFromTheDescribeStreamActionToolResult,
} from "./stream_action_description.js";

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
    capture_devices_whose_access_was_never_asked_for: [],
    action: actionUnderWay?.action ?? null,
    step: actionUnderWay?.step ?? null,
  };
}

const A_PROJECT = "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55";
const A_STREAM_ASSET = "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68";

function locationOf(projectDirectory: string, project = A_PROJECT, streamAsset = A_STREAM_ASSET): StreamLocation {
  return { project_directory: projectDirectory, project, stream_asset: streamAsset };
}

const BACK_DOOR_IMPORT_FAILURE =
  "cannot describe `nodes.back_door_lock:BackDoorLock`: the stream's interpreter `/home/jonathan-fontanez/scratch/app176/projects/doorways/.venv/bin/python` refused it: its module `nodes.back_door_lock` did not import:\nTraceback (most recent call last):\n  File \"/home/jonathan-fontanez/scratch/app176/tatolab-app/build/streamlib/target/tatolab-runtime/lib/tatolab/lend/tatolab/runtime/_processor_interpreter_bootstrap.py\", line 899, in describe_one_processor_class\n    importlib.import_module(module_name)\n  File \"/home/jonathan-fontanez/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/lib/python3.12/importlib/__init__.py\", line 90, in import_module\n    return _bootstrap._gcd_import(name[level:], package, level)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"<frozen importlib._bootstrap>\", line 1387, in _gcd_import\n  File \"<frozen importlib._bootstrap>\", line 1360, in _find_and_load\n  File \"<frozen importlib._bootstrap>\", line 1331, in _find_and_load_unlocked\n  File \"<frozen importlib._bootstrap>\", line 935, in _load_unlocked\n  File \"<frozen importlib._bootstrap_external>\", line 999, in exec_module\n  File \"<frozen importlib._bootstrap>\", line 488, in _call_with_frames_removed\n  File \"/home/jonathan-fontanez/scratch/app176/projects/doorways/nodes/back_door_lock.py\", line 11, in <module>\n    BACK_DOOR_KEY = BACK_DOOR_KEY_FILE.read_bytes()\n                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/jonathan-fontanez/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/lib/python3.12/pathlib.py\", line 1019, in read_bytes\n    with self.open(mode='rb') as f:\n         ^^^^^^^^^^^^^^^^^^^^\n  File \"/home/jonathan-fontanez/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/lib/python3.12/pathlib.py\", line 1013, in open\n    return io.open(self, mode, buffering, encoding, errors, newline)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nFileNotFoundError: [Errno 2] No such file or directory: '/home/jonathan-fontanez/scratch/app176/projects/doorways/keys/back_door.key'";

const RECORDED_DOORWAYS = "/home/jonathan-fontanez/scratch/app176/projects/doorways";
const RECORDED_DOORWAYS_PROJECT = "4be1ae19-0c7f-4cff-a959-d596c611e05b";
const RECORDED_BACK_DOOR = listedStream(
  "doorways-back_door-a38bd7",
  "back_door",
  locationOf(RECORDED_DOORWAYS, RECORDED_DOORWAYS_PROJECT, "b0da5496-c9c2-486d-9d17-f5cdc63cb534"),
  "failed",
  null,
  BACK_DOOR_IMPORT_FAILURE,
);
const RECORDED_FRONT_DOOR = listedStream("doorways-front_door-1cd149", "front_door", locationOf(RECORDED_DOORWAYS, RECORDED_DOORWAYS_PROJECT, "04eda0c2-bea3-4534-abe2-6e120edb7267"), "running", 3, null);
const RECORDED_PATTERN_LOCATION = locationOf("/home/jonathan-fontanez/scratch/app176/projects/pattern", "b1f6f250-de7d-4446-aa1c-492451d9e6bd", "7194d1f9-721a-41e5-9cc9-7db50336a1ed");

test("a_real_list_streams_result_lists_a_running_a_stopped_and_a_failed_stream_by_id_display_name_and_location", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "stopped", null, null),
  ]);
});

test("a_real_listing_after_the_runtime_restarted_lists_every_stream_it_re_loaded_running_and_the_rest_as_recorded", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-after-the-runtime-restarted.json")),
  ]);

  const listedStreams = answerOf(await server.client().listStreams());
  expect(listedStreams.map((listed) => [listed.stream, listed.state, listed.node_count])).toEqual([
    ["doorways-back_door-a38bd7", "failed", null],
    ["doorways-front_door-1cd149", "running", 3],
    ["pattern-main-9960f6", "stopped", null],
  ]);
});

test("a_real_listing_names_the_action_and_step_of_a_stream_preparing_or_stopping", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-preparing-on-its-starting-step.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-stopping.json")),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "preparing", null, null, { action: "Ruvjtaprxhhworo0axqwt6ffb-2", step: "starting" }),
  ]);
  expect(answerOf(await server.client().listStreams())).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "stopping", 3, null, { action: "Ruvjtaprxhhworo0axqwt6ffb-3", step: "stopping" }),
  ]);
});

test("a_stream_waiting_in_its_projects_queue_is_listed_with_its_action_and_no_step", () => {
  const toolResult = {
    streams: [
      {
        stream: "pattern-main-d76f70",
        display_name: "main",
        location: { project_directory: "/tmp/p", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
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
        location: { project_directory: "/Users/me/newer", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68", a_field_from_later: 1 },
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

test("a_stream_waiting_for_capture_device_access_lists_each_device_as_spelled", () => {
  const toolResult = {
    streams: [
      {
        stream: "camera-main-018da9",
        display_name: "camera",
        location: { project_directory: "/Users/me/camera", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
        state: "running",
        node_count: 4,
        failed_because: null,
        capture_devices_whose_access_was_never_asked_for: ["camera", "a_device_from_later"],
        action: null,
        step: null,
      },
    ],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toEqual([
    { ...listedStream("camera-main-018da9", "camera", locationOf("/Users/me/camera"), "running", 4, null), capture_devices_whose_access_was_never_asked_for: ["camera", "a_device_from_later"] },
  ]);
  expect(
    failureOf(
      listedStreamsFromTheListStreamsToolResult(
        JSON.stringify({ streams: [{ ...toolResult.streams[0], capture_devices_whose_access_was_never_asked_for: [1] }] }),
      ),
    ),
  ).toBe("the runtime's list_streams result could not be read: `capture_devices_whose_access_was_never_asked_for` holds a value that is not a string");
});

test("a_location_naming_no_stream_asset_is_refused_naming_the_missing_field", () => {
  const toolResult = {
    streams: [{ stream: "pattern-main-d76f70", display_name: "main", location: { project_directory: "/tmp/p", stream_function: "stream:main" }, state: "running", node_count: 4, failed_because: null }],
  };

  expect(failureOf(listedStreamsFromTheListStreamsToolResult(JSON.stringify(toolResult)))).toBe("the runtime's list_streams result could not be read: missing field `project`");
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

  const summary = answerOf(await server.client().describeStreamGraph("main"));

  expect(summary.stream).toBe("main");
  expect(summary.graph_document_text).toBe(graphText);
  expect(summary.graph_document_text).toContain('"config_checksum": 15071898633716066277');
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: graph\r\n");
  expect(JSON.parse(body).params.arguments).toEqual({ stream: "main" });
});

test("a_real_graph_tool_result_reads_with_its_counters_and_verbatim_text", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-graph-tool-result-of-the-stream-front-door.json")),
  ]);

  const summary = answerOf(await server.client().describeStreamGraph("front-door"));

  expect(summary.nodes.map((node) => [node.name, node.type, node.state])).toEqual([
    ["testpatternsource", "tatolab.stream:TestPatternSource", "Running"],
    ["halftonelenseffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "Running"],
    ["brightnessmeter", "nodes.brightness_meter:BrightnessMeter", "Running"],
    ["h264encoder", "tatolab.stream:H264Encoder", "Running"],
  ]);
  expect(summary.nodes.map((node) => [node.name, node.input_ports, node.output_ports])).toEqual([
    ["testpatternsource", [], [{ name: "video", family: null, stream_facts: null, values_checked: null }]],
    ["halftonelenseffect", [{ name: "video_from_upstream", family: null, stream_facts: null, values_checked: null }], [{ name: "video_to_downstream", family: null, stream_facts: null, values_checked: null }]],
    ["brightnessmeter", [{ name: "video_from_upstream", family: null, stream_facts: null, values_checked: null }], []],
    ["h264encoder", [{ name: "video", family: null, stream_facts: null, values_checked: null }], [{ name: "encoded_video", family: null, stream_facts: null, values_checked: null }]],
  ]);
  expect(summary.nodes[1]?.dropped_bags_by_link).toEqual({ Lt12wev5nhhd2ankv0rrz1w3v: 0 });
  expect(summary.nodes[3]?.refused_bags_by_output_port).toEqual({ encoded_video: 0 });
  expect(summary.links.map((link) => link.id)).toContain("Lt12wev5nhhd2ankv0rrz1w3v");
  expect(JSON.parse(summary.graph_document_text).stream).toBe("front-door");
});

test("a_real_graph_tool_result_reads_each_outputs_stream_facts_and_the_records_unchecked_mark", async () => {
  const stream = "suite-stream-project-1-a_declaring_source_and_a_replacin-98bc63";
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-graph-tool-result-of-a-stream-stating-stream-facts.json")),
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
        },
        { name: "records", family: "records", stream_facts: null, values_checked: false },
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
        },
      ],
    ],
    ["reportsitsupstreamsstreamfacts", [{ name: "encoded_from_upstream", family: "packets", stream_facts: null, values_checked: null }], []],
  ]);
});

test("a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json")),
  ]);

  expect(failureOf(await server.client().describeStreamGraph("front-door")).failureDescription).toBe(
    "graph failed: Resource not found: no stream named `front-door` is loaded in this runtime. Loaded: none",
  );
});

test("stopping_a_project_queues_stop_project_with_its_folder_and_answers_the_action_it_queued", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-project-answer-for-the-project-pattern.json"))]);

  expect(answerOf(await server.client().stopProject("/tmp/tatolab-proof-projects/pattern"))).toBe("Rwvfg6azxy43ggj3zi6l7z4gy-5");
  expect(toolCallsReceivedBy(server)).toEqual([["stop_project", { project_directory: "/tmp/tatolab-proof-projects/pattern" }]]);
});

test("a_stop_of_a_project_none_of_whose_streams_runs_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-project-refusal-for-the-stopped-project-pattern.json"))]);

  expect(failureOf(await server.client().stopProject("/tmp/tatolab-proof-projects/pattern"))).toEqual({
    failureDescription:
      "Runtime error: no stream of the project in /tmp/tatolab-proof-projects/pattern runs, so there is none to stop; `run` runs it. Loaded: none. Recorded: pattern-main-1bd25a (stopped)",
    isTheRuntimesRefusal: true,
  });
});

test("a_stream_action_answers_within_the_ordinary_request_timeout_or_reads_as_not_answering", async () => {
  const server = await FakeLocalApiServer.answering(
    [httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-project-answer-for-the-project-pattern.json"))],
    300,
  );
  cleanUps.push(() => server.close());
  const clientWithAShortRequestTimeout = new LocalApiClient(server.localApiSocketPath, 100, "0.45.0");

  expect(failureOf(await clientWithAShortRequestTimeout.stopProject("/tmp/tatolab-proof-projects/pattern"))).toEqual({
    failureDescription: `POST /mcp to ${server.localApiSocketPath} did not answer within 100ms`,
    isTheRuntimesRefusal: false,
  });
});

test("a_stream_action_answer_naming_no_action_is_refused_naming_it", () => {
  expect(failureOf(queuedStreamActionFromTheToolResult("stop_project", '{"project_directory":"/tmp/tatolab-proof-projects/pattern"}'))).toBe(
    "the runtime's stop_project result could not be read: missing field `action`",
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

test("creating_a_project_calls_create_project_with_its_folder_or_none_and_reads_the_action_the_stream_and_the_folder", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-create-project-answer-for-the-folder-lobby.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-create-project-answer-with-no-folder-drawn-kind-butte.json")),
  ]);

  expect(answerOf(await server.client().createProject("/tmp/tatolab-proof-projects/lobby"))).toEqual({
    action: "Rj12j3eujz3zn0dposliv79k9-2",
    stream: "lobby-main-caa719",
    project_directory: "/tmp/tatolab-proof-projects/lobby",
  });
  expect(answerOf(await server.client().createProject(null))).toEqual({
    action: "Rj12j3eujz3zn0dposliv79k9-7",
    stream: "kind-butte-main-e51c2f",
    project_directory: "/tmp/tatolab-proof/streams/kind-butte",
  });
  expect(toolCallsReceivedBy(server)).toEqual([
    ["create_project", { project_directory: "/tmp/tatolab-proof-projects/lobby" }],
    ["create_project", {}],
  ]);
});

test("running_a_project_calls_run_project_with_its_folder_and_reads_the_action_it_queued", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-project-answer-for-the-folder-hallways.json")),
  ]);

  expect(answerOf(await server.client().runProject("/tmp/tatolab-proof-projects/hallways"))).toEqual({
    action: "Rj12j3eujz3zn0dposliv79k9-3",
    project_directory: "/tmp/tatolab-proof-projects/hallways",
  });
  expect(toolCallsReceivedBy(server)).toEqual([["run_project", { project_directory: "/tmp/tatolab-proof-projects/hallways" }]]);
});

/** The description `describe_stream_action` answered, failing the test when it answered anything else. */
function describedOf(followed: StreamActionFollowed): StreamActionDescription {
  return followed.kind === "described" ? followed.description : expect.unreachable(`the action was not described: ${followed.words}`);
}

test("describing_a_stream_action_reads_its_state_step_and_streams_from_queued_to_done", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-a-run-of-hallways-queued.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-a-create-making-the-venv.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-the-run-of-hallways-done-one-running-one-failed.json")),
  ]);

  expect(answerOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-9"))).toEqual({
    kind: "described",
    description: {
      action: "Rj12j3eujz3zn0dposliv79k9-9",
      project_directory: "/tmp/tatolab-proof-projects/hallways",
      kind: "load",
      state: "queued",
      step: null,
      streams: [],
      failed_because: null,
    },
  });
  expect(describedOf(answerOf(await server.client().describeStreamAction("Riioiuiuj7n1z3ghkm7s9n1xi-6")))).toMatchObject({ state: "in_progress", step: "making_the_venv" });
  expect(describedOf(answerOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-3"))).streams).toEqual([
    { stream: "hallways-front_door-58034f", display_name: "front_door", state: "running" },
    { stream: "hallways-back_door-2416d3", display_name: "back_door", state: "failed" },
  ]);
  expect(toolCallsReceivedBy(server)[0]).toEqual(["describe_stream_action", { action: "Rj12j3eujz3zn0dposliv79k9-9" }]);
});

test("a_failed_action_reads_its_reason_one_the_tool_no_longer_holds_answers_its_words_and_a_json_rpc_error_stays_a_refusal", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-a-create-into-pattern-failed-on-its-files.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-refusal-for-an-action-not-held.json")),
    httpResponse("500 Internal Server Error", "application/json", '{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"the runtime is shutting down"}}'),
  ]);

  const failedCreation = describedOf(answerOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-5")));
  expect(failedCreation).toMatchObject({ state: "failed", streams: [] });
  expect(failedCreation.failed_because).toContain("already has .gitignore");
  expect(answerOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-999"))).toEqual({
    kind: "not_held",
    words:
      "Invalid configuration: the stream action `Rj12j3eujz3zn0dposliv79k9-999` is not held: this runtime never queued it, or it is older than the last 64 finished actions of its project; its records stay in the project's log",
  });
  expect(failureOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-5"))).toEqual({
    failureDescription: "the runtime refused `describe_stream_action` (500): the runtime is shutting down",
    isTheRuntimesRefusal: true,
  });
});

test("a_cancel_answers_cancelled_for_a_queued_action_and_in_progress_for_one_it_stops_at_its_step_the_action_then_read_cancelled", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-queued-run-of-slowpoke-cancelled.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-run-of-slowpoke-making-the-venv-in-progress.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-the-run-of-slowpoke-cancelled-while-making-the-venv.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-queued-stop-of-doorways-front-door-cancelled.json")),
  ]);

  expect(answerOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-10"))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-10", state: "cancelled" });
  expect(answerOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-9"))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-9", state: "in_progress" });
  expect(describedOf(answerOf(await server.client().describeStreamAction("Ra19ljkh20wimdvgya5udt9v1-9")))).toEqual({
    action: "Ra19ljkh20wimdvgya5udt9v1-9",
    project_directory: "/tmp/tatolab-proof-projects/slowpoke",
    kind: "load",
    state: "cancelled",
    step: null,
    streams: [],
    failed_because: null,
  });
  expect(answerOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-12"))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-12", state: "cancelled" });
  expect(toolCallsReceivedBy(server)[0]).toEqual(["cancel_stream_action", { action: "Ra19ljkh20wimdvgya5udt9v1-10" }]);
});

test("a_cancel_the_runtime_declines_carries_its_own_words_a_running_stop_past_cancelling_among_them", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-refusal-for-a-running-stop-of-doorways-front-door.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-refusal-for-an-action-already-cancelled.json")),
  ]);

  expect(failureOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-13"))).toEqual({
    failureDescription:
      "Invalid configuration: the stream action `Ra19ljkh20wimdvgya5udt9v1-13` is a running stop, which has begun unloading its streams and cannot be cut short; it ends done",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-9")).failureDescription).toBe(
    "Invalid configuration: the stream action `Ra19ljkh20wimdvgya5udt9v1-9` is already cancelled, so there is nothing to cancel",
  );
});

test("a_describe_stream_action_result_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(streamActionCancelAnswerFromTheCancelStreamActionToolResult('{"action":"R1-2"}'))).toBe(
    "the runtime's cancel_stream_action result could not be read: missing field `state`",
  );
  expect(failureOf(streamActionDescriptionFromTheDescribeStreamActionToolResult('{"action":"R1-2","project_directory":"/tmp/p","kind":"load"}'))).toBe(
    "the runtime's describe_stream_action result could not be read: missing field `state`",
  );
  expect(failureOf(projectCreationQueuedFromTheCreateProjectToolResult('{"action":"R1-2","project_directory":"/tmp/p"}'))).toBe(
    "the runtime's create_project result could not be read: missing field `stream`",
  );
});

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_description_its_streams_their_graphs_logs_node_types_and_dependencies_and_its_machine_name", async () => {
  const client = new LocalApiClient(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000, "0.45.0");

  answerOf(await client.checkHealth());
  const runtimeDescription = answerOf(await client.describeRuntime());
  expect(runtimeDescription.build_id.startsWith(`${runtimeDescription.version}+`)).toBe(true);
  expect(runtimeDescription.up_for_ms).toBeGreaterThan(0);
  const streams = answerOf(await client.listStreams());
  expect(answerOf(await client.machineName())).not.toBe("");
  for (const loadedStream of streams.filter((listedStream) => listedStream.node_count !== null)) {
    const graph = answerOf(await client.describeStreamGraph(loadedStream.stream));
    expect(graph.stream).toBe(loadedStream.stream);
    expect(graph.graph_document_text.startsWith("{\n")).toBe(true);
  }
  for (const projectDirectory of new Set(streams.flatMap((listedStream) => (listedStream.location === null ? [] : [listedStream.location.project_directory])))) {
    const projectStreams = streams.filter((listedStream) => listedStream.location?.project_directory === projectDirectory);
    const nodeTypeListing = answerOf(await client.listProjectNodeTypes(projectDirectory));
    answerOf(await client.listDependencies(projectDirectory, false));
    expect(nodeTypeListing.sources[0]?.origin).toEqual({ source: "project" });
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
});

test("a_dependency_added_from_a_folder_or_a_zip_answers_the_import_the_runtime_copied", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-folder-lobby-wall.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-zip-doorways.json")),
  ]);

  expect(answerOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall"))).toEqual({
    project: "dde5a62f-b0a8-45d2-a741-79140871f978",
    folder: "lobby-wall",
    source: "/tmp/tatolab-proof-projects/lobby-wall",
    version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82",
  });
  expect(answerOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/doorways.zip"))).toMatchObject({ folder: "doorways", source: "/tmp/tatolab-proof-projects/doorways.zip" });
  expect(toolCallsReceivedBy(server)).toEqual([
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/lobby-wall" }],
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/doorways.zip" }],
  ]);
});

test("a_dependency_the_runtime_refuses_to_add_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-dependency-refusal-for-a-folder-that-is-not-a-project.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-dependency-refusal-for-lobby-wall-imported-already.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-add-dependency-refusal-for-requirements-uv-could-not-resolve-offline.json")),
  ]);

  expect(failureOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/not-a-project"))).toEqual({
    failureDescription: "add_dependency failed: /tmp/tatolab-proof-projects/not-a-project holds no project to import: it has no `tatolab-project.json` at its root",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall")).failureDescription).toBe(
    "add_dependency failed: the project already imports dde5a62f-b0a8-45d2-a741-79140871f978; copy it again with update_dependency",
  );
  expect(failureOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall")).failureDescription).toContain(
    "the project's Python requirements, with this import change, cannot be resolved, so nothing changed",
  );
});

test("an_update_of_a_dependency_edited_since_its_copy_waits_on_the_overwrite_and_then_commits_it", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-edited-since-its-copy.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-overwriting-its-edits.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-update-dependency-refusal-for-a-project-not-imported.json")),
  ]);
  const lobbyWall = "dde5a62f-b0a8-45d2-a741-79140871f978";

  expect(answerOf(await server.client().updateDependency("/tmp/tatolab-proof-projects/night-show", lobbyWall, false))).toEqual({ kind: "edited_since_its_copy", edited_files: ["nodes/brightness_meter.py"] });
  expect(answerOf(await server.client().updateDependency("/tmp/tatolab-proof-projects/night-show", lobbyWall, true))).toEqual({
    kind: "updated",
    dependency: { project: lobbyWall, folder: "lobby-wall", source: "/tmp/tatolab-proof-projects/lobby-wall", version: "27ac758d40fe967b15e1f8c9722755d82d4e093ed69e4617e22c674fbb66dfff" },
  });
  expect(failureOf(await server.client().updateDependency("/tmp/tatolab-proof-projects/night-show", "00000000-0000-4000-8000-000000000000", false)).failureDescription).toBe(
    "update_dependency failed: the project imports no project 00000000-0000-4000-8000-000000000000",
  );
  expect(toolCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: true },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "00000000-0000-4000-8000-000000000000", overwrite_edited_files: false },
  ]);
});

test("the_dependencies_listed_carry_their_edited_files_and_with_a_check_whether_their_source_holds_a_newer_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-dependencies-tool-result-of-the-project-night-show-importing-nothing.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-importing-lobby-wall.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-with-lobby-wall-edited-and-newer-on-its-source.json")),
  ]);
  const lobbyWall = { project: "dde5a62f-b0a8-45d2-a741-79140871f978", folder: "lobby-wall", source: "/tmp/tatolab-proof-projects/lobby-wall", version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82" };

  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", false))).toEqual([]);
  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", false))).toEqual([
    { dependency: lobbyWall, edited_files: [], newer_version_exists: null, check_refused_because: null },
  ]);
  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", true))).toEqual([
    { dependency: lobbyWall, edited_files: ["nodes/brightness_meter.py"], newer_version_exists: true, check_refused_because: null },
  ]);
  expect(toolCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: true },
  ]);
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

test("the_node_catalog_is_read_from_the_registry_of_the_stream_asked_for", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-registry-answer-of-a-test-root-runtime-naming-no-stream.json")),
  ]);

  const nodeCatalog = answerOf(await server.client().describeNodeCatalog("pattern-main-3f2a1c"));

  expect(server.receivedRequests()[0]?.startsWith("GET /api/registry?stream=pattern-main-3f2a1c HTTP/1.1\r\n")).toBe(true);
  expect(nodeCatalog.stream).toBe("pattern-main-3f2a1c");
  expect(nodeCatalog.node_types.map((nodeType) => nodeType.type)).toEqual(["tatolab.stream:RelayTrackSource"]);
});

test("a_node_catalog_of_a_stream_not_loaded_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("404 Not Found", "application/json", await recordedResponseBody("local-api-registry-refusal-for-the-stream-front-door-not-loaded.json")),
  ]);

  expect(failureOf(await server.client().describeNodeCatalog("front-door")).failureDescription).toBe(
    "Resource not found: no stream with the id `front-door` is loaded in this runtime. Loaded: none",
  );
});

test("listing_a_projects_node_types_calls_list_project_node_types_with_its_folder_and_reads_each_source", async () => {
  const listingText = JSON.stringify({
    project_directory: "/w/pattern",
    project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
    project_name: "pattern",
    sources: [{ source: "project", node_types: [], graph_generators: [], unreadable_modules: [] }],
  });
  const server = await fakeLocalApiServerAnswering([toolResultResponseOfText(listingText)]);

  const listing = answerOf(await server.client().listProjectNodeTypes("/w/pattern"));

  expect(listing.project_name).toBe("pattern");
  expect(listing.sources.map((source) => source.origin)).toEqual([{ source: "project" }]);
  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head).toContain("Mcp-Name: list_project_node_types\r\n");
  expect(JSON.parse(body).params.arguments).toEqual({ project_directory: "/w/pattern" });
});

test("a_node_type_listing_the_runtime_refuses_carries_its_own_words", async () => {
  const refusal = "list_project_node_types failed: the project's interpreter printed no listing";
  const server = await fakeLocalApiServerAnswering([toolResultResponseOfText(refusal, true)]);

  expect(failureOf(await server.client().listProjectNodeTypes("/w/pattern")).failureDescription).toBe(refusal);
});

test("a_real_node_type_listing_reads_the_projects_node_types_generator_unreadable_module_and_installed_distribution", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-node-types-tool-result-of-a-project-with-a-module-that-does-not-parse.json")),
  ]);

  const listing = answerOf(await server.client().listProjectNodeTypes("/private/tmp/tatolab-proof-185/node-type-proof"));

  expect(listing.project_name).toBe("node-type-proof");
  expect(listing.sources.map((source) => source.origin)).toEqual([
    { source: "project" },
    { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "0.68.41" },
  ]);
  const [projectSource, testPatternSource] = listing.sources;
  expect(projectSource?.node_types.map((nodeType) => [nodeType.type, nodeType.kind, nodeType.category])).toEqual([
    ["nodes.brightness_meter:BrightnessMeter", "process", "nodes.brightness_meter"],
    ["nodes.edge_mask:EdgeMask", "process", "Masks"],
    ["nodes.gain:scale_by_gain", "function", "nodes.gain"],
    ["nodes.halftone_lens_effect:HalftoneLensEffect", "process", "nodes.halftone_lens_effect"],
  ]);
  expect(projectSource?.node_types[1]?.outputs).toEqual([{ name: "mask_out", family: "image", description: "The edge mask.", annotation: null }]);
  expect(projectSource?.node_types[2]?.inputs?.[1]).toEqual({ name: "gain", family: "channels", description: "", annotation: "float" });
  expect(projectSource?.graph_generators).toEqual([
    { generator: "nodes.masked_rig:masked_rig", description: "Wires `mask_count` edge masks in a row.", promoted_config: [{ name: "mask_count", annotation: "int" }], path: "nodes/masked_rig.py", line: 7 },
  ]);
  expect(projectSource?.unreadable_modules).toEqual([{ module: "nodes.half_written", path: "nodes/half_written.py", line: 4, column: 11, why: "SyntaxError: '(' was never closed" }]);
  expect(testPatternSource?.node_types.map((nodeType) => nodeType.type)).toEqual(["tatolab.testpattern:TestPatternSource"]);
});

test("a_real_node_type_listing_of_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-node-types-tool-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(failureOf(await server.client().listProjectNodeTypes("/private/tmp/tatolab-proof-185/not-a-project")).failureDescription).toBe(
    "list_project_node_types failed: /private/tmp/tatolab-proof-185/not-a-project holds no project: it has no tatolab-project.json",
  );
});

test("a_real_node_type_listing_of_a_project_with_imports_lists_each_import_by_its_uuid_folder_and_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-node-types-tool-result-of-night-show-importing-doorways-and-lobby-wall.json")),
  ]);

  const listing = answerOf(await server.client().listProjectNodeTypes("/tmp/tatolab-proof-projects/night-show"));

  expect(listing.sources.map((source) => [source.origin, source.node_types.length])).toEqual([
    [{ source: "project" }, 2],
    [{ source: "dependency", project: "27f7b9b7-9a4d-463c-9b72-10bbf0c3c3e1", folder: "doorways", version: "a1202f3410913185a5866e8bbe3423c6b860f9c339164d8f3e78c267562f93c3" }, 2],
    [{ source: "dependency", project: "dde5a62f-b0a8-45d2-a741-79140871f978", folder: "lobby-wall", version: "27ac758d40fe967b15e1f8c9722755d82d4e093ed69e4617e22c674fbb66dfff" }, 2],
  ]);
});

test("a_real_asset_listing_names_the_project_and_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-assets-tool-result-of-the-project-night-show.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-assets-tool-result-of-the-import-lobby-wall-of-night-show.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.client().nameTheProject("/tmp/tatolab-proof-projects/night-show"))).toEqual({
    folder: "/tmp/tatolab-proof-projects/night-show",
    project: "cc5046d5-d8b7-4ecf-82e7-3f0e511b2ab0",
    name: "night-show",
  });
  expect(answerOf(await server.client().nameTheProject("/tmp/tatolab-proof-projects/night-show/imports/lobby-wall"))).toEqual({
    folder: "/tmp/tatolab-proof-projects/night-show/imports/lobby-wall",
    project: "dde5a62f-b0a8-45d2-a741-79140871f978",
    name: "lobby-wall",
  });
  expect(failureOf(await server.client().nameTheProject("/tmp/tatolab-proof-projects/not-a-project")).failureDescription).toBe(
    "list_assets failed: /tmp/tatolab-proof-projects/not-a-project holds no project: it has no tatolab-project.json",
  );
  expect(toolCallsReceivedBy(server).map(([toolName]) => toolName)).toEqual(["list_assets", "list_assets", "list_assets"]);
});

test("a_node_type_listing_waits_past_the_ordinary_request_timeout_for_the_projects_interpreter", async () => {
  const listingText = JSON.stringify({ project_directory: "/w/pattern", project: "p", project_name: "pattern", sources: [] });
  const server = await FakeLocalApiServer.answering([toolResultResponseOfText(listingText)], 300);
  cleanUps.push(() => server.close());
  const clientWithAShortRequestTimeout = new LocalApiClient(server.localApiSocketPath, 100, "0.45.0");

  expect(answerOf(await clientWithAShortRequestTimeout.listProjectNodeTypes("/w/pattern")).project_name).toBe("pattern");
});

test("undo_and_redo_ask_the_runtime_by_the_author_and_answer_the_transaction_or_the_runtimes_refusal_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-undo-tool-refusal-for-sam-with-nothing-left-to-undo.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;
  const projectFolder = "/tmp/claude-0/-home-user/e49a0dd5-7a95-5fdd-b9ce-70d350d7c52d/scratchpad/streams/lobby";

  const undone = answerOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(answerOf(await server.client().redoInTheProject(projectFolder, sam)).redoes).toBe(undone.undoes);
  const refusal = failureOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(refusal).toMatchObject({ isTheRuntimesRefusal: true, failureDescription: "undo failed: Sam has no transaction left to undo" });
  expect(toolCallsReceivedBy(server)).toEqual([
    ["undo", { project_directory: projectFolder, author: sam }],
    ["redo", { project_directory: projectFolder, author: sam }],
    ["undo", { project_directory: projectFolder, author: sam }],
  ]);
});

const RECORDED_NIGHT_SHOW = "/private/tmp/tl-rec053/projects/night-show";

test("project files are listed, read whole as bytes, and written as one transaction by the author under a key, each through the runtime's file tools, a refusal in its own words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show-under-nodes.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-nodes-camera-py.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-views-deck-icon-png.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-imports-lobby-wall-views-meter-manifest.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-read-project-file-refusal-for-a-path-outside-night-show.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-write-project-file-tool-result-of-sam-saving-night-show-nodes-camera-py.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-write-project-file-refusal-for-a-file-under-imports-of-night-show.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-write-project-file-refusal-for-content-night-show-already-holds.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;

  const wholeProject = answerOf(await server.client().listProjectFiles(RECORDED_NIGHT_SHOW, null));
  expect(wholeProject.map((listedFile) => listedFile.path)).toContain("views/deck/icon.png");
  expect(wholeProject.find((listedFile) => listedFile.path === "nodes/camera.py")).toEqual({ path: "nodes/camera.py", byte_len: 43 });
  expect(answerOf(await server.client().listProjectFiles(RECORDED_NIGHT_SHOW, "nodes"))).toEqual([{ path: "nodes/camera.py", byte_len: 43 }]);
  expect(answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py")).toString("utf8")).toBe("import streamlib\n\n\nCAMERA_DEVICE_INDEX = 0\n");
  const iconBytes = answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "views/deck/icon.png"));
  expect([iconBytes.length, [...iconBytes.subarray(0, 8)]]).toEqual([75, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]);
  expect(JSON.parse(answerOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "imports/lobby-wall/views/meter/tatolab_view.json")).toString("utf8"))).toMatchObject({ title: "Meter" });
  expect(failureOf(await server.client().readProjectFile(RECORDED_NIGHT_SHOW, "../elsewhere.txt"))).toMatchObject({
    isTheRuntimesRefusal: true,
    failureDescription: "read_project_file failed: the file path `../elsewhere.txt` is refused: it holds `.`, `..` or a root, which could lead outside the project",
  });
  expect(answerOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py", "import streamlib\n", sam, "save-1"))).toEqual({
    path: "nodes/camera.py",
    transaction: "c394e90f-a850-4603-81c3-8d25ba25ea76",
    commit: "a85ff7d5a389463bfcf6af6a27e268b013849bf6",
  });
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "imports/lobby-wall/views/meter/index.html", "<p></p>\n", sam, "save-2")).failureDescription).toBe(
    "write_project_file failed: the file `imports/lobby-wall/views/meter/index.html` is not written with write_project_file: an import's files are edited by opening `imports/<folder>/` as a project of its own",
  );
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py", "import streamlib\n", sam, "save-3")).failureDescription).toBe(
    "write_project_file failed: a transaction must hold at least one change",
  );
  expect(toolCallsReceivedBy(server)).toEqual([
    ["list_project_files", { project_directory: RECORDED_NIGHT_SHOW }],
    ["list_project_files", { project_directory: RECORDED_NIGHT_SHOW, under: "nodes" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "views/deck/icon.png" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "imports/lobby-wall/views/meter/tatolab_view.json" }],
    ["read_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "../elsewhere.txt" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py", content: "import streamlib\n", author: sam, idempotency_key: "save-1" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "imports/lobby-wall/views/meter/index.html", content: "<p></p>\n", author: sam, idempotency_key: "save-2" }],
    ["write_project_file", { project_directory: RECORDED_NIGHT_SHOW, path: "nodes/camera.py", content: "import streamlib\n", author: sam, idempotency_key: "save-3" }],
  ]);
});

test("undoing a save is the runtime's undo of the write_project_file transaction that recorded it", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-save-of-night-show-nodes-camera-py.json")),
  ]);

  const undone = answerOf(await server.client().undoInTheProject(RECORDED_NIGHT_SHOW, { kind: "person", name: "Sam" }));

  expect(undone.undoes).toBe("c394e90f-a850-4603-81c3-8d25ba25ea76");
});

test("a project's views are listed from its views/ folders and its imports', each that does not open with the runtime's reason, and a folder that is not a project refused in its words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json")),
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-views-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  const listed = answerOf(await server.client().listProjectViews(RECORDED_NIGHT_SHOW));
  const refusal = failureOf(await server.client().listProjectViews("/private/tmp/tl-rec053/not-a-project"));

  expect(listed.map(({ view_type, project_name, import_folder, view_folder_in_the_project, opens, not_opened_because }) => ({ view_type, project_name, import_folder, view_folder_in_the_project, opens, not_opened_because }))).toEqual([
    { view_type: "night-show:broken", project_name: "night-show", import_folder: null, view_folder_in_the_project: "views/broken", opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0." },
    { view_type: "night-show:deck", project_name: "night-show", import_folder: null, view_folder_in_the_project: "views/deck", opens: true, not_opened_because: null },
    { view_type: "lobby-wall:meter", project_name: "lobby-wall", import_folder: "lobby-wall", view_folder_in_the_project: "imports/lobby-wall/views/meter", opens: true, not_opened_because: null },
  ]);
  expect(listed[1]?.manifest).toMatchObject({ title: "DJ Deck", placement: "node", entry: "index.html" });
  expect(refusal.failureDescription).toBe("list_project_views failed: /private/tmp/tl-rec053/not-a-project holds no project: it has no tatolab-project.json");
});
