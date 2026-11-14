import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CONTROL_CONTRACT_VERSION } from "@tatolab/runtime-client";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, StreamActionDescription, StreamActionFollowed, StreamLocation } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, controlOperationResponseOfTheRecordedToolResponse, httpResponse, controlOperationFailedResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import {
  httpRequestBytes,
  listedStreamsFromTheListStreamsToolResult,
  LocalApiClient,
  parseHttpResponse,
  runtimeDescriptionFromTheDescribeRuntimeToolResult,
  queuedStreamActionFromTheToolResult,
  streamsThePauseOrResumeReachedFromTheToolResult,
  streamAssetChangeFromTheToolResult,
} from "./local_api_client.js";
import { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";
import { streamActionChangesConnectionOver } from "./stream_action_changes_followed_for_the_status.js";
import type { Result } from "./result.js";
import {
  projectCreationQueuedFromTheCreateProjectToolResult,
  projectStreamActionQueuedFromTheToolResult,
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

  const failure = failureOf(await new LocalApiClient(socketPath, 1_000).checkHealth());

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

  const failure = failureOf(await new LocalApiClient(socketPath, 200).checkHealth());

  expect(failure.failureDescription).toContain("did not answer within");
});

test("listing_streams_posts_list_streams_to_control_with_the_contract_version_and_the_apps_name", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse({ streams: [] })]);

  expect(answerOf(await server.client().listStreams())).toEqual([]);

  const [head, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(head.startsWith("POST /control HTTP/1.1\r\n"), head).toBe(true);
  const headLines = head.toLowerCase().split("\r\n");
  for (const requiredHeader of [
    "content-type: application/json",
    `tatolab-control-contract-version: ${CONTROL_CONTRACT_VERSION}`,
    "tatolab-control-client-name: tatolab-app",
    `content-length: ${Buffer.byteLength(body)}`,
  ]) {
    expect(headLines, `${requiredHeader} missing`).toContain(requiredHeader);
  }
  expect(JSON.parse(body)).toEqual({ jsonrpc: "2.0", id: 1, method: "list_streams", params: {} });
});

/** `describe_runtime`'s result as streamlib's wire-text test writes it, with and without the runtime's own log. */
const DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":"/home/u/.local/state/tatolab/logs"}';
const DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER =
  '{"version":"0.55.1","build_id":"0.55.1+0123abc.9f8e7d","up_for_ms":266400000,"runtime_log_directory":null}';

test("describing_the_runtime_calls_describe_runtime_with_no_arguments_and_reads_its_four_fields", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResultResponse(JSON.parse(DESCRIBE_RUNTIME_WIRE_TEXT_WITH_A_LOG_FOLDER))]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.1",
    build_id: "0.55.1+0123abc.9f8e7d",
    up_for_ms: 266_400_000,
    runtime_log_directory: "/home/u/.local/state/tatolab/logs",
  });
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("describe_runtime");
  expect(JSON.parse(body)).toMatchObject({ jsonrpc: "2.0", method: "describe_runtime", params: {} });
});

test("a_real_describe_runtime_result_reads_its_version_build_uptime_and_log_folder", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-runtime-tool-result-of-a-test-root-runtime.json")),
  ]);

  expect(answerOf(await server.client().describeRuntime())).toEqual({
    version: "0.55.2",
    build_id: "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60",
    up_for_ms: 10_007,
    runtime_log_directory: "/tmp/tatolab-proof/state/logs",
  });
});

test("a_runtime_keeping_no_own_log_describes_its_log_folder_as_null", () => {
  expect(answerOf(runtimeDescriptionFromTheDescribeRuntimeToolResult(JSON.parse(DESCRIBE_RUNTIME_WIRE_TEXT_WITHOUT_A_LOG_FOLDER))).runtime_log_directory).toBeNull();
});

test("a_describe_runtime_result_missing_a_field_is_refused_naming_it", () => {
  expect(failureOf(runtimeDescriptionFromTheDescribeRuntimeToolResult(JSON.parse('{"version":"0.55.1","up_for_ms":5,"runtime_log_directory":null}')))).toBe(
    "the runtime's describe_runtime result could not be read: missing field `build_id`",
  );
});

test("an_operation_the_runtime_does_not_serve_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-an-operation-this-runtime-does-not-serve.json")),
  ]);

  expect(failureOf(await server.client().describeRuntime())).toEqual({
    failureDescription: "the runtime refused `describe_runtime`: the runtime serves no operation named `describe_runtime_of_a_later_runtime`",
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

const RECORDED_HARBOUR_LIGHTS = "/tmp/claude-0/live/home/Tato Studio/Harbour Lights";
const RECORDED_HARBOUR_DUSK_PNG = "38ab4435-5f49-4cd1-b60e-f03acf54db34";
const RECORDED_QUAY_WALK_MP4 = "23199eb3-ea3c-4d31-8f0f-2bf9395590d2";
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
  ]);

  expect(answerOf(await server.client().listStreams())).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "stopped", null, null),
  ]);
});

test("a_real_listing_after_the_runtime_restarted_lists_every_stream_it_re_loaded_running_and_the_rest_as_recorded", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-after-the-runtime-restarted.json")),
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-preparing-on-its-starting-step.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-the-stream-pattern-main-stopping.json")),
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

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(toolResult))).toEqual([
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

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(toolResult))).toEqual([
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

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(toolResult))).toEqual([
    { ...listedStream("camera-main-018da9", "camera", locationOf("/Users/me/camera"), "running", 4, null), capture_devices_whose_access_was_never_asked_for: ["camera", "a_device_from_later"] },
  ]);
  expect(
    failureOf(
      listedStreamsFromTheListStreamsToolResult(
        { streams: [{ ...toolResult.streams[0], capture_devices_whose_access_was_never_asked_for: [1] }] },
      ),
    ),
  ).toBe("the runtime's list_streams result could not be read: `capture_devices_whose_access_was_never_asked_for` holds a value that is not a string");
});

test("a_location_naming_no_stream_asset_is_refused_naming_the_missing_field", () => {
  const toolResult = {
    streams: [{ stream: "pattern-main-d76f70", display_name: "main", location: { project_directory: "/tmp/p", stream_function: "stream:main" }, state: "running", node_count: 4, failed_because: null }],
  };

  expect(failureOf(listedStreamsFromTheListStreamsToolResult(toolResult))).toBe("the runtime's list_streams result could not be read: missing field `project`");
});

test("a_record_an_earlier_runtime_wrote_is_listed_without_a_location", () => {
  const toolResult = {
    streams: [{ stream: "camera", display_name: "camera", location: null, state: "failed", node_count: null, failed_because: "recorded by an earlier runtime; run it again" }],
  };

  expect(answerOf(listedStreamsFromTheListStreamsToolResult(toolResult))).toEqual([
    listedStream("camera", "camera", null, "failed", null, "recorded by an earlier runtime; run it again"),
  ]);
});

test("a_list_streams_result_naming_no_stream_id_or_display_name_is_refused", () => {
  expect(failureOf(listedStreamsFromTheListStreamsToolResult({ streams: [{ display_name: "main", location: null, state: "running" }] }))).toBe(
    "the runtime's list_streams result could not be read: missing field `stream`",
  );
  expect(failureOf(listedStreamsFromTheListStreamsToolResult({ streams: [{ stream: "a-main-1a2b3c", location: null, state: "running" }] }))).toBe(
    "the runtime's list_streams result could not be read: missing field `display_name`",
  );
  expect(failureOf(listedStreamsFromTheListStreamsToolResult({ streams: [{ stream: "a-main-1a2b3c", display_name: "main", location: "/a", state: "running" }] }))).toBe(
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

test("a_runtime_serving_another_contract_version_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-control-refusal-for-a-client-of-contract-version-1.json")),
  ]);

  expect(failureOf(await server.client().listStreams())).toEqual({
    failureDescription: "the runtime refused `list_streams`: the client was built against control contract version 1, and this runtime serves version 2",
    isTheRuntimesRefusal: true,
  });
});

test("an_operation_that_ran_and_failed_is_reported_with_its_words", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse("the stream action did not finish")]);

  expect(failureOf(await server.client().listStreams()).failureDescription).toBe("the stream action did not finish");
});

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

/** The `POST /control` answer carrying `resultText` as its result, spliced in exactly as written. */
function controlOperationResponseOfTheResultText(resultText: string): Buffer {
  return httpResponse("200 OK", "application/json", `{"jsonrpc":"2.0","id":1,"result":${resultText}}`);
}

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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-graph-tool-refusal-for-the-stopped-stream-front-door.json")),
  ]);

  expect(failureOf(await server.client().describeStreamGraph("front-door")).failureDescription).toBe(
    "graph failed: Resource not found: no stream named `front-door` is loaded in this runtime. Loaded: none",
  );
});

