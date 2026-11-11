import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { projectViewFolderUrl, ProjectViewsListedToTheWindows } from "./project_view_files.js";
import { RuntimePortViewers } from "./runtime_port_viewers.js";
import { localApiRequestFailure } from "./local_api_client.js";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { ListedStream, SystemMenuBarMenu, TatolabPlatform } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  FakeCarriedRuntimeStarts,
  FakeTatolabAppOpenedAtLogin,
  FakeTatolabCommandLineToolLink,
  FakeTerminalOpenedInAFolder,
  fakeTatolabPlatformForThisBuild,
  FakeSystemMediaAccess,
} from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { SystemMediaAccessAskedAheadForViews } from "./system_media_access_asked_ahead_for_views.js";
import { HeldRememberedSwitch, RememberedSwitchFile } from "./remembered_switch_file.js";
import { ProjectOpening, type ProjectReadingsOfTheRuntime } from "./open_project.js";
import { PythonLanguageServers } from "./python_language_servers.js";
import { TatolabAppWindows } from "./tatolab_app_windows.js";
import { FakeTatolabElectronAppShell, PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { recentProjectFoldersFileIn } from "./recent_project_folders_file.js";
import { failedWith, succeeded } from "./result.js";
import { StreamFailureNotifications } from "./stream_failure_notifications.js";
import { RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL } from "./carried_runtime_run_as_the_apps_child.js";
import { RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL } from "./runtime_log_folder_opening.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import { SystemMenuBarOfTheFocusedWindow } from "./system_menu_bar_of_the_focused_window.js";

/** A command as the Projects window sends it. */
const FROM_THE_PROJECTS_WINDOW = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID };
import {
  answerTheWindow,
  describeStreamGraph,
  getTatolabStatus,
  readProjectLogRecords,
  enabledArgumentsFrom,
  readProjectLogRecordsArgumentsFrom,
  removeProject,
  streamArgumentsFrom,
  linkCommandLineTool,
  runTheSavedPythonFileOfAPlayingOrFailedProject,
  whatASavedNodeFileAsksOfTheRuntime,
  startTheProjectWhenTheRuntimeHoldsNoStreamOfItLoaded,
  tatolabWindowCommandHandlers,
} from "./tatolab_commands.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { StreamProjectAdding } from "./stream_project_adding.js";
import { TatolabAppUpdateAnnouncements } from "./tatolab_app_update_announcements.js";
import { TatolabAppUpdater } from "./tatolab_app_updater.js";
import { ProjectAssetsImportedFromChosenFiles } from "./project_assets_imported_from_chosen_files.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

const NO_RUNTIME_READS_THE_PROJECTS: ProjectReadingsOfTheRuntime = {
  nameTheProject: async () => failedWith("no runtime answers"),
  listTheDependencies: async () => failedWith("no runtime answers"),
};

const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

async function sharedStateOverFakes(
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
    whenTheRuntimeExits: () => {},
    projectVenvSyncsOnTheStreamActionsFeed: { keepFollowing: () => {}, takeTheProjectVenvSyncs: () => ({ underWay: [], justEnded: [] }) },
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
    stopTheProjectAsItsWindowCloses: async () => succeeded(undefined),
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
    startTheProjectWhenTheRuntimeHoldsNoStreamOfItLoaded: async () => succeeded(undefined),
  });
  return {
    controller,
    statusPublisher,
    tatolabAppUpdater,
    tatolabAppUpdateAnnouncements: new TatolabAppUpdateAnnouncements(() => {}),
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
      repeatEvery: () => () => undefined,
      waitThen: () => undefined,
      streamStateTheRuntimeListsNow: () => "running",
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
    streamFailureNotifications,
    systemNotifications,
    tatolabAppOpenedAtLogin,
  };
}

test("an_awaited_command_answers_with_its_works_answer_or_why_it_has_none", async () => {
  expect(await answerTheWindow("read_project_log_records", async () => succeeded(7))).toEqual(succeeded(7));
  const refusal = await answerTheWindow<number>("describe_stream_graph", () => Promise.reject(new Error("the work failed unexpectedly")));
  expect(!refusal.ok && refusal.failure.startsWith("describe_stream_graph ended without an answer"), JSON.stringify(refusal)).toBe(true);
});

