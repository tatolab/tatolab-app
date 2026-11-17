import { mkdtemp, realpath, rm } from "node:fs/promises";
import { projectViewFolderUrl } from "./extension_files_served_with_types_removed.js";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { controlOperationResponseOfTheRecordedToolResponse, httpResponse } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { failedWith, succeeded } from "./result.js";
import { reloadTheOpenProjectAfterASaveOfItsPythonFile, whatASavedNodeFileAsksOfTheRuntime } from "./tatolab_open_project_commands.js";
import { cleanUpTheFakesTheLastTestMade, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, cleanUps, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS, recordedResponseBody, sharedStateOverFakes, listedStreamOfTheProject, statusLastPublishedListing, projectActionsQueuedOn } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

test("a saved Python file of a project the runtime lists open queues reload_project, as tatolab dev does; another file, or a closed project, is left as it is", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux");
  await sharedState.statusPublisher.refreshAndPublish();
  const projectActionsQueued = projectActionsQueuedOn(sharedState);
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const doorways = "/projects/doorways";
  const pattern = "/projects/pattern";
  const lobby = "/projects/lobby";
  statusLastPublishedListing(sharedState, [listedStreamOfTheProject(doorways, "running"), listedStreamOfTheProject(pattern, "stopped"), listedStreamOfTheProject(lobby, "closed")]);

  await reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState, doorways, path.join(doorways, "tatolab_view.json"));
  await reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState, lobby, path.join(lobby, "nodes", "invert.py"));
  expect(projectActionsQueued).toEqual([]);

  await reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState, doorways, path.join(doorways, "nodes", "invert.py"));
  await reloadTheOpenProjectAfterASaveOfItsPythonFile(sharedState, pattern, path.join(pattern, "nodes", "invert.py"));
  expect(projectActionsQueued).toEqual([
    ["reload_project", doorways],
    ["reload_project", pattern],
  ]);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
});

test("a saved node file reloads a project the runtime holds open, playing, stopped or failed, and leaves a closed or unlisted one alone", () => {
  const hallways = "/projects/hallways";

  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfTheProject(hallways, "running"), listedStreamOfTheProject(hallways, "failed", "lobby")], hallways)).toBe("reload");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfTheProject(hallways, "stopped")], hallways)).toBe("reload");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfTheProject(hallways, "failed")], hallways)).toBe("reload");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfTheProject(hallways, "closed")], hallways)).toBe("nothing");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfTheProject(hallways, "failed")], "/projects/doorways")).toBe("nothing");
});

