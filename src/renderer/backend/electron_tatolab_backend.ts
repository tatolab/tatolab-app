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
    linkCommandLineTool: async () => {
      await invokeTatolabCommand("link_command_line_tool", undefined);
    },
    quitTatolabApp: async () => {
      await invokeTatolabCommand("quit_tatolab_app", undefined);
    },
    readProjectLogRecords: (projectDirectory, narrowing, after) =>
      invokeTatolabCommand("read_project_log_records", { project_directory: projectDirectory, stream: narrowing.stream, action: narrowing.action, after }),
    describeStreamGraph: (streamId) => invokeTatolabCommand("describe_stream_graph", { stream: streamId }),
    describeNodeCatalog: (streamId) => invokeTatolabCommand("describe_node_catalog", { stream: streamId }),
    checkForTatolabAppUpdates: async () => {
      await invokeTatolabCommand("check_for_tatolab_app_updates", undefined);
    },
    runStreamAction: async (streamAction, streamId) => {
      await invokeTatolabCommand(streamAction, { stream: streamId });
    },
    removeProject: async (projectDirectory) => {
      await invokeTatolabCommand("remove_project", { project_directory: projectDirectory });
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
    createStreamProject: (folder) => invokeTatolabCommand("create_stream_project", { folder }),
    runStreamProject: (folder) => invokeTatolabCommand("run_stream_project", { folder }),
    reloadProject: (projectDirectory) => invokeTatolabCommand("reload_project", { project_directory: projectDirectory }),
    describeStreamAction: (action) => invokeTatolabCommand("describe_stream_action", { action }),
    cancelStreamAction: (action) => invokeTatolabCommand("cancel_stream_action", { action }),
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
    describeRelays: () => invokeTatolabCommand("describe_relays", undefined),
    addRelay: async (adapter, settings) => (await invokeTatolabCommand("add_relay", { adapter, settings: { ...settings } })).relay_id,
    configureRelay: async (relayId, settings) => {
      await invokeTatolabCommand("configure_relay", { relay_id: relayId, settings: { ...settings } });
    },
    removeRelay: async (relayId) => {
      await invokeTatolabCommand("remove_relay", { relay_id: relayId });
    },
    onStreamPageRequested: (listener) => tatolabElectronBridge.onStreamPageRequested(listener),
    showTheProjectsWindow: async () => {
      await invokeTatolabCommand("show_projects_window", undefined);
    },
    chooseProjectFolder: (chosenFor) => invokeTatolabCommand("choose_project_folder", { chosen_for: chosenFor }),
    readNewProjectDefaults: () => invokeTatolabCommand("read_new_project_defaults", undefined),
    chooseNewProjectLocation: (startingAt) => invokeTatolabCommand("choose_new_project_location", { starting_at: startingAt }),
    createNewProject: (name, location) => invokeTatolabCommand("create_new_project", { name, location }),
    readOpenProject: () => invokeTatolabCommand("read_open_project", undefined),
    popOutViewer: async (target) => {
      await invokeTatolabCommand("pop_out_viewer", { ...target });
    },
    readPoppedOutViewer: () => invokeTatolabCommand("read_popped_out_viewer", undefined),
    openGetMoreWindow: async () => {
      await invokeTatolabCommand("open_get_more_window", undefined);
    },
    readGetMoreWorkspace: () => invokeTatolabCommand("read_get_more_workspace", undefined),
    readPackageCatalog: () => invokeTatolabCommand("read_package_catalog", undefined),
    previewImport: (requirement) => invokeTatolabCommand("preview_import", { requirement }),
    importIntoWorkspace: async (requirement, basedOnVersion) => {
      await invokeTatolabCommand("import_into_workspace", { requirement, based_on_version: basedOnVersion });
    },
    openImportToEdit: async (name) => {
      await invokeTatolabCommand("open_import_to_edit", { name });
    },
    readRecentProjects: () => invokeTatolabCommand("read_recent_projects", undefined),
    openRecentProject: async (folder) => {
      await invokeTatolabCommand("open_recent_project", { folder });
    },
    onOpenProjectChanged: (listener) => tatolabElectronBridge.onOpenProjectChanged(listener),
    onTatolabStatusChanged: async (listener) => tatolabElectronBridge.onTatolabStatusChanged(listener),
    readProjectFile: (file) => invokeTatolabCommand("read_project_file", { file }),
    saveProjectFile: (file, text, basedOnVersion) => invokeTatolabCommand("save_project_file", { file, text, based_on_version: basedOnVersion }),
    listProjectFiles: (projectFolder) => invokeTatolabCommand("list_project_files", { project_folder: projectFolder }),
    runOpenProject: () => invokeTatolabCommand("run_open_project", undefined),
    startPythonLanguageServer: async (projectFolder) => (await invokeTatolabCommand("start_python_language_server", { project_folder: projectFolder })).session,
    sendToPythonLanguageServer: async (session, message) => {
      await invokeTatolabCommand("send_to_python_language_server", { session, message });
    },
    stopPythonLanguageServer: async (session) => {
      await invokeTatolabCommand("stop_python_language_server", { session });
    },
    onPythonLanguageServerEvent: (listener) => tatolabElectronBridge.onPythonLanguageServerEvent(listener),
    openPortViewer: async (target) => (await invokeTatolabCommand("open_port_viewer", target)).port_viewer,
    closePortViewer: async (portViewer) => {
      await invokeTatolabCommand("close_port_viewer", { port_viewer: portViewer });
    },
    onPortViewerEvent: (listener) => tatolabElectronBridge.onPortViewerEvent(listener),
    onPortViewerImageFrame: (listener) =>
      tatolabElectronBridge.onPortViewerImageFrame((videoFrame, frameFacts) => {
        if (videoFrame instanceof VideoFrame) listener(videoFrame, frameFacts);
        else videoFrame.close();
      }),
  };
}
