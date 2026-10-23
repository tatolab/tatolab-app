// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { TatolabPlatform } from "../../src/backend/tatolab_backend_contract.js";
import { FakeLocalApiServer, httpResponse, toolResultResponse } from "./fake_local_api_server.js";
import {
  FakeRuntimeAgentRegistration,
  FakeTatolabMachineSetup,
  FakeTerminalOpenedInAFolder,
  fakeTatolabPlatformForThisBuild,
} from "./fake_tatolab_platform_for_this_build.js";
import { failedWith, succeeded } from "./result.js";
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
  readStreamLogRecordsArgumentsFrom,
  runStreamAction,
  setRunTatolabArgumentsFrom,
  streamArgumentsFrom,
  setUpTatolab,
  tatolabWindowCommandHandlers,
} from "./tatolab_commands.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { TatolabAppUpdater } from "./tatolab_app_updater.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

async function sharedStateOverFakes(
  scriptedLocalApiResponses: readonly Buffer[],
  platform: TatolabPlatform,
  setUpTatolabRefusal: string | null,
  existingFolders: readonly string[] = [],
): Promise<TatolabAppSharedState & { machineSetup: FakeTatolabMachineSetup; terminal: FakeTerminalOpenedInAFolder; foldersShownInTheFileManager: string[] }> {
  const localApiServer = await FakeLocalApiServer.answering(scriptedLocalApiResponses);
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  cleanUps.push(() => localApiServer.close(), () => rm(appConfigDirectory, { recursive: true, force: true }));
  const machineSetup = new FakeTatolabMachineSetup("complete", setUpTatolabRefusal);
  const terminal = new FakeTerminalOpenedInAFolder();
  const platformForThisBuild = fakeTatolabPlatformForThisBuild(
    new FakeRuntimeAgentRegistration("enabled"),
    machineSetup,
    localApiServer.localApiSocketPath,
    undefined,
    undefined,
    undefined,
    terminal,
  );
  const controller = await TatolabAppController.create({
    platform,
    platformForThisBuild,
    appConfigDirectory,
    appLaunchedAtMs: 0,
    appVersion: "0.45.0",
    readMonotonicClockMs: () => 0,
    readTheAppUpdateState: () => ({ kind: "not_checked" }),
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
    tatolabAppLog: quietTatolabAppLog,
    machineSetup,
    terminal,
    foldersShownInTheFileManager,
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
    "macos",
    null,
  );
  expect(JSON.stringify(await runningRuntime.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"macos","run_tatolab":true,' +
      '"runtime_agent":"enabled","runtime_state":"running",' +
      '"machine_name":"jonathanf-macbook","streams":[' +
      '{"name":"main","state":"kept","project_directory":"/private/tmp/x/pattern",' +
      '"node_count":4,"failed_because":null}],"machine_setup_state":"complete",' +
      '"command_line_tool_linked_at":"/usr/local/bin/tatolab","app_update":{"kind":"not_checked"}}',
  );
  const runtimeThatIsDown = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux", null);
  runtimeThatIsDown.machineSetup.machineSetupState = "needs_administrator";
  expect(JSON.stringify(await runtimeThatIsDown.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0","platform":"linux","run_tatolab":true,' +
      '"runtime_agent":"enabled","runtime_state":"starting","machine_name":null,' +
      '"streams":null,"machine_setup_state":"needs_administrator",' +
      '"command_line_tool_linked_at":null,"app_update":{"kind":"not_checked"}}',
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
      '"attrs":{"processor_class_import_path":"nodes.x:X"}},' +
      '{"sequence":8,"host_ts_ns":null,"level":null,"source":null,"target":null,' +
      '"message":"","attrs":{}}],"next_after":8,"records_no_longer_held":0}',
  );

  const graphToolResultText = JSON.stringify({
      machine: "jonathanf-macbook",
      exposed: [{ level: "private", port: "video_to_downstream", node: "invertingeffect" }],
      links: [
        { state: "wired", target: { port: "video_from_upstream", node: "invertingeffect" }, source: { port: "video", node: "testpatternsource" }, id: "L1" },
      ],
      nodes: [
        { components: { state: "Running" }, type: "tatolab.stream:TestPatternSource", name: "testpatternsource" },
        { type: "nodes.inverting_effect:InvertingEffect", name: "invertingeffect", components: { metrics: { dropped_bags_by_link: { L1: 12 } } } },
      ],
      stream: "main",
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphToolResultText, "http://127.0.0.1:4446");
  expect(graph.ok && JSON.stringify(graph.value)).toBe(
    '{"stream":"main","nodes":[' +
      '{"name":"testpatternsource","type":"tatolab.stream:TestPatternSource","state":"Running",' +
      '"dropped_bags_by_link":{},"refused_bags_by_output_port":{}},' +
      '{"name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","state":null,' +
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
    "macos",
    null,
  );

  expect(await describeStreamGraph(sharedState, "nope")).toEqual(failedWith(graphRefusal));
  expect(await readStreamLogRecords(sharedState, "nope", 0)).toEqual(failedWith(logsRefusal));
});

test("the window asking for the status before the first round waits for it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux", null);

  const status = getTatolabStatus(sharedState);
  await sharedState.statusPublisher.refreshAndPublish();

  expect((await status).ok).toBe(true);
});

test("Set Up Tatolab is refused at once where the platform has no machine setup", async () => {
  const refusal = "Tatolab on Linux is set up by its installer";
  const sharedState = await sharedStateOverFakes([], "linux", refusal);

  expect(setUpTatolab(sharedState)).toEqual(failedWith(refusal));
  expect(sharedState.machineSetup.setUpTriggers).toEqual([]);
});

test("a command's arguments are read as the window sends them, and anything else is refused", () => {
  expect(setRunTatolabArgumentsFrom({ enabled: false })).toEqual(succeeded({ enabled: false }));
  expect(setRunTatolabArgumentsFrom({ enabled: "yes" }).ok).toBe(false);
  expect(setRunTatolabArgumentsFrom(null).ok).toBe(false);
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
    "linux",
    "the installer sets up Tatolab",
  );
  let quitRequests = 0;
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {
    quitRequests += 1;
  });
  expect(await commandHandlers.describe_stream_graph({ stream: "nope" })).toEqual({ ok: false, refusal: graphRefusal });
  expect(await commandHandlers.set_up_tatolab(undefined)).toEqual({ ok: false, refusal: "the installer sets up Tatolab" });
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
    "macos",
    null,
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
    "linux",
    null,
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
    null,
    ["/Users/jonathanf/streams/main"],
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
    refusal: "open_terminal_at_stream_project needs `stream`, a stream's name",
  });

  expect(sharedState.foldersShownInTheFileManager).toEqual(["/Users/jonathanf/streams/main"]);
  expect(sharedState.terminal.openedInFolders).toEqual(["/Users/jonathanf/streams/main"]);
});
