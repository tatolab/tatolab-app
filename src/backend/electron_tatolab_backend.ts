// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabBackend } from "./tatolab_backend";
import type {
  TatolabCommandName,
  TatolabCommandSignatures,
  TatolabElectronBridge,
} from "./tatolab_electron_bridge_contract";

/** The backend inside the Electron app: its commands and status event through the preload's bridge, each refusal rejected in the main process's own words. */
export function createElectronTatolabBackend(tatolabElectronBridge: TatolabElectronBridge): TatolabBackend {
  async function invokeTatolabCommand<CommandName extends TatolabCommandName>(
    commandName: CommandName,
    commandArguments: TatolabCommandSignatures[CommandName]["commandArguments"],
  ): Promise<TatolabCommandSignatures[CommandName]["answer"]> {
    const commandAnswer = await tatolabElectronBridge.invokeTatolabCommand(commandName, commandArguments);
    if (!commandAnswer.ok) throw commandAnswer.refusal;
    return commandAnswer.value;
  }
  return {
    getTatolabStatus: () => invokeTatolabCommand("get_tatolab_status", undefined),
    setRunTatolab: async (enabled) => {
      await invokeTatolabCommand("set_run_tatolab", { enabled });
    },
    openLoginItemsSettings: async () => {
      await invokeTatolabCommand("open_login_items_settings", undefined);
    },
    setUpTatolab: async () => {
      await invokeTatolabCommand("set_up_tatolab", undefined);
    },
    quitTatolabApp: async () => {
      await invokeTatolabCommand("quit_tatolab_app", undefined);
    },
    uninstallTatolab: async () => {
      await invokeTatolabCommand("uninstall_tatolab", undefined);
    },
    readStreamLogRecords: (streamName, afterSequence) =>
      invokeTatolabCommand("read_stream_log_records", { stream: streamName, after: afterSequence }),
    describeStreamGraph: (streamName) => invokeTatolabCommand("describe_stream_graph", { stream: streamName }),
    onTatolabStatusChanged: async (listener) => tatolabElectronBridge.onTatolabStatusChanged(listener),
  };
}