test("stopping_the_playback_queues_stop_playback_with_its_folder_and_answers_the_action_it_queued", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-stop-playback-answer-for-the-playing-project-hallways.json")),
  ]);

  expect(answerOf(await server.client().stopPlayback("/tmp/tatolab-proof-projects/hallways"))).toBe("Rhrb4oumhnnzujbb137ivd7ah-9");
  expect(controlOperationCallsReceivedBy(server)).toEqual([["stop_playback", { project_directory: "/tmp/tatolab-proof-projects/hallways" }]]);
});

test("a_stop_of_the_playback_of_a_project_none_of_whose_streams_plays_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-stop-playback-refusal-for-the-stopped-project-pattern.json")),
  ]);

  expect(failureOf(await server.client().stopPlayback("/tmp/tatolab-proof-projects/pattern"))).toEqual({
    failureDescription:
      "Runtime error: no stream of the project in /tmp/tatolab-proof-projects/pattern plays, so there is none to stop; `start_playback` plays it. Loaded: hallways-main-80cbae, pattern-main-32fee2. Recorded: hallways-main-80cbae, lobby-main-298da3 (closed), pattern-main-32fee2 (stopped)",
    isTheRuntimesRefusal: true,
  });
});

test("pausing_then_resuming_the_playback_calls_pause_playback_and_resume_playback_with_its_folder_and_answers_the_streams_each_reached", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-pause-playback-answer-for-the-playing-project-hallways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-resume-playback-answer-for-the-paused-project-hallways.json")),
  ]);

  expect(answerOf(await server.client().pausePlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual(["hallways-main-06e134"]);
  expect(answerOf(await server.client().resumePlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual(["hallways-main-06e134"]);
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["pause_playback", { project_directory: "/tmp/tatolab-proof-projects/hallways" }],
    ["resume_playback", { project_directory: "/tmp/tatolab-proof-projects/hallways" }],
  ]);
});

test("a_pause_of_a_stopped_project_and_a_resume_of_a_playing_one_are_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-pause-playback-refusal-for-the-stopped-project-hallways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-resume-playback-refusal-for-the-playing-project-hallways.json")),
  ]);

  expect(failureOf(await server.client().pausePlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual({
    failureDescription: "Runtime error: no stream of the project in /tmp/tatolab-proof-projects/hallways plays, so there is none to pause; `start_playback` plays it. Loaded: hallways-main-06e134",
    isTheRuntimesRefusal: true,
  });
  expect(failureOf(await server.client().resumePlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual({
    failureDescription: "Runtime error: the project in /tmp/tatolab-proof-projects/hallways is not paused, so there is none to resume",
    isTheRuntimesRefusal: true,
  });
});

test("a_pause_answer_naming_no_streams_is_refused_naming_it", () => {
  expect(failureOf(streamsThePauseOrResumeReachedFromTheToolResult("pause_playback", JSON.parse('{"project_directory":"/tmp/tatolab-proof-projects/hallways"}')))).toBe(
    "the runtime's pause_playback result could not be read: missing field `streams`",
  );
});

test("closing_a_project_queues_close_project_with_its_folder_and_a_closed_one_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-close-project-answer-for-the-open-project-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-close-project-refusal-for-the-closed-project-lobby.json")),
  ]);

  expect(answerOf(await server.client().closeProject("/tmp/tatolab-proof-projects/lobby"))).toBe("Rhrb4oumhnnzujbb137ivd7ah-5");
  expect(failureOf(await server.client().closeProject("/tmp/tatolab-proof-projects/lobby"))).toEqual({
    failureDescription:
      "Runtime error: the project in /tmp/tatolab-proof-projects/lobby is not open, so there is none to close. Loaded: hallways-main-80cbae, pattern-main-32fee2. Recorded: hallways-main-80cbae, lobby-main-298da3 (closed), pattern-main-32fee2 (stopped)",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["close_project", { project_directory: "/tmp/tatolab-proof-projects/lobby" }],
    ["close_project", { project_directory: "/tmp/tatolab-proof-projects/lobby" }],
  ]);
});

test("a_stream_action_answers_within_the_ordinary_request_timeout_or_reads_as_not_answering", async () => {
  const server = await FakeLocalApiServer.answering(
    [controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-stop-playback-answer-for-the-playing-project-hallways.json"))],
    300,
  );
  cleanUps.push(() => server.close());
  const clientWithAShortRequestTimeout = new LocalApiClient(server.localApiSocketPath, 100);

  expect(failureOf(await clientWithAShortRequestTimeout.stopPlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual({
    failureDescription: `\`stop_playback\` to ${server.localApiSocketPath} did not answer within 100ms`,
    isTheRuntimesRefusal: false,
  });
});

test("a_stream_action_answer_naming_no_action_is_refused_naming_it", () => {
  expect(failureOf(queuedStreamActionFromTheToolResult("stop_playback", JSON.parse('{"project_directory":"/tmp/tatolab-proof-projects/pattern"}')))).toBe(
    "the runtime's stop_playback result could not be read: missing field `action`",
  );
});

test("removing_a_project_queues_remove_project_with_its_folder_and_a_project_the_runtime_holds_no_stream_of_is_refused_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json")),
  ]);

  expect(answerOf(await server.client().removeProject("/tmp/tatolab-proof-projects/doorways"))).toBe("Rnd53mwtsrixjyxk7h3jfq5j5-8");
  expect(failureOf(await server.client().removeProject("/tmp/tatolab-proof-projects/doorways")).failureDescription).toBe(
    "Resource not found: this runtime holds no stream of the project in /tmp/tatolab-proof-projects/doorways, so there is none to remove. Loaded: pattern-main-d76f70. Recorded: pattern-main-d76f70",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["remove_project", { project_directory: "/tmp/tatolab-proof-projects/doorways" }],
    ["remove_project", { project_directory: "/tmp/tatolab-proof-projects/doorways" }],
  ]);
});

const SAM_EDITING = { kind: "person", name: "Sam" } as const;

test("setting_a_streams_display_name_calls_set_stream_display_name_with_its_project_stream_asset_and_author_and_a_refusal_is_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-stream-display-name-answer-for-the-main-stream-of-hallways-renamed-heat-map.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-stream-display-name-refusal-for-a-display-name-that-shows-nothing.json")),
  ]);
  const hallways = "/private/tmp/tatolab-proof-projects/hallways";
  const mainStreamAsset = "666895f1-e258-4587-8c62-ed07c0cc70db";

  expect(answerOf(await server.client().setStreamDisplayName(hallways, mainStreamAsset, "Heat map", SAM_EDITING))).toEqual({
    stream_asset: mainStreamAsset,
    transaction: "43d874c1-83a9-4506-90fc-e01bfc47b9ca",
    commit: "22857d5b7b2ac6dbd9e62ed1b64fd38dff47cb9f",
  });
  expect(failureOf(await server.client().setStreamDisplayName(hallways, mainStreamAsset, "   ", SAM_EDITING))).toEqual({
    failureDescription: `set_stream_display_name failed: "   " cannot be a stream's display name: it shows nothing`,
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["set_stream_display_name", { project_directory: hallways, stream_asset: mainStreamAsset, display_name: "Heat map", author: SAM_EDITING }],
    ["set_stream_display_name", { project_directory: hallways, stream_asset: mainStreamAsset, display_name: "   ", author: SAM_EDITING }],
  ]);
});

test("creating_a_stream_calls_create_stream_with_its_project_path_display_name_and_author_and_reads_the_stream_asset_it_made", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-stream-answer-for-preview-in-lobby-loading-it.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-stream-refusal-for-a-path-another-asset-holds.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-stream-refusal-for-a-display-name-that-shows-nothing.json")),
  ]);
  const lobby = "/root/streams/lobby";

  expect(answerOf(await server.client().createStream(lobby, "streams/preview.graph.json", "Preview", SAM_EDITING))).toEqual({
    stream_asset: "38766917-e6ed-443f-bad5-6d70eff6efac",
    transaction: "9f884a11-5efd-4189-b119-6d6ea8212744",
    commit: "7af0da3b8cb0bae77712253ab2df7108217fac22",
  });
  expect(failureOf(await server.client().createStream(lobby, "streams/preview.graph.json", "Preview", SAM_EDITING)).failureDescription).toBe(
    "create_stream failed: `streams/preview.graph.json` is already the path of the asset 38766917-e6ed-443f-bad5-6d70eff6efac",
  );
  expect(failureOf(await server.client().createStream(lobby, "streams/blank.graph.json", "   ", SAM_EDITING)).failureDescription).toBe(
    `create_stream failed: "   " cannot be a stream's display name: it shows nothing`,
  );
  expect(controlOperationCallsReceivedBy(server)[0]).toEqual(["create_stream", { project_directory: lobby, path: "streams/preview.graph.json", display_name: "Preview", author: SAM_EDITING }]);
});

