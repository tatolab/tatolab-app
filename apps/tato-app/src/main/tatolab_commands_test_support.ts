import { mkdtemp, readFile, rm } from "node:fs/promises";
import { ProjectViewsListedToTheWindows } from "./project_view_files.js";
import { streamGraphChangesFollowedForTheWindows } from "./stream_graph_changes_followed_for_the_windows.js";
import { projectLogRecordsFollowedForTheWindows } from "./project_log_records_followed_for_the_windows.js";
import { RuntimePortViewers } from "./runtime_port_viewers.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import os from "node:os";
import path from "node:path";
import { assert, vi } from "vitest";
import type { ListedStream, SystemMenuBarMenu, TatolabPlatform } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeStarts, FakeTatolabAppOpenedAtLogin, FakeTatolabCommandLineToolLink, FakeTerminalOpenedInAFolder, fakeTatolabPlatformForThisBuild, FakeSystemMediaAccess } from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { SystemMediaAccessAskedAheadForViews } from "./system_media_access_asked_ahead_for_views.js";
import { HeldRememberedSwitch, RememberedSwitchFile } from "./remembered_switch_file.js";
import { StudioWarningsOfThisRun } from "./studio_warnings.js";
import { ProjectOpening, type ProjectReadingsOfTheRuntime } from "./open_project.js";
import { PythonLanguageServers } from "./python_language_servers.js";
import { TatolabAppWindows } from "./tatolab_app_windows.js";
import { FakeTatolabElectronAppShell, PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { recentProjectFoldersFileIn } from "./recent_project_folders_file.js";
import { failedWith, succeeded } from "./result.js";
import { StreamFailureNotifications } from "./stream_failure_notifications.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { SystemMenuBarOfTheFocusedWindow } from "./system_menu_bar_of_the_focused_window.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { StreamProjectAdding } from "./stream_project_adding.js";
import { TatolabAppUpdateAnnouncements } from "./tatolab_app_update_announcements.js";
import { TatolabAppUpdater } from "./tatolab_app_updater.js";
import { ProjectAssetsImportedFromChosenFiles } from "./project_assets_imported_from_chosen_files.js";


/** A command as the Projects window sends it. */
export const FROM_THE_PROJECTS_WINDOW = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID };

/** The clean-ups of the fakes the running test made, run after it. */
export const cleanUps: (() => Promise<void>)[] = [];

/** Runs and forgets the clean-ups of the fakes the test that just ended made. */
export async function cleanUpTheFakesTheLastTestMade(): Promise<void> {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
}

/** The app's log, keeping only errors and writing them nowhere. */
const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** Project readings of a runtime that answers none of them. */
const NO_RUNTIME_READS_THE_PROJECTS: ProjectReadingsOfTheRuntime = {
  nameTheProject: async () => failedWith("no runtime answers"),
  listTheDependencies: async () => failedWith("no runtime answers"),
};

/** Project readings of a runtime that names every project `hallways`, with no dependencies. */
export const THE_RUNTIME_READS_EACH_PROJECT_AS_HALLWAYS: ProjectReadingsOfTheRuntime = {
  nameTheProject: async (folder) => succeeded({ folder, project: "6f1d0b7e-4c2a-4e8b-9a31-0d5e7c9b2f14", name: "hallways" }),
  listTheDependencies: async () => succeeded([]),
};

/** The text of the recorded runtime response `fixtureFileName` under `test-fixtures/`. */
export const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

/** The control operation a request to the fake local API called and its params, or none for a request that calls no operation. */
function controlOperationCallOfTheRequest(request: string): [string, unknown][] {
  if (!request.startsWith("POST /control ")) return [];
  const requestBody: { method: string; params: unknown } = JSON.parse(request.slice(request.indexOf("\r\n\r\n") + 4));
  return [[requestBody.method, requestBody.params]];
}

/** The app's shared state over a fake local API answering `scriptedLocalApiResponses` and fakes of everything else it drives, with the fakes exposed to check. */
export async function sharedStateOverFakes(
  scriptedLocalApiResponses: readonly Buffer[],
  platform: TatolabPlatform,
  existingFolders: readonly string[] = [],
  folderTheDialogAnswers: string | null = null,
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime = NO_RUNTIME_READS_THE_PROJECTS,
): Promise<
  TatolabAppSharedState & {
    commandLineToolLink: FakeTatolabCommandLineToolLink;
    carriedRuntimeStarts: FakeCarriedRuntimeStarts;
    terminal: FakeTerminalOpenedInAFolder;
    foldersShownInTheFileManager: string[];
    webPagesOpenedInTheBrowser: string[];
    localApiSocketPath: string;
    systemNotifications: FakeSystemNotifications;
    systemMediaAccess: FakeSystemMediaAccess;
    tatolabAppOpenedAtLogin: FakeTatolabAppOpenedAtLogin;
    menusShownInTheSystemMenuBar: (readonly SystemMenuBarMenu[] | null)[];
    assetFilesTheDialogAnswers: { files: readonly string[] | null };
    localApiControlOperationCallsReceived: () => [string, unknown][];
  }
