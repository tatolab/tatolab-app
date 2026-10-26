import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_LOOPBACK_HTTP_ORIGIN } from "./runtime_loopback_watch_page.js";
import { afterEach, expect, test, vi } from "vitest";
import type { TatolabPlatform } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  FakeRuntimeAgentRegistration,
  FakeTatolabAppOpenedAtLogin,
  FakeTatolabCommandLineToolLinks,
  FakeTerminalOpenedInAFolder,
  fakeTatolabPlatformForThisBuild,
} from "./fake_tatolab_platform_for_this_build.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { failedWith, succeeded } from "./result.js";
import { StreamFailureNotifications } from "./stream_failure_notifications.js";
import { RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL } from "./run_tatolab_switch.js";
import { RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL } from "./runtime_log_folder_opening.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { streamLogRecordsPageFromTheLogsToolResult } from "./stream_log_records_page.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import {
  answerTheWindow,
  describeStreamGraph,
  getTatolabStatus,
  readStreamLogRecords,
  enabledArgumentsFrom,
  readStreamLogRecordsArgumentsFrom,
  runStreamAction,
  streamArgumentsFrom,
  linkCommandLineToolInUsrLocalBin,
  rememberFirstRunFinished,
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
    commandLineToolLinks: FakeTatolabCommandLineToolLinks;
    runtimeAgent: FakeRuntimeAgentRegistration;
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
  const commandLineToolLinks = new FakeTatolabCommandLineToolLinks("/Users/someone/.local/bin/tatolab");
  commandLineToolLinks.homeFolderLinkedAt = "/Users/someone/.local/bin/tatolab";
  const terminal = new FakeTerminalOpenedInAFolder();
  const runtimeAgent = new FakeRuntimeAgentRegistration("enabled");
  const tatolabAppOpenedAtLogin = new FakeTatolabAppOpenedAtLogin();
  const platformForThisBuild = fakeTatolabPlatformForThisBuild(
    runtimeAgent,
    commandLineToolLinks,
    localApiServer.localApiSocketPath,
    undefined,
    undefined,
    undefined,
    terminal,
    undefined,
    tatolabAppOpenedAtLogin,
  );
  const controller = await TatolabAppController.create({
    platform,
    platformForThisBuild,
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    runtimeLoopbackHttpOrigin: RUNTIME_LOOPBACK_HTTP_ORIGIN,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
    readStreamFailureNotifications: () => ({ enabled: true, shown_by_this_desktop: true }),
    readTheCommandLineToolVersion: () => ({ kind: "read", version: "0.55.2" }),
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
  return {
    controller,
    statusPublisher,
    tatolabAppUpdater,
    tatolabUninstall: platformForThisBuild.tatolabUninstall,
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
      terminalOpenedInAFolder: terminal,
      tatolabCommandLineTool: platformForThisBuild.tatolabCommandLineTool,
      runProgramToCompletion: async () => failedWith("this fake runs no program"),
      streamRunsOnTheRuntime: controller,
    }),
    tatolabAppLog: quietTatolabAppLog,
    commandLineToolLinks,
    runtimeAgent,
    terminal,
    foldersShownInTheFileManager,
    localApiSocketPath: localApiServer.localApiSocketPath,
    streamFailureNotifications,
    systemNotifications,
    tatolabAppOpenedAtLogin,
  };
}

test("an_awaited_command_answers_with_its_works_answer_or_why_it_has_none", async () => {
  expect(await answerTheWindow("read_stream_log_records", async () => succeeded(7))).toEqual(succeeded(7));
  const refusal = await answerTheWindow<number>("describe_stream_graph", () => Promise.reject(new Error("the work failed unexpectedly")));
  expect(!refusal.ok && refusal.failure.startsWith("describe_stream_graph ended without an answer"), JSON.stringify(refusal)).toBe(true);
});