test("deleting_a_stream_calls_delete_stream_with_its_project_stream_asset_and_author_and_a_refusal_is_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-stream-answer-for-preview-of-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-stream-refusal-for-a-stream-asset-the-project-no-longer-holds.json")),
  ]);
  const lobby = "/root/streams/lobby";
  const previewStreamAsset = "38766917-e6ed-443f-bad5-6d70eff6efac";

  expect(answerOf(await server.client().deleteStream(lobby, previewStreamAsset, SAM_EDITING))).toEqual({
    stream_asset: previewStreamAsset,
    transaction: "4a8fed8f-bf7c-4941-a1a5-31f5731718ca",
    commit: "88bf532826018559d6105af6e9e7b8bc3e556155",
  });
  expect(failureOf(await server.client().deleteStream(lobby, previewStreamAsset, SAM_EDITING))).toEqual({
    failureDescription: `delete_stream failed: the project holds no stream asset ${previewStreamAsset}`,
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)[0]).toEqual(["delete_stream", { project_directory: lobby, stream_asset: previewStreamAsset, author: SAM_EDITING }]);
});

test("a_stream_asset_tool_answer_missing_its_commit_or_asset_is_refused_naming_it", () => {
  expect(failureOf(streamAssetChangeFromTheToolResult("set_stream_display_name", JSON.parse('{"asset":{"asset":"666895f1-e258-4587-8c62-ed07c0cc70db"},"transaction":"43d874c1-83a9-4506-90fc-e01bfc47b9ca"}')))).toBe(
    "the runtime's set_stream_display_name result could not be read: missing field `commit`",
  );
  expect(failureOf(streamAssetChangeFromTheToolResult("delete_stream", JSON.parse('{"transaction":"43d874c1-83a9-4506-90fc-e01bfc47b9ca","commit":"22857d5b"}')))).toBe(
    "the runtime's delete_stream result could not be read: missing field `asset`",
  );
});

test("creating_a_project_calls_create_project_with_its_folder_or_none_and_reads_the_action_the_stream_and_the_folder", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-project-answer-for-the-folder-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-project-answer-with-no-folder-drawn-kind-butte.json")),
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
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["create_project", { project_directory: "/tmp/tatolab-proof-projects/lobby" }],
    ["create_project", {}],
  ]);
});

test("opening_a_project_calls_open_project_with_its_folder_and_reads_the_action_it_queued_and_an_open_one_is_refused_naming_reload_project", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-answer-for-the-closed-project-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-refusal-for-the-open-project-pattern.json")),
  ]);

  expect(answerOf(await server.client().openProject("/tmp/tatolab-proof-projects/lobby"))).toEqual({
    action: "Rhrb4oumhnnzujbb137ivd7ah-8",
    project_directory: "/tmp/tatolab-proof-projects/lobby",
  });
  expect(failureOf(await server.client().openProject("/tmp/tatolab-proof-projects/pattern"))).toEqual({
    failureDescription: "Runtime error: the project in /tmp/tatolab-proof-projects/pattern is already open, so there is none to open; `reload_project` re-reads what changed on disk",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["open_project", { project_directory: "/tmp/tatolab-proof-projects/lobby" }],
    ["open_project", { project_directory: "/tmp/tatolab-proof-projects/pattern" }],
  ]);
});

test("starting_the_playback_calls_start_playback_with_its_folder_and_reads_the_action_it_queued_and_a_closed_or_playing_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-start-playback-answer-for-the-stopped-project-hallways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-start-playback-refusal-for-the-closed-project-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-start-playback-refusal-for-the-playing-project-hallways.json")),
  ]);

  expect(answerOf(await server.client().startPlayback("/tmp/tatolab-proof-projects/hallways"))).toEqual({
    action: "Rhrb4oumhnnzujbb137ivd7ah-4",
    project_directory: "/tmp/tatolab-proof-projects/hallways",
  });
  expect(failureOf(await server.client().startPlayback("/tmp/tatolab-proof-projects/lobby")).failureDescription).toBe(
    "Runtime error: the project in /tmp/tatolab-proof-projects/lobby is not open, so there is none to play; `open_project` opens it",
  );
  expect(failureOf(await server.client().startPlayback("/tmp/tatolab-proof-projects/hallways")).failureDescription).toBe(
    "Runtime error: the project in /tmp/tatolab-proof-projects/hallways already plays, so there is none to play; `stop_playback` stops it",
  );
  expect(controlOperationCallsReceivedBy(server).map(([toolName]) => toolName)).toEqual(["start_playback", "start_playback", "start_playback"]);
});

test("reloading_a_closed_project_is_refused_naming_open_project", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-reload-project-refusal-for-the-closed-project-lobby.json")),
  ]);

  expect(failureOf(await server.client().reloadProject("/tmp/tatolab-proof-projects/lobby"))).toEqual({
    failureDescription: "Runtime error: the project in /tmp/tatolab-proof-projects/lobby is not open, so there is none to reload; `open_project` opens it",
    isTheRuntimesRefusal: true,
  });
});

test("reloading_a_project_calls_reload_project_with_its_folder_and_reads_the_action_it_queued", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-reload-project-answer-for-the-stopped-project-pattern.json")),
  ]);

  expect(answerOf(await server.client().reloadProject("/tmp/tatolab-proof-projects/pattern"))).toEqual({
    action: "Rhrb4oumhnnzujbb137ivd7ah-7",
    project_directory: "/tmp/tatolab-proof-projects/pattern",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([["reload_project", { project_directory: "/tmp/tatolab-proof-projects/pattern" }]]);
});

test("an_open_start_playback_or_reload_project_answer_missing_its_action_is_refused_naming_the_tool", () => {
  expect(failureOf(projectStreamActionQueuedFromTheToolResult("reload_project", '{"project_directory":"/tmp/hallways"}'))).toContain("reload_project");
});

/** The description `describe_stream_action` answered, failing the test when it answered anything else. */
function describedOf(followed: StreamActionFollowed): StreamActionDescription {
  return followed.kind === "described" ? followed.description : expect.unreachable(`the action was not described: ${followed.words}`);
}

test("describing_a_stream_action_reads_its_state_step_and_streams_from_queued_to_done", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-a-run-of-hallways-queued.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-a-create-making-the-venv.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-run-of-hallways-done-one-running-one-failed.json")),
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
      venv_sync: null,
    },
  });
  expect(describedOf(answerOf(await server.client().describeStreamAction("Riioiuiuj7n1z3ghkm7s9n1xi-6")))).toMatchObject({ state: "in_progress", step: "making_the_venv" });
  expect(describedOf(answerOf(await server.client().describeStreamAction("Rj12j3eujz3zn0dposliv79k9-3"))).streams).toEqual([
    { stream: "hallways-front_door-58034f", display_name: "front_door", state: "running" },
    { stream: "hallways-back_door-2416d3", display_name: "back_door", state: "failed" },
  ]);
  expect(controlOperationCallsReceivedBy(server)[0]).toEqual(["describe_stream_action", { action: "Rj12j3eujz3zn0dposliv79k9-9" }]);
});

test("describing_a_stream_action_reads_its_venv_sync_package_by_package_while_uv_downloads_and_once_it_installed", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-a-new-project-downloading-numpy-and-pillow.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-a-new-project-done-numpy-and-pillow-installed.json")),
  ]);

  expect(describedOf(answerOf(await server.client().describeStreamAction("Rvxjb0uiacgp6c3o13o9qvzj1-1"))).venv_sync).toEqual({
    phase: "downloading",
    packages_resolved: 9,
    packages_prepared: null,
    packages_installed: null,
    downloads_started: 4,
    downloads_done: 3,
    packages: [
      { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 5452595 },
      { name: "pillow", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 4823450 },
      { name: "numba", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 2726298 },
      { name: "llvmlite", version: null, kind: "distribution", state: "downloading", download_size_bytes: 40579891 },
    ],
  });
  const done = describedOf(answerOf(await server.client().describeStreamAction("Rvxjb0uiacgp6c3o13o9qvzj1-1")));
  expect(done).toMatchObject({ state: "done", step: null, venv_sync: { phase: "installed", packages_prepared: 4, packages_installed: 8, downloads_done: 4 } });
  expect(done.venv_sync?.packages.map((venvSyncPackage) => [venvSyncPackage.name, venvSyncPackage.version, venvSyncPackage.download_size_bytes])).toEqual([
    ["numpy", "2.5.4", 5452595],
    ["pillow", "13.0.0", 4823450],
    ["numba", "0.68.1", 2726298],
    ["llvmlite", "0.50.0", 40579891],
    ["tatolab-compositor", "0.68.59", null],
    ["tatolab-ops", "0.68.59", null],
    ["tatolab-stream", "0.68.59", null],
    ["tatolab-testpattern", "0.68.59", null],
  ]);
});

test("a_failed_action_reads_its_reason_one_the_tool_no_longer_holds_answers_its_words_and_a_json_rpc_error_stays_a_refusal", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-a-create-into-pattern-failed-on-its-files.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-refusal-for-an-action-not-held.json")),
    httpResponse("200 OK", "application/json", '{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"the runtime is shutting down"}}'),
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
    failureDescription: "the runtime refused `describe_stream_action`: the runtime is shutting down",
    isTheRuntimesRefusal: true,
  });
});