> {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  const commandLineToolLink = new FakeTatolabCommandLineToolLink({ kind: "linked", path: "/Users/someone/.local/bin/tatolab" });
  const terminal = new FakeTerminalOpenedInAFolder();
  const carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  const tatolabAppOpenedAtLogin = new FakeTatolabAppOpenedAtLogin();
  const platformForThisBuild = fakeTatolabPlatformForThisBuild({
    localApiSocket: localApiServer.localApiSocketPath,
    commandLineToolLink,
    terminalOpenedInAFolder: terminal,
    tatolabAppOpenedAtLogin,
  });
  const studioWarnings = new StudioWarningsOfThisRun(
    platform === "linux" ? "cpu_read" : "display_import",
    await HeldRememberedSwitch.load(RememberedSwitchFile.x11WarningDialogShownInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog)),
  );
  const controller = TatolabAppController.create({
    platform,
    platformForThisBuild,
    startTheCarriedRuntime: carriedRuntimeStarts.startTheCarriedRuntime,
    appVersion: "0.45.0",
    appBuild: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "dev", built_with_uncommitted_changes: true },
    readMonotonicClockMs: () => 0,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readTheAppUpdateAnnouncement: () => null,
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readDeveloperMode: () => false,
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    readTheStudioWarnings: () => studioWarnings.warningsNow(),
    whenTheRuntimeExits: () => {},
    projectVenvSyncsOfTheFollowedStreamActions: { takeTheProjectVenvSyncs: () => ({ underWay: [], justEnded: [] }) },
    projectStreamActionFailuresOfTheFollowedStreamActions: { projectStreamActionFailuresNow: () => [] },
    tatolabAppLog: quietTatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(controller, () => {}, () => 0, quietTatolabAppLog);
  const tatolabAppUpdater = new TatolabAppUpdater(
    { kind: "not_offered", reason: "this fake platform updates nothing" },
    { notifyANewerVersionIsAvailable: () => {}, notifyTheAppIsUpToDate: () => {}, notifyTheUpdateFailed: () => {} },
    () => {},
    () => {},
    quietTatolabAppLog,
  );
  const foldersShownInTheFileManager: string[] = [];
  const webPagesOpenedInTheBrowser: string[] = [];
  const systemNotifications = new FakeSystemNotifications();
  const systemMediaAccess = new FakeSystemMediaAccess();
  const streamFailureNotifications = await StreamFailureNotifications.load(
    RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog),
    systemNotifications,
    () => {},
    quietTatolabAppLog,
  );
  const developerModeSwitch = await HeldRememberedSwitch.load(RememberedSwitchFile.developerModeInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog));
  const fakeShellForTheWindows = new FakeTatolabElectronAppShell();
  const menusShownInTheSystemMenuBar: (readonly SystemMenuBarMenu[] | null)[] = [];
  const assetFilesTheDialogAnswers: { files: readonly string[] | null } = { files: null };
  const appWindows = new TatolabAppWindows({
    mainWindowHostFactory: fakeShellForTheWindows.tatolabElectronAppShell.mainWindowHostFactory,
    platformItems: { mainWindowChrome: { titleBarStyle: "default" }, setDockIconVisible: () => {} },
    dockIconHost: fakeShellForTheWindows.tatolabElectronAppShell.dockIconHost,
    watchFolderEntries: () => null,
    projectReadingsOfTheRuntime,
    projectFilesOfTheRuntime: {
      listProjectFiles: async () => failedWith("no runtime answers"),
      readProjectFile: async () => failedWith("no runtime answers"),
      writeProjectFile: async () => failedWith("no runtime answers"),
      createNodeFile: async () => failedWith("no runtime answers"),
    },
    personSavingTheFiles: { kind: "person", name: "sam" },
    mintAnIdempotencyKey: () => "a-save",
    openTheProjectTransactionsFeedConnection: async () => localApiRequestFailure("no runtime answers"),
    runAfter: () => () => {},
    closeTheProjectAsItsWindowCloses: async () => succeeded(undefined),
    whenAWindowStartingLanguageServersClosed: () => {},
    whenAWindowShowingPortViewersClosed: () => {},
    tatolabAppLog: quietTatolabAppLog,
  });
  appWindows.showTheProjectsWindow();
  const projectOpening = new ProjectOpening({
    homeDirectory: appConfigDirectory,
    documentsDirectory: path.join(appConfigDirectory, "Documents"),
    projectFolderDialog: async () => succeeded(null),
    projectArchiveDialog: async () => succeeded(null),
    projectCoverImageDialog: async () => succeeded(null),
    recentProjectFolders: recentProjectFoldersFileIn(appConfigDirectory, quietTatolabAppLog),
    readWallClockNowMs: () => 1_790_000_000_000,
    newProjectCreation: controller,
    projectReadingsOfTheRuntime,
    projectChanges: controller,
    waitFor: async () => {},
    readMonotonicClockMs: () => 0,
    openTheProjectInItsStudioWindow: (folder) => appWindows.openTheProjectInItsStudioWindow(folder),
    closeTheStudioWindowOf: (folder) => appWindows.studioWindowOfTheProjectIn(folder)?.tatolabMainWindow.close(),
    openTheProjectWhenTheRuntimeHoldsItClosed: async () => succeeded(undefined),
  });
  return {
    controller,
    statusPublisher,
    tatolabAppUpdater,
    tatolabAppUpdateAnnouncements: new TatolabAppUpdateAnnouncements(() => {}),
    machineModulesInstallOn: { sys_platform: "darwin", platform_machine: "arm64" },
    openAWebPageInTheBrowser: async (webPageUrl) => {
      webPagesOpenedInTheBrowser.push(webPageUrl);
      return succeeded(undefined);
    },
    streamProjectFolderOpeners: {
      openAFolderInTheFileManager: async (folder) => {
        foldersShownInTheFileManager.push(folder);
        return succeeded(undefined);
      },
      terminalOpenedInAFolder: terminal,
      isAnExistingFolder: async (folderPath) => existingFolders.includes(folderPath),
    },
    streamProjectAdding: new StreamProjectAdding({
      homeDirectory: appConfigDirectory,
      streamProjectFolderDialog: async () => succeeded(folderTheDialogAnswers),
      projectLoadsOnTheRuntime: controller,
    }),
    developerModeSwitch,
    studioWarnings,
    projectOpening,
    appWindows,
    pythonLanguageServers: new PythonLanguageServers({
      startANodeLanguageServer: () => failedWith("these tests start no language server"),
      pyrightLanguageServerModulePath: "/fake/pyright/langserver.index.js",
      tatolabAppLog: quietTatolabAppLog,
    }),
    runtimePortViewers: new RuntimePortViewers({
      openTheViewerConnection: async () => localApiRequestFailure("these tests open no viewer connection"),
      openAChannelReader: () => failedWith("these tests read no channel"),
      viewerProcessId: 4242,
      waitThen: () => undefined,
      streamStateTheRuntimeListsNow: () => "running",
      tatolabAppLog: quietTatolabAppLog,
    }),
    streamGraphChangesFollowed: streamGraphChangesFollowedForTheWindows({
      openThePushesConnection: async () => localApiRequestFailure("these tests open no stream graph changes connection"),
      waitThen: () => undefined,
      tatolabAppLog: quietTatolabAppLog,
    }),
    projectLogRecordsFollowed: projectLogRecordsFollowedForTheWindows({
      openThePushesConnection: async () => localApiRequestFailure("these tests open no project log records connection"),
      waitThen: () => undefined,
      tatolabAppLog: quietTatolabAppLog,
    }),
    systemMenuBar: new SystemMenuBarOfTheFocusedWindow({
      applicationMenu: platform === "macos" ? "macos_menu_bar" : "none",
      setTheApplicationMenu: (_applicationMenu, menusOfTheFocusedWindow) => menusShownInTheSystemMenuBar.push(menusOfTheFocusedWindow),
      sendTheWindowTheChosenEntry: () => {},
    }),
    menusShownInTheSystemMenuBar,
    fetchTextOverHttps: async () => failedWith("these tests reach no network"),
    fetchBytesOverHttps: async () => failedWith("these tests reach no network"),
    moduleDownloadsFolder: path.join(appConfigDirectory, "module-downloads"),
    dependencySourceDialog: async () => succeeded(null),
    projectAssetsImportedFromChosenFiles: new ProjectAssetsImportedFromChosenFiles({
      homeDirectory: appConfigDirectory,
      projectAssetFilesDialog: async () => succeeded(assetFilesTheDialogAnswers.files),
      projectChanges: controller,
    }),
    assetFilesTheDialogAnswers,
    thePersonEditingInStudio: { kind: "person", name: "sam" },
    projectViewsListed: new ProjectViewsListedToTheWindows(),
    systemMediaAccessAskedAheadForViews: new SystemMediaAccessAskedAheadForViews(systemMediaAccess, systemNotifications),
    systemMediaAccess,
    tatolabAppLog: quietTatolabAppLog,
    commandLineToolLink,
    carriedRuntimeStarts,
    terminal,
    foldersShownInTheFileManager,
    webPagesOpenedInTheBrowser,
    localApiSocketPath: localApiServer.localApiSocketPath,
    localApiControlOperationCallsReceived: () => localApiServer.receivedRequests().flatMap(controlOperationCallOfTheRequest),
    streamFailureNotifications,
    systemNotifications,
    tatolabAppOpenedAtLogin,
  };
}