/** The window's TypeScript types read exactly this JSON, key for key and in this order. */
test("the_status_a_log_page_and_a_graph_serialize_exactly_as_the_window_reads_them", async () => {
  const runningRuntime = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({
        streams: [
          {
            stream: "pattern-main-41d0c2",
            display_name: "main",
            location: { project_directory: "/private/tmp/x/pattern", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
            state: "running",
            node_count: 4,
            failed_because: null,
            action: null,
            step: null,
            from_later: 1,
          },
        ],
      }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "macos"
  );
  expect(JSON.stringify(await runningRuntime.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0",' +
      '"app_build":{"tatolab_app_commit":"22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1","build_kind":"dev","built_with_uncommitted_changes":true},' +
      '"platform":"macos","runtime_state":"running","runtime_not_running_because":null,' +
      '"machine_name":"jonathanf-macbook","streams":[' +
      '{"stream":"pattern-main-41d0c2","display_name":"main","location":{"project_directory":"/private/tmp/x/pattern","project":"0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55","stream_asset":"7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"action":null,"step":null}],"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"streams_not_listed_because":null,' +
      '"command_line_tool_link":{"kind":"linked","path":"/Users/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(runningRuntime.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );
  const runtimeThatIsDown = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");
  runtimeThatIsDown.commandLineToolLink.commandLineToolLink = { kind: "not_linked", path: "/home/someone/.local/bin/tatolab" };
  expect(JSON.stringify(await runtimeThatIsDown.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0",' +
      '"app_build":{"tatolab_app_commit":"22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1","build_kind":"dev","built_with_uncommitted_changes":true},' +
      '"platform":"linux","runtime_state":"starting","runtime_not_running_because":null,"machine_name":null,' +
      '"streams":null,"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"streams_not_listed_because":null,"command_line_tool_link":{"kind":"not_linked","path":"/home/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(runtimeThatIsDown.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );

  const page = projectLogRecordsPageFromTheLogsToolResult(
    JSON.stringify({
      project_directory: "/private/tmp/x/pattern",
      records: [
        {
          message: "Loading the stream `main`",
          host_ts: 1791757115431254000,
          target: "streamlib_engine::core::runtime::loaded_stream",
          source: "rust",
          attrs: { processor_class_import_path: "nodes.x:X" },
          level: "info",
          action: "R1-2",
          stream: "pattern-main-41d0c2",
        },
        {},
      ],
      next_after: "1:90",
      records_no_longer_held: false,
    }),
  );
  expect(page.ok && JSON.stringify(page.value)).toBe(
    '{"project_directory":"/private/tmp/x/pattern","records":[' +
      '{"host_ts_ns":1791757115431254000,"level":"info","source":"rust",' +
      '"target":"streamlib_engine::core::runtime::loaded_stream",' +
      '"message":"Loading the stream `main`",' +
      '"attrs":{"processor_class_import_path":"nodes.x:X"},"processor_id":null,"sent_by_its_own_process":false,' +
      '"action":"R1-2","stream":"pattern-main-41d0c2",' +
      '"jsonl_line":"{\\"message\\":\\"Loading the stream `main`\\",\\"host_ts\\":1791757115431254000,' +
      '\\"target\\":\\"streamlib_engine::core::runtime::loaded_stream\\",\\"source\\":\\"rust\\",' +
      '\\"attrs\\":{\\"processor_class_import_path\\":\\"nodes.x:X\\"},\\"level\\":\\"info\\",' +
      '\\"action\\":\\"R1-2\\",\\"stream\\":\\"pattern-main-41d0c2\\"}"},' +
      '{"host_ts_ns":null,"level":null,"source":null,"target":null,' +
      '"message":"","attrs":{},"processor_id":null,"sent_by_its_own_process":false,"action":null,"stream":null,"jsonl_line":"{}"}],' +
      '"next_after":"1:90","records_no_longer_held":false}',
  );

  const graphToolResultText = JSON.stringify({
      machine: "jonathanf-macbook",
      links: [
        { state: "wired", target: { port: "video_from_upstream", node: "invertingeffect" }, source: { port: "video", node: "testpatternsource" }, id: "L1" },
      ],
      nodes: [
        {
          ports: { outputs: [{ catalog_entry: { entry: {}, section: "binary" }, name: "video" }], inputs: [] },
          components: { state: "Running" },
          type: "tatolab.stream:TestPatternSource",
          name: "testpatternsource",
          id: "P1",
        },
        { type: "nodes.inverting_effect:InvertingEffect", name: "invertingeffect", components: { metrics: { dropped_bags_by_link: { L1: 12 } } } },
      ],
      stream: "main",
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphToolResultText);
  expect(graph.ok && JSON.stringify(graph.value)).toBe(
    '{"stream":"main","stream_asset":null,"nodes":[' +
      '{"id":"P1","name":"testpatternsource","type":"tatolab.stream:TestPatternSource","state":"Running","failed_because":null,"config":{},"pins":{},' +
      '"input_ports":[],"output_ports":[{"name":"video","family":null,"stream_facts":null,"values_checked":null}],' +
      '"dropped_bags_by_link":{},"refused_bags_by_output_port":{},"studio":{"position":null,"group":null,"comment":null,"colour":null,"collapsed":null,"metadata":{}},"fragment":null},' +
      '{"id":"","name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","state":null,"failed_because":null,"config":{},"pins":{},' +
      '"input_ports":[],"output_ports":[],' +
      '"dropped_bags_by_link":{"L1":12},"refused_bags_by_output_port":{},"studio":{"position":null,"group":null,"comment":null,"colour":null,"collapsed":null,"metadata":{}},"fragment":null}],' +
      '"links":[{"id":"L1","source_node":"testpatternsource","source_port":"video",' +
      '"target_node":"invertingeffect","target_port":"video_from_upstream","state":"wired"}],"groups":[],"notes":[],' +
      `"graph_document_text":${JSON.stringify(graphToolResultText)}}`,
  );
});

test("a refusal from the runtime reaches the window in the runtime's own words", async () => {
  const graphRefusal = "graph failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const logsRefusal = "logs failed: Resource not found: this runtime holds no stream of the project in /tmp/nope";
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: graphRefusal }], isError: true } })),
      httpResponse(
        "200 OK",
        "application/json",
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: logsRefusal }], isError: true } }),
      ),
    ],
    "macos"
  );

  expect(await describeStreamGraph(sharedState, "nope")).toEqual(failedWith(graphRefusal));
  expect(await readProjectLogRecords(sharedState, "/tmp/nope", { stream: null, action: null }, null)).toEqual(failedWith(logsRefusal));
});

