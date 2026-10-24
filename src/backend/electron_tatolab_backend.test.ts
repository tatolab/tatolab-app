// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createElectronTatolabBackend } from "./electron_tatolab_backend";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import { describeBackendRejection } from "./tatolab_backend";
import type { TatolabStatus } from "./tatolab_backend_contract";
import type {
  TatolabCommandAnswerTo,
  TatolabCommandName,
  TatolabCommandSignatures,
  TatolabElectronBridge,
} from "./tatolab_electron_bridge_contract";

type FakeCommandAnswers = Partial<{ [CommandName in TatolabCommandName]: TatolabCommandAnswerTo<CommandName> }>;

function fakeTatolabElectronBridge(fakeCommandAnswers: FakeCommandAnswers) {
  const invokedCommands: [TatolabCommandName, unknown][] = [];
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const streamPageRequestListeners = new Set<(streamName: string) => void>();
  const tatolabElectronBridge: TatolabElectronBridge = {
    async invokeTatolabCommand<CommandName extends TatolabCommandName>(
      commandName: CommandName,
      commandArguments: TatolabCommandSignatures[CommandName]["commandArguments"],
    ): Promise<TatolabCommandAnswerTo<CommandName>> {
      invokedCommands.push([commandName, commandArguments]);
      return fakeCommandAnswers[commandName] ?? { ok: false, refusal: `the fake bridge has no answer for ${commandName}` };
    },
    onTatolabStatusChanged(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    onStreamPageRequested(listener) {
      streamPageRequestListeners.add(listener);
      return () => streamPageRequestListeners.delete(listener);
    },
  };
  return { tatolabElectronBridge, invokedCommands, statusListeners, streamPageRequestListeners };
}

async function aTatolabStatus(): Promise<TatolabStatus> {
  return createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams())).getTatolabStatus();
}

