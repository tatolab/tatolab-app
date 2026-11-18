import { mkdtemp, readFile, rm } from "node:fs/promises";
import { ProjectViewsListedToTheWindows } from "./extension_files_served_with_types_removed.js";
import { streamGraphChangesFollowedForTheWindows } from "./stream_graph_changes_followed_for_the_windows.js";
import { projectLogRecordsFollowedForTheWindows } from "./project_log_records_followed_for_the_windows.js";
import { RuntimePortViewers } from "./runtime_port_viewers.js";
import { localApiRequestFailure } from "./local_api_request_failure.js";
import os from "node:os";
import path from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { assert, vi } from "vitest";
import type { ListedStream, ProjectTransactionAuthor, SystemMenuBarMenu, TatolabPlatform } from "../shared/tatolab_backend_contract.js";
import { controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { FakeCarriedRuntimeStarts, FakeTatolabAppOpenedAtLogin, FakeTatolabCommandLineToolLink, FakeTerminalOpenedInAFolder, fakeTatolabPlatformForThisBuild, FakeSystemMediaAccess } from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { SystemMediaAccessAskedAheadForViews } from "./system_media_access_asked_ahead_for_views.js";
import { HeldRememberedSwitch, RememberedSwitchFile } from "./remembered_switch_file.js";
import { StudioWarningsOfThisRun } from "./studio_warnings.js";
import type { ProjectReadingsOfTheRuntime } from "./open_project.js";
import { PythonLanguageServers } from "./python_language_servers.js";
import { TatolabAppWindows } from "./tatolab_app_windows.js";
import { FakeTatolabElectronAppShell, PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { recentProjectFoldersFileIn } from "./recent_project_folders_file.js";
import { failedWith, succeeded } from "./result.js";
import { StreamFailureNotifications } from "./stream_failure_notifications.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog, type TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";
import { tatolabWindowCommandHandlers } from "./tatolab_commands.js";
import {
  ListedStreams,
  ModuleManagerWindows,
  PackageCatalog,
  PersonEditingInStudio,
  RecentProjects,
  ProjectDialogs,
  ProjectViewsListed,
  StatusRounds,
  StudioAppVersion,
  studioRuntimeLayer,
  StudioWindows,
  SystemMediaAccessAhead,
  ThisMachinesFolders,
  tatolabAppLogAsEffectsLogger,
  type StudioServices,
} from "./studio_runtime.js";
import { projectPlaybackAsListed } from "../shared/project_playback.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { CommandRefused } from "./window_command.js";
import { SystemMenuBarOfTheFocusedWindow } from "./system_menu_bar_of_the_focused_window.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { StreamProjectAdding } from "./stream_project_adding.js";
import { TatolabAppUpdateAnnouncements } from "./tatolab_app_update_announcements.js";
import { TatolabAppUpdater } from "./tatolab_app_updater.js";


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

/** The version of the Studio the command handlers in a test run as. */
export const STUDIO_APP_VERSION_UNDER_TEST = "0.45.0";

/** What a test's Studio services hold where the defaults of `studioServicesLayerForTest` do not suit it. */
export interface StudioServicesOfATest {
  /** The local API the live `RuntimeControl` calls, and how long it waits; nothing answers at the default. */
  readonly localApiSocketPath?: string;
  readonly localApiTimeLimitMs?: number;
  /** The one studio window, by its contents id, and the project it holds; a command from any other window is refused as one from the Projects window. */
  readonly studioWindow?: { readonly windowContentsId: number; readonly projectFolder: string };
  readonly streamAssetsOfTheProject?: (projectFolder: string) => ReadonlySet<string>;
  /** Whether the runtime lists a stream from a folder; at the default, whether `streamAssetsOfTheProject` gives it any. */
  readonly aStreamIsListedFrom?: (projectFolder: string) => boolean;
  /** Whether the runtime lists a folder's project open; none at the default. */
  readonly theProjectIsListedOpen?: (projectFolder: string) => boolean;
  /** The stream the runtime lists with an id; none at the default. */
  readonly listedStream?: (stream: string) => ListedStream | null;
  readonly author?: ProjectTransactionAuthor;
  readonly appVersion?: string;
  /** Where Effect's logs go; nowhere at the default. */
  readonly tatolabAppLog?: TatolabAppLog;
}

/** A studio window a test's commands come from, holding hallways. */
export const STUDIO_WINDOW_UNDER_TEST = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1, projectFolder: "/home/sam/projects/hallways" } as const;

/** Every Studio service a converted command runs on, as a test sets them up: the live `RuntimeControl` over a fake local API and the rest as `overrides` says. */
export function studioServicesLayerForTest(overrides: StudioServicesOfATest = {}): Layer.Layer<StudioServices> {
  const studioWindow = overrides.studioWindow ?? STUDIO_WINDOW_UNDER_TEST;
  return Layer.mergeAll(
    runtimeControlLayer(overrides.localApiSocketPath ?? "/nowhere/tatolab.sock", overrides.localApiTimeLimitMs ?? 2_000),
    Layer.succeed(StudioWindows, {
      projectFolderOfTheWindow: (commandFromWindow) =>
        commandFromWindow.windowContentsId === studioWindow.windowContentsId ? Effect.succeed(studioWindow.projectFolder) : Effect.fail(new CommandRefused({ words: "No project is open in this window." })),
      openProjectReadingOfTheWindow: (commandFromWindow) =>
        commandFromWindow.windowContentsId === studioWindow.windowContentsId
          ? Effect.succeed({ kind: "none_open" as const })
          : Effect.fail(new CommandRefused({ words: "No project is open in this window." })),
      aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === studioWindow.projectFolder,
      folderOfTheWindowsOpenProject: (commandFromWindow, folder) => (commandFromWindow.windowContentsId === studioWindow.windowContentsId && folder === studioWindow.projectFolder ? folder : null),
      openedFolderOfTheStudioWindow: (commandFromWindow) => (commandFromWindow.windowContentsId === studioWindow.windowContentsId ? studioWindow.projectFolder : null),
      openTheProjectInItsStudioWindow: () => Effect.succeed("opened_its_studio_window" as const),
      closeTheStudioWindowOf: () => Effect.void,
      stepTheProjectsWindowAsideFor: () => Effect.void,
    }),
    Layer.succeed(ModuleManagerWindows, {
      workspaceFolderOfTheWindow: () => Effect.fail(new CommandRefused({ words: "Only a Module manager window imports into a project." })),
      chooseDependencySource: () => Effect.succeed(null),
    }),
    Layer.succeed(PackageCatalog, {
      readTheCatalog: Effect.succeed({ kind: "read" as const, entries: [], unreadable_entry_count: 0 }),
      downloadTheZipOf: (entry) => Effect.fail(new CommandRefused({ words: `${entry.title} was not downloaded.` })),
    }),
    Layer.succeed(ThisMachinesFolders, { homeDirectory: "/home/sam", documentsDirectory: "/home/sam/Documents" }),
    Layer.succeed(ProjectDialogs, {
      chooseAProjectFolder: () => Effect.succeed(null),
      chooseAProjectArchive: () => Effect.succeed(null),
      chooseAProjectCoverImage: () => Effect.succeed(null),
      chooseProjectAssetFiles: () => Effect.succeed(null),
    }),
    Layer.succeed(RecentProjects, { readRecentFolders: Effect.succeed([]), rememberOpened: () => Effect.void, forget: () => Effect.void }),
    Layer.succeed(ProjectViewsListed, { isListedAsOpening: () => false, startAListing: Effect.succeed(1), rememberTheListing: () => Effect.void }),
    Layer.succeed(ListedStreams, {
      streamAssetsOfTheProject: overrides.streamAssetsOfTheProject ?? (() => new Set()),
      aStreamIsListedFrom: overrides.aStreamIsListedFrom ?? ((projectFolder) => (overrides.streamAssetsOfTheProject?.(projectFolder).size ?? 0) > 0),
      theProjectIsListedOpen: overrides.theProjectIsListedOpen ?? (() => false),
      listedStream: overrides.listedStream ?? (() => null),
      playbackOfTheProject: (projectFolder) => projectPlaybackAsListed([], projectFolder),
    }),
    Layer.succeed(SystemMediaAccessAhead, { askForTheDevicesTheViewsDeclare: () => Effect.void }),
    Layer.succeed(StatusRounds, { requestARound: Effect.void }),
    Layer.succeed(PersonEditingInStudio, { author: overrides.author ?? { kind: "person", name: "sam" } }),
    Layer.succeed(StudioAppVersion, { version: overrides.appVersion ?? STUDIO_APP_VERSION_UNDER_TEST }),
    tatolabAppLogAsEffectsLogger(overrides.tatolabAppLog ?? quietTatolabAppLog),
  );
}

/**
 * The handler of every command the window invokes over `sharedState`, the converted ones run on the app's live layers over it and the local API at
 * `localApiSocketPath`, its fake one at the default, disposed after the test; `quit_tatolab_app` quits through `quitTheApp`.
 */
export function commandHandlersOver(
  sharedState: TatolabAppSharedState & { localApiSocketPath: string },
  quitTheApp: () => void = () => {},
  localApiSocketPath: string = sharedState.localApiSocketPath,
): TatolabWindowCommandHandlers {
  const studioRuntime = ManagedRuntime.make(studioRuntimeLayer(sharedState, localApiSocketPath, STUDIO_APP_VERSION_UNDER_TEST));
  cleanUps.push(() => studioRuntime.dispose());
  return tatolabWindowCommandHandlers(sharedState, studioRuntime, quitTheApp);
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
    /** The request line of each request the fake local API read, in order. */
    localApiRequestLinesReceived: () => string[];
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
    appVersion: STUDIO_APP_VERSION_UNDER_TEST,
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
    homeDirectory: appConfigDirectory,
    documentsDirectory: path.join(appConfigDirectory, "Documents"),
    projectFolderDialog: async () => succeeded(null),
    projectArchiveDialog: async () => succeeded(null),
    projectCoverImageDialog: async () => succeeded(null),
    recentProjectFolders: recentProjectFoldersFileIn(appConfigDirectory, quietTatolabAppLog),
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
    projectAssetFilesDialog: async () => succeeded(assetFilesTheDialogAnswers.files),
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
    localApiRequestLinesReceived: () => localApiServer.receivedRequests().map((request) => request.split("\r\n")[0] ?? ""),
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

/** A local API carrying out each project action the open-project commands ask of it as the runtime does, recording each in order with its folder, and answering `open_project` with `openRefusedWith` instead when given. */
export async function aLocalApiQueuingEachProjectAction(openRefusedWith: Buffer | null = null): Promise<{ localApiSocketPath: string; projectActionsQueued: [string, string][] }> {
  const projectActionsQueued: [string, string][] = [];
  const localApiServer = await FakeLocalApiServer.answeringEachControlOperation(async (method, params) => {
    const projectDirectory = String(params["project_directory"]);
    projectActionsQueued.push([method, projectDirectory]);
    switch (method) {
      case "open_project":
        return openRefusedWith ?? controlOperationResultResponse({ action: `${method}-1`, project_directory: projectDirectory });
      case "start_playback":
      case "reload_project":
      case "stop_playback":
        return controlOperationResultResponse({ action: `${method}-1`, project_directory: projectDirectory });
      case "pause_playback":
      case "resume_playback":
        return controlOperationResultResponse({ project_directory: projectDirectory, streams: ["hallways-main-80cbae"] });
      default:
        return null;
    }
  });
  cleanUps.push(() => localApiServer.close());
  return { localApiSocketPath: localApiServer.localApiSocketPath, projectActionsQueued };
}