test("the window asking for the status before the first round waits for it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");

  const status = getTatolabStatus(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect((await status).ok).toBe(true);
});

test("linking the tatolab command asks the link, then observes again, and a refusal reaches the window in its own words", async () => {
  const sharedState = await sharedStateOverFakes([], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  sharedState.commandLineToolLink.commandLineToolLink = { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" };

  expect(await linkCommandLineTool(sharedState)).toEqual(succeeded(undefined));
  expect(sharedState.commandLineToolLink.commandLineToolLink).toEqual({ kind: "linked", path: "/Users/someone/.local/bin/tatolab" });
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  sharedState.commandLineToolLink.linkRefusal = "/Users/someone/.local/bin/tatolab is not a link to Tatolab, so Tato Studio left it alone.";
  expect(await linkCommandLineTool(sharedState)).toEqual(failedWith("/Users/someone/.local/bin/tatolab is not a link to Tatolab, so Tato Studio left it alone."));
  expect(sharedState.commandLineToolLink.linksAsked).toBe(2);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
});

test("a command's arguments are read as the window sends them, and anything else is refused", () => {
  expect(enabledArgumentsFrom("set_stream_failure_notifications", { enabled: false })).toEqual(succeeded({ enabled: false }));
  expect(enabledArgumentsFrom("set_stream_failure_notifications", { enabled: "yes" }).ok).toBe(false);
  expect(enabledArgumentsFrom("set_stream_failure_notifications", null).ok).toBe(false);
  expect(readProjectLogRecordsArgumentsFrom({ project_directory: "/tmp/p", stream: "pattern-main-d76f70", action: null, after: "1:7830" })).toEqual(
    succeeded({ projectDirectory: "/tmp/p", narrowing: { stream: "pattern-main-d76f70", action: null }, after: "1:7830" }),
  );
  expect(readProjectLogRecordsArgumentsFrom({ project_directory: "/tmp/p", stream: null, action: null, after: 79 }).ok).toBe(false);
  expect(readProjectLogRecordsArgumentsFrom({ stream: null, action: null, after: null }).ok).toBe(false);
  expect(streamArgumentsFrom("describe_stream_graph", { stream: "main" })).toEqual(succeeded({ stream: "main" }));
  expect(streamArgumentsFrom("describe_stream_graph", {}).ok).toBe(false);
});

test("each command answers the window in the contract's shape, a refusal in its own words and nothing as null", async () => {
  const graphRefusal = "graph failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const sharedState = await sharedStateOverFakes(
    [httpResponse("200 OK", "application/json", JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: graphRefusal }], isError: true } }))],
    "linux"
  );
  let quitRequests = 0;
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {
    quitRequests += 1;
  });
  expect(await commandHandlers.describe_stream_graph({ stream: "nope" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: graphRefusal });
  expect(await commandHandlers.link_command_line_tool(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.quit_tatolab_app(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(quitRequests).toBe(1);
  expect(await commandHandlers.set_stream_failure_notifications({ enabled: "yes" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "set_stream_failure_notifications needs `enabled`, true or false",
  });
  expect(await commandHandlers.read_project_log_records({ stream: "camera" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal:
      "read_project_log_records needs `project_directory`, a project's folder, and `stream`, `action` and `after`, each text or null: a stream's id, a stream action's id, and the cursor of the page before",
  });
  expect(await commandHandlers.describe_stream_graph(null, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "describe_stream_graph needs `stream`, a stream's id" });
});

test("removing a project queues on the runtime, then observes again whether it queued or was refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-refusal-for-a-project-the-runtime-holds-no-stream-of.json")),
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
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
    ],
    "linux"
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  expect(await commandHandlers.remove_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /home/jonathan-fontanez/scratch/app176/projects/doorways.",
  });
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.stop_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect(await commandHandlers.remove_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_project({ stream: "pattern-main-d76f70" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "remove_project needs `project_directory`, a project's folder as the runtime lists it",
  });
  expect(await commandHandlers.remove_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.read_project_log_records({ project_directory: "/etc", stream: null, action: null, after: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /etc.",
  });
  expect(await commandHandlers.list_project_node_types({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.list_project_node_types({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "list_project_node_types needs `project_directory`, a project's folder" });
});

test("reloading a project the runtime lists running queues reload_project, one it lists stopped start_project, each answering the action and observing again; one it does not list is refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-reload-project-answer-for-the-folder-hallways.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-project-answer-for-the-folder-hallways.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const reloads = vi.spyOn(sharedState.controller, "reloadProject");
  const starts = vi.spyOn(sharedState.controller, "startProject");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  await sharedState.statusPublisher.refreshAndPublish();

  expect(JSON.stringify(await commandHandlers.reload_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/doorways" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rgdbghpj6ai2ge3wgy64g42y7-5","project_directory":"/private/tmp/tatolab-proof-projects/hallways"}}',
  );
  expect(reloads.mock.calls).toEqual([["/home/jonathan-fontanez/scratch/app176/projects/doorways"]]);
  expect(JSON.stringify(await commandHandlers.reload_project({ project_directory: "/home/jonathan-fontanez/scratch/app176/projects/pattern" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rgdbghpj6ai2ge3wgy64g42y7-4","project_directory":"/private/tmp/tatolab-proof-projects/hallways"}}',
  );
  expect(starts.mock.calls).toEqual([["/home/jonathan-fontanez/scratch/app176/projects/pattern"]]);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(await commandHandlers.reload_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.reload_project({ folder: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "reload_project needs `project_directory`, a project's folder as the runtime lists it",
  });
});

test("a saved Python file of a project the runtime lists running queues reload_project, as tatolab dev does; another file, or a stopped project, is left as it is", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-reload-project-answer-for-the-folder-hallways.json")),
    ],
    "linux"
  );
  const reloads = vi.spyOn(sharedState.controller, "reloadProject");
  const starts = vi.spyOn(sharedState.controller, "startProject");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  await sharedState.statusPublisher.refreshAndPublish();
  const doorways = "/home/jonathan-fontanez/scratch/app176/projects/doorways";
  const pattern = "/home/jonathan-fontanez/scratch/app176/projects/pattern";

  await runTheSavedPythonFileOfAPlayingOrFailedProject(sharedState, doorways, path.join(doorways, "tatolab_view.json"));
  await runTheSavedPythonFileOfAPlayingOrFailedProject(sharedState, pattern, path.join(pattern, "nodes", "invert.py"));
  expect(reloads).not.toHaveBeenCalled();

  await runTheSavedPythonFileOfAPlayingOrFailedProject(sharedState, doorways, path.join(doorways, "nodes", "invert.py"));
  expect(reloads.mock.calls).toEqual([[doorways]]);
  expect(starts).not.toHaveBeenCalled();
  expect(refreshRequests).toHaveBeenCalledTimes(1);
});

test("a saved node file reloads a project with a stream running, starts again one whose streams failed, and leaves a stopped one alone", () => {
  const hallways = "/projects/hallways";
  const listedStreamOfHallways = (state: string): ListedStream => ({
    stream: `hallways-${state}`,
    display_name: state,
    location: { project_directory: hallways, project: "4be1ae19-0c7f-4cff-a959-d596c611e05b", stream_asset: `asset-${state}` },
    state,
    node_count: null,
    failed_because: state === "failed" ? "process() raised SyntaxError" : null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  });

  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfHallways("running"), listedStreamOfHallways("failed")], hallways)).toBe("reload");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfHallways("failed"), listedStreamOfHallways("stopped")], hallways)).toBe("start");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfHallways("stopped")], hallways)).toBe("nothing");
  expect(whatASavedNodeFileAsksOfTheRuntime([listedStreamOfHallways("failed")], "/projects/doorways")).toBe("nothing");
});