test("a_cancel_answers_cancelled_for_a_queued_action_and_in_progress_for_one_it_stops_at_its_step_the_action_then_read_cancelled", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-queued-run-of-slowpoke-cancelled.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-run-of-slowpoke-making-the-venv-in-progress.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-run-of-slowpoke-cancelled-while-making-the-venv.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-queued-stop-of-doorways-front-door-cancelled.json")),
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
    venv_sync: null,
  });
  expect(answerOf(await server.client().cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-12"))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-12", state: "cancelled" });
  expect(controlOperationCallsReceivedBy(server)[0]).toEqual(["cancel_stream_action", { action: "Ra19ljkh20wimdvgya5udt9v1-10" }]);
});

test("a_cancel_the_runtime_declines_carries_its_own_words_a_running_stop_past_cancelling_among_them", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-refusal-for-a-running-stop-of-doorways-front-door.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-refusal-for-an-action-already-cancelled.json")),
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
  expect(failureOf(streamActionCancelAnswerFromTheCancelStreamActionToolResult(JSON.parse('{"action":"R1-2"}')))).toBe(
    "the runtime's cancel_stream_action result could not be read: missing field `state`",
  );
  expect(failureOf(streamActionDescriptionFromTheDescribeStreamActionToolResult(JSON.parse('{"action":"R1-2","project_directory":"/tmp/p","kind":"load"}')))).toBe(
    "the runtime's describe_stream_action result could not be read: missing field `state`",
  );
  expect(failureOf(projectCreationQueuedFromTheCreateProjectToolResult(JSON.parse('{"action":"R1-2","project_directory":"/tmp/p"}')))).toBe(
    "the runtime's create_project result could not be read: missing field `stream`",
  );
});

test("a_chunked_response_is_dechunked", async () => {
  const server = await fakeLocalApiServerAnswering([Buffer.from("HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n")]);

  answerOf(await server.client().checkHealth());
});

/** Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`. */
const noLiveRuntimeSocketIsNamed = !process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"];
test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_answers_health_its_description_its_streams_their_graphs_logs_node_types_assets_and_dependencies_and_its_machine_name", async () => {
  const client = new LocalApiClient(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000);

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
    const assetListing = answerOf(await client.listProjectAssets(projectDirectory));
    expect(assetListing.assets.filter((asset) => asset.kind === "stream").length).toBeGreaterThanOrEqual(projectStreams.length);
    for (const previewedAsset of assetListing.assets.filter((asset) => asset.preview !== null)) {
      const picture = answerOf(await client.readAssetPreview(projectDirectory, previewedAsset.asset));
      expect([picture.pixel_width, picture.pixel_height, picture.media_type]).toEqual([previewedAsset.preview?.pixel_width, previewedAsset.preview?.pixel_height, previewedAsset.preview?.media_type]);
    }
    const wholeLog = answerOf(await client.readProjectLogRecords(projectDirectory, { stream: null, action: null }, null, null, 500));
    expect(wholeLog.project_directory).toBe(projectDirectory);
    expect(wholeLog.records.length).toBeGreaterThan(0);
    for (const projectStream of projectStreams) {
      const streamLog = answerOf(await client.readProjectLogRecords(projectDirectory, { stream: projectStream.stream, action: null }, null, null, 500));
      expect(streamLog.records.every((record) => record.stream === projectStream.stream)).toBe(true);
    }
  }

  const expectedStreamCount = process.env["TATOLAB_APP_LIVE_EXPECTED_STREAM_COUNT"];
  if (expectedStreamCount !== undefined) expect(streams.length).toBe(Number(expectedStreamCount));
});

test.skipIf(noLiveRuntimeSocketIsNamed)("a_real_runtime_names_its_stream_actions_under_way_on_subscribing_and_describes_each_on_the_same_connection", async () => {
  const opened = await TatolabRuntimeControlWebSocketConnection.open(process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "", 5_000);
  const connection = streamActionChangesConnectionOver(answerOf(opened));
  try {
    const actionsUnderWay = answerOf(await connection.subscribeToTheStreamActionChanges());
    for (const action of actionsUnderWay) expect(answerOf(await connection.describeTheStreamAction(action)).action).toBe(action);
    const finishedAction = process.env["TATOLAB_APP_LIVE_FINISHED_STREAM_ACTION"];
    if (finishedAction !== undefined) expect(answerOf(await connection.describeTheStreamAction(finishedAction)).action).toBe(finishedAction);
  } finally {
    connection.close();
  }
});

test("a_dependency_added_from_a_folder_or_a_zip_answers_the_import_the_runtime_copied", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-folder-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-tool-result-of-night-show-importing-the-zip-doorways.json")),
  ]);

  expect(answerOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/lobby-wall"))).toEqual({
    project: "dde5a62f-b0a8-45d2-a741-79140871f978",
    folder: "lobby-wall",
    source: "/tmp/tatolab-proof-projects/lobby-wall",
    version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82",
  });
  expect(answerOf(await server.client().addDependency("/tmp/tatolab-proof-projects/night-show", "/tmp/tatolab-proof-projects/doorways.zip"))).toMatchObject({ folder: "doorways", source: "/tmp/tatolab-proof-projects/doorways.zip" });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/lobby-wall" }],
    ["add_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", source: "/tmp/tatolab-proof-projects/doorways.zip" }],
  ]);
});

test("a_dependency_removed_answers_the_import_the_runtime_took_out_and_a_refused_removal_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-dependency-tool-result-of-night-show-removing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-dependency-refusal-for-a-project-not-imported.json")),
  ]);

  expect(answerOf(await server.client().removeDependency("/tmp/tatolab-proof-projects/night-show", "92c01338-ae3e-400f-aef1-4e791b0150b8"))).toEqual({
    project: "92c01338-ae3e-400f-aef1-4e791b0150b8",
    folder: "lobby-wall",
    source: "/tmp/tatolab-proof-projects/lobby-wall",
    version: "a33a4a3c5ebb6cbc2d878536e95327f8135ab0a1938f096bcac4c0c30c9b70ad",
  });
  expect(failureOf(await server.client().removeDependency("/tmp/tatolab-proof-projects/night-show", "00000000-0000-4000-8000-000000000000"))).toEqual({
    failureDescription: "remove_dependency failed: the project imports no project 00000000-0000-4000-8000-000000000000",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["remove_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "92c01338-ae3e-400f-aef1-4e791b0150b8" }],
    ["remove_dependency", { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "00000000-0000-4000-8000-000000000000" }],
  ]);
});

test("a_dependency_the_runtime_refuses_to_add_carries_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-a-folder-that-is-not-a-project.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-lobby-wall-imported-already.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-add-dependency-refusal-for-requirements-uv-could-not-resolve-offline.json")),
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-edited-since-its-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-tool-result-of-lobby-wall-overwriting-its-edits.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-update-dependency-refusal-for-a-project-not-imported.json")),
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
  expect(controlOperationCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: lobbyWall, overwrite_edited_files: true },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", project: "00000000-0000-4000-8000-000000000000", overwrite_edited_files: false },
  ]);
});

test("the_dependencies_listed_carry_their_edited_files_and_with_a_check_whether_their_source_holds_a_newer_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-the-project-night-show-importing-nothing.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-importing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-dependencies-tool-result-of-night-show-with-lobby-wall-edited-and-newer-on-its-source.json")),
  ]);
  const lobbyWall = { project: "dde5a62f-b0a8-45d2-a741-79140871f978", folder: "lobby-wall", source: "/tmp/tatolab-proof-projects/lobby-wall", version: "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82" };

  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", false))).toEqual([]);
  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", false))).toEqual([
    { dependency: lobbyWall, edited_files: [], newer_version_exists: null, check_refused_because: null },
  ]);
  expect(answerOf(await server.client().listDependencies("/tmp/tatolab-proof-projects/night-show", true))).toEqual([
    { dependency: lobbyWall, edited_files: ["nodes/brightness_meter.py"], newer_version_exists: true, check_refused_because: null },
  ]);
  expect(controlOperationCallsReceivedBy(server).map(([, toolArguments]) => toolArguments)).toEqual([
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: false },
    { project_directory: "/tmp/tatolab-proof-projects/night-show", check_for_newer: true },
  ]);
});

/** The operation and params of each `POST /control` `server` read, in order. */
function controlOperationCallsReceivedBy(server: FakeLocalApiServer): [string | undefined, unknown][] {
  return server.receivedRequests().map((request) => {
    const [head, body] = headAndBodyOf(request);
    expect(head.startsWith("POST /control HTTP/1.1\r\n"), head).toBe(true);
    const requestBody: { method: string; params: unknown } = JSON.parse(body);
    return [requestBody.method, requestBody.params];
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-registry-answer-of-a-test-root-runtime-naming-no-stream.json")),
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
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheResultText(listingText)]);

  const listing = answerOf(await server.client().listProjectNodeTypes("/w/pattern"));

  expect(listing.project_name).toBe("pattern");
  expect(listing.sources.map((source) => source.origin)).toEqual([{ source: "project" }]);
  const [, body] = headAndBodyOf(server.receivedRequests()[0]);
  expect(JSON.parse(body).method).toBe("list_project_node_types");
  expect(JSON.parse(body).params).toEqual({ project_directory: "/w/pattern" });
});

