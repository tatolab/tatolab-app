import { afterEach, expect, test } from "vitest";
import type { StreamActionDescription, StreamActionFollowed } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, controlOperationResponseOfTheRecordedToolResponse, httpResponse } from "./fake_local_api_server.js";
import { LocalApiClient, queuedStreamActionFromTheToolResult, streamsThePauseOrResumeReachedFromTheToolResult, streamAssetChangeFromTheToolResult } from "./local_api_client.js";
import { projectCreationQueuedFromTheCreateProjectToolResult, projectStreamActionQueuedFromTheToolResult, streamActionCancelAnswerFromTheCancelStreamActionToolResult, streamActionDescriptionFromTheDescribeStreamActionToolResult } from "./stream_action_description.js";
import { answerOf, cleanUps, cleanUpWhatTheTestStarted, controlOperationCallsReceivedBy, failureOf, fakeLocalApiServerAnswering, recordedResponseBody } from "./local_api_client_test_support.js";
import { cancelStreamAction } from "./runtime_operations.js";

afterEach(cleanUpWhatTheTestStarted);

const SAM_EDITING = { kind: "person", name: "Sam" } as const;

/** The description `describe_stream_action` answered, failing the test when it answered anything else. */
function describedOf(followed: StreamActionFollowed): StreamActionDescription {
  return followed.kind === "described" ? followed.description : expect.unreachable(`the action was not described: ${followed.words}`);
}

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

  expect(answerOf(await server.run(cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-10")))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-10", state: "cancelled" });
  expect(answerOf(await server.run(cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-9")))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-9", state: "in_progress" });
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
  expect(answerOf(await server.run(cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-12")))).toEqual({ action: "Ra19ljkh20wimdvgya5udt9v1-12", state: "cancelled" });
  expect(controlOperationCallsReceivedBy(server)[0]).toEqual(["cancel_stream_action", { action: "Ra19ljkh20wimdvgya5udt9v1-10" }]);
});

test("a_cancel_the_runtime_declines_carries_its_own_words_a_running_stop_past_cancelling_among_them", async () => {
  const server = await fakeLocalApiServerAnswering([
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-refusal-for-a-running-stop-of-doorways-front-door.json")),
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-refusal-for-an-action-already-cancelled.json")),
  ]);

  expect(failureOf(await server.run(cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-13")))).toMatchObject({
    _tag: "RuntimeRefused",
    words:
      "Invalid configuration: the stream action `Ra19ljkh20wimdvgya5udt9v1-13` is a running stop, which has begun unloading its streams and cannot be cut short; it ends done",
  });
  expect(failureOf(await server.run(cancelStreamAction("Ra19ljkh20wimdvgya5udt9v1-9"))).words).toBe(
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

test("a_stream_action_whose_params_the_runtime_does_not_read_is_a_failure_in_its_words_never_an_action_not_held", async () => {
  const runtimeWords = "`describe_stream_action`'s params do not match its request: missing field `action`";
  const paramsRefused = {
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32602, message: runtimeWords, data: { refusal_code: "params_do_not_match_schema", action: "describe_stream_action", runtime_words: runtimeWords } },
  };
  const server = await fakeLocalApiServerAnswering([httpResponse("200 OK", "application/json", JSON.stringify(paramsRefused))]);

  expect(failureOf(await server.client().describeStreamAction("Rgw2h0t6a3cjv8y1-4"))).toEqual({ isTheRuntimesRefusal: true, failureDescription: `the runtime refused \`describe_stream_action\`: ${runtimeWords}` });
});