test("opening a project starts it only when the runtime, asked then, lists none of its streams or each stopped, observing again after; its refusal in its own words", async () => {
  const listedStreams = await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json");
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", listedStreams),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-project-answer-for-the-folder-hallways.json")),
      httpResponse("200 OK", "application/json", listedStreams),
      httpResponse("200 OK", "application/json", listedStreams),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-project-refusal-for-a-project-already-running.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const starts = vi.spyOn(sharedState.controller, "startProject");

  expect(await startTheProjectWhenTheRuntimeHoldsNoStreamOfItLoaded(sharedState, "/home/jonathan-fontanez/scratch/app176/projects/pattern")).toEqual(succeeded(undefined));
  expect(await startTheProjectWhenTheRuntimeHoldsNoStreamOfItLoaded(sharedState, "/home/jonathan-fontanez/scratch/app176/projects/doorways")).toEqual(succeeded(undefined));
  const refused = await startTheProjectWhenTheRuntimeHoldsNoStreamOfItLoaded(sharedState, "/home/jonathan-fontanez/scratch/app176/projects/lobby");
  expect(starts.mock.calls).toEqual([["/home/jonathan-fontanez/scratch/app176/projects/pattern"], ["/home/jonathan-fontanez/scratch/app176/projects/lobby"]]);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(refused).toEqual(failedWith(expect.stringContaining("already runs, so there is none to start")));
});