test("a_node_type_listing_the_runtime_refuses_carries_its_own_words", async () => {
  const refusal = "list_project_node_types failed: the project's interpreter printed no listing";
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse(refusal)]);

  expect(failureOf(await server.client().listProjectNodeTypes("/w/pattern")).failureDescription).toBe(refusal);
});

test("a_real_node_type_listing_reads_the_projects_node_types_generator_unreadable_module_and_installed_distribution", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-result-of-a-project-with-a-module-that-does-not-parse.json")),
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(failureOf(await server.client().listProjectNodeTypes("/private/tmp/tatolab-proof-185/not-a-project")).failureDescription).toBe(
    "list_project_node_types failed: /private/tmp/tatolab-proof-185/not-a-project holds no project: it has no tatolab-project.json",
  );
});

test("a_real_node_type_listing_of_a_project_with_imports_lists_each_import_by_its_uuid_folder_and_version", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-node-types-tool-result-of-night-show-importing-doorways-and-lobby-wall.json")),
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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-the-project-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-the-import-lobby-wall-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json")),
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
  expect(controlOperationCallsReceivedBy(server).map(([toolName]) => toolName)).toEqual(["list_assets", "list_assets", "list_assets"]);
});

test("a_real_asset_listing_sizes_an_images_preview_picture_and_a_video_whose_poster_frame_did_not_decode_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-harbour-lights-holding-a-previewed-image-and-a-video-with-no-poster.json")),
  ]);
  const listing = answerOf(await server.client().listProjectAssets(RECORDED_HARBOUR_LIGHTS));
  expect(listing.assets.map((asset) => [asset.path, asset.preview])).toEqual([
    ["media/harbour-dusk.png", { pixel_width: 512, pixel_height: 320, media_type: "image/png" }],
    ["media/quay-walk.mp4", null],
    ["streams/main.graph.json", null],
  ]);
  expect(listing.assets.map((asset) => [asset.path, asset.media_its_bytes_hold])).toEqual([
    ["media/harbour-dusk.png", ["image"]],
    ["media/quay-walk.mp4", ["video"]],
    ["streams/main.graph.json", null],
  ]);
});

test("a_real_preview_picture_read_answers_the_png_and_a_video_with_no_poster_frame_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-tool-result-of-harbour-dusk-png.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-refusal-for-quay-walk-mp4-with-no-poster-frame.json")),
  ]);
  const picture = answerOf(await server.client().readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_HARBOUR_DUSK_PNG));
  expect([picture.pixel_width, picture.pixel_height, picture.media_type, picture.picture_bytes.length]).toEqual([512, 320, "image/png", 36974]);
  expect(picture.picture_bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect(failureOf(await server.client().readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_QUAY_WALK_MP4)).failureDescription).toBe(
    "read_asset_preview failed: asset 23199eb3-ea3c-4d31-8f0f-2bf9395590d2 has no preview picture; the runtime makes one for an image",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    [
      "read_asset_preview",
      {
        project_directory: RECORDED_HARBOUR_LIGHTS,
        asset: RECORDED_HARBOUR_DUSK_PNG,
      },
    ],
    [
      "read_asset_preview",
      {
        project_directory: RECORDED_HARBOUR_LIGHTS,
        asset: RECORDED_QUAY_WALK_MP4,
      },
    ],
  ]);
});

test("a_preview_picture_answered_for_another_asset_is_refused", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-tool-result-of-harbour-dusk-png.json"))]);
  expect(failureOf(await server.client().readAssetPreview(RECORDED_HARBOUR_LIGHTS, RECORDED_QUAY_WALK_MP4)).failureDescription).toBe(
    `the runtime's read_asset_preview result could not be read: it answers the asset ${RECORDED_HARBOUR_DUSK_PNG}, not ${RECORDED_QUAY_WALK_MP4}`,
  );
});

test("a_real_asset_listing_lists_each_imported_file_and_graph_document_and_a_folder_that_is_not_a_project_is_refused_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-lobby-camera-holding-a-video-an-image-and-a-lut.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);
  const lobbyCameraFolder = "/tmp/claude-0/-home-user/4632618e-7712-59e1-9bd8-72d7c92c4d42/scratchpad/live/home/Tato Studio/Lobby Camera";

  const listing = answerOf(await server.client().listProjectAssets(lobbyCameraFolder));
  expect([listing.project_directory, listing.project, listing.project_name]).toEqual([lobbyCameraFolder, "9ffa289f-60a1-48ed-a867-f19e3726aa96", "Lobby Camera"]);
  expect(listing.assets.map((asset) => [asset.kind, asset.path, asset.content_byte_len])).toEqual([
    ["data", "luts/warm.cube", 75],
    ["media", "media/lobby-intro.mp4", 48493],
    ["media", "media/poster.png", 11194],
    ["stream", "streams/main.graph.json", 336],
  ]);
  expect(listing.assets[1]).toEqual({
    asset: "207ef246-3d00-4167-b394-bb591f7c4b8f",
    kind: "media",
    path: "media/lobby-intro.mp4",
    content_sha256: "16e89515f01295ded2534fd319db70fbd6bce1e95ed619b0127105489cc82700",
    content_byte_len: 48493,
    import_settings: {},
    preview: null,
    media_its_bytes_hold: null,
  });
  expect(failureOf(await server.client().listProjectAssets("/tmp/tatolab-proof-projects/not-a-project")).failureDescription).toBe(
    "list_assets failed: /tmp/tatolab-proof-projects/not-a-project holds no project: it has no tatolab-project.json",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["list_assets", { project_directory: lobbyCameraFolder }],
    ["list_assets", { project_directory: "/tmp/tatolab-proof-projects/not-a-project" }],
  ]);
});

test("a_node_type_listing_waits_past_the_ordinary_request_timeout_for_the_projects_interpreter", async () => {
  const listingText = JSON.stringify({ project_directory: "/w/pattern", project: "p", project_name: "pattern", sources: [] });
  const server = await FakeLocalApiServer.answering([controlOperationResponseOfTheResultText(listingText)], 300);
  cleanUps.push(() => server.close());
  const clientWithAShortRequestTimeout = new LocalApiClient(server.localApiSocketPath, 100);

  expect(answerOf(await clientWithAShortRequestTimeout.listProjectNodeTypes("/w/pattern")).project_name).toBe("pattern");
});

test("undo_and_redo_ask_the_runtime_by_the_author_and_answer_the_transaction_or_the_runtimes_refusal_in_its_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-redo-tool-result-of-sam-redoing-their-import-into-lobby.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-refusal-for-sam-with-nothing-left-to-undo.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;
  const projectFolder = "/tmp/claude-0/-home-user/e49a0dd5-7a95-5fdd-b9ce-70d350d7c52d/scratchpad/streams/lobby";

  const undone = answerOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(answerOf(await server.client().redoInTheProject(projectFolder, sam)).redoes).toBe(undone.undoes);
  const refusal = failureOf(await server.client().undoInTheProject(projectFolder, sam));
  expect(refusal).toMatchObject({ isTheRuntimesRefusal: true, failureDescription: "undo failed: Sam has no transaction left to undo" });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["undo", { project_directory: projectFolder, author: sam }],
    ["redo", { project_directory: projectFolder, author: sam }],
    ["undo", { project_directory: projectFolder, author: sam }],
  ]);
});

const SAM_EDITING_IN_STUDIO = { kind: "person", name: "sam" } as const;

test("an_undo_of_the_persons_graph_edit_answers_each_operation_by_its_stream_asset_with_from_and_to_swapped", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-a-person-undoing-a-rename-and-a-pin-value-sent-from-studio.json")),
  ]);
  const undone = answerOf(await server.client().undoInTheProject("/home/user/projects/hallways", { kind: "person", name: "user" }));
  expect(undone).toMatchObject({
    author_kind: "person",
    author_name: "user",
    operations: [
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "set_pin_value", input: "value", from: 0.25, to: 0.5 },
      { stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", operation: "rename_node", from: "half", to: "constant" },
    ],
  });
});

