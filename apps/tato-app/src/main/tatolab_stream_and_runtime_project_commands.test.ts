import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse, controlOperationResultResponse, controlWebSocketUpgradeRefusedWithWords, runtimeDescribedResponse } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { failedWith, succeeded } from "./result.js";
import { removeProject, openTheProjectWhenTheRuntimeHoldsItClosed } from "./tatolab_stream_and_runtime_project_commands.js";
import { cleanUpTheFakesTheLastTestMade, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, cleanUps, recordedResponseBody, sharedStateOverFakes, RECORDED_PATTERN_PROJECT, RECORDED_PATTERN_RELOAD_ACTION, RECORDED_LOBBY_PROJECT, RECORDED_LOBBY_OPEN_ACTION, RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

test("removing a project queues on the runtime, then observes again whether it queued or was refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");

  expect(await removeProject(sharedState, "/tmp/tatolab-proof-projects/doorways")).toEqual(succeeded(undefined));
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  const refusal = await removeProject(sharedState, "/tmp/tatolab-proof-projects/doorways");
  expect(!refusal.ok && refusal.failure).toContain("this runtime holds no stream of the project in /tmp/tatolab-proof-projects/doorways");
  expect(refreshRequests).toHaveBeenCalledTimes(2);
});

test("each queued action answers the window null, and a missing argument or a project the runtime does not list is refused in the command's words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      controlWebSocketUpgradeRefusedWithWords(),
      runtimeDescribedResponse("0.69.84+test.1"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
    ],
    "linux"
  );
  const commandHandlers = commandHandlersOver(sharedState);
  expect(await commandHandlers.remove_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /home/jonathan-fontanez/scratch/app176/projects/doorways.",
  });
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.stop_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await commandHandlers.pause_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await commandHandlers.remove_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_project({ stream: "pattern-main-d76f70" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "remove_project needs `project_directory`, a project's folder as the runtime lists it",
  });
  expect(await commandHandlers.remove_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.read_project_log_records({ project_directory: "/etc", stream: null, action: null, after: null, until: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /etc.",
  });
  expect(await commandHandlers.list_project_node_types({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.follow_project_log_records({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.follow_project_log_records({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "Only a studio window or a popped-out view follows a project's log.",
  });
  expect(await commandHandlers.list_project_node_types({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "list_project_node_types needs `project_directory`, a project's folder" });
});

test("reloading a project the runtime lists open queues reload_project, one it lists closed open_project, each answering the action and observing again; one it does not list is refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-a-playing-a-stopped-and-a-closed-project.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      controlWebSocketUpgradeRefusedWithWords(),
      runtimeDescribedResponse("0.69.84+test.1"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-reload-project-answer-for-the-stopped-project-pattern.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-answer-for-the-closed-project-lobby.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const reloads = vi.spyOn(sharedState.controller, "reloadProject");
  const opens = vi.spyOn(sharedState.controller, "openProject");
  const commandHandlers = commandHandlersOver(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect(JSON.stringify(await commandHandlers.reload_project({ project_directory: RECORDED_PATTERN_PROJECT }, FROM_THE_PROJECTS_WINDOW))).toBe(
    `{"ok":true,"value":{"action":"${RECORDED_PATTERN_RELOAD_ACTION}","project_directory":"${RECORDED_PATTERN_PROJECT}"}}`,
  );
  expect(reloads.mock.calls).toEqual([[RECORDED_PATTERN_PROJECT]]);
  expect(JSON.stringify(await commandHandlers.reload_project({ project_directory: RECORDED_LOBBY_PROJECT }, FROM_THE_PROJECTS_WINDOW))).toBe(
    `{"ok":true,"value":{"action":"${RECORDED_LOBBY_OPEN_ACTION}","project_directory":"${RECORDED_LOBBY_PROJECT}"}}`,
  );
  expect(opens.mock.calls).toEqual([[RECORDED_LOBBY_PROJECT]]);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(await commandHandlers.reload_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.reload_project({ folder: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "reload_project needs `project_directory`, a project's folder as the runtime lists it",
  });
});

test("opening a project opens it only when the runtime, asked then, lists none of its streams or each closed, observing again after; its refusal in its own words", async () => {
  const listedStreams = await recordedResponseBody("local-api-list-streams-tool-result-of-a-playing-a-stopped-and-a-closed-project.json");
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(listedStreams),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-answer-for-the-closed-project-lobby.json")),
      controlOperationResponseOfTheRecordedToolResponse(listedStreams),
      controlOperationResponseOfTheRecordedToolResponse(listedStreams),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-refusal-for-the-open-project-pattern.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const opens = vi.spyOn(sharedState.controller, "openProject");

  expect(await openTheProjectWhenTheRuntimeHoldsItClosed(sharedState, RECORDED_LOBBY_PROJECT)).toEqual(succeeded(undefined));
  expect(await openTheProjectWhenTheRuntimeHoldsItClosed(sharedState, RECORDED_PATTERN_PROJECT)).toEqual(succeeded(undefined));
  const refused = await openTheProjectWhenTheRuntimeHoldsItClosed(sharedState, RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN);
  expect(opens.mock.calls).toEqual([[RECORDED_LOBBY_PROJECT], [RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN]]);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(refused).toEqual(failedWith(expect.stringContaining("is already open, so there is none to open; `reload_project` re-reads what changed on disk")));
});

test("renaming a stream sets the display name of the stream asset the runtime lists for it, then observes again whether it renamed or refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-hallways-running.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      controlWebSocketUpgradeRefusedWithWords(),
      runtimeDescribedResponse("0.69.84+test.1"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-stream-display-name-answer-for-the-main-stream-of-hallways-renamed-heat-map.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-set-stream-display-name-refusal-for-a-display-name-that-shows-nothing.json")),
    ],
    "macos"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect(JSON.stringify(await commandHandlers.rename_stream({ stream: "hallways-main-26aa44", display_name: "Heat map" }, FROM_THE_PROJECTS_WINDOW))).toBe('{"ok":true,"value":null}');
  expect(await commandHandlers.rename_stream({ stream: "hallways-main-26aa44", display_name: "   " }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: `set_stream_display_name failed: "   " cannot be a stream's display name: it shows nothing`,
  });
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(sharedState.localApiControlOperationCallsReceived().filter(([toolName]) => toolName === "set_stream_display_name")).toEqual([
    ["set_stream_display_name", { project_directory: "/private/tmp/tatolab-proof-projects/hallways", stream_asset: "666895f1-e258-4587-8c62-ed07c0cc70db", display_name: "Heat map", author: { kind: "person", name: "sam" } }],
    ["set_stream_display_name", { project_directory: "/private/tmp/tatolab-proof-projects/hallways", stream_asset: "666895f1-e258-4587-8c62-ed07c0cc70db", display_name: "   ", author: { kind: "person", name: "sam" } }],
  ]);
  expect(await commandHandlers.rename_stream({ stream: "doorways-main-0b1c2d", display_name: "Heat map" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime does not list doorways-main-0b1c2d, so Tato Studio has no stream to rename.",
  });
  expect(await commandHandlers.rename_stream({ stream: "hallways-main-26aa44" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "rename_stream needs `display_name`, the display name to show it under",
  });
});

test("opening_a_streams_project_opens_the_folder_the_runtime_last_listed_for_it_and_never_a_path_from_the_window", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResultResponse({
        streams: [
          {
            stream: "main-main-9e44b1",
            display_name: "main",
            location: { project_directory: "/Users/jonathanf/streams/main", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
            state: "running",
            node_count: 4,
            failed_because: null,
            capture_devices_whose_access_was_never_asked_for: [],
            action: null,
            step: null,
          },
        ],
      }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      controlWebSocketUpgradeRefusedWithWords(),
      runtimeDescribedResponse("0.69.84+test.1"),
    ],
    "macos",
    ["/Users/jonathanf/streams/main", "/Users/jonathanf/streams/main/.streamlib/logs"],
  );
  const commandHandlers = commandHandlersOver(sharedState);
  expect(await commandHandlers.open_stream_project_folder({ stream: "main-main-9e44b1" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime does not list main-main-9e44b1, so Tato Studio has no project folder to open.",
  });
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.open_stream_project_folder({ stream: "main-main-9e44b1", project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_stream_project_folder({ stream: "main" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime does not list main, so Tato Studio has no project folder to open.",
  });
  expect(await commandHandlers.open_terminal_at_stream_project({ stream: "main-main-9e44b1" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_terminal_at_stream_project({ stream: "other" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime does not list other, so Tato Studio has no project folder to open.",
  });
  expect(await commandHandlers.open_terminal_at_stream_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "open_terminal_at_stream_project needs `stream`, a stream's id",
  });

  expect(await commandHandlers.open_stream_log_folder({ stream: "main-main-9e44b1" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_stream_log_folder({}, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "open_stream_log_folder needs `stream`, a stream's id",
  });

  expect(sharedState.foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/main", "/Users/jonathanf/streams/main/.streamlib/logs"]);
  expect(sharedState.terminal.openedInFolders).toEqual(["/Users/jonathanf/streams/main"]);
});

/** The window's `ProjectCreationQueued`, `ProjectStreamActionQueued` and `StreamActionFollowed` read exactly this JSON. */
test("adding a project answers the window in the contract's shape, from the chosen folder to the action queued and followed", async () => {
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tl-app-project-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-answer-for-the-closed-project-lobby.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-project-answer-with-no-folder-drawn-kind-butte.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-of-the-create-of-kind-butte-starting.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-describe-stream-action-refusal-for-an-action-not-held.json")),
      httpResponse("503 Service Unavailable", "text/plain", "starting"),
    ],
    "macos",
    [projectFolder],
    projectFolder,
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);

  expect(JSON.stringify(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_open" }, FROM_THE_PROJECTS_WINDOW))).toBe(`{"ok":true,"value":${JSON.stringify(projectFolder)}}`);
  expect(JSON.stringify(await commandHandlers.open_stream_project({ folder: projectFolder }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rhrb4oumhnnzujbb137ivd7ah-8","project_directory":"/tmp/tatolab-proof-projects/lobby"}}',
  );
  expect(JSON.stringify(await commandHandlers.create_stream_project({ folder: null }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rj12j3eujz3zn0dposliv79k9-7","stream":"kind-butte-main-e51c2f","project_directory":"/tmp/tatolab-proof/streams/kind-butte"}}',
  );
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(await commandHandlers.describe_stream_action({ action: "Rj12j3eujz3zn0dposliv79k9-7" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"kind":"described","description":{"action":"Rj12j3eujz3zn0dposliv79k9-7","project_directory":"/tmp/tatolab-proof/streams/kind-butte",' +
      '"kind":"load","state":"in_progress","step":"starting","streams":[{"stream":"kind-butte-main-e51c2f","display_name":"main","state":null}],"failed_because":null,"venv_sync":null}}}',
  );
  expect(await commandHandlers.describe_stream_action({ action: "Rj12j3eujz3zn0dposliv79k9-999" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: true,
    value: {
      kind: "not_held",
      words:
        "Invalid configuration: the stream action `Rj12j3eujz3zn0dposliv79k9-999` is not held: this runtime never queued it, or it is older than the last 64 finished actions of its project; its records stay in the project's log",
    },
  });
  const unanswered = await commandHandlers.describe_stream_action({ action: "Rj12j3eujz3zn0dposliv79k9-7" }, FROM_THE_PROJECTS_WINDOW);
  expect(unanswered.ok).toBe(false);
});

/** The window's `StreamActionCancelAnswer` reads exactly this JSON. */
test("cancel_stream_action answers the window in the contract's shape, asks for a status round, and carries a declined cancel in the runtime's words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-run-of-slowpoke-making-the-venv-in-progress.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-cancel-stream-action-refusal-for-a-running-stop-of-doorways-front-door.json")),
    ],
    "linux",
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);

  expect(JSON.stringify(await commandHandlers.cancel_stream_action({ action: "Ra19ljkh20wimdvgya5udt9v1-9" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Ra19ljkh20wimdvgya5udt9v1-9","state":"in_progress"}}',
  );
  expect(await commandHandlers.cancel_stream_action({ action: "Ra19ljkh20wimdvgya5udt9v1-13" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "Invalid configuration: the stream action `Ra19ljkh20wimdvgya5udt9v1-13` is a running stop, which has begun unloading its streams and cannot be cut short; it ends done",
  });
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(await commandHandlers.cancel_stream_action({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "cancel_stream_action needs `action`, a stream action's id" });
});

test("the commands that add a project read their arguments as the window sends them, and refuse anything else", async () => {
  const commandHandlers = commandHandlersOver(await sharedStateOverFakes([], "linux"));
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "anything" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "choose_stream_project_folder needs `chosen_for`, project_to_open or new_project_directory",
  });
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_open" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.create_stream_project({ folder: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "create_stream_project needs `folder`, a folder chosen in the window, or null for one the runtime draws under ~/streams",
  });
  expect(await commandHandlers.create_stream_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "Tato Studio acts only on a folder chosen in its window. Choose /etc again." });
  expect(await commandHandlers.open_stream_project({ folder: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "open_stream_project needs `folder`, a folder chosen in the window" });
  expect(await commandHandlers.describe_stream_action({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "describe_stream_action needs `action`, a stream action's id" });
});

test("deleting_a_stream_deletes_the_stream_asset_the_runtime_last_listed_for_it_by_the_person_editing_and_a_refusal_is_the_runtimes_own_words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-streams-tool-result-of-lobby-with-its-new-stream-preview.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "sams-laptop", streams: [] })),
      controlWebSocketUpgradeRefusedWithWords(),
      runtimeDescribedResponse("0.69.84+test.1"),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-stream-answer-for-preview-of-lobby.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-stream-refusal-for-a-stream-asset-the-project-no-longer-holds.json")),
    ],
    "linux",
  );
  const commandHandlers = commandHandlersOver(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.delete_stream({ stream: "lobby-preview-0758ea" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.delete_stream({ stream: "lobby-preview-0758ea" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "delete_stream failed: the project holds no stream asset 38766917-e6ed-443f-bad5-6d70eff6efac",
  });
  expect(sharedState.localApiControlOperationCallsReceived().filter(([toolName]) => toolName === "delete_stream")[0]).toEqual([
    "delete_stream",
    { project_directory: "/root/streams/lobby", stream_asset: "38766917-e6ed-443f-bad5-6d70eff6efac", author: { kind: "person", name: "sam" } },
  ]);
  expect(await commandHandlers.delete_stream({ stream: "doorways-main-0b1c2d" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime does not list doorways-main-0b1c2d, so Tato Studio has no stream to delete.",
  });
  expect(await commandHandlers.delete_stream({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "delete_stream needs `stream`, a stream's id" });
});

/** The window's `StreamAssetCreated` reads exactly this JSON. */
test("creating_a_stream_in_the_open_project_places_its_graph_document_in_streams_under_a_name_no_file_holds_by_the_person_editing_and_answers_its_stream_asset", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-lobby-under-streams.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-stream-answer-for-preview-in-lobby-loading-it.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-files-tool-result-of-lobby-under-streams.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-create-stream-refusal-for-a-display-name-that-shows-nothing.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "lobby-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);

  expect(JSON.stringify(await commandHandlers.create_stream_in_the_open_project({ display_name: "Preview" }, fromTheStudioWindow))).toBe(
    '{"ok":true,"value":{"stream_asset":"38766917-e6ed-443f-bad5-6d70eff6efac"}}',
  );
  expect(await commandHandlers.create_stream_in_the_open_project({ display_name: "   " }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: `create_stream failed: "   " cannot be a stream's display name: it shows nothing`,
  });
  expect(sharedState.localApiControlOperationCallsReceived().slice(0, 2)).toEqual([
    ["list_project_files", { project_directory: projectFolder, under: "streams" }],
    ["create_stream", { project_directory: projectFolder, path: "streams/preview.graph.json", display_name: "Preview", author: { kind: "person", name: "sam" } }],
  ]);
  expect(await commandHandlers.create_stream_in_the_open_project({ display_name: "Preview" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await commandHandlers.create_stream_in_the_open_project({}, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "create_stream_in_the_open_project needs `display_name`, the display name to show the new stream under",
  });
});
