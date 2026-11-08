import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { RuntimePortViewers } from "./runtime_port_viewers.js";
import { localApiRequestFailure } from "./local_api_client.js";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { TatolabPlatform } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  FakeCarriedRuntimeStarts,
  FakeTatolabAppOpenedAtLogin,
  FakeTatolabCommandLineToolLink,
  FakeTerminalOpenedInAFolder,
  fakeTatolabPlatformForThisBuild,
} from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { ProjectOpening } from "./open_project.js";
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
  runStreamAction,
  streamArgumentsFrom,
  linkCommandLineTool,
  tatolabWindowCommandHandlers,
} from "./tatolab_commands.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { StreamProjectAdding } from "./stream_project_adding.js";
import { TatolabAppUpdater } from "./tatolab_app_updater.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

async function sharedStateOverFakes(
  scriptedLocalApiResponses: readonly Buffer[],
  platform: TatolabPlatform,
  existingFolders: readonly string[] = [],
  folderTheDialogAnswers: string | null = null,
): Promise<
  TatolabAppSharedState & {
    commandLineToolLink: FakeTatolabCommandLineToolLink;
    carriedRuntimeStarts: FakeCarriedRuntimeStarts;
    terminal: FakeTerminalOpenedInAFolder;
    foldersShownInTheFileManager: string[];
    localApiSocketPath: string;
    systemNotifications: FakeSystemNotifications;
    tatolabAppOpenedAtLogin: FakeTatolabAppOpenedAtLogin;
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
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
    whenTheRuntimeExits: () => {},
    tatolabAppLog: quietTatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(controller, () => {}, () => 0, quietTatolabAppLog);
  const tatolabAppUpdater = new TatolabAppUpdater(
    { kind: "not_offered", reason: "this fake platform updates nothing" },
    { notifyANewerVersionIsAvailable: () => {}, notifyTheAppIsUpToDate: () => {}, notifyTheUpdateFailed: () => {} },
    () => {},
    quietTatolabAppLog,
  );
  const foldersShownInTheFileManager: string[] = [];
  const systemNotifications = new FakeSystemNotifications();
  const streamFailureNotifications = await StreamFailureNotifications.load(
    RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog),
    systemNotifications,
    () => {},
    quietTatolabAppLog,
  );
  const fakeShellForTheWindows = new FakeTatolabElectronAppShell();
  const appWindows = new TatolabAppWindows({
    mainWindowHostFactory: fakeShellForTheWindows.tatolabElectronAppShell.mainWindowHostFactory,
    platformItems: { mainWindowChrome: { titleBarStyle: "default" }, setDockIconVisible: () => {} },
    dockIconHost: fakeShellForTheWindows.tatolabElectronAppShell.dockIconHost,
    watchFolderEntries: () => null,
    runAfter: () => () => {},
    whenAStudioWindowClosed: () => {},
    whenAWindowShowingPortViewersClosed: () => {},
    tatolabAppLog: quietTatolabAppLog,
  });
  appWindows.showTheProjectsWindow();
  const projectOpening = new ProjectOpening({
    homeDirectory: appConfigDirectory,
    documentsDirectory: path.join(appConfigDirectory, "Documents"),
    projectFolderDialog: async () => succeeded(null),
    recentProjectFolders: recentProjectFoldersFileIn(appConfigDirectory, quietTatolabAppLog),
    readWallClockNowMs: () => 1_790_000_000_000,
    newProjectCreation: controller,
    openTheProjectInItsStudioWindow: (folder) => appWindows.openTheProjectInItsStudioWindow(folder),
  });
  return {
    controller,
    statusPublisher,
    tatolabAppUpdater,
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
      tatolabAppLog: quietTatolabAppLog,
    }),
    fetchTextOverHttps: async () => failedWith("these tests reach no network"),
    tatolabAppLog: quietTatolabAppLog,
    commandLineToolLink,
    carriedRuntimeStarts,
    terminal,
    foldersShownInTheFileManager,
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
            location: { project_directory: "/private/tmp/x/pattern", stream_function: "stream:main" },
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
      '{"stream":"pattern-main-41d0c2","display_name":"main","location":{"project_directory":"/private/tmp/x/pattern","stream_function":"stream:main"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"action":null,"step":null}],' +
      '"command_line_tool_link":{"kind":"linked","path":"/Users/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(runningRuntime.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );
  const runtimeThatIsDown = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");
  runtimeThatIsDown.commandLineToolLink.commandLineToolLink = { kind: "not_linked", path: "/home/someone/.local/bin/tatolab" };
  expect(JSON.stringify(await runtimeThatIsDown.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0",' +
      '"app_build":{"tatolab_app_commit":"22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1","build_kind":"dev","built_with_uncommitted_changes":true},' +
      '"platform":"linux","runtime_state":"starting","runtime_not_running_because":null,"machine_name":null,' +
      '"streams":null,"command_line_tool_link":{"kind":"not_linked","path":"/home/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(runtimeThatIsDown.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
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
    '{"stream":"main","nodes":[' +
      '{"id":"P1","name":"testpatternsource","type":"tatolab.stream:TestPatternSource","state":"Running","config":{},' +
      '"input_ports":[],"output_ports":[{"name":"video","family":null,"catalog_section":"binary"}],' +
      '"dropped_bags_by_link":{},"refused_bags_by_output_port":{}},' +
      '{"id":"","name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","state":null,"config":{},' +
      '"input_ports":[],"output_ports":[],' +
      '"dropped_bags_by_link":{"L1":12},"refused_bags_by_output_port":{}}],' +
      '"links":[{"id":"L1","source_node":"testpatternsource","source_port":"video",' +
      '"target_node":"invertingeffect","target_port":"video_from_upstream","state":"wired"}],' +
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

test("a stream action queues on the runtime, then observes again whether it queued or was refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-answer-for-the-running-stream-pattern-main.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-refusal-for-the-stopped-stream-pattern-main.json")),
    ],
    "macos"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");

  expect(await runStreamAction(sharedState, "stop_stream", "pattern-main-d76f70")).toEqual(succeeded(undefined));
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(await runStreamAction(sharedState, "stop_stream", "pattern-main-d76f70")).toEqual(
    failedWith("Runtime error: the stream `pattern-main-d76f70` is already stopped; `start` loads it again"),
  );
  expect(refreshRequests).toHaveBeenCalledTimes(2);
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
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-stop-stream-answer-for-the-running-stream-pattern-main.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-start-stream-answer-for-the-stopped-stream-pattern-main.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-remove-project-answer-for-the-project-doorways.json")),
    ],
    "linux"
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  expect(await commandHandlers.remove_project({ project_directory: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /tmp/tatolab-proof-projects/doorways.",
  });
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.stop_stream({ stream: "pattern-main-d76f70" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.start_stream({ stream: "pattern-main-d76f70" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_project({ project_directory: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_project({ stream: "pattern-main-d76f70" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "remove_project needs `project_directory`, a project's folder as the runtime lists it",
  });
  expect(await commandHandlers.remove_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.read_project_log_records({ project_directory: "/etc", stream: null, action: null, after: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "The runtime lists no stream from /etc.",
  });
});

test("reloading a project the runtime lists queues run_project on its folder, answers the action, and observes again; one it does not list is refused", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-list-streams-tool-result-of-a-running-a-stopped-and-a-failed-stream.json")),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-project-answer-for-the-folder-doorways.json")),
    ],
    "linux"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  await sharedState.statusPublisher.refreshAndPublish();

  expect(JSON.stringify(await commandHandlers.reload_project({ project_directory: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rnd53mwtsrixjyxk7h3jfq5j5-7","project_directory":"/tmp/tatolab-proof-projects/doorways"}}',
  );
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(await commandHandlers.reload_project({ project_directory: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "The runtime lists no stream from /etc." });
  expect(await commandHandlers.reload_project({ folder: "/tmp/tatolab-proof-projects/doorways" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "reload_project needs `project_directory`, a project's folder as the runtime lists it",
  });
});

test("renaming a stream asks the runtime, then observes again whether it renamed or refused, answering null or its refusal", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-rename-stream-answer-for-the-stream-heat-map-main-8eda1f-renamed-heat-map.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-rename-stream-refusal-for-a-display-name-that-shows-nothing.json")),
    ],
    "macos"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(JSON.stringify(await commandHandlers.rename_stream({ stream: "heat-map-main-8eda1f", display_name: "Heat map" }, FROM_THE_PROJECTS_WINDOW))).toBe('{"ok":true,"value":null}');
  expect(await commandHandlers.rename_stream({ stream: "heat-map-main-8eda1f", display_name: "   " }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: `Invalid configuration: "   " cannot be a stream's display name: it shows nothing; a display name is any text with something to show`,
  });
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(await commandHandlers.rename_stream({ stream: "heat-map-main-8eda1f" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
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
            location: { project_directory: "/Users/jonathanf/streams/main", stream_function: "stream:main" },
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
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-project-answer-for-the-folder-hallways.json")),
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
    '{"ok":true,"value":{"action":"Rj12j3eujz3zn0dposliv79k9-3","project_directory":"/tmp/tatolab-proof-projects/hallways"}}',
  );
  expect(JSON.stringify(await commandHandlers.create_stream_project({ folder: null }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"action":"Rj12j3eujz3zn0dposliv79k9-7","stream":"kind-butte-main-e51c2f","project_directory":"/tmp/tatolab-proof/streams/kind-butte"}}',
  );
  expect(refreshRequests).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(await commandHandlers.describe_stream_action({ action: "Rj12j3eujz3zn0dposliv79k9-7" }, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"kind":"described","description":{"action":"Rj12j3eujz3zn0dposliv79k9-7","project_directory":"/tmp/tatolab-proof/streams/kind-butte",' +
      '"kind":"load","state":"in_progress","step":"starting","streams":[{"stream":"kind-butte-main-e51c2f","display_name":"main","state":null}],"failed_because":null}}}',
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