test("a_graph_transaction_is_sent_as_the_runtimes_transact_by_the_person_editing_and_answers_what_it_applied_a_retry_under_its_key_answering_the_first", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-adding-hold-frame-wired-to-the-test-pattern-in-hallways.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-the-hold-frame-add-sent-again-under-the-same-idempotency-key.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-adding-a-constant-holding-a-half.json")),
  ]);
  const streamAsset = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
  const addHoldFrameWiredToTheTestPattern = [
    { operation: "add_node", stream: streamAsset, type: "tatolab.ops:HoldFrame", as: "hold" },
    { operation: "connect", stream: streamAsset, source: { node: testPattern, port: "video" }, target: { node: "hold", port: "frame" } },
  ] as const;
  const gesture = "7d1f8c52-3b0e-4a39-9a51-2f6a0b9c4e11";

  const first = answerOf(await server.client().transactOnTheStreamGraphs(addHoldFrameWiredToTheTestPattern, "commit", gesture, SAM_EDITING_IN_STUDIO));
  const retry = answerOf(await server.client().transactOnTheStreamGraphs(addHoldFrameWiredToTheTestPattern, "commit", gesture, SAM_EDITING_IN_STUDIO));
  const addAConstantHoldingAHalf = [{ operation: "add_node", stream: streamAsset, type: "tatolab.ops:Constant", pins: { value: 0.5 }, as: "c" }] as const;
  const constant = answerOf(await server.client().transactOnTheStreamGraphs(addAConstantHoldingAHalf, "commit", null, SAM_EDITING_IN_STUDIO));

  if (first.kind !== "applied" || retry.kind !== "applied" || constant.kind !== "applied") return expect.unreachable("every transaction applied");
  expect(first.transaction).toMatchObject({
    mode: "commit",
    transaction: "918d0afc-9357-4e3a-92f2-9b8cf1cb8b47",
    added_nodes: [{ stream: "hallways-main-3990b7", node: "d28273fd-8094-41f7-b832-a55f58d60f37", name: "holdframe", as: "hold" }],
    connected_links: [
      { stream: "hallways-main-3990b7", source: { node: testPattern, port: "video" }, target: { node: "d28273fd-8094-41f7-b832-a55f58d60f37", port: "frame" }, state: "wired", error_reason: null },
    ],
    added_groups: [],
    added_notes: [],
  });
  expect(retry.transaction.transaction).toBe(first.transaction.transaction);
  expect(constant.transaction.operations).toHaveLength(2);
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addHoldFrameWiredToTheTestPattern, mode: "commit", author: SAM_EDITING_IN_STUDIO, idempotency_key: gesture }],
    ["transact", { operations: addAConstantHoldingAHalf, mode: "commit", author: SAM_EDITING_IN_STUDIO }],
  ]);
});

test("a_drags_live_edits_answer_no_transaction_and_its_commit_under_the_same_key_answers_the_change_from_the_saved_value", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-a-live-pin-value-mid-drag.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-tool-result-of-the-drags-commit-from-the-saved-value.json")),
  ]);
  const setTheValue = (value: number) => [{ operation: "set_pin_value", stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", node: "cbbe8192-d3a7-4208-9c4d-3ad78cd04910", input: "value", value }] as const;
  const gesture = "9c0e5d2a-41b7-4f3e-8a6d-1b2c3d4e5f60";

  const live = answerOf(await server.client().transactOnTheStreamGraphs(setTheValue(0.1), "live", gesture, SAM_EDITING_IN_STUDIO));
  const committed = answerOf(await server.client().transactOnTheStreamGraphs(setTheValue(0.3), "commit", gesture, SAM_EDITING_IN_STUDIO));

  expect(live).toMatchObject({ kind: "applied", transaction: { mode: "live", transaction: null, commit: null, operations: [{ operation: "set_pin_value", from: 0.5, to: 0.1 }] } });
  expect(committed).toMatchObject({ kind: "applied", transaction: { mode: "commit", transaction: expect.any(String), operations: [{ operation: "set_pin_value", from: 0.5, to: 0.3 }] } });
});

test("a_refused_graph_transaction_answers_the_runtimes_structured_refusal_naming_the_node_the_link_or_the_field", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-a-rename-to-a-name-another-node-has.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-an-image-output-into-a-channels-input.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-transact-refusal-for-a-pin-value-on-an-input-holdframe-lacks.json")),
  ]);
  const streamAsset = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const holdFrame = "d28273fd-8094-41f7-b832-a55f58d60f37";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";

  const rename = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "rename_node", stream: streamAsset, node: holdFrame, name: "testpatternsource" }], "commit", null, SAM_EDITING_IN_STUDIO));
  const link = { source: { node: testPattern, port: "video" }, target: { node: holdFrame, port: "refresh" } };
  const connect = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "connect", stream: streamAsset, ...link }], "commit", null, SAM_EDITING_IN_STUDIO));
  const pin = answerOf(await server.client().transactOnTheStreamGraphs([{ operation: "set_pin_value", stream: streamAsset, node: holdFrame, input: "no_such_input", value: 1 }], "commit", null, SAM_EDITING_IN_STUDIO));

  expect(rename).toMatchObject({ kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_node: holdFrame, refused_link: null, refused_field: null } });
  if (rename.kind !== "refused") return expect.unreachable("the rename was refused");
  expect(rename.refusal.runtime_words).toMatch(/^the node name `testpatternsource` casts to `testpatternsource`, which node `testpatternsource` in this graph already has/);
  expect(connect).toEqual({
    kind: "refused",
    refusal: {
      action: "transact",
      refused_operation_index: 0,
      refused_node: null,
      refused_link: link,
      refused_field: null,
      runtime_words:
        "Invalid link: cannot link testpatternsource.video (Image) to holdframe.refresh (Channels): a link joins two ports of one family; no one node converts between them; chain the conversion nodes that do",
    },
  });
  expect(pin).toEqual({
    kind: "refused",
    refusal: { action: "transact", refused_operation_index: 0, refused_node: holdFrame, refused_link: null, refused_field: "no_such_input", runtime_words: "Processor 'holdframe' has no input port named 'no_such_input'" },
  });
});

test("a_graph_transaction_refused_with_no_structured_refusal_fails_in_the_runtimes_own_words", async () => {
  const server = await fakeLocalApiServerAnswering([controlOperationFailedResponse("transact failed: the runtime is shutting down")]);

  const failure = failureOf(await server.client().transactOnTheStreamGraphs([{ operation: "remove_node", stream: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68", node: "n" }], "live", null, SAM_EDITING_IN_STUDIO));

  expect(failure).toEqual({ isTheRuntimesRefusal: true, failureDescription: "transact failed: the runtime is shutting down" });
});

test("renaming_a_project_calls_rename_project_with_its_folder_and_name_and_reads_its_name_now_and_a_blank_name_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-rename-project-answer-for-night-show-renamed-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-rename-project-refusal-for-a-name-that-shows-nothing.json")),
  ]);

  expect(answerOf(await server.client().renameProject("/tmp/tatolab-proof-projects/night-show", "Night Show"))).toBe("Night Show");
  expect(failureOf(await server.client().renameProject("/tmp/tatolab-proof-projects/night-show", "   "))).toEqual({
    failureDescription: "rename_project failed: a project's name cannot be blank",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["rename_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", name: "Night Show" }],
    ["rename_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", name: "   " }],
  ]);
});

test("duplicating_a_project_calls_duplicate_project_into_a_new_folder_and_reads_the_duplicate_and_a_folder_already_there_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-duplicate-project-answer-for-night-show-into-night-show-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-duplicate-project-refusal-for-a-folder-already-there.json")),
  ]);
  const into = "/tmp/tatolab-proof-projects/night-show copy";

  expect(answerOf(await server.client().duplicateProject("/tmp/tatolab-proof-projects/night-show", into))).toEqual({
    folder: into,
    project: "03784927-d486-46f1-a0d8-a1768485f601",
    name: "Night Show copy",
  });
  expect(failureOf(await server.client().duplicateProject("/tmp/tatolab-proof-projects/night-show", into)).failureDescription).toBe(
    "duplicate_project failed: /tmp/tatolab-proof-projects/night-show copy already exists, so the project was not duplicated into it",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["duplicate_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", into }],
    ["duplicate_project", { project_directory: "/tmp/tatolab-proof-projects/night-show", into }],
  ]);
});

test("importing_a_project_zip_calls_import_project_with_the_zip_and_a_new_folder_and_reads_the_project_made_and_a_zip_holding_none_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-project-answer-for-night-show-zip-into-imported-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-project-refusal-for-a-zip-holding-no-project.json")),
  ]);

  expect(answerOf(await server.client().importProject("/tmp/tatolab-proof-projects/night-show.zip", "/tmp/tatolab-proof-projects/imported-show"))).toEqual({
    folder: "/tmp/tatolab-proof-projects/imported-show",
    project: "cba1d286-8a36-4113-bf10-8630cf9a52b2",
    name: "Night Show",
  });
  expect(failureOf(await server.client().importProject("/tmp/tatolab-proof-projects/notes.zip", "/tmp/tatolab-proof-projects/imported-notes")).failureDescription).toBe(
    "import_project failed: /tmp/tatolab-proof-projects/notes.zip holds no project to import: it has no `tatolab-project.json` at its root",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["import_project", { source: "/tmp/tatolab-proof-projects/night-show.zip", project_directory: "/tmp/tatolab-proof-projects/imported-show" }],
    ["import_project", { source: "/tmp/tatolab-proof-projects/notes.zip", project_directory: "/tmp/tatolab-proof-projects/imported-notes" }],
  ]);
});