describe("createElectronTatolabBackend", () => {
  it("sends each command under its name with its arguments", async () => {
    const fakeBridge = fakeTatolabElectronBridge({
      set_run_tatolab: { ok: true, value: null },
      open_login_items_settings: { ok: true, value: null },
      set_up_tatolab: { ok: true, value: null },
      quit_tatolab_app: { ok: true, value: null },
      uninstall_tatolab: { ok: true, value: null },
      read_stream_log_records: { ok: true, value: { stream: "camera", stream_instance: "camera-0", records: [], next_after: 7, records_no_longer_held: 0 } },
      describe_stream_graph: { ok: true, value: { stream: "camera", nodes: [], links: [], exposed: [], graph_document_text: "{}" } },
      open_stream_project_folder: { ok: true, value: null },
      open_terminal_at_stream_project: { ok: true, value: null },
      open_stream_log_folder: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    await backend.setRunTatolab(false);
    await backend.openLoginItemsSettings();
    await backend.setUpTatolab();
    await backend.quitTatolabApp();
    await backend.uninstallTatolab();
    await backend.readStreamLogRecords("camera", 7);
    await backend.describeStreamGraph("camera");
    await backend.openStreamProjectFolder("camera");
    await backend.openTerminalAtStreamProject("camera");
    await backend.openStreamLogFolder("camera");

    expect(fakeBridge.invokedCommands).toEqual([
      ["set_run_tatolab", { enabled: false }],
      ["open_login_items_settings", undefined],
      ["set_up_tatolab", undefined],
      ["quit_tatolab_app", undefined],
      ["uninstall_tatolab", undefined],
      ["read_stream_log_records", { stream: "camera", after: 7 }],
      ["describe_stream_graph", { stream: "camera" }],
      ["open_stream_project_folder", { stream: "camera" }],
      ["open_terminal_at_stream_project", { stream: "camera" }],
      ["open_stream_log_folder", { stream: "camera" }],
    ]);
  });

  it("sends the runtime's commands under their names, answering the runtime's description as it came", async () => {
    const runtimeDescription = { version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 4_000, runtime_log_directory: null };
    const fakeBridge = fakeTatolabElectronBridge({
      describe_runtime: { ok: true, value: runtimeDescription },
      restart_runtime: { ok: true, value: null },
      open_runtime_log_folder: { ok: false, refusal: "The runtime keeps no log of its own, so there is no folder to open." },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    expect(await backend.describeRuntime()).toEqual(runtimeDescription);
    await backend.restartRuntime();
    await expect(backend.openRuntimeLogFolder()).rejects.toBe("The runtime keeps no log of its own, so there is no folder to open.");
    expect(fakeBridge.invokedCommands).toEqual([
      ["describe_runtime", undefined],
      ["restart_runtime", undefined],
      ["open_runtime_log_folder", undefined],
    ]);
  });

  it("sends each stream action under its command, answering a stop's notice and null for the rest", async () => {
    const notRecordedBecause = "the kept record of `camera` could not be written: Permission denied (os error 13)";
    const fakeBridge = fakeTatolabElectronBridge({
      stop_stream: { ok: true, value: { not_recorded_because: notRecordedBecause } },
      start_stream: { ok: true, value: null },
      remove_stream: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    expect(await backend.runStreamAction("stop_stream", "camera")).toBe(notRecordedBecause);
    expect(await backend.runStreamAction("start_stream", "camera")).toBeNull();
    expect(await backend.runStreamAction("remove_stream", "camera")).toBeNull();
    expect(fakeBridge.invokedCommands).toEqual([
      ["stop_stream", { stream: "camera" }],
      ["start_stream", { stream: "camera" }],
      ["remove_stream", { stream: "camera" }],
    ]);
  });

  it("sends each command that adds a stream under its name, answering the main process's report and outcome", async () => {
    const report = {
      folder: "/Users/someone/code/heat-map",
      folder_exists: true,
      stream_file_present: true,
      stream_functions: ["heat_map"],
      python_environment: { kind: "missing" as const },
    };
    const outcome = { kind: "name_taken" as const, refusal: "the stream name `heat_map` is held", free_name: "heat_map-2" };
    const fakeBridge = fakeTatolabElectronBridge({
      choose_stream_project_folder: { ok: true, value: null },
      propose_new_stream_project_folder: { ok: true, value: report },
      check_stream_project_folder: { ok: true, value: report },
      create_stream_project: { ok: true, value: report },
      run_stream_project: { ok: true, value: outcome },
      open_terminal_at_stream_project: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    expect(await backend.chooseStreamProjectFolder("project_to_run")).toBeNull();
    expect(await backend.proposeNewStreamProjectFolder()).toEqual(report);
    expect(await backend.checkStreamProjectFolder(report.folder)).toEqual(report);
    expect(await backend.createStreamProject(report.folder)).toEqual(report);
    expect(await backend.runStreamProject(report.folder, null, "heat_map")).toEqual(outcome);
    await backend.openTerminalAtChosenProjectFolder(report.folder);

    expect(fakeBridge.invokedCommands).toEqual([
      ["choose_stream_project_folder", { chosen_for: "project_to_run" }],
      ["propose_new_stream_project_folder", undefined],
      ["check_stream_project_folder", { folder: report.folder }],
      ["create_stream_project", { folder: report.folder }],
      ["run_stream_project", { folder: report.folder, stream_function: null, name: "heat_map" }],
      ["open_terminal_at_stream_project", { folder: report.folder }],
    ]);
  });

  it("answers with what the main process answered", async () => {
    const tatolabStatus = await aTatolabStatus();
    const backend = createElectronTatolabBackend(
      fakeTatolabElectronBridge({ get_tatolab_status: { ok: true, value: tatolabStatus } }).tatolabElectronBridge,
    );

    expect(await backend.getTatolabStatus()).toEqual(tatolabStatus);
  });

  it("rejects with a refusal in the main process's own words", async () => {
    const runtimeRefusal = "stream `camera` is not loaded";
    const backend = createElectronTatolabBackend(
      fakeTatolabElectronBridge({ describe_stream_graph: { ok: false, refusal: runtimeRefusal } }).tatolabElectronBridge,
    );

    const rejection: unknown = await backend.describeStreamGraph("camera").catch((caughtRejection: unknown) => caughtRejection);

    expect(rejection).toBe(runtimeRefusal);
    expect(describeBackendRejection(rejection)).toBe(runtimeRefusal);
  });

  it("hands each status the main process sends to the listener until it stops listening", async () => {
    const tatolabStatus = await aTatolabStatus();
    const fakeBridge = fakeTatolabElectronBridge({});
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);
    const heardStatuses: TatolabStatus[] = [];

    const stopListening = await backend.onTatolabStatusChanged((status) => heardStatuses.push(status));
    fakeBridge.statusListeners.forEach((statusListener) => statusListener(tatolabStatus));
    stopListening();
    fakeBridge.statusListeners.forEach((statusListener) => statusListener(tatolabStatus));

    expect(heardStatuses).toEqual([tatolabStatus]);
  });

  it("sends the stream-failure notifications switch, and hands each stream page request to the listener until it stops listening", async () => {
    const fakeBridge = fakeTatolabElectronBridge({ set_stream_failure_notifications: { ok: true, value: null } });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);
    const requestedStreams: string[] = [];

    await backend.setStreamFailureNotifications(false);
    const stopListening = backend.onStreamPageRequested((streamName) => requestedStreams.push(streamName));
    fakeBridge.streamPageRequestListeners.forEach((streamPageRequestListener) => streamPageRequestListener("camera"));
    stopListening();
    fakeBridge.streamPageRequestListeners.forEach((streamPageRequestListener) => streamPageRequestListener("main"));

    expect(fakeBridge.invokedCommands).toEqual([["set_stream_failure_notifications", { enabled: false }]]);
    expect(requestedStreams).toEqual(["camera"]);
  });
});
