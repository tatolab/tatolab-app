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
    listProjectNodeTypes: (projectDirectory) => invokeTatolabCommand("list_project_node_types", { project_directory: projectDirectory }),
    listProjectAssets: (projectDirectory) => invokeTatolabCommand("list_project_assets", { project_directory: projectDirectory }),
    importAssetsIntoTheOpenProject: () => invokeTatolabCommand("import_assets_into_the_open_project", undefined),
    checkForTatolabAppUpdates: async () => {
      await invokeTatolabCommand("check_for_tatolab_app_updates", undefined);
    },
    takeTheNewerTatolabAppVersion: async () => {
      await invokeTatolabCommand("take_the_newer_tatolab_app_version", undefined);
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
    setDeveloperMode: async (enabled) => {
      await invokeTatolabCommand("set_developer_mode", { enabled });
    },
    setOpenTatolabAtLogin: async (enabled) => {
      await invokeTatolabCommand("set_open_tatolab_at_login", { enabled });
    },
    onStreamPageRequested: (listener) => tatolabElectronBridge.onStreamPageRequested(listener),
    showTheProjectsWindow: async () => {
      await invokeTatolabCommand("show_projects_window", undefined);
    },
    showTheMenusInTheSystemMenuBar: async (menus) => {
      await invokeTatolabCommand("show_menus_in_the_system_menu_bar", { menus });
    },
    onSystemMenuBarEntryChosen: (listener) => tatolabElectronBridge.onSystemMenuBarEntryChosen(listener),
    chooseProjectFolder: (chosenFor) => invokeTatolabCommand("choose_project_folder", { chosen_for: chosenFor }),
    readNewProjectDefaults: () => invokeTatolabCommand("read_new_project_defaults", undefined),
    chooseNewProjectLocation: (startingAt) => invokeTatolabCommand("choose_new_project_location", { starting_at: startingAt }),
    createNewProject: (name, location) => invokeTatolabCommand("create_new_project", { name, location }),
    readOpenProject: () => invokeTatolabCommand("read_open_project", undefined),
    popOutView: async (target) => {
      await invokeTatolabCommand("pop_out_view", { ...target });
    },
    readPoppedOutView: () => invokeTatolabCommand("read_popped_out_view", undefined),
    openModuleManagerWindow: async () => {
      await invokeTatolabCommand("open_module_manager_window", undefined);
    },
    readModuleManagerWorkspace: () => invokeTatolabCommand("read_module_manager_workspace", undefined),
    readPackageCatalog: () => invokeTatolabCommand("read_package_catalog", undefined),
    listWorkspaceDependencies: (checkForNewer) => invokeTatolabCommand("list_workspace_dependencies", { check_for_newer: checkForNewer }),
    chooseDependencySource: (sourceKind) => invokeTatolabCommand("choose_dependency_source", { source_kind: sourceKind }),
    addDependencyToTheWorkspace: (source) => invokeTatolabCommand("add_dependency_to_the_workspace", { source }),
    updateWorkspaceDependency: (project, overwriteEditedFiles) => invokeTatolabCommand("update_workspace_dependency", { project, overwrite_edited_files: overwriteEditedFiles }),
    importFromTheMarketplace: (name) => invokeTatolabCommand("import_from_the_marketplace", { name }),
    openImportToEdit: async (folder) => {
      await invokeTatolabCommand("open_import_to_edit", { folder });
    },
    pathOfADroppedFile: (droppedFile) => tatolabElectronBridge.pathOfADroppedFile(droppedFile),
    readRecentProjects: () => invokeTatolabCommand("read_recent_projects", undefined),
    openRecentProject: async (folder) => {
      await invokeTatolabCommand("open_recent_project", { folder });
    },
    renameRecentProject: async (folder, name) => {
      await invokeTatolabCommand("rename_recent_project", { folder, name });
    },
    duplicateRecentProject: (folder) => invokeTatolabCommand("duplicate_recent_project", { folder }),
    deleteRecentProject: async (folder) => {
      await invokeTatolabCommand("delete_recent_project", { folder });
    },
    readRecentProjectCover: (folder) => invokeTatolabCommand("read_recent_project_cover", { folder }),
    setRecentProjectDescription: async (folder, description) => {
      await invokeTatolabCommand("set_recent_project_description", { folder, description });
    },
    chooseProjectCoverImage: () => invokeTatolabCommand("choose_project_cover_image", undefined),
    setRecentProjectCover: async (folder, image) => {
      await invokeTatolabCommand("set_recent_project_cover", { folder, image });
    },
    chooseProjectArchiveToImport: () => invokeTatolabCommand("choose_project_archive_to_import", undefined),
    importProjectArchive: (archive, name, location) => invokeTatolabCommand("import_project_archive", { archive, name, location }),
    onOpenProjectChanged: (listener) => tatolabElectronBridge.onOpenProjectChanged(listener),
    readOpenProjectTransactions: () => invokeTatolabCommand("read_open_project_transactions", undefined),
    onProjectTransactionsChanged: (listener) => tatolabElectronBridge.onProjectTransactionsChanged(listener),
    undoInTheOpenProject: (author) => invokeTatolabCommand("undo_in_the_open_project", { author }),
    transactInTheOpenProject: (operations, mode, idempotencyKey) => invokeTatolabCommand("transact_in_the_open_project", { operations, mode, idempotency_key: idempotencyKey }),
    readThePersonEditingInStudio: () => invokeTatolabCommand("read_the_person_editing_in_studio", undefined),
    redoInTheOpenProject: (author) => invokeTatolabCommand("redo_in_the_open_project", { author }),
    onTatolabStatusChanged: async (listener) => tatolabElectronBridge.onTatolabStatusChanged(listener),
    readProjectFile: (file) => invokeTatolabCommand("read_project_file", { file }),
    saveProjectFile: (file, text, basedOnVersion) => invokeTatolabCommand("save_project_file", { file, text, based_on_version: basedOnVersion }),
    createNodeFile: (file) => invokeTatolabCommand("create_node_file", { file }),
    listProjectFiles: (projectFolder) => invokeTatolabCommand("list_project_files", { project_folder: projectFolder }),
    runOpenProject: () => invokeTatolabCommand("run_open_project", undefined),
    stopOpenProject: async () => {
      await invokeTatolabCommand("stop_open_project", undefined);
    },
    startPythonLanguageServer: async (projectFolder) => (await invokeTatolabCommand("start_python_language_server", { project_folder: projectFolder })).session,
    sendToPythonLanguageServer: async (session, message) => {
      await invokeTatolabCommand("send_to_python_language_server", { session, message });
    },
    stopPythonLanguageServer: async (session) => {
      await invokeTatolabCommand("stop_python_language_server", { session });
    },
    onPythonLanguageServerEvent: (listener) => tatolabElectronBridge.onPythonLanguageServerEvent(listener),
    listStudioViewsOfTheOpenProject: () => invokeTatolabCommand("list_studio_views_of_the_open_project", undefined),
    writeStudioViewOutput: async (stream, node, port, value) => {
      await invokeTatolabCommand("write_studio_view_output", { stream, node, port, value });
    },
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
