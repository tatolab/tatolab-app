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
  };
  return { tatolabElectronBridge, invokedCommands, statusListeners };
}

async function aTatolabStatus(): Promise<TatolabStatus> {
  return createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams())).getTatolabStatus();
}

describe("createElectronTatolabBackend", () => {
  it("sends each command under its Tauri name with the arguments Tauri took", async () => {
    const fakeBridge = fakeTatolabElectronBridge({
      set_run_tatolab: { ok: true, value: null },
      open_login_items_settings: { ok: true, value: null },
      set_up_tatolab: { ok: true, value: null },
      quit_tatolab_app: { ok: true, value: null },
      uninstall_tatolab: { ok: true, value: null },
      read_stream_log_records: { ok: true, value: { stream: "camera", stream_instance: "camera-0", records: [], next_after: 7, records_no_longer_held: 0 } },
      describe_stream_graph: { ok: true, value: { stream: "camera", nodes: [], links: [], exposed: [] } },
    });
    const backend = createElectronTatolabBackend(fakeBridge.tatolabElectronBridge);

    await backend.setRunTatolab(false);
    await backend.openLoginItemsSettings();
    await backend.setUpTatolab();
    await backend.quitTatolabApp();
    await backend.uninstallTatolab();
    await backend.readStreamLogRecords("camera", 7);
    await backend.describeStreamGraph("camera");

    expect(fakeBridge.invokedCommands).toEqual([
      ["set_run_tatolab", { enabled: false }],
      ["open_login_items_settings", undefined],
      ["set_up_tatolab", undefined],
      ["quit_tatolab_app", undefined],
      ["uninstall_tatolab", undefined],
      ["read_stream_log_records", { stream: "camera", after: 7 }],
      ["describe_stream_graph", { stream: "camera" }],
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
});