/** The window's TypeScript types read exactly this JSON, key for key and in this order. */
test("the_status_a_log_page_and_a_graph_serialize_exactly_as_the_window_reads_them", async () => {
  const runningRuntime = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({
        streams: [{ name: "main", state: "kept", project_directory: "/private/tmp/x/pattern", node_count: 4, failed_because: null, from_later: 1 }],
      }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "macos"
  );
  expect(JSON.stringify(await runningRuntime.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"macos","run_tatolab":true,' +
      '"runtime_agent":"enabled","runtime_state":"running",' +
      '"machine_name":"jonathanf-macbook","streams":[' +
      '{"name":"main","state":"kept","project_directory":"/private/tmp/x/pattern",' +
      '"node_count":4,"failed_because":null}],"first_run_finished":false,' +
      '"command_line_tool_linked_at":"/Users/someone/.local/bin/tatolab","command_line_tool_usr_local_bin_link":{"kind":"not_linked"},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(runningRuntime.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );
  const runtimeThatIsDown = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");
  runtimeThatIsDown.commandLineToolLinks.homeFolderLinkedAt = null;
  runtimeThatIsDown.commandLineToolLinks.usrLocalBinLink = { kind: "not_offered", reason: "On Linux the installer links tatolab into ~/.local/bin with the runtime." };
  expect(JSON.stringify(await runtimeThatIsDown.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"linux","run_tatolab":true,' +
      '"runtime_agent":"enabled","runtime_state":"starting","machine_name":null,' +
      '"streams":null,"first_run_finished":false,"command_line_tool_linked_at":null,' +
      '"command_line_tool_usr_local_bin_link":{"kind":"not_offered","reason":"On Linux the installer links tatolab into ~/.local/bin with the runtime."},' +
      '"app_update":{"kind":"not_checked"},' +
      `"local_api_socket":${JSON.stringify(runtimeThatIsDown.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"}}',
  );

  const page = streamLogRecordsPageFromTheLogsToolResult(
    JSON.stringify({
      stream: "main",
      stream_instance: "4",
      records: [
        {
          sequence: 7,
          record: {
            message: "Loading the stream `main`",
            host_ts: 1791757115431254000,
            target: "streamlib_engine::core::runtime::loaded_stream",
            source: "rust",
            attrs: { processor_class_import_path: "nodes.x:X" },
            level: "info",
          },
        },
        { sequence: 8, record: {} },
      ],
      next_after: 8,
    }),
  );
  expect(page.ok && JSON.stringify(page.value)).toBe(
    '{"stream":"main","stream_instance":"4","records":[' +
      '{"sequence":7,"host_ts_ns":1791757115431254000,"level":"info","source":"rust",' +
      '"target":"streamlib_engine::core::runtime::loaded_stream",' +
      '"message":"Loading the stream `main`",' +
      '"attrs":{"processor_class_import_path":"nodes.x:X"},"processor_id":null,"sent_by_its_own_process":false,' +
      '"jsonl_line":"{\\"message\\":\\"Loading the stream `main`\\",\\"host_ts\\":1791757115431254000,' +
      '\\"target\\":\\"streamlib_engine::core::runtime::loaded_stream\\",\\"source\\":\\"rust\\",' +
      '\\"attrs\\":{\\"processor_class_import_path\\":\\"nodes.x:X\\"},\\"level\\":\\"info\\"}"},' +
      '{"sequence":8,"host_ts_ns":null,"level":null,"source":null,"target":null,' +
      '"message":"","attrs":{},"processor_id":null,"sent_by_its_own_process":false,"jsonl_line":"{}"}],' +
      '"next_after":8,"records_no_longer_held":0}',
  );

  const graphToolResultText = JSON.stringify({
      machine: "jonathanf-macbook",
      exposed: [{ level: "private", port: "video_to_downstream", node: "invertingeffect" }],
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
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphToolResultText, "http://127.0.0.1:4446");
  expect(graph.ok && JSON.stringify(graph.value)).toBe(
    '{"stream":"main","nodes":[' +
      '{"id":"P1","name":"testpatternsource","type":"tatolab.stream:TestPatternSource","state":"Running",' +
      '"input_ports":[],"output_ports":[{"name":"video","catalog_section":"binary"}],' +
      '"dropped_bags_by_link":{},"refused_bags_by_output_port":{}},' +
      '{"id":"","name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","state":null,' +
      '"input_ports":[],"output_ports":[],' +
      '"dropped_bags_by_link":{"L1":12},"refused_bags_by_output_port":{}}],' +
      '"links":[{"id":"L1","source_node":"testpatternsource","source_port":"video",' +
      '"target_node":"invertingeffect","target_port":"video_from_upstream","state":"wired"}],' +
      '"exposed":[{"node":"invertingeffect","port":"video_to_downstream","level":"private",' +
      '"watch_page_url":"http://127.0.0.1:4446/watch/jonathanf-macbook/main/invertingeffect/video_to_downstream"}],' +
      `"graph_document_text":${JSON.stringify(graphToolResultText)}}`,
  );
});

test("a refusal from the runtime reaches the window in the runtime's own words", async () => {
  const graphRefusal = "graph failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const logsRefusal = "logs failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
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
  expect(await readStreamLogRecords(sharedState, "nope", 0)).toEqual(failedWith(logsRefusal));
});

test("the window asking for the status before the first round waits for it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");

  const status = getTatolabStatus(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect((await status).ok).toBe(true);
});

test("get started is remembered, and the usr local bin link answers once the prompt closes", async () => {
  const sharedState = await sharedStateOverFakes([], "macos");

  expect(await rememberFirstRunFinished(sharedState)).toEqual(succeeded(undefined));
  expect((await sharedState.controller.composeStatus(0)).first_run_finished).toBe(true);

  sharedState.commandLineToolLinks.linkingInUsrLocalBin = failedWith({ kind: "refused", refusal: "The password prompt was cancelled, so nothing changed." });
  expect(await linkCommandLineToolInUsrLocalBin(sharedState)).toEqual(failedWith("The password prompt was cancelled, so nothing changed."));
  expect(sharedState.commandLineToolLinks.linksAsked).toEqual(["usr_local_bin"]);
});

test("a command's arguments are read as the window sends them, and anything else is refused", () => {
  expect(enabledArgumentsFrom("set_run_tatolab", { enabled: false })).toEqual(succeeded({ enabled: false }));
  expect(enabledArgumentsFrom("set_run_tatolab", { enabled: "yes" }).ok).toBe(false);
  expect(enabledArgumentsFrom("set_run_tatolab", null).ok).toBe(false);
  expect(readStreamLogRecordsArgumentsFrom({ stream: "main", after: 79 })).toEqual(succeeded({ stream: "main", after: 79 }));
  expect(readStreamLogRecordsArgumentsFrom({ stream: "main", after: -1 }).ok).toBe(false);
  expect(readStreamLogRecordsArgumentsFrom({ stream: 7, after: 0 }).ok).toBe(false);
  expect(streamArgumentsFrom("describe_stream_graph", { stream: "main" })).toEqual(succeeded({ stream: "main" }));
  expect(streamArgumentsFrom("describe_stream_graph", {}).ok).toBe(false);
  expect(streamArgumentsFrom("remove_stream", { stream: "main" })).toEqual(succeeded({ stream: "main" }));
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
  expect(await commandHandlers.describe_stream_graph({ stream: "nope" })).toEqual({ ok: false, refusal: graphRefusal });
  expect(await commandHandlers.link_command_line_tool_in_usr_local_bin(undefined)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remember_first_run_finished(undefined)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.uninstall_tatolab(undefined)).toEqual({ ok: false, refusal: "this fake platform uninstalls nothing" });
  expect(await commandHandlers.quit_tatolab_app(undefined)).toEqual({ ok: true, value: null });
  expect(quitRequests).toBe(1);
  expect(await commandHandlers.set_run_tatolab({ enabled: "yes" })).toEqual({ ok: false, refusal: "set_run_tatolab needs `enabled`, true or false" });
  expect(await commandHandlers.read_stream_log_records({ stream: "camera" })).toEqual({
    ok: false,
    refusal: "read_stream_log_records needs `stream`, a stream's name, and `after`, a sequence number from 0",
  });
  expect(await commandHandlers.describe_stream_graph(null)).toEqual({ ok: false, refusal: "describe_stream_graph needs `stream`, a stream's name" });
});

test("a stream action asks the runtime, then observes again whether it was carried out or refused", async () => {
  const refusal = "Runtime error: the kept stream `camera` is already stopped; `start` loads it again";
  const sharedState = await sharedStateOverFakes(
    [
      toolResultResponse({ stream: "camera", stopped: true, kept: true }),
      httpResponse("200 OK", "application/json", JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: refusal }], isError: true } })),
    ],
    "macos"
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");

  expect(await runStreamAction(sharedState, "stop_stream", "camera")).toEqual(succeeded(null));
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(await runStreamAction(sharedState, "stop_stream", "camera")).toEqual(failedWith(refusal));
  expect(refreshRequests).toHaveBeenCalledTimes(2);
});

/** The window's `StreamStopAnswer` reads exactly this JSON. */
test("each stream action answers the window in the contract's shape", async () => {
  const notRecordedBecause = "the kept record of `camera` could not be written: Permission denied (os error 13)";
  const sharedState = await sharedStateOverFakes(
    [
      toolResultResponse({ stream: "camera", stopped: true, kept: true, not_recorded_because: notRecordedBecause }),
      toolResultResponse({ stream: "camera", node_count: 3 }),
      toolResultResponse({ stream: "camera", unloaded: true, forgotten: true }),
    ],
    "linux"
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(JSON.stringify(await commandHandlers.stop_stream({ stream: "camera" }))).toBe(
    `{"ok":true,"value":{"not_recorded_because":${JSON.stringify(notRecordedBecause)}}}`,
  );
  expect(await commandHandlers.start_stream({ stream: "camera" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_stream({ stream: "camera" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.remove_stream({})).toEqual({ ok: false, refusal: "remove_stream needs `stream`, a stream's name" });
});

test("opening_a_streams_project_opens_the_folder_the_runtime_last_listed_for_it_and_never_a_path_from_the_window", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      toolResultResponse({ streams: [{ name: "main", state: "kept", project_directory: "/Users/jonathanf/streams/main", node_count: 4, failed_because: null }] }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "macos",
    ["/Users/jonathanf/streams/main", "/Users/jonathanf/streams/main/.streamlib/logs"],
  );
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  expect(await commandHandlers.open_stream_project_folder({ stream: "main" })).toEqual({
    ok: false,
    refusal: "The runtime does not list main, so Tatolab has no project folder to open.",
  });
  await sharedState.statusPublisher.refreshAndPublish();

  expect(await commandHandlers.open_stream_project_folder({ stream: "main", project_directory: "/etc" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_terminal_at_stream_project({ stream: "main" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_terminal_at_stream_project({ stream: "other" })).toEqual({
    ok: false,
    refusal: "The runtime does not list other, so Tatolab has no project folder to open.",
  });
  expect(await commandHandlers.open_terminal_at_stream_project({})).toEqual({
    ok: false,
    refusal: "open_terminal_at_stream_project needs `stream`, a stream's name, or `folder`, a folder chosen in the window",
  });

  expect(await commandHandlers.open_stream_log_folder({ stream: "main" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_stream_log_folder({})).toEqual({
    ok: false,
    refusal: "open_stream_log_folder needs `stream`, a stream's name",
  });

  expect(sharedState.foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/main", "/Users/jonathanf/streams/main/.streamlib/logs"]);
  expect(sharedState.terminal.openedInFolders).toEqual(["/Users/jonathanf/streams/main"]);
});

/** The window's `StreamProjectFolderReport` and `StreamProjectRunOutcome` read exactly this JSON. */
test("adding a stream answers the window in the contract's shape, from the chosen folder to the runtime's answer or its refusal of a taken name", async () => {
  const projectFolder = await mkdtemp(path.join(os.tmpdir(), "tl-app-project-"));
  cleanUps.push(() => rm(projectFolder, { recursive: true, force: true }));
  const sharedState = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-answer-for-the-new-project-hello.json")),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-refusal-for-the-name-hello-a-kept-stream-holds.json")),
      toolResultResponse({ streams: [{ name: "hello", state: "kept", project_directory: "/private/tmp/tatolab-proof/projects/hello", node_count: 4, failed_because: null }] }),
      httpResponse("200 OK", "application/json", await recordedResponseBody("local-api-run-stream-refusal-for-the-project-no-venv-without-its-venv.json")),
    ],
    "macos",
    [projectFolder],
    projectFolder,
  );
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(JSON.stringify(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_run" }))).toBe(
    `{"ok":true,"value":{"folder":${JSON.stringify(projectFolder)},"folder_exists":true,"stream_file_present":false,"stream_functions":[],"python_environment":{"kind":"missing"}}}`,
  );
  expect(JSON.stringify(await commandHandlers.run_stream_project({ folder: projectFolder, stream_function: null, name: "hello" }))).toBe(
    '{"ok":true,"value":{"kind":"running","answer":{"stream":"hello","stream_instance":"1","kept":true,' +
      '"project_directory":"/private/tmp/tatolab-proof/projects/hello","node_count":4,"replaced_the_kept_record":false,"compile_warnings":[]}}}',
  );
  expect(JSON.stringify(await commandHandlers.run_stream_project({ folder: projectFolder, stream_function: null, name: "hello" }))).toBe(
    '{"ok":true,"value":{"kind":"name_taken","refusal":' +
      JSON.stringify("Stream graph error: the stream name `hello` is held by a kept stream from /private/tmp/tatolab-proof/projects/hello; load this one under another name with `--name`") +
      ',"free_name":"hello-2"}}',
  );
  expect(await commandHandlers.run_stream_project({ folder: projectFolder, stream_function: null, name: "no-venv" })).toEqual({
    ok: false,
    refusal: "Invalid configuration: /tmp/tatolab-proof/projects/no-venv has no .venv/bin/python; run `uv sync` in /tmp/tatolab-proof/projects/no-venv",
  });
  expect(refreshRequests).toHaveBeenCalledTimes(3);

  expect(await commandHandlers.open_terminal_at_stream_project({ folder: projectFolder })).toEqual({ ok: true, value: null });
  expect(sharedState.terminal.openedInFolders).toEqual([projectFolder]);
  expect(await commandHandlers.open_terminal_at_stream_project({ folder: "/etc" })).toEqual({
    ok: false,
    refusal: "Tatolab acts only on a folder chosen in its window. Choose /etc again.",
  });
  expect(await commandHandlers.create_stream_project({ folder: projectFolder })).toEqual({ ok: false, refusal: "this fake platform has no tatolab command" });
  expect((await commandHandlers.check_stream_project_folder({ folder: projectFolder })).ok).toBe(true);
  const proposal = await commandHandlers.propose_new_stream_project_folder(undefined);
  expect(proposal.ok && proposal.value.folder.endsWith(path.join("streams", "hello"))).toBe(true);
});

test("the commands that add a stream read their arguments as the window sends them, and refuse anything else", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "anything" })).toEqual({
    ok: false,
    refusal: "choose_stream_project_folder needs `chosen_for`, project_to_run or new_project_directory",
  });
  expect(await commandHandlers.choose_stream_project_folder({ chosen_for: "project_to_run" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.check_stream_project_folder({})).toEqual({ ok: false, refusal: "check_stream_project_folder needs `folder`, a folder chosen in the window" });
  expect(await commandHandlers.create_stream_project({ folder: 7 })).toEqual({ ok: false, refusal: "create_stream_project needs `folder`, a folder chosen in the window" });
  expect(await commandHandlers.run_stream_project({ folder: "/tmp/a", stream_function: 3, name: null })).toEqual({
    ok: false,
    refusal: "run_stream_project needs `folder`, a folder chosen in the window, and `stream_function` and `name`, each text or null",
  });
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

  expect(JSON.stringify(await commandHandlers.describe_runtime(undefined))).toBe(
    '{"ok":true,"value":{"version":"0.55.2","build_id":"0.55.2+ec6adf522.7f3a91","up_for_ms":4000,"runtime_log_directory":null}}',
  );
  expect(await commandHandlers.describe_runtime(undefined)).toEqual({
    ok: false,
    refusal: "`describe_runtime` answered 503 with a body that is not JSON-RPC: Unexpected end of JSON input",
  });
});

test("restarting_the_runtime_waits_for_the_service_manager_then_observes_again_and_is_refused_in_its_words", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.restart_runtime(undefined)).toEqual({ ok: true, value: null });
  expect(sharedState.runtimeAgent.calls).toEqual(["restart_the_agents_runtime"]);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  const refusal = "systemctl --user restart tatolabd.service failed (exit 1): Job for tatolabd.service failed.";
  sharedState.runtimeAgent.restartingTheAgentsRuntime = failedWith({ kind: "refused", refusal });
  expect(await commandHandlers.restart_runtime(undefined)).toEqual({ ok: false, refusal });
  expect(refreshRequests).toHaveBeenCalledTimes(2);

  await sharedState.controller.setRunTatolab(false);
  expect(await commandHandlers.restart_runtime(undefined)).toEqual({ ok: false, refusal: RESTART_WITH_RUN_TATOLAB_OFF_REFUSAL });
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

  expect(await commandHandlers.open_runtime_log_folder({ folder: "/etc" })).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_runtime_log_folder(undefined)).toEqual({ ok: false, refusal: RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL });
  expect(sharedState.foldersShownInTheFileManager).toEqual([runtimeLogFolder]);
});

test("turning_stream_failure_notifications_off_is_remembered_shown_in_the_next_status_and_refuses_anything_but_true_or_false", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.set_stream_failure_notifications({ enabled: false })).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.streamFailureNotifications.stateNow()).toEqual({ enabled: false, shown_by_this_desktop: true });
  expect(await commandHandlers.set_stream_failure_notifications({ enabled: "no" })).toEqual({
    ok: false,
    refusal: "set_stream_failure_notifications needs `enabled`, true or false",
  });
});

test("opening_tatolab_at_login_asks_the_desktop_then_observes_again_and_is_refused_in_its_words", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});

  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: true })).toEqual({ ok: true, value: null });
  expect(sharedState.tatolabAppOpenedAtLogin.setsAsked).toEqual([true]);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  sharedState.tatolabAppOpenedAtLogin.refusal = "Tatolab could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: false })).toEqual({
    ok: false,
    refusal: "Tatolab could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
  });
  expect(await commandHandlers.set_open_tatolab_at_login({})).toEqual({ ok: false, refusal: "set_open_tatolab_at_login needs `enabled`, true or false" });
});