/** The pattern project the recorded `list_streams`, `open_project` and `reload_project` answers name. */
export const RECORDED_PATTERN_PROJECT = "/tmp/tatolab-proof-projects/pattern";
/** The action of the recorded `reload_project` answer of the pattern project. */
export const RECORDED_PATTERN_RELOAD_ACTION = "Rhrb4oumhnnzujbb137ivd7ah-7";
/** The lobby project the recorded answers name. */
export const RECORDED_LOBBY_PROJECT = "/tmp/tatolab-proof-projects/lobby";
/** The action of the recorded `open_project` answer of the lobby project. */
export const RECORDED_LOBBY_OPEN_ACTION = "Rhrb4oumhnnzujbb137ivd7ah-8";
/** A project the runtime holds open that the recorded `list_streams` answer does not list. */
export const RECORDED_UNLISTED_PROJECT_THE_RUNTIME_HOLDS_OPEN = "/tmp/tatolab-proof-projects/doorways";

/** A stream of the project in `projectDirectory` as `list_streams` lists it in `state`. */
export function listedStreamOfTheProject(projectDirectory: string, state: string, streamName = "main"): ListedStream {
  return {
    stream: `${path.basename(projectDirectory)}-${streamName}-${state}`,
    display_name: streamName,
    location: { project_directory: projectDirectory, project: "4be1ae19-0c7f-4cff-a959-d596c611e05b", stream_asset: `asset-${streamName}-${state}` },
    state,
    node_count: state === "failed" || state === "closed" ? null : 3,
    failed_because: state === "failed" ? "process() raised SyntaxError" : null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

/** Have the status publisher answer that it last listed `streams`. */
export function statusLastPublishedListing(sharedState: TatolabAppSharedState, streams: ListedStream[]): void {
  const lastPublished = sharedState.statusPublisher.lastPublishedStatusNow();
  assert(lastPublished !== null, "the status publisher published no status yet");
  vi.spyOn(sharedState.statusPublisher, "lastPublishedStatusNow").mockReturnValue({ ...lastPublished, streams });
}

/** The project actions each controller method queued, in order, each answering `queued`. */
export function projectActionsQueuedOn(sharedState: TatolabAppSharedState) {
  const projectActionsQueued: [string, string][] = [];
  const queued = (verb: string) => async (projectDirectory: string) => {
    projectActionsQueued.push([verb, projectDirectory]);
    return succeeded({ action: `${verb}-1`, project_directory: projectDirectory });
  };
  vi.spyOn(sharedState.controller, "openProject").mockImplementation(queued("open_project"));
  vi.spyOn(sharedState.controller, "startPlayback").mockImplementation(queued("start_playback"));
  vi.spyOn(sharedState.controller, "reloadProject").mockImplementation(queued("reload_project"));
  vi.spyOn(sharedState.controller, "stopPlayback").mockImplementation(async (projectDirectory) => {
    projectActionsQueued.push(["stop_playback", projectDirectory]);
    return succeeded("stop_playback-1");
  });
  const heldOrResumed = (verb: string) => async (projectDirectory: string) => {
    projectActionsQueued.push([verb, projectDirectory]);
    return succeeded(["hallways-main-80cbae"]);
  };
  vi.spyOn(sharedState.controller, "pausePlayback").mockImplementation(heldOrResumed("pause_playback"));
  vi.spyOn(sharedState.controller, "resumePlayback").mockImplementation(heldOrResumed("resume_playback"));
  return projectActionsQueued;
}