test("deleting_a_project_queues_delete_project_answering_its_action_which_is_followed_to_done_and_a_folder_holding_no_project_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-project-answer-queueing-the-deletion-of-night-show-copy.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-deletion-of-night-show-copy-done.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-project-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.client().deleteProject("/tmp/tatolab-proof-projects/night-show copy"))).toBe("Rumdndppudfu1hageszz80pom-2");
  expect(answerOf(await server.client().describeStreamAction("Rumdndppudfu1hageszz80pom-2"))).toMatchObject({
    kind: "described",
    description: { action: "Rumdndppudfu1hageszz80pom-2", kind: "delete", state: "done", streams: [], failed_because: null },
  });
  expect(failureOf(await server.client().deleteProject("/tmp/tatolab-proof-projects/nothing-here")).failureDescription).toBe(
    "Resource not found: /tmp/tatolab-proof-projects/nothing-here holds no project: it has no tatolab-project.json, so there is none to delete",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["delete_project", { project_directory: "/tmp/tatolab-proof-projects/night-show copy" }],
    ["describe_stream_action", { action: "Rumdndppudfu1hageszz80pom-2" }],
    ["delete_project", { project_directory: "/tmp/tatolab-proof-projects/nothing-here" }],
  ]);
});

test("summarizing_a_project_reads_its_name_description_and_last_edit_from_list_assets_and_a_project_never_described_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-described-and-edited.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-copy-with-no-description-or-cover.json")),
  ]);

  expect(answerOf(await server.client().summarizeTheProject("/tmp/tatolab-proof-projects/night-show"))).toMatchObject({
    name: "Night Show",
    description: "Projection for the night market: a test pattern into a brightness meter.",
    last_edited_at_wall_clock_ms: 1_794_335_926_000,
  });
  expect(answerOf(await server.client().summarizeTheProject("/tmp/tatolab-proof-projects/night-show copy"))).toMatchObject({
    name: "Night Show copy",
    description: null,
    last_edited_at_wall_clock_ms: 1_794_335_872_000,
  });
});

test("a_project_covered_by_a_media_asset_is_summarized_with_that_assets_path_and_one_with_no_cover_has_none", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-covered-by-cover-art.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-assets-tool-result-of-night-show-copy-with-no-description-or-cover.json")),
  ]);

  expect(answerOf(await server.client().summarizeTheProject("/tmp/tatolab-proof-projects/night-show"))).toMatchObject({ name: "Night Market", cover_path: "media/cover-art.png" });
  expect(answerOf(await server.client().summarizeTheProject("/tmp/tatolab-proof-projects/night-show copy"))).toMatchObject({ cover_path: null });
});

test("describing_a_project_calls_set_project_description_and_reads_its_settings_after_and_a_folder_holding_no_project_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-description-answer-for-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-description-refusal-for-a-folder-that-is-not-a-project.json")),
  ]);

  expect(answerOf(await server.client().setProjectDescription("/tmp/tatolab-proof-projects/night-show", "Projection for the night market."))).toEqual({
    name: "Night Market",
    description: "Projection for the night market.",
    cover: "7593be3b-210b-4656-ab21-2213bfa307b5",
  });
  expect(failureOf(await server.client().setProjectDescription("/tmp/tatolab-proof-projects/nothing-here", null))).toEqual({
    failureDescription: "set_project_description failed: /tmp/tatolab-proof-projects/nothing-here holds no project: it has no tatolab-project.json",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["set_project_description", { project_directory: "/tmp/tatolab-proof-projects/night-show", description: "Projection for the night market." }],
    ["set_project_description", { project_directory: "/tmp/tatolab-proof-projects/nothing-here", description: null }],
  ]);
});

test("an_asset_the_person_imports_naming_no_path_lands_in_its_kinds_folder_numbered_past_a_name_taken_recorded_under_them_and_answered_by_its_uuid_and_path", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-answer-for-poster-png-numbered-poster-3-in-media-imported-by-a-person.json")),
  ]);
  const tidePool = "/tmp/tatolab-proof-projects/tide-pool";

  expect(answerOf(await server.client().importAsset(tidePool, "/tmp/poster.png", null, { kind: "person", name: "sam" }))).toEqual({
    asset: "d18ac59c-d741-45fc-8d21-d3febd0d14a0",
    path: "media/poster-3.png",
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([["import_asset", { project_directory: tidePool, source: "/tmp/poster.png", author: { kind: "person", name: "sam" } }]]);
});

test("covering_a_project_imports_the_image_with_import_asset_then_names_it_with_set_project_cover_and_each_refusal_is_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-answer-for-cover-art-png-into-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-refusal-for-a-path-night-show-already-holds.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-cover-answer-for-night-show-covered-by-cover-art.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-project-cover-refusal-for-an-asset-night-show-does-not-hold.json")),
  ]);
  const nightShow = "/tmp/tatolab-proof-projects/night-show";

  expect(answerOf(await server.client().importAsset(nightShow, "/tmp/cover-art.png", "media/cover-art.png", null))).toEqual({ asset: "7593be3b-210b-4656-ab21-2213bfa307b5", path: "media/cover-art.png" });
  expect(failureOf(await server.client().importAsset(nightShow, "/tmp/cover-art.png", "media/cover-art.png", null)).failureDescription).toBe(
    "import_asset failed: `media/cover-art.png` is already the path of the asset 7593be3b-210b-4656-ab21-2213bfa307b5",
  );
  expect(answerOf(await server.client().setProjectCover(nightShow, "7593be3b-210b-4656-ab21-2213bfa307b5"))).toMatchObject({ cover: "7593be3b-210b-4656-ab21-2213bfa307b5" });
  expect(failureOf(await server.client().setProjectCover(nightShow, "00000000-0000-4000-8000-000000000000")).failureDescription).toBe(
    "set_project_cover failed: the project holds no asset 00000000-0000-4000-8000-000000000000",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["import_asset", { project_directory: nightShow, source: "/tmp/cover-art.png", asset_path: "media/cover-art.png" }],
    ["import_asset", { project_directory: nightShow, source: "/tmp/cover-art.png", asset_path: "media/cover-art.png" }],
    ["set_project_cover", { project_directory: nightShow, cover: "7593be3b-210b-4656-ab21-2213bfa307b5" }],
    ["set_project_cover", { project_directory: nightShow, cover: "00000000-0000-4000-8000-000000000000" }],
  ]);
});

test("an_asset_the_person_renames_or_moves_keeps_its_uuid_at_its_new_path_recorded_under_them_and_a_path_another_asset_takes_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-answer-for-poster-png-renamed-to-harbour-poster-png-by-a-person.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-answer-for-harbour-poster-png-moved-into-media-posters.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-refusal-for-a-path-another-asset-of-harbour-lights-takes.json")),
  ]);
  const harbourLights = "/tmp/tatolab-proof-projects/harbour-lights";
  const poster = "7fc01c14-399c-4749-a45b-2c99a77ce0a6";
  const sam = { kind: "person", name: "sam" } as const;

  expect(answerOf(await server.client().relocateAsset(harbourLights, poster, "media/harbour-poster.png", sam))).toEqual({ asset: poster, path: "media/harbour-poster.png" });
  expect(answerOf(await server.client().relocateAsset(harbourLights, poster, "media/posters/harbour-poster.png", sam))).toEqual({ asset: poster, path: "media/posters/harbour-poster.png" });
  expect(failureOf(await server.client().relocateAsset(harbourLights, poster, "media/opening.png", sam))).toEqual({
    failureDescription: "relocate_asset failed: `media/opening.png` is already the path of the asset 4ce7c229-734b-4210-9bb5-e321bf4183de",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/harbour-poster.png", author: sam }],
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/posters/harbour-poster.png", author: sam }],
    ["relocate_asset", { project_directory: harbourLights, asset: poster, to_path: "media/opening.png", author: sam }],
  ]);
});

test("an_asset_the_person_deletes_is_answered_as_it_was_recorded_under_them_and_one_the_project_does_not_hold_is_refused_in_the_runtimes_words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-answer-for-opening-png-deleted-by-a-person.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-refusal-for-an-asset-harbour-lights-does-not-hold.json")),
  ]);
  const harbourLights = "/tmp/tatolab-proof-projects/harbour-lights";
  const sam = { kind: "person", name: "sam" } as const;

  expect(answerOf(await server.client().deleteAsset(harbourLights, "4ce7c229-734b-4210-9bb5-e321bf4183de", sam))).toEqual({ asset: "4ce7c229-734b-4210-9bb5-e321bf4183de", path: "media/opening.png" });
  expect(failureOf(await server.client().deleteAsset(harbourLights, "00000000-0000-4000-8000-000000000000", sam))).toEqual({
    failureDescription: "delete_asset failed: the project holds no asset 00000000-0000-4000-8000-000000000000",
    isTheRuntimesRefusal: true,
  });
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["delete_asset", { project_directory: harbourLights, asset: "4ce7c229-734b-4210-9bb5-e321bf4183de", author: sam }],
    ["delete_asset", { project_directory: harbourLights, asset: "00000000-0000-4000-8000-000000000000", author: sam }],
  ]);
});