test("Live opens then plays a closed project, reloads then plays a stopped one with a failed stream, only reloads a playing one with a failed stream, resumes a paused one, and plays any other open one; Pause pauses it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux", [], null, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS);
  await sharedState.statusPublisher.refreshAndPublish();
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "hallways-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);
  const projectActionsQueued = projectActionsQueuedOn(sharedState);
  const runTheProjectLiveListing = async (streams: ListedStream[]) => {
    statusLastPublishedListing(sharedState, streams);
    projectActionsQueued.splice(0);
    const answer = await commandHandlers.run_open_project(undefined, fromTheStudioWindow);
    return { answer, queued: [...projectActionsQueued] };
  };

  expect(await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "closed")])).toEqual({
    answer: { ok: true, value: null },
    queued: [
      ["open_project", projectFolder],
      ["start_playback", projectFolder],
    ],
  });
  expect((await runTheProjectLiveListing([])).queued).toEqual([
    ["open_project", projectFolder],
    ["start_playback", projectFolder],
  ]);
  expect((await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "stopped"), listedStreamOfTheProject(projectFolder, "failed", "lobby")])).queued).toEqual([
    ["reload_project", projectFolder],
    ["start_playback", projectFolder],
  ]);
  expect(await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "running"), listedStreamOfTheProject(projectFolder, "failed", "lobby")])).toEqual({
    answer: { ok: true, value: null },
    queued: [["reload_project", projectFolder]],
  });
  expect((await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "stopped")])).queued).toEqual([["start_playback", projectFolder]]);
  for (const streamStateMidAction of ["preparing", "stopping"]) {
    expect((await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, streamStateMidAction)])).queued).toEqual([["start_playback", projectFolder]]);
    expect((await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, streamStateMidAction), listedStreamOfTheProject(projectFolder, "failed", "lobby")])).queued).toEqual([
      ["reload_project", projectFolder],
      ["start_playback", projectFolder],
    ]);
    expect(
      (await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "running"), listedStreamOfTheProject(projectFolder, streamStateMidAction, "camera"), listedStreamOfTheProject(projectFolder, "failed", "lobby")])).queued,
    ).toEqual([["reload_project", projectFolder]]);
  }
  expect(await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "paused")])).toEqual({ answer: { ok: true, value: null }, queued: [["resume_playback", projectFolder]] });
  expect((await runTheProjectLiveListing([listedStreamOfTheProject(projectFolder, "paused"), listedStreamOfTheProject(projectFolder, "failed", "lobby")])).queued).toEqual([
    ["reload_project", projectFolder],
    ["resume_playback", projectFolder],
  ]);

  statusLastPublishedListing(sharedState, [listedStreamOfTheProject(projectFolder, "running")]);
  projectActionsQueued.splice(0);
  expect(await commandHandlers.pause_open_project(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(projectActionsQueued).toEqual([["pause_playback", projectFolder]]);

  statusLastPublishedListing(sharedState, [listedStreamOfTheProject(projectFolder, "running")]);
  projectActionsQueued.splice(0);
  expect(await commandHandlers.stop_open_project(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(projectActionsQueued).toEqual([["stop_playback", projectFolder]]);
});

test("Live answers the runtime's refusal of an open it would play after, in its own words, and queues no playback", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux", [], null, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS);
  await sharedState.statusPublisher.refreshAndPublish();
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "hallways-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const refusal = `Runtime error: the project in ${projectFolder} is already open, so there is none to open; \`reload_project\` re-reads what changed on disk`;
  vi.spyOn(sharedState.controller, "openProject").mockResolvedValue(failedWith({ failureDescription: refusal, isTheRuntimesRefusal: true }));
  const playbackStarts = vi.spyOn(sharedState.controller, "startPlayback");
  statusLastPublishedListing(sharedState, []);

  expect(await commandHandlersOver(sharedState).run_open_project(undefined, { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 })).toEqual({ ok: false, refusal });
  expect(playbackStarts).not.toHaveBeenCalled();
});

/** The window's `ProjectTransaction` and `ProjectTransactionsReading` read exactly this JSON. */
test("undo and redo in the open project ask the runtime by the window's author and answer its transaction, or its refusal in its own words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-redo-tool-refusal-for-sam-with-nothing-left-to-redo.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "lobby-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);
  const sam = { kind: "person", name: "Sam" };

  expect(await commandHandlers.read_open_project_transactions(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: { kind: "not_read", because: expect.any(String) } });
  const undone = await commandHandlers.undo_in_the_open_project({ author: sam }, fromTheStudioWindow);
  expect(undone).toMatchObject({ ok: true, value: { author_kind: "person", author_name: "Sam", undoes: "a25a70ab-229d-4e68-9e05-27cfb771da50", redoes: null, undo_state: null, applied_at: "2026-11-10T18:17:12Z" } });
  expect(await commandHandlers.redo_in_the_open_project({ author: sam }, fromTheStudioWindow)).toEqual({ ok: false, refusal: "redo failed: Sam has undone nothing that is left to redo" });
  expect(await commandHandlers.undo_in_the_open_project({ author: { kind: "runtime", name: "tatolab" } }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "undo_in_the_open_project needs `author`, a person or an agent by the name history shows",
  });
  expect(await commandHandlers.undo_in_the_open_project({ author: sam }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

/** The window's `ProjectAssetsImported` reads exactly this JSON. */
test("importing assets into the open project copies each file the person chooses into the project, naming no path, by the person editing, answering each one imported and each refusal in the runtime's words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-answer-for-poster-png-numbered-poster-3-in-media-imported-by-a-person.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-import-asset-refusal-for-main-graph-json-a-stream-graph-document.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "tide-pool-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.import_assets_into_the_open_project({ media: null }, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  sharedState.assetFilesTheDialogAnswers.files = ["/home/sam/poster.png", "/home/sam/main.graph.json"];
  expect(await commandHandlers.import_assets_into_the_open_project({ media: null }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      imported: [{ asset: "d18ac59c-d741-45fc-8d21-d3febd0d14a0", path: "media/poster-3.png" }],
      refused: [{ file_name: "main.graph.json", because: "import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write" }],
    },
  });
  expect(await commandHandlers.import_assets_into_the_open_project({ media: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await commandHandlers.import_assets_into_the_open_project({ media: "image" }, fromTheStudioWindow)).toEqual({ ok: false, refusal: "import_assets_into_the_open_project needs `media`, a list of media names or null" });
});

test("renaming, moving and deleting an asset of the open project reach the runtime by the person editing, answering nothing, or the runtime's refusal in its own words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-answer-for-poster-png-renamed-to-harbour-poster-png-by-a-person.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-relocate-asset-refusal-for-a-path-another-asset-of-harbour-lights-takes.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-answer-for-opening-png-deleted-by-a-person.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-delete-asset-refusal-for-an-asset-harbour-lights-does-not-hold.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "harbour-lights-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);
  const poster = "7fc01c14-399c-4749-a45b-2c99a77ce0a6";

  expect(await commandHandlers.relocate_asset_in_the_open_project({ asset: poster, to_path: "media/harbour-poster.png" }, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.relocate_asset_in_the_open_project({ asset: poster, to_path: "media/opening.png" }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "relocate_asset failed: `media/opening.png` is already the path of the asset 4ce7c229-734b-4210-9bb5-e321bf4183de",
  });
  expect(await commandHandlers.delete_asset_from_the_open_project({ asset: "4ce7c229-734b-4210-9bb5-e321bf4183de" }, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.delete_asset_from_the_open_project({ asset: "00000000-0000-4000-8000-000000000000" }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "delete_asset failed: the project holds no asset 00000000-0000-4000-8000-000000000000",
  });
  expect(await commandHandlers.relocate_asset_in_the_open_project({ asset: poster }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "relocate_asset_in_the_open_project needs `to_path`, the asset's new path in the project",
  });
  expect(await commandHandlers.delete_asset_from_the_open_project({ asset: poster }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

test("an asset's preview picture of the open project reaches the window as a data URL, or the runtime's refusal in its own words, and only a studio window may ask", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-tool-result-of-harbour-dusk-png.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-read-asset-preview-refusal-for-quay-walk-mp4-with-no-poster-frame.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "harbour-lights-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = {
    windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1,
  };
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.read_asset_preview_of_the_open_project({ asset: "38ab4435-5f49-4cd1-b60e-f03acf54db34" }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      picture_url: expect.stringMatching(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+=*$/),
      pixel_width: 512,
      pixel_height: 320,
    },
  });
  expect(await commandHandlers.read_asset_preview_of_the_open_project({ asset: "23199eb3-ea3c-4d31-8f0f-2bf9395590d2" }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "read_asset_preview failed: asset 23199eb3-ea3c-4d31-8f0f-2bf9395590d2 has no preview picture; the runtime makes one for an image",
  });
  expect(await commandHandlers.read_asset_preview_of_the_open_project({}, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "read_asset_preview_of_the_open_project needs `asset`, the UUID of an asset of the open project",
  });
  expect(await commandHandlers.read_asset_preview_of_the_open_project({ asset: "38ab4435-5f49-4cd1-b60e-f03acf54db34" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "No project is open in this window.",
  });
});

test("listing the open project's views asks the system ahead for the camera and the microphone a view declares, once however often it is listed", async () => {
  const nightShow = "/private/tmp/tl-rec-cam/projects/night-show";
  const listingDeclaringTheCamera = await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-with-a-view-declaring-the-camera-and-microphone.json");
  const sharedState = await sharedStateOverFakes(
    [controlOperationResponseOfTheRecordedToolResponse(listingDeclaringTheCamera), controlOperationResponseOfTheRecordedToolResponse(listingDeclaringTheCamera)],
    "macos",
    [],
    null,
    {
      nameTheProject: async () => succeeded({ folder: nightShow, project: "a06ae4a5-e1ae-48f7-a660-7380b0815e71", name: "night-show" }),
      listTheDependencies: async () => succeeded([]),
    },
  );
  sharedState.systemMediaAccess.answerByDevice = { microphone: "refused" };
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "night-show-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const commandHandlers = commandHandlersOver(sharedState);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };

  expect((await commandHandlers.list_studio_views_of_the_open_project(undefined, fromTheStudioWindow)).ok).toBe(true);
  expect((await commandHandlers.list_studio_views_of_the_open_project(undefined, fromTheStudioWindow)).ok).toBe(true);
  await new Promise((resolve) => setImmediate(resolve));

  expect(sharedState.systemMediaAccess.devicesAsked).toEqual(["camera", "microphone"]);
  expect(sharedState.systemNotifications.notificationsShown).toEqual([
    {
      title: "Tato Studio can't use the microphone",
      body: "Stage camera needs it. Click to allow Tato Studio in System Settings.",
      notificationIdentifier: "com.tatolab.tatolab.media-access-refused.microphone",
    },
  ]);
});

/** The window's `ListedStudioView` reads exactly this JSON. */
test("the open project's views are the runtime's list_project_views of its folder, each folder served under the window page's scheme, and refused in the Projects window", async () => {
  const nightShow = "/private/tmp/tl-rec053/projects/night-show";
  const sharedState = await sharedStateOverFakes(
    [controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json"))],
    "macos",
    [],
    null,
    {
      nameTheProject: async () => succeeded({ folder: nightShow, project: "000719ff-93e9-43d1-ba64-975cf13f9a6a", name: "night-show" }),
      listTheDependencies: async () => succeeded([]),
    },
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "night-show-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const commandHandlers = commandHandlersOver(sharedState);
  const recordedNightShowFolder = "/private/tmp/tl-rec053/projects/night-show";

  const listed = await commandHandlers.list_studio_views_of_the_open_project(undefined, { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 });

  expect(listed.ok && listed.value.map(({ manifest_json, ...listedView }) => ({ ...listedView, has_its_manifest: manifest_json !== null }))).toEqual([
    {
      view_type_id: "night-show:broken",
      project_name: "night-show",
      import_folder: null,
      opens: false,
      not_opened_because: "`contract`: this runtime reads view contract 1.0.",
      folder_url: projectViewFolderUrl(recordedNightShowFolder, "views/broken"),
      has_its_manifest: true,
    },
    { view_type_id: "night-show:deck", project_name: "night-show", import_folder: null, opens: true, not_opened_because: null, folder_url: projectViewFolderUrl(recordedNightShowFolder, "views/deck"), has_its_manifest: true },
    {
      view_type_id: "lobby-wall:meter",
      project_name: "lobby-wall",
      import_folder: "lobby-wall",
      opens: true,
      not_opened_because: null,
      folder_url: projectViewFolderUrl(recordedNightShowFolder, "imports/lobby-wall/views/meter"),
      has_its_manifest: true,
    },
  ]);
  expect(sharedState.projectViewsListed.isListedAsOpening(recordedNightShowFolder, "views/deck")).toBe(true);
  expect(sharedState.projectViewsListed.isListedAsOpening(recordedNightShowFolder, "views/broken")).toBe(false);
  expect(await commandHandlers.list_studio_views_of_the_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

/** The window's `write_graph_input` answers `null` once the runtime took the value, and its refusal word for word. */
test("a Graph Input's value reaches the runtime's write_graph_input from a studio window, answered null once taken, refused in the runtime's own words, and from the Projects window or with arguments that are not text and JSON refused before it is asked", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-tool-result-of-s06-perform-brightness.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-graph-input-refusal-for-the-stopped-project-s06-perform.json")),
    ],
    "macos",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "s06-perform-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const commandHandlers = commandHandlersOver(sharedState);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const brightness = { stream: "s06-perform-main-0df4a7", input: "brightness", value: 0.8 };

  expect(await commandHandlers.write_graph_input(brightness, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "Only a studio window or a popped-out view writes a Graph Input." });
  expect(await commandHandlers.write_graph_input(brightness, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.write_graph_input(brightness, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal:
      "write_graph_input failed: Runtime error: the project of the stream `s06-perform-main-0df4a7` in /tmp/tatolab-proof-projects/s06-perform is stopped, so no node of it runs to publish on `value`; `start_playback` plays it",
  });
  expect(await commandHandlers.write_graph_input({ ...brightness, input: 7 }, fromTheStudioWindow)).toEqual({ ok: false, refusal: "write_graph_input needs `stream` and `input` as text" });
  expect(await commandHandlers.write_graph_input({ stream: brightness.stream, input: brightness.input }, fromTheStudioWindow)).toEqual({ ok: false, refusal: "write_graph_input needs `value` as JSON" });
  expect(await commandHandlers.write_graph_input("brightness", fromTheStudioWindow)).toEqual({ ok: false, refusal: "write_graph_input needs `stream`, `input` and `value`" });
});

/** The window's `write_studio_view_output` answers `null` once the runtime took the value, and its refusal word for word. */
test("a view's output value reaches the runtime's write_studio_view_output from a studio window, answered null once taken, refused in the runtime's own words, and from the Projects window or with arguments that are not text and JSON refused before it is asked", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-studio-view-output-tool-result-of-the-deck-node-cue.json")),
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-write-studio-view-output-refusal-for-the-stopped-stream-night-show.json")),
    ],
    "macos",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "night-show-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const commandHandlers = commandHandlersOver(sharedState);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const cue = { stream: "night-show-main-aa298d", node: "fdca90ae-f25d-4551-86e2-11f5cdb65d16", port: "cue", value: { track: "Opening" } };

  expect(await commandHandlers.write_studio_view_output(cue, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "Only a studio window or a popped-out view writes a view's output." });
  expect(await commandHandlers.write_studio_view_output(cue, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.write_studio_view_output(cue, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "write_studio_view_output failed: Resource not found: no stream with the id `night-show-main-aa298d` is loaded in this runtime. Loaded: lobby-wall-main-c95d53",
  });
  expect(await commandHandlers.write_studio_view_output({ ...cue, node: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "write_studio_view_output needs `stream`, `node` and `port` as text" });
  expect(await commandHandlers.write_studio_view_output({ stream: cue.stream, node: cue.node, port: cue.port }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "write_studio_view_output needs `value` as JSON",
  });
});
