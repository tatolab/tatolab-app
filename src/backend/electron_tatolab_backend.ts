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
    rememberFirstRunFinished: async () => {
      await invokeTatolabCommand("remember_first_run_finished", undefined);
    },
    registerTheRuntimeAgain: async () => {
      await invokeTatolabCommand("register_the_runtime_again", undefined);
    },
    linkCommandLineToolInUsrLocalBin: async () => {
      await invokeTatolabCommand("link_command_line_tool_in_usr_local_bin", undefined);
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
    checkForTatolabAppUpdates: async () => {
      await invokeTatolabCommand("check_for_tatolab_app_updates", undefined);
    },
    runStreamAction: async (streamAction, streamName) => {
      switch (streamAction) {
        case "stop_stream":
          return (await invokeTatolabCommand("stop_stream", { stream: streamName })).not_recorded_because;
        case "start_stream":
        case "remove_stream":
          await invokeTatolabCommand(streamAction, { stream: streamName });
          return null;
      }
    },
    openStreamProjectFolder: async (streamName) => {
      await invokeTatolabCommand("open_stream_project_folder", { stream: streamName });
    },
    openTerminalAtStreamProject: async (streamName) => {
      await invokeTatolabCommand("open_terminal_at_stream_project", { stream: streamName });
    },
    openStreamLogFolder: async (streamName) => {
      await invokeTatolabCommand("open_stream_log_folder", { stream: streamName });
    },
    chooseStreamProjectFolder: (chosenFor) => invokeTatolabCommand("choose_stream_project_folder", { chosen_for: chosenFor }),
    proposeNewStreamProjectFolder: () => invokeTatolabCommand("propose_new_stream_project_folder", undefined),
    checkStreamProjectFolder: (folder) => invokeTatolabCommand("check_stream_project_folder", { folder }),
    createStreamProject: (folder) => invokeTatolabCommand("create_stream_project", { folder }),
    runStreamProject: (folder, streamFunction, streamName) =>
      invokeTatolabCommand("run_stream_project", { folder, stream_function: streamFunction, name: streamName }),
    openTerminalAtChosenProjectFolder: async (folder) => {
      await invokeTatolabCommand("open_terminal_at_stream_project", { folder });
    },
    describeRuntime: () => invokeTatolabCommand("describe_runtime", undefined),
    restartRuntime: async () => {
      await invokeTatolabCommand("restart_runtime", undefined);
    },
    openRuntimeLogFolder: async () => {
      await invokeTatolabCommand("open_runtime_log_folder", undefined);
    },
    setStreamFailureNotifications: async (enabled) => {
      await invokeTatolabCommand("set_stream_failure_notifications", { enabled });
    },
    setOpenTatolabAtLogin: async (enabled) => {
      await invokeTatolabCommand("set_open_tatolab_at_login", { enabled });
    },
    onStreamPageRequested: (listener) => tatolabElectronBridge.onStreamPageRequested(listener),
    onTatolabStatusChanged: async (listener) => tatolabElectronBridge.onTatolabStatusChanged(listener),
  };
}
