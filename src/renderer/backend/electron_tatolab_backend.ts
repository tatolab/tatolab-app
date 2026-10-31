import type { TatolabBackend } from "./tatolab_backend";
import type {
  TatolabCommandName,
  TatolabCommandSignatures,
  TatolabElectronBridge,
} from "../../shared/tatolab_electron_bridge_contract";

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
    linkCommandLineToolInUsrLocalBin: async () => {
      await invokeTatolabCommand("link_command_line_tool_in_usr_local_bin", undefined);
    },
    quitTatolabApp: async () => {
      await invokeTatolabCommand("quit_tatolab_app", undefined);
    },
    uninstallTatolab: async () => {
      await invokeTatolabCommand("uninstall_tatolab", undefined);
    },
    readStreamLogRecords: (streamId, afterSequence) =>
      invokeTatolabCommand("read_stream_log_records", { stream: streamId, after: afterSequence }),
    describeStreamGraph: (streamId) => invokeTatolabCommand("describe_stream_graph", { stream: streamId }),
    checkForTatolabAppUpdates: async () => {
      await invokeTatolabCommand("check_for_tatolab_app_updates", undefined);
    },
    runStreamAction: async (streamAction, streamId) => {
      switch (streamAction) {
        case "stop_stream":
          return (await invokeTatolabCommand("stop_stream", { stream: streamId })).not_recorded_because;
        case "start_stream":
        case "remove_stream":
          await invokeTatolabCommand(streamAction, { stream: streamId });
          return null;
      }
    },
    renameStream: async (streamId, displayName) => {
      await invokeTatolabCommand("rename_stream", { stream: streamId, display_name: displayName });
    },
    openStreamProjectFolder: async (streamId) => {
      await invokeTatolabCommand("open_stream_project_folder", { stream: streamId });
    },
    openTerminalAtStreamProject: async (streamId) => {
      await invokeTatolabCommand("open_terminal_at_stream_project", { stream: streamId });
    },
    openStreamLogFolder: async (streamId) => {
      await invokeTatolabCommand("open_stream_log_folder", { stream: streamId });
    },
    chooseStreamProjectFolder: (chosenFor) => invokeTatolabCommand("choose_stream_project_folder", { chosen_for: chosenFor }),
    proposeNewStreamProjectFolder: () => invokeTatolabCommand("propose_new_stream_project_folder", undefined),
    createStreamProject: (folder) => invokeTatolabCommand("create_stream_project", { folder }),
    runStreamProject: (folder, streamFunction, displayName) =>
      invokeTatolabCommand("run_stream_project", { folder, stream_function: streamFunction, name: displayName }),
    describeRuntime: () => invokeTatolabCommand("describe_runtime", undefined),
    restartRuntime: async () => {
      await invokeTatolabCommand("restart_runtime", undefined);
    },
    installTheCarriedRuntimeAgain: async () => {
      await invokeTatolabCommand("install_the_carried_runtime_again", undefined);
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
    choosePythonForNewEnvironments: async (python) => {
      await invokeTatolabCommand("choose_python_for_new_environments", { python });
    },
    describeRelays: () => invokeTatolabCommand("describe_relays", undefined),
    addRelay: async (adapter, settings) => (await invokeTatolabCommand("add_relay", { adapter, settings: { ...settings } })).relay_id,
    configureRelay: async (relayId, settings) => {
      await invokeTatolabCommand("configure_relay", { relay_id: relayId, settings: { ...settings } });
    },
    removeRelay: async (relayId) => {
      await invokeTatolabCommand("remove_relay", { relay_id: relayId });
    },
    onStreamPageRequested: (listener) => tatolabElectronBridge.onStreamPageRequested(listener),
    onTatolabStatusChanged: async (listener) => tatolabElectronBridge.onTatolabStatusChanged(listener),
  };
}