const RECORDED_NIGHT_SHOW = "/tmp/tl-rec/projects/night-show";

test("project files are listed, read whole as bytes, and written as one transaction by the author under a key, each through the runtime's file tools, a refusal in its own words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-night-show-under-nodes.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-nodes-camera-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-views-deck-icon-png.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-tool-result-of-night-show-imports-lobby-wall-views-meter-manifest.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-project-file-refusal-for-a-path-outside-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-tool-result-of-sam-saving-night-show-nodes-camera-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-refusal-for-a-file-under-imports-of-night-show.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-project-file-refusal-for-content-night-show-already-holds.json")),
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
    transaction: "841dea3f-0f85-44f6-a3bf-7ab09d1fa179",
    commit: "bbd985b362ad3ff5e7154324bcd13d19022e9ff2",
  });
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "imports/lobby-wall/views/meter/index.html", "<p></p>\n", sam, "save-2")).failureDescription).toBe(
    "write_project_file failed: the file `imports/lobby-wall/views/meter/index.html` is not written with write_project_file: an import's files are edited by opening `imports/<folder>/` as a project of its own",
  );
  expect(failureOf(await server.client().writeProjectFile(RECORDED_NIGHT_SHOW, "nodes/camera.py", "import streamlib\n", sam, "save-3")).failureDescription).toBe(
    "write_project_file failed: `nodes/camera.py` already holds this content, so the write has nothing to change",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
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

const RECORDED_S07_CODE = "/tmp/tatolab-proof-projects/s07-code";

test("a new node file is created from the runtime's node template as one transaction by the author under a key, answering the node type it declares, a refusal in the runtime's own words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-tool-result-of-sam-creating-s07-code-nodes-invert-py.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-refusal-for-a-file-s07-code-already-holds.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-node-file-refusal-for-a-path-not-importable-as-a-python-module.json")),
  ]);
  const sam = { kind: "person", name: "Sam" } as const;

  expect(answerOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/invert.py", sam, "create-1"))).toEqual({
    path: "nodes/invert.py",
    node_type: "nodes.invert:Invert",
    transaction: "9c38b2ef-7d8b-4d89-b6fd-c226ca507521",
    commit: "665925378946a3db63451a5eff799202db9bc04b",
  });
  expect(failureOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/invert.py", sam, "create-2"))).toMatchObject({
    isTheRuntimesRefusal: true,
    failureDescription: "create_node_file failed: the project already holds `nodes/invert.py`, and a new file is never written over it",
  });
  expect(failureOf(await server.client().createNodeFile(RECORDED_S07_CODE, "nodes/my-effect.py", sam, "create-3")).failureDescription).toBe(
    "create_node_file failed: `nodes/my-effect.py` is not importable as a Python module: `my-effect` is not a Python identifier; use letters, digits and `_`, not starting with a digit",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/invert.py", author: sam, idempotency_key: "create-1" }],
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/invert.py", author: sam, idempotency_key: "create-2" }],
    ["create_node_file", { project_directory: RECORDED_S07_CODE, path: "nodes/my-effect.py", author: sam, idempotency_key: "create-3" }],
  ]);
});

test("undoing a save is the runtime's undo of the write_project_file transaction that recorded it", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-save-of-night-show-nodes-camera-py.json")),
  ]);

  const undone = answerOf(await server.client().undoInTheProject(RECORDED_NIGHT_SHOW, { kind: "person", name: "Sam" }));

  expect(undone.undoes).toBe("c394e90f-a850-4603-81c3-8d25ba25ea76");
});

test("a project's views are listed from its views/ folders and its imports', each that does not open with the runtime's reason, and a folder that is not a project refused in its words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-refusal-for-a-folder-that-is-not-a-project.json")),
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

test("a value a view writes is handed to its node's output with the stream, the node's UUID and the port, and a stream that is not loaded refused in the runtime's words", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-studio-view-output-tool-result-of-the-deck-node-cue.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-studio-view-output-refusal-for-the-stopped-stream-night-show.json")),
  ]);
  const deckNode = "fdca90ae-f25d-4551-86e2-11f5cdb65d16";

  expect(answerOf(await server.client().writeStudioViewOutput("night-show-main-aa298d", deckNode, "cue", { track: "Opening" }))).toEqual({ stream: "night-show-main-aa298d", node: deckNode, port: "cue" });
  expect(failureOf(await server.client().writeStudioViewOutput("night-show-main-aa298d", deckNode, "cue", { track: "Opening" })).failureDescription).toBe(
    "write_studio_view_output failed: Resource not found: no stream with the id `night-show-main-aa298d` is loaded in this runtime. Loaded: lobby-wall-main-c95d53",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["write_studio_view_output", { stream: "night-show-main-aa298d", node: deckNode, port: "cue", value: { track: "Opening" } }],
    ["write_studio_view_output", { stream: "night-show-main-aa298d", node: deckNode, port: "cue", value: { track: "Opening" } }],
  ]);
});

/** `write_graph_input` hands a stream's top-level Input a value, recorded nowhere, and each refusal reaches the caller in the runtime's own words. */
test("writing a Graph Input calls write_graph_input with the stream, the Input and the value, reads the family it carries, and is refused in the runtime's own words for an undeclared Input, a value of another family and a stopped project", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-tool-result-of-s06-perform-brightness.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-tool-result-of-s06-perform-cue.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-refusal-for-an-input-s06-perform-does-not-declare.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-refusal-for-words-to-the-channels-input-brightness.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-refusal-for-the-stopped-project-s06-perform.json")),
  ]);
  const stream = "s06-perform-main-0df4a7";

  expect(answerOf(await server.client().writeGraphInput(stream, "brightness", 0.8))).toEqual({ stream, input: "brightness", family: "channels" });
  expect(answerOf(await server.client().writeGraphInput(stream, "cue", { scene: "finale" }))).toEqual({ stream, input: "cue", family: "records" });
  expect(failureOf(await server.client().writeGraphInput(stream, "contrast", 0.3)).failureDescription).toBe(
    "write_graph_input failed: Processor not found: no `GraphInput` on the top level of the stream `s06-perform-main-0df4a7` declares the Input `contrast` and runs; a client writes the Inputs of family array, channels or records, and the stream's are: `brightness`, `cue`",
  );
  expect(failureOf(await server.client().writeGraphInput(stream, "brightness", "bright")).failureDescription).toBe(
    'write_graph_input failed: Port error: output `value` of node `graphinput` carries Channels, and a Channels value is a number, a bool or `{"samples": [[...], ...], "sample_rate"}`',
  );
  expect(failureOf(await server.client().writeGraphInput(stream, "brightness", 0.4)).failureDescription).toBe(
    "write_graph_input failed: Runtime error: the project of the stream `s06-perform-main-0df4a7` in /tmp/tatolab-proof-projects/s06-perform is stopped, so no node of it runs to publish on `value`; `start_playback` plays it",
  );
  expect(controlOperationCallsReceivedBy(server)).toEqual([
    ["write_graph_input", { stream, input: "brightness", value: 0.8 }],
    ["write_graph_input", { stream, input: "cue", value: { scene: "finale" } }],
    ["write_graph_input", { stream, input: "contrast", value: 0.3 }],
    ["write_graph_input", { stream, input: "brightness", value: "bright" }],
    ["write_graph_input", { stream, input: "brightness", value: 0.4 }],
  ]);
});
test("the_listing_reads_a_closed_projects_streams_closed_and_unloaded_beside_a_playing_and_a_stopped_one", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-playing-a-stopped-and-a-closed-project.json")),
  ]);

  expect(answerOf(await server.client().listStreams()).map((listedStream) => [listedStream.stream, listedStream.state, listedStream.node_count === null])).toEqual([
    ["hallways-main-80cbae", "running", false],
    ["lobby-main-298da3", "closed", true],
    ["pattern-main-32fee2", "stopped", false],
  ]);
});

test("an_open_a_start_playback_and_a_close_are_described_under_their_own_kinds_with_each_stream_as_the_action_left_it", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-open-of-lobby-done.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-start-playback-of-hallways-done.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-close-of-lobby-done.json")),
  ]);
  const kindAndStreamStatesOf = async (action: string) => {
    const followed = answerOf(await server.client().describeStreamAction(action));
    return followed.kind === "described" ? [followed.description.kind, followed.description.state, followed.description.streams.map((stream) => stream.state)] : followed;
  };

  expect(await kindAndStreamStatesOf("Rhrb4oumhnnzujbb137ivd7ah-8")).toEqual(["open", "done", ["stopped"]]);
  expect(await kindAndStreamStatesOf("Rhrb4oumhnnzujbb137ivd7ah-4")).toEqual(["start_playback", "done", ["running"]]);
  expect(await kindAndStreamStatesOf("Rhrb4oumhnnzujbb137ivd7ah-5")).toEqual(["close", "done", ["closed"]]);
});
