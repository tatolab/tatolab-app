import { mkdtemp, realpath, rm } from "node:fs/promises";
import { folderVersionOf } from "./extension_check_gate.js";
import { answersOfAFolderPassingTheGate } from "./extension_check_gate_test_support.js";
import { projectViewFolderUrl } from "./extension_files_served_with_types_removed.js";
import os from "node:os";
import path from "node:path";
import { Effect, ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import type { ListedStream } from "../shared/tatolab_backend_contract.js";
import { controlOperationFailedResponse, controlOperationResponseOfTheRecordedToolResponse, controlOperationResultResponse, FakeLocalApiServer, httpResponse } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { succeeded } from "./result.js";
import { openProjectCommandHandlersOf, reloadTheOpenProjectAfterASaveOfItsPythonFile } from "./tatolab_open_project_commands.js";
import { projectFileVersionOf } from "./open_project_files.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, cleanUps, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS, recordedResponseBody, sharedStateOverFakes, listedStreamOfTheProject, statusLastPublishedListing, aLocalApiQueuingEachProjectAction, studioServicesLayerForTest, STUDIO_WINDOW_UNDER_TEST } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

/** A view page the gate passes. */
const NOTES_PAGE = "<!doctype html><title>Notes</title>\n";

test("a saved Python file of a project the runtime lists open queues reload_project, as tatolab dev does, then a status round; another file, or a closed project, is left as it is", async () => {
  const doorways = "/projects/doorways";
  const pattern = "/projects/pattern";
  const lobby = "/projects/lobby";
  const { localApiSocketPath, projectActionsQueued } = await aLocalApiQueuingEachProjectAction();
  let statusRounds = 0;
  const studioRuntime = ManagedRuntime.make(
    studioServicesLayerForTest({
      localApiSocketPath,
      theProjectIsListedOpen: (projectFolder) => projectFolder === doorways || projectFolder === pattern,
      requestARound: Effect.sync(() => void (statusRounds += 1)),
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());
  const afterASaveOf = (projectFolder: string, savedFile: string) => studioRuntime.runPromise(reloadTheOpenProjectAfterASaveOfItsPythonFile(projectFolder, savedFile));

  await afterASaveOf(doorways, path.join(doorways, "tatolab_view.json"));
  await afterASaveOf(lobby, path.join(lobby, "nodes", "invert.py"));
  expect([projectActionsQueued, statusRounds]).toEqual([[], 0]);

  await afterASaveOf(doorways, path.join(doorways, "nodes", "invert.py"));
  await afterASaveOf(pattern, path.join(pattern, "nodes", "invert.py"));
  expect(projectActionsQueued).toEqual([
    ["reload_project", doorways],
    ["reload_project", pattern],
  ]);
  expect(statusRounds).toBe(2);
});

test("a reload the runtime refuses after a save is logged in its own words, and still asks for a status round", async () => {
  const doorways = "/projects/doorways";
  const localApiServer = await FakeLocalApiServer.answeringEachControlOperation(async () => controlOperationFailedResponse("reload_project failed: the project's history is busy"));
  cleanUps.push(() => localApiServer.close());
  const loggedLines: string[] = [];
  let statusRounds = 0;
  const studioRuntime = ManagedRuntime.make(
    studioServicesLayerForTest({
      localApiSocketPath: localApiServer.localApiSocketPath,
      theProjectIsListedOpen: () => true,
      requestARound: Effect.sync(() => void (statusRounds += 1)),
      tatolabAppLog: createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine)),
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());

  await studioRuntime.runPromise(reloadTheOpenProjectAfterASaveOfItsPythonFile(doorways, path.join(doorways, "nodes", "invert.py")));

  expect(statusRounds).toBe(1);
  expect(loggedLines.find((logLine) => logLine.includes("refused to reload the project after a save"))).toContain("reload_project failed: the project's history is busy");
});

test("a save from the studio window writes the file by the person editing, then reloads the open project for a Python file; a refused save reloads nothing, and bad arguments or the Projects window are refused", async () => {
  const hallways = STUDIO_WINDOW_UNDER_TEST.projectFolder;
  const fromTheStudioWindow = { windowContentsId: STUDIO_WINDOW_UNDER_TEST.windowContentsId };
  const heldText = "class Invert: ...\n";
  const filesByPath = new Map([["nodes/invert.py", Buffer.from(heldText)]]);
  const operationsAsked: [string, unknown][] = [];
  const localApiServer = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    operationsAsked.push([method, method === "write_project_file" ? { path: params["path"], content: params["content"], idempotency_key: params["idempotency_key"] } : params["project_directory"]]);
    switch (method) {
      case "list_project_files":
        return controlOperationResultResponse({ files: [...filesByPath.entries()].map(([filePath, fileBytes]) => ({ path: filePath, byte_len: fileBytes.length })) });
      case "read_project_file": {
        const fileBytes = filesByPath.get(String(params["path"])) ?? Buffer.from("");
        return controlOperationResultResponse({ path: params["path"], byte_len: fileBytes.length, content_base64: fileBytes.toString("base64"), content_sha256: projectFileVersionOf(fileBytes) });
      }
      case "write_project_file":
        filesByPath.set(String(params["path"]), Buffer.from(String(params["content"])));
        return controlOperationResultResponse({ path: params["path"], content_sha256: projectFileVersionOf(String(params["content"])), transaction: "a1b2c3d4-0000-4000-8000-000000000001", commit: "4f102d0624025485316c83cd6d759672c34fb18a" });
      case "reload_project":
        return controlOperationResultResponse({ action: "reload_project-1", project_directory: params["project_directory"] });
      default:
        return null;
    }
  });
  cleanUps.push(() => localApiServer.close());
  const studioRuntime = ManagedRuntime.make(
    studioServicesLayerForTest({
      localApiSocketPath: localApiServer.localApiSocketPath,
      openProjectReading: { kind: "read", open_project: { project: { folder: hallways, project: "6f1d0b7e-hallways", name: "hallways" }, imports: [], imports_not_listed_because: null } },
      theProjectIsListedOpen: (projectFolder) => projectFolder === hallways,
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());
  const { save_project_file: saveProjectFile } = openProjectCommandHandlersOf(await sharedStateOverFakes([], "linux"), studioRuntime);
  const invertPy = path.join(hallways, "nodes", "invert.py");

  expect(await saveProjectFile({ file: invertPy, text: "# edited\n", based_on_version: projectFileVersionOf(heldText) }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: { version: projectFileVersionOf("# edited\n") },
  });
  expect(operationsAsked.filter(([method]) => method === "write_project_file" || method === "reload_project")).toEqual([
    ["write_project_file", { path: "nodes/invert.py", content: "# edited\n", idempotency_key: "a-key-1" }],
    ["reload_project", hallways],
  ]);
  operationsAsked.length = 0;

  expect(await saveProjectFile({ file: invertPy, text: "# mine\n", based_on_version: projectFileVersionOf(heldText) }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "invert.py changed since it was opened, so it was not saved.",
  });
  expect(await saveProjectFile({ file: invertPy, text: "# mine\n" }, fromTheStudioWindow)).toEqual({ ok: false, refusal: expect.stringMatching(/^save_project_file: /) });
  expect(await saveProjectFile({ file: invertPy, text: "# mine\n", based_on_version: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(operationsAsked.map(([method]) => method)).toEqual(["list_project_files", "read_project_file"]);
});

test("Live opens then plays a closed project, reloads then plays a stopped one with a failed stream, only reloads a playing one with a failed stream, resumes a paused one, and plays any other open one; Pause pauses it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux", [], null, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS);
  await sharedState.statusPublisher.refreshAndPublish();
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "hallways-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const { localApiSocketPath, projectActionsQueued } = await aLocalApiQueuingEachProjectAction();
  const commandHandlers = commandHandlersOver(sharedState, () => {}, localApiSocketPath);
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

test("Pause and Stop ask the runtime about the project's folder as the runtime named it, not as the window was opened at", async () => {
  const hallwaysAsTheRuntimeNamesIt = "/private/tmp/tl-rec-hallways/projects/hallways";
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux", [], null, {
    nameTheProject: async () => succeeded({ folder: hallwaysAsTheRuntimeNamesIt, project: "6f1d0b7e-4c2a-4e8b-9a31-0d5e7c9b2f14", name: "hallways" }),
    listTheDependencies: async () => succeeded([]),
  });
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "hallways-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const { localApiSocketPath, projectActionsQueued } = await aLocalApiQueuingEachProjectAction();
  const commandHandlers = commandHandlersOver(sharedState, () => {}, localApiSocketPath);

  expect(await commandHandlers.pause_open_project(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.stop_open_project(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(projectActionsQueued).toEqual([
    ["pause_playback", hallwaysAsTheRuntimeNamesIt],
    ["stop_playback", hallwaysAsTheRuntimeNamesIt],
  ]);
});

test("Live answers the runtime's refusal of an open it would play after, in its own words, and queues no playback", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux", [], null, THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS);
  await sharedState.statusPublisher.refreshAndPublish();
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "hallways-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const { localApiSocketPath, projectActionsQueued } = await aLocalApiQueuingEachProjectAction(
    controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-open-project-refusal-for-the-open-project-pattern.json")),
  );
  statusLastPublishedListing(sharedState, []);

  expect(await commandHandlersOver(sharedState, () => {}, localApiSocketPath).run_open_project(undefined, { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 })).toEqual({
    ok: false,
    refusal: "Runtime error: the project in /tmp/tatolab-proof-projects/pattern is already open, so there is none to open; `reload_project` re-reads what changed on disk",
  });
  expect(projectActionsQueued).toEqual([["open_project", projectFolder]]);
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
    refusal: expect.stringMatching(/^undo_in_the_open_project: /),
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
  expect(await commandHandlers.import_assets_into_the_open_project({ media: "image" }, fromTheStudioWindow)).toEqual({ ok: false, refusal: expect.stringMatching(/^import_assets_into_the_open_project: /) });
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
    refusal: expect.stringMatching(/^relocate_asset_in_the_open_project: Missing key/),
  });
  expect(await commandHandlers.delete_asset_from_the_open_project({ asset: poster }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

test("filing a node type of the open project under a group, and putting it back, reach the runtime by the person editing, answering nothing, or the runtime's refusal in its own words", async () => {
  const blankName = 'set_node_type_group failed: "Show//Levels" cannot file `nodes.mix:Mixer`: a group is one or more names split by `/`, none of them blank, as `Effects/Stylize`';
  const filed = (group: string | null) => controlOperationResultResponse({ project: "/tmp/harbour-lights", node_type: "nodes.mix:Mixer", group, transaction: "0b9e4f61-3c2a-4d7e-9a51-6f0c2b8d1e73", commit: "5d2f0e1c9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d" });
  const sharedState = await sharedStateOverFakes([filed("Show/Levels"), controlOperationFailedResponse(blankName), filed(null)], "linux");
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "harbour-lights-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.set_node_type_group_in_the_open_project({ node_type: "nodes.mix:Mixer", group: "Show/Levels" }, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.set_node_type_group_in_the_open_project({ node_type: "nodes.mix:Mixer", group: "Show//Levels" }, fromTheStudioWindow)).toEqual({ ok: false, refusal: blankName });
  expect(await commandHandlers.set_node_type_group_in_the_open_project({ node_type: "nodes.mix:Mixer", group: null }, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.set_node_type_group_in_the_open_project({ node_type: "nodes.mix:Mixer" }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: expect.stringMatching(/^set_node_type_group_in_the_open_project: Missing key/),
  });
  expect(await commandHandlers.set_node_type_group_in_the_open_project({ node_type: "nodes.mix:Mixer", group: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
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
    refusal: expect.stringMatching(/^read_asset_preview_of_the_open_project: Missing key/),
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
    [
      controlOperationResponseOfTheRecordedToolResponse(listingDeclaringTheCamera),
      ...answersOfAFolderPassingTheGate("views/notes", { "index.html": NOTES_PAGE }),
      ...answersOfAFolderPassingTheGate("views/stage_camera", { "index.html": NOTES_PAGE }),
      controlOperationResponseOfTheRecordedToolResponse(listingDeclaringTheCamera),
    ],
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
test("the open project's views are the runtime's list_project_views of its folder, each that opens passed through the check and served under the window page's scheme at the version it passed, and refused in the Projects window", async () => {
  const nightShow = "/private/tmp/tl-rec053/projects/night-show";
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResponseOfTheRecordedToolResponse(await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json")),
      ...answersOfAFolderPassingTheGate("views/deck", { "index.html": NOTES_PAGE }),
      ...answersOfAFolderPassingTheGate("imports/lobby-wall/views/meter", { "index.html": NOTES_PAGE, "meter.ts": "export const level = 1;\n" }, "imports/lobby-wall/"),
    ],
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
  const deckVersion = folderVersionOf(new Map([["views/deck/index.html", Buffer.from(NOTES_PAGE)]]));
  const meterVersion = folderVersionOf(
    new Map([
      ["imports/lobby-wall/views/meter/index.html", Buffer.from(NOTES_PAGE)],
      ["imports/lobby-wall/views/meter/meter.ts", Buffer.from("export const level = 1;\n")],
    ]),
  );

  expect(listed.ok && listed.value.map(({ manifest_json, ...listedView }) => ({ ...listedView, has_its_manifest: manifest_json !== null }))).toEqual([
    {
      view_type_id: "night-show:broken",
      project: "000719ff-93e9-43d1-ba64-975cf13f9a6a",
      project_name: "night-show",
      view_folder: "broken",
      import_folder: null,
      opens: false,
      not_opened_because: "`contract`: this runtime reads view contract 1.0.",
      folder_url: "",
      newer_version_blocked_because: null,
      has_its_manifest: true,
    },
    { view_type_id: "night-show:deck", project: "000719ff-93e9-43d1-ba64-975cf13f9a6a", project_name: "night-show", view_folder: "deck", import_folder: null, opens: true, not_opened_because: null, folder_url: projectViewFolderUrl(recordedNightShowFolder, deckVersion, "views/deck"), newer_version_blocked_because: null, has_its_manifest: true },
    {
      view_type_id: "lobby-wall:meter",
      project: "d3e1e5f3-dbe2-4741-af4a-f04744190635",
      project_name: "lobby-wall",
      view_folder: "meter",
      import_folder: "lobby-wall",
      opens: true,
      not_opened_because: null,
      folder_url: projectViewFolderUrl(recordedNightShowFolder, meterVersion, "imports/lobby-wall/views/meter"),
      newer_version_blocked_because: null,
      has_its_manifest: true,
    },
  ]);
  expect(sharedState.projectViewsListed.passedExtensionFolder(recordedNightShowFolder, deckVersion, "views/deck")?.files).toEqual(new Map([["views/deck/index.html", Buffer.from(NOTES_PAGE)]]));
  expect(sharedState.projectViewsListed.passedExtensionFolder(recordedNightShowFolder, deckVersion, "views/broken")).toBeNull();
  expect(sharedState.localApiControlOperationCallsReceived().filter(([method]) => method === "check_project_code").map(([, params]) => params)).toEqual([
    { project_directory: recordedNightShowFolder, paths: ["views/deck/index.html"] },
    { project_directory: `${recordedNightShowFolder}/imports/lobby-wall`, paths: ["views/meter/index.html", "views/meter/meter.ts"] },
  ]);
  expect(await commandHandlers.list_studio_views_of_the_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});
