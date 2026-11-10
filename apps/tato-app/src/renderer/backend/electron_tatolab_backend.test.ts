// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createElectronTatolabBackend } from "./electron_tatolab_backend";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../../mock/mock_tatolab_backend";
import { describeBackendRejection } from "./tatolab_backend";
import type { OpenProjectReading, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type {
  TatolabCommandAnswerTo,
  TatolabCommandName,
  TatolabCommandSignatures,
  TatolabElectronBridge,
} from "../../shared/tatolab_electron_bridge_contract";

type FakeCommandAnswers = Partial<{ [CommandName in TatolabCommandName]: TatolabCommandAnswerTo<CommandName> }>;

function fakeTatolabElectronBridge(fakeCommandAnswers: FakeCommandAnswers) {
  const invokedCommands: [TatolabCommandName, unknown][] = [];
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const streamPageRequestListeners = new Set<(streamId: string) => void>();
  const openProjectListeners = new Set<(reading: OpenProjectReading) => void>();
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
    onOpenProjectChanged(listener) {
      openProjectListeners.add(listener);
      return () => openProjectListeners.delete(listener);
    },
    onProjectTransactionsChanged() {
      return () => undefined;
    },
    onPythonLanguageServerEvent() {
      return () => undefined;
    },
    onPortViewerEvent() {
      return () => undefined;
    },
    onPortViewerImageFrame() {
      return () => undefined;
    },
    onSystemMenuBarEntryChosen() {
      return () => undefined;
    },
    tellTheAppTheWindowDrewItsFirstStatus() {},
    pathOfADroppedFile: () => "",
  };
  return { tatolabElectronBridge, invokedCommands, statusListeners, streamPageRequestListeners, openProjectListeners };
}

async function aTatolabStatus(): Promise<TatolabStatus> {
  return createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams())).getTatolabStatus();
}

describe("createElectronTatolabBackend", () => {
  it("refuses to list a project's views in words naming the runtime's listing it waits on, asking the app nothing", async () => {
    const fakeBridge = fakeTatolabElectronBridge({});
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    await expect(backend.listStudioViewsOfTheOpenProject()).rejects.toBe(
      "Tato Studio lists a project's views once the runtime lists the tatolab.views of a stream's packages (tatolab/streamlib#3307).",
    );
    expect(fakeBridge.invokedCommands).toEqual([]);
  });

  it("sends each command under its name with its arguments", async () => {
    const fakeBridge = fakeTatolabElectronBridge({
      link_command_line_tool: { ok: true, value: null },
      quit_tatolab_app: { ok: true, value: null },
      read_project_log_records: { ok: true, value: { project_directory: "/p", records: [], next_after: "1:90", records_no_longer_held: false } },
      describe_stream_graph: { ok: true, value: { stream: "camera", stream_asset: null, nodes: [], links: [], groups: [], notes: [], graph_document_text: "{}" } },
      open_stream_project_folder: { ok: true, value: null },
      open_terminal_at_stream_project: { ok: true, value: null },
      open_stream_log_folder: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    await backend.linkCommandLineTool();
    await backend.quitTatolabApp();
    await backend.readProjectLogRecords("/p", { stream: "camera", action: null }, "1:40");
    await backend.describeStreamGraph("camera");
    await backend.openStreamProjectFolder("camera");
    await backend.openTerminalAtStreamProject("camera");
    await backend.openStreamLogFolder("camera");

    expect(fakeBridge.invokedCommands).toEqual([
      ["link_command_line_tool", undefined],
      ["quit_tatolab_app", undefined],
      ["read_project_log_records", { project_directory: "/p", stream: "camera", action: null, after: "1:40" }],
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

  it("sends each queued action under its command, rejecting a refusal in the main process's words", async () => {
    const fakeBridge = fakeTatolabElectronBridge({
      stop_open_project: { ok: false, refusal: "Runtime error: no stream of the project in /p runs, so there is none to stop; `run` runs it. Loaded: none. Recorded: none" },
      remove_project: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    await expect(backend.stopOpenProject()).rejects.toContain("none to stop");
    await backend.removeProject("/p");
    expect(fakeBridge.invokedCommands).toEqual([
      ["stop_open_project", undefined],
      ["remove_project", { project_directory: "/p" }],
    ]);
  });

  it("sends each command that adds a project under its name, answering what the main process answered", async () => {
    const creationQueued = { action: "R1-7", stream: "kind-butte-main-e51c2f", project_directory: "/Users/someone/streams/kind-butte" };
    const runQueued = { action: "R1-3", project_directory: "/Users/someone/code/hallways" };
    const notHeld = { kind: "not_held" as const, words: "Invalid configuration: the stream action `R1-999` is not held" };
    const fakeBridge = fakeTatolabElectronBridge({
      choose_stream_project_folder: { ok: true, value: "/Users/someone/code/hallways" },
      create_stream_project: { ok: true, value: creationQueued },
      run_stream_project: { ok: true, value: runQueued },
      describe_stream_action: { ok: true, value: notHeld },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    expect(await backend.chooseStreamProjectFolder("project_to_run")).toBe("/Users/someone/code/hallways");
    expect(await backend.createStreamProject(null)).toEqual(creationQueued);
    expect(await backend.runStreamProject("/Users/someone/code/hallways")).toEqual(runQueued);
    expect(await backend.describeStreamAction("R1-999")).toEqual(notHeld);

    expect(fakeBridge.invokedCommands).toEqual([
      ["choose_stream_project_folder", { chosen_for: "project_to_run" }],
      ["create_stream_project", { folder: null }],
      ["run_stream_project", { folder: "/Users/someone/code/hallways" }],
      ["describe_stream_action", { action: "R1-999" }],
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

  it("sends the stream-failure notifications and open-at-login switches, and hands each stream page request to the listener until it stops listening", async () => {
    const fakeBridge = fakeTatolabElectronBridge({
      set_stream_failure_notifications: { ok: true, value: null },
      set_open_tatolab_at_login: { ok: true, value: null },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);
    const requestedStreams: string[] = [];

    await backend.setStreamFailureNotifications(false);
    await backend.setOpenTatolabAtLogin(true);
    const stopListening = backend.onStreamPageRequested((streamId) => requestedStreams.push(streamId));
    fakeBridge.streamPageRequestListeners.forEach((streamPageRequestListener) => streamPageRequestListener("camera"));
    stopListening();
    fakeBridge.streamPageRequestListeners.forEach((streamPageRequestListener) => streamPageRequestListener("main"));

    expect(fakeBridge.invokedCommands).toEqual([
      ["set_stream_failure_notifications", { enabled: false }],
      ["set_open_tatolab_at_login", { enabled: true }],
    ]);
    expect(requestedStreams).toEqual(["camera"]);
  });
});
