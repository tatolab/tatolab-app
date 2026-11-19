import { afterEach, expect, test } from "vitest";
import type { StreamLocation } from "../shared/tatolab_backend_contract.js";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse } from "./fake_local_api_server.js";
import { listedStreamsFromTheListStreamsToolResult } from "./listed_streams_on_the_wire.js";
import { answerOf, cleanUpWhatTheTestStarted, failureOf, fakeLocalApiServerAnswering, listedStream, recordedResponseBody } from "./runtime_operations_test_support.js";
import { listStreams, readTheMachineName } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

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
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
  ]);

  expect(answerOf(await server.run(listStreams()))).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "stopped", null, null),
  ]);
});

test("a_real_listing_after_the_runtime_restarted_lists_every_stream_it_re_loaded_running_and_the_rest_as_recorded", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-after-the-runtime-restarted.json")),
  ]);

  const listedStreams = answerOf(await server.run(listStreams()));
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

  expect(answerOf(await server.run(listStreams()))).toEqual([
    RECORDED_BACK_DOOR,
    RECORDED_FRONT_DOOR,
    listedStream("pattern-main-9960f6", "pattern", RECORDED_PATTERN_LOCATION, "preparing", null, null, { action: "Ruvjtaprxhhworo0axqwt6ffb-2", step: "starting" }),
  ]);
  expect(answerOf(await server.run(listStreams()))).toEqual([
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

  expect(answerOf(await server.run(readTheMachineName()))).toBe("jonathanf-macbook");
  expect(server.receivedRequests()[0]?.startsWith("GET /api/graph HTTP/1.1\r\n")).toBe(true);
});

test("the_listing_reads_a_closed_projects_streams_closed_and_unloaded_beside_a_playing_and_a_stopped_one", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-playing-a-stopped-and-a-closed-project.json")),
  ]);

  expect(answerOf(await server.run(listStreams())).map((listedStream) => [listedStream.stream, listedStream.state, listedStream.node_count === null])).toEqual([
    ["hallways-main-80cbae", "running", false],
    ["lobby-main-298da3", "closed", true],
    ["pattern-main-32fee2", "stopped", false],
  ]);
});

test("each_streams_condition_reads_with_its_diagnostics_a_value_newer_than_this_app_as_its_sets_fallback_and_none_from_a_runtime_that_lists_none", () => {
  const listing = { stream: "lobby-main-298da3", display_name: "main", location: { project_directory: "/Users/me/lobby", project: A_PROJECT, stream_asset: A_STREAM_ASSET }, state: "failed", node_count: null, failed_because: "the link was refused" };
  const condition = {
    load: "loaded",
    playback: "rewinding",
    health: "degraded",
    diagnostics: [
      { kind: "link_refused", place: { on: "link", from_node: "camera", from_port: "video", to_node: "display", to_port: "video" }, words: "the link was refused", recovery: "fix_the_link" },
      { kind: "edit_not_live", place: { on: "node", node_id: "D1", node_name: "display" }, words: "the running stream refused it", recovery: "restart_the_playback" },
      { kind: "a_kind_from_later", place: { on: "a_place_from_later" }, words: "something newer", recovery: "a_recovery_from_later" },
    ],
  };

  const [listedWithACondition, listedWithNone] = answerOf(listedStreamsFromTheListStreamsToolResult({ streams: [{ ...listing, condition }, listing] }));

  expect(listedWithACondition?.condition).toEqual({
    load: "loaded",
    playback: "stopped",
    health: "degraded",
    diagnostics: [
      { kind: "link_refused", place: { on: "link", from_node: "camera", from_port: "video", to_node: "display", to_port: "video" }, words: "the link was refused", recovery: "fix_the_link" },
      { kind: "edit_not_live", place: { on: "node", node_id: "D1", node_name: "display" }, words: "the running stream refused it", recovery: "restart_the_playback" },
      { kind: "other", place: { on: "stream" }, words: "something newer", recovery: "retry_the_load" },
    ],
  });
  expect(listedWithNone?.condition).toBeNull();
  expect(failureOf(listedStreamsFromTheListStreamsToolResult({ streams: [{ ...listing, condition: { ...condition, diagnostics: [{ kind: "node_failed", place: { on: "node", node_id: "D1" }, words: "it failed", recovery: "restart_the_playback" }] } }] }))).toMatch(
    /^the runtime's list_streams result could not be read: .*node_name/,
  );
});