test("renaming a stream sets the display name of the stream asset the runtime lists for it, then observes again whether it renamed or refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-hallways-running.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-set-stream-display-name-answer-for-the-main-stream-of-hallways-renamed-heat-map.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-set-stream-display-name-refusal-for-a-display-name-that-shows-nothing.json")),
    ],
    "macos"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  await sharedState.statusPublisher.refreshAndPublish();

  expect(JSON.stringify(await commandHandlers.rename_stream({ stream: "hallways-main-26aa44", display_name: "Heat map" }, FROM_THE_PROJECTS_WINDOW))).toBe('{"ok":true,"value":null}');
  expect(await commandHandlers.rename_stream({ stream: "hallways-main-26aa44", display_name: "   " }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: `set_stream_display_name failed: "   " cannot be a stream's display name: it shows nothing`,
  });
  expect(refreshRequests).toHaveBeenCalledTimes(2);
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
      toolResultResponse({
        streams: [
          {
            stream: "main-main-9e44b1",
            display_name: "main",
            location: { project_directory: "/Users/jonathanf/streams/main", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
            state: "running",
            node_count: 4,
            failed_because: null,
            action: null,
            step: null,
          },
        ],
      }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "macos",
    ["/Users/jonathanf/streams/main", "/Users/jonathanf/streams/main/.streamlib/logs"],
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
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

/** The window's `ProjectCreationQueued`, `ProjectRunQueued` and `StreamActionFollowed` read exactly this JSON. */
test("adding a project answers the window in the contract's shape, from the chosen folder to the action queued and followed", async () => {
  const projectFolder = await realpath(await mkdtemp(path.join(os.tmpdir(), "tl-app-project-")));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-project-answer-for-the-folder-hallways.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-create-project-answer-with-no-folder-drawn-kind-butte.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-of-the-create-of-kind-butte-starting.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-describe-stream-action-refusal-for-an-action-not-held.json")),
      httpResponse("503 Service Unavailable", "text/plain", "starting"),
    ],
    "macos",
    [projectFolder],
    projectFolder,
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(JSON.stringify(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_run" }, FROM_THE_PROJECTS_WINDOW))).toBe(`{"ok":true,"value":${JSON.stringify(projectFolder)}}`);
  expect(JSON.stringify(await commandHandlers.run_stream_project({ folder: projectFolder }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rgdbghpj6ai2ge3wgy64g42y7-4","project_directory":"/private/tmp/tatolab-proof-projects/hallways"}}',
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
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-answer-for-a-run-of-slowpoke-making-the-venv-in-progress.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-cancel-stream-action-refusal-for-a-running-stop-of-doorways-front-door.json")),
    ],
    "linux",
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

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
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "anything" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "choose_stream_project_folder needs `chosen_for`, project_to_run or new_project_directory",
  });
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_run" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.create_stream_project({ folder: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "create_stream_project needs `folder`, a folder chosen in the window, or null for one the runtime draws under ~/streams",
  });
  expect(await commandHandlers.create_stream_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "Tato Studio acts only on a folder chosen in its window. Choose /etc again." });
  expect(await commandHandlers.run_stream_project({ folder: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "run_stream_project needs `folder`, a folder chosen in the window" });
  expect(await commandHandlers.describe_stream_action({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "describe_stream_action needs `action`, a stream action's id" });
});

test("The Projects window's commands list no recent project on a fresh install, and open only a recent one", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.read_recent_projects(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: [] });
  expect(await commandHandlers.open_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "open_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.open_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("A recent project's ⋯ commands and Import project .zip… read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.rename_recent_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "rename_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "rename_recent_project needs `name`, the project's new name" });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.duplicate_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "duplicate_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.duplicate_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.delete_recent_project({ folder: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "delete_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.delete_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_archive_to_import(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.import_project_archive({ name: "Show", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `archive`, the project .zip chosen in the dialog" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `name`, the imported project's name" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `location`, the folder the project goes in" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
});

test("The Project details panel's commands read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.read_recent_project_cover({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "read_recent_project_cover needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.read_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.set_recent_project_description({ description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_description needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_description needs `description`, what the project is, blank to clear it" });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc", description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_cover_image(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.set_recent_project_cover({ image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `image`, the full path of an image, or null for the plain cover" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `image`, the full path of an image, or null for the plain cover" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("New project's commands suggest an untitled project in Documents/Tato Studio and read their arguments as the window sends them", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  const readDefaults = await commandHandlers.read_new_project_defaults(undefined, FROM_THE_PROJECTS_WINDOW);
  expect(readDefaults).toMatchObject({ ok: true, value: { name: "Untitled project" } });
  expect(readDefaults.ok && readDefaults.value.location.endsWith(path.join("Documents", "Tato Studio"))).toBe(true);
  expect(await commandHandlers.choose_project_folder({ chosen_for: "new_project" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "choose_project_folder needs `chosen_for`, project_to_open" });
  expect(await commandHandlers.choose_new_project_location({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "choose_new_project_location needs `starting_at`, the folder the dialog opens in" });
  expect(await commandHandlers.choose_new_project_location({ starting_at: "/Users/someone" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.create_new_project({ location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "create_new_project needs `name`, the new project's name" });
  expect(await commandHandlers.create_new_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "create_new_project needs `location`, the full path of the folder it goes in" });
  expect(await commandHandlers.create_new_project({ name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
});

/** The window's `RuntimeDescription` reads exactly this JSON. */
test("describing_the_runtime_answers_the_window_in_the_contracts_shape_and_a_runtime_that_is_down_in_why", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      toolResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 4_000, runtime_log_directory: null, from_later: true }),
      httpResponse("503 Service Unavailable", "text/plain", ""),
    ],
    "macos"
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(JSON.stringify(await commandHandlers.describe_runtime(undefined, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"version":"0.55.2","build_id":"0.55.2+ec6adf522.7f3a91","up_for_ms":4000,"runtime_log_directory":null}}',
  );
  expect(await commandHandlers.describe_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "`describe_runtime` answered 503 with a body that is not JSON-RPC: Unexpected end of JSON input",
  });
});

test("restarting_the_runtime_stops_the_apps_runtime_to_start_it_again_then_observes_again_and_leaves_one_it_did_not_start_alone", async () => {
  const sharedState = await sharedStateOverFakes(
    [httpResponse("503 Service Unavailable", "text/plain", ""), httpResponse("503 Service Unavailable", "text/plain", "")],
    "linux",
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  await sharedState.controller.composeStatus(0);
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");

  expect(await commandHandlers.restart_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  const runtimeTheCommandLineStarted = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux");
  expect(await tatolabWindowCommandHandlers(runtimeTheCommandLineStarted, () => {}).restart_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL,
  });
  expect(runtimeTheCommandLineStarted.carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
});

test("opening_the_runtimes_log_folder_opens_the_folder_the_runtime_names_and_never_a_path_from_the_window", async () => {
  const runtimeLogFolder = "/Users/jonathanf/Library/Application Support/Tatolab/logs";
  const sharedState = await sharedStateOverFakes(
    [
      toolResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 4_000, runtime_log_directory: runtimeLogFolder }),
      toolResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 5_000, runtime_log_directory: null }),
    ],
    "macos",
    [runtimeLogFolder],
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.open_runtime_log_folder({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_runtime_log_folder(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL });
  expect(sharedState.foldersShownInTheFileManager).toEqual([runtimeLogFolder]);
});

test("turning_stream_failure_notifications_off_is_remembered_shown_in_the_next_status_and_refuses_anything_but_true_or_false", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.set_stream_failure_notifications({ enabled: false }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.streamFailureNotifications.stateNow()).toEqual({ enabled: false, shown_by_this_desktop: true });
  expect(await commandHandlers.set_stream_failure_notifications({ enabled: "no" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "set_stream_failure_notifications needs `enabled`, true or false",
  });
});

test("answering_the_update_dialog_takes_its_announcement_away_and_release_notes_opens_the_announced_page_never_one_from_the_window", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  sharedState.tatolabAppUpdateAnnouncements.announceTheUpdateLanded("0.69.0");

  expect(
    await commandHandlers.answer_the_app_update_announcement(
      { kind: "update_landed", version: "0.69.0", answer: "take_its_action", release_notes_url: "https://example.com" },
      FROM_THE_PROJECTS_WINDOW,
    ),
  ).toEqual({ ok: true, value: null });
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_landed", version: "0.69.0", answer: "take_its_action" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.webPagesOpenedInTheBrowser).toEqual(["https://github.com/tatolab/tatolab-app/releases/tag/v0.69.0"]);
  expect(sharedState.tatolabAppUpdateAnnouncements.shownAnnouncement()).toBeNull();

  sharedState.tatolabAppUpdateAnnouncements.announceTheUpdateLanded("0.69.1");
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_landed", version: "0.69.1", answer: "dismiss" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.webPagesOpenedInTheBrowser).toHaveLength(1);
  expect(sharedState.tatolabAppUpdateAnnouncements.shownAnnouncement()).toBeNull();
});

test("answering_the_update_dialog_refuses_a_kind_or_an_answer_it_does_not_know", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_gone", version: "0.69.0", answer: "dismiss" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "answer_the_app_update_announcement takes `kind` update_ready or update_landed, not update_gone",
  });
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_ready", version: "0.69.0", answer: "later" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "answer_the_app_update_announcement takes `answer` take_its_action or dismiss, not later",
  });
});

test("turning_developer_mode_on_is_remembered_shown_in_the_next_status_and_refuses_anything_but_true_or_false", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  expect(sharedState.developerModeSwitch.isOnNow()).toBe(false);

  expect(await commandHandlers.set_developer_mode({ enabled: true }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.developerModeSwitch.isOnNow()).toBe(true);
  expect(await commandHandlers.set_developer_mode({ enabled: "yes" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "set_developer_mode needs `enabled`, true or false",
  });
});

test("opening_tatolab_at_login_asks_the_desktop_then_observes_again_and_is_refused_in_its_words", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: true }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.tatolabAppOpenedAtLogin.setsAsked).toEqual([true]);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  sharedState.tatolabAppOpenedAtLogin.refusal = "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: false }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
  });
  expect(await commandHandlers.set_open_tatolab_at_login({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_open_tatolab_at_login needs `enabled`, true or false" });
});

test("a window's menus are kept for the system menu bar on macOS, shown while it is in focus, and menus out of shape are refused", async () => {
  const sharedState = await sharedStateOverFakes([], "macos");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  const fileMenu = {
    label: "File",
    system_menu: null,
    entries: [{ kind: "command", entry_id: "File/Open project…", label: "Open project…", shortcut_hint: "⌘O", unavailable_because: null }],
  };

  sharedState.systemMenuBar.noticeTheWindowFocused(FROM_THE_PROJECTS_WINDOW.windowContentsId);
  expect(await commandHandlers.show_menus_in_the_system_menu_bar({ menus: [fileMenu] }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.show_menus_in_the_system_menu_bar({ menus: [{ ...fileMenu, entries: [{ kind: "command", label: "No id" }] }] }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "show_menus_in_the_system_menu_bar needs `menus`, the window's menus in the system menu bar's shape",
  });

  expect(sharedState.menusShownInTheSystemMenuBar).toEqual([null, [fileMenu]]);
});

/** The window's `ProjectTransaction` and `ProjectTransactionsReading` read exactly this JSON. */
test("undo and redo in the open project ask the runtime by the window's author and answer its transaction, or its refusal in its own words", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-undo-tool-result-of-sam-undoing-their-import-into-lobby.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-redo-tool-refusal-for-sam-with-nothing-left-to-redo.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "lobby-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
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
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-import-asset-answer-for-poster-png-numbered-poster-3-in-media-imported-by-a-person.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-import-asset-refusal-for-main-graph-json-a-stream-graph-document.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "tide-pool-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.import_assets_into_the_open_project(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: null });
  sharedState.assetFilesTheDialogAnswers.files = ["/home/sam/poster.png", "/home/sam/main.graph.json"];
  expect(await commandHandlers.import_assets_into_the_open_project(undefined, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      imported: [{ asset: "d18ac59c-d741-45fc-8d21-d3febd0d14a0", path: "media/poster-3.png" }],
      refused: [{ file_name: "main.graph.json", because: "import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write" }],
    },
  });
  expect(await commandHandlers.import_assets_into_the_open_project(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

/** The window's `ProjectGraphTransactionTheRuntimeAnswered` reads exactly this JSON. */
test("a graph transaction in the open project reaches the runtime's transact held to its shape and to the project's streams, by the person editing, answering what it applied or the runtime's structured refusal", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-transact-tool-result-of-setting-the-test-pattern-to-640-by-360.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-transact-refusal-for-an-image-output-into-a-channels-input.json")),
    ],
    "linux",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "hallways-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const fromTheStudioWindow = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  const stream = "ab38b36d-ea2a-4948-bc01-f231ca4fa043";
  const testPattern = "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a";
  const setTheSize = { operation: "set_node_config", stream, node: testPattern, config: { width: 640, height: 360 } };
  const hallwaysMainListed: ListedStream = {
    stream: "hallways-main-3990b7",
    display_name: "main",
    location: { project_directory: projectFolder, project: "6f1d0b7e-hallways", stream_asset: stream },
    state: "running",
    node_count: 3,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
  vi.spyOn(sharedState.statusPublisher, "lastPublishedStatusNow").mockReturnValue({
    app_version: "0.68.55",
    app_build: null,
    platform: "linux",
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "hallways-box",
    streams: [hallwaysMainListed],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/home/sam/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    app_update: { kind: "not_offered", reason: "a test updates nothing" },
    app_update_announcement: null,
    local_api_socket: sharedState.localApiSocketPath,
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "reading" },
  });

  expect(await commandHandlers.read_the_person_editing_in_studio(undefined, fromTheStudioWindow)).toEqual({ ok: true, value: { kind: "person", name: "sam" } });
  const anotherProjectsStream = "0c4e2f9a-7b13-4d58-a6e1-3f9b2c7d8e10";
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize, { ...setTheSize, stream: anotherProjectsStream }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: `The stream asset ${anotherProjectsStream} is not one of the streams the runtime lists in ${projectFolder}.`,
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "commit", idempotency_key: "5a8e1c3f-2d47-4b6a-9f01-8c7d6e5b4a32" }, fromTheStudioWindow)).toEqual({
    ok: true,
    value: {
      kind: "applied",
      transaction: {
        mode: "commit",
        transaction: "0e29a20a-60d9-4cf1-9fdc-6c66a4b5136d",
        commit: "5e2cdcdc1f1b5e5cfde4d4c870c83197dcc29b7c",
        operations: [{ operation: "set_node_config", node: testPattern, from: {}, to: { width: 640, height: 360 }, stream: "hallways-main-3990b7" }],
        added_nodes: [],
        connected_links: [],
        added_groups: [],
        added_notes: [],
      },
    },
  });
  const link = { source: { node: testPattern, port: "video" }, target: { node: "d28273fd-8094-41f7-b832-a55f58d60f37", port: "refresh" } };
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ operation: "connect", stream, ...link }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toMatchObject({
    ok: true,
    value: { kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_link: link, refused_node: null, refused_field: null } },
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [{ ...setTheSize, force: true }], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toMatchObject({
    ok: false,
    refusal: expect.stringMatching(/^transact_in_the_open_project's operation 0 is not a graph action the runtime takes: /),
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [], mode: "commit", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "transact_in_the_open_project needs `operations`, at least one graph action",
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "kept", idempotency_key: null }, fromTheStudioWindow)).toEqual({
    ok: false,
    refusal: "transact_in_the_open_project needs `mode`, `commit` or `live`",
  });
  expect(await commandHandlers.transact_in_the_open_project({ operations: [setTheSize], mode: "commit", idempotency_key: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
});

test("listing the open project's views asks the system ahead for the camera and the microphone a view declares, once however often it is listed", async () => {
  const nightShow = "/private/tmp/tl-rec-cam/projects/night-show";
  const listingDeclaringTheCamera = await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-with-a-view-declaring-the-camera-and-microphone.json");
  const sharedState = await sharedStateOverFakes(
    [httpResponse("200 OK", "application/json", listingDeclaringTheCamera), httpResponse("200 OK", "application/json", listingDeclaringTheCamera)],
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
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
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
    [httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json"))],
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
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
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

/** The window's `write_studio_view_output` answers `null` once the runtime took the value, and its refusal word for word. */
test("a view's output value reaches the runtime's write_studio_view_output from a studio window, answered null once taken, refused in the runtime's own words, and from the Projects window or with arguments that are not text and JSON refused before it is asked", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-write-studio-view-output-tool-result-of-the-deck-node-cue.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-write-studio-view-output-refusal-for-the-stopped-stream-night-show.json")),
    ],
    "macos",
  );
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "night-show-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  await sharedState.appWindows.openTheProjectInItsStudioWindow(projectFolder);
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
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
