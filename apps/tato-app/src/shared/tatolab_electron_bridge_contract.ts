// The wire between the window and the Electron main process: the commands the window invokes,
// under their snake_case names, the event each status change arrives on, and how a
// command answers.

import type {
  ChosenProjectFolder,
  NewProjectDefaults,
  NodeCatalog,
  ProjectNodeTypeListing,
  JsonValue,
  DependencySourceKind,
  ProjectDependency,
  WorkspaceDependency,
  WorkspaceDependencyUpdate,
  OpenProjectReading,
  PackageCatalogReading,
  PoppedOutView,
  PortViewerEvent,
  PortViewerImageFrameFacts,
  PortViewerTarget,
  RecentProject,
  ProjectCreationQueued,
  PythonLanguageServerEvent,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectRunQueued,
  ProjectTransaction,
  GraphEditMode,
  ProjectGraphTransactionTheRuntimeAnswered,
  StreamGraphAction,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  RuntimeDescription,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  ProjectFileRead,
  ProjectFileSaved,
  ProjectFolderChosenFor,
  ListedStudioView,
  ProjectFiles,
  SystemMenuBarMenu,
} from "./tatolab_backend_contract.js";

/** The scheme the Electron app serves its window's page under: a page on it with no bridge is the app's window whose preload did not load. */
export const TATOLAB_WINDOW_PAGE_SCHEME = "tatolab-app";

/** The host of the window page's origin, which core views' pages and project views' files are served on too. */
export const TATOLAB_WINDOW_PAGE_HOST = "app";

/** Every command the window invokes, each an IPC channel the main process handles. */
export const TATOLAB_COMMAND_NAMES = [
  "get_tatolab_status",
  "link_command_line_tool",
  "quit_tatolab_app",
  "read_project_log_records",
  "describe_stream_graph",
  "describe_node_catalog",
  "list_project_node_types",
  "check_for_tatolab_app_updates",
  "take_the_newer_tatolab_app_version",
  "remove_project",
  "rename_stream",
  "open_stream_project_folder",
  "open_terminal_at_stream_project",
  "open_stream_log_folder",
  "choose_stream_project_folder",
  "read_new_project_defaults",
  "choose_new_project_location",
  "create_new_project",
  "create_stream_project",
  "run_stream_project",
  "reload_project",
  "describe_stream_action",
  "cancel_stream_action",
  "describe_runtime",
  "restart_runtime",
  "open_runtime_log_folder",
  "set_stream_failure_notifications",
  "set_developer_mode",
  "set_open_tatolab_at_login",
  "choose_project_folder",
  "read_open_project",
  "read_recent_projects",
  "open_recent_project",
  "show_projects_window",
  "pop_out_view",
  "read_popped_out_view",
  "open_module_manager_window",
  "read_module_manager_workspace",
  "read_package_catalog",
  "list_workspace_dependencies",
  "choose_dependency_source",
  "add_dependency_to_the_workspace",
  "update_workspace_dependency",
  "import_from_the_marketplace",
  "open_import_to_edit",
  "read_project_file",
  "save_project_file",
  "list_project_files",
  "list_studio_views_of_the_open_project",
  "run_open_project",
  "read_open_project_transactions",
  "undo_in_the_open_project",
  "transact_in_the_open_project",
  "read_the_person_editing_in_studio",
  "redo_in_the_open_project",
  "stop_open_project",
  "start_python_language_server",
  "send_to_python_language_server",
  "stop_python_language_server",
  "open_port_viewer",
  "close_port_viewer",
  "show_menus_in_the_system_menu_bar",
] as const;

/**
 * One command the window invokes. Arguments: `set_stream_failure_notifications`, `set_developer_mode` and `set_open_tatolab_at_login` `{ enabled }`, `read_project_log_records` `{ project_directory, stream, action, after }`,
 * `remove_project` and `reload_project` `{ project_directory }`, `describe_stream_graph`, `describe_node_catalog`, `open_stream_project_folder`, `open_terminal_at_stream_project` and `open_stream_log_folder` `{ stream }`, `rename_stream` `{ stream, display_name }`,
 * `choose_stream_project_folder` `{ chosen_for }`, `create_stream_project` and `run_stream_project` `{ folder }`, `describe_stream_action` and `cancel_stream_action` `{ action }`,
 * `choose_project_folder` `{ chosen_for }`, `open_recent_project` `{ folder }`, `choose_new_project_location` `{ starting_at }`, `create_new_project` `{ name, location }`, `pop_out_view` a `PoppedOutView`, `list_workspace_dependencies` `{ check_for_newer }`, `choose_dependency_source` `{ source_kind }`, `add_dependency_to_the_workspace` `{ source }`, `update_workspace_dependency` `{ project, overwrite_edited_files }`, `import_from_the_marketplace` `{ name }`, `open_import_to_edit` `{ folder }`, the project file, language server and port viewer commands as their signatures below give, the rest none. A command naming a stream opens the folder the runtime listed for it, or its log folder; one naming a folder
 * acts only on a folder the app handed the window from its folder dialog, `open_recent_project` only on one of the recent projects, and `read_project_log_records`, `remove_project` and `reload_project` only on a project the runtime last listed a stream from. `check_for_tatolab_app_updates` checks and, finding a newer Tatolab
 * that installs in place, downloads it; `take_the_newer_tatolab_app_version` restarts into a downloaded one, downloads one a check found, or opens a `.deb`'s download, the person choosing it being the confirmation. `restart_runtime` answers once the app's runtime has been started again; `open_runtime_log_folder` opens the
 * folder the runtime names when the app asks it, never one the window names.
 */
export type TatolabCommandName = (typeof TATOLAB_COMMAND_NAMES)[number];

/** The event each status change, and the status again each time the window is shown, arrives on; it carries a `TatolabStatus`. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** The event the app asks the window to show a stream's page on, as a click on that stream's failure notification does; it carries a `TatolabStreamPageRequest`. */
export const TATOLAB_STREAM_PAGE_REQUESTED_EVENT = "tatolab-stream-page-requested";

/** The event each change of the open project arrives on: another folder opened, a change in one of its folders, or the runtime starting to answer; it carries an `OpenProjectReading`. */
export const TATOLAB_OPEN_PROJECT_CHANGED_EVENT = "tatolab-open-project-changed";

/** The event each new reading of a studio window's project's change feed arrives on: a transaction applied, or the feed lost or followed again; it carries a `ProjectTransactionsReading`. */
export const TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT = "tatolab-project-transactions-changed";

/** The event each message a Python language server sends, and each server's end, arrives on; it carries a `PythonLanguageServerEvent`. */
export const TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT = "tatolab-python-language-server-event";

/** The event each port viewer's messages, its CPU-read Image frames, its reopening and its end arrive on; it carries a `PortViewerEvent`. Its shared-texture Image frames arrive through Electron's `sharedTexture` receiver instead. */
export const TATOLAB_PORT_VIEWER_EVENT = "tatolab-port-viewer-event";

/** The event the system menu bar sends the window an entry the person chose on, from the menus that window last showed there; it carries a `SystemMenuBarEntryChosen`. */
export const TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT = "tatolab-system-menu-bar-entry-chosen";

/** The graph actions a studio window sends as one transaction, under its gesture's idempotency key or none. */
export interface ProjectGraphTransactionSentByTheWindow {
  operations: readonly StreamGraphAction[];
  mode: GraphEditMode;
  idempotency_key: string | null;
}

/** What `tatolab-system-menu-bar-entry-chosen` carries: the `entry_id` of the entry chosen. */
export interface SystemMenuBarEntryChosen {
  entry_id: string;
}

/** Whether an event's payload is a `SystemMenuBarEntryChosen`. */
export function isASystemMenuBarEntryChosen(eventPayload: unknown): eventPayload is SystemMenuBarEntryChosen {
  return typeof eventPayload === "object" && eventPayload !== null && "entry_id" in eventPayload && typeof eventPayload.entry_id === "string";
}

/** The notice the window sends the main process once it has drawn its first status, carrying nothing; the window first goes on screen on it. */
export const TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE = "tatolab-window-drew-its-first-status";

/** The part of a WebCodecs `VideoFrame` the contract names, since the main process's build has no DOM; the window narrows it with `instanceof VideoFrame`. */
export interface PortViewerVideoFrame {
  readonly codedWidth: number;
  readonly codedHeight: number;
  close(): void;
}

/** Whether a shared texture's companion argument is a `PortViewerImageFrameFacts`. */
export function isPortViewerImageFrameFacts(companionArgument: unknown): companionArgument is PortViewerImageFrameFacts {
  return (
    typeof companionArgument === "object" &&
    companionArgument !== null &&
    "port_viewer" in companionArgument &&
    typeof companionArgument.port_viewer === "string" &&
    "format_wire_name" in companionArgument &&
    typeof companionArgument.format_wire_name === "string" &&
    "skipped_since_last_read" in companionArgument &&
    typeof companionArgument.skipped_since_last_read === "number"
  );
}

/** What `tatolab-stream-page-requested` carries: the id of the stream whose page to show. */
export interface TatolabStreamPageRequest {
  stream: string;
}

/** Whether an event's payload is a `TatolabStreamPageRequest`. */
export function isATatolabStreamPageRequest(eventPayload: unknown): eventPayload is TatolabStreamPageRequest {
  return typeof eventPayload === "object" && eventPayload !== null && "stream" in eventPayload && typeof eventPayload.stream === "string";
}

/** What a command answers: its answer (`null` for a command that answers nothing), or a refusal in words, which the window shows as it is. A command never answers with a thrown error. */
export type TatolabCommandAnswer = { ok: true; value: unknown } | { ok: false; refusal: string };

type EveryCommandHasASignature<CommandSignatures extends Record<TatolabCommandName, { commandArguments: unknown; answer: unknown }>> = CommandSignatures;

/** Each command's arguments and answer, as the window sends and reads them. */
export type TatolabCommandSignatures = EveryCommandHasASignature<{
  get_tatolab_status: { commandArguments: undefined; answer: TatolabStatus };
  /** Links `~/.local/bin/tatolab` to the CLI the app carries; refused in words when something else holds the name or the build offers none. */
  link_command_line_tool: { commandArguments: undefined; answer: null };
  quit_tatolab_app: { commandArguments: undefined; answer: null };
  /** `stream` and `action` narrow the read, `null` for no narrowing; `after` is the `next_after` of the page before, `null` for the oldest record held. */
  read_project_log_records: { commandArguments: { project_directory: string; after: string | null } & ProjectLogNarrowing; answer: ProjectLogRecordsPage };
  describe_stream_graph: { commandArguments: { stream: string }; answer: StreamGraphSummary };
  describe_node_catalog: { commandArguments: { stream: string }; answer: NodeCatalog };
  /** `project_directory` the asking window's project, one of its imports, or a project the runtime lists; refused in the runtime's own words. */
  list_project_node_types: { commandArguments: { project_directory: string }; answer: ProjectNodeTypeListing };
  check_for_tatolab_app_updates: { commandArguments: undefined; answer: null };
  take_the_newer_tatolab_app_version: { commandArguments: undefined; answer: null };
  /** Answers once the runtime has queued the removal of every stream it holds from the project; deletes no file. */
  remove_project: { commandArguments: { project_directory: string }; answer: null };
  /** `stream` a stream's id; answers once the runtime has recorded `display_name`, refused in its own words. */
  rename_stream: { commandArguments: { stream: string; display_name: string }; answer: null };
  open_stream_project_folder: { commandArguments: { stream: string }; answer: null };
  open_terminal_at_stream_project: { commandArguments: { stream: string }; answer: null };
  open_stream_log_folder: { commandArguments: { stream: string }; answer: null };
  /** The chosen folder, absolute with its links resolved; `null` when the person cancels the dialog. */
  choose_stream_project_folder: { commandArguments: { chosen_for: StreamProjectFolderChosenFor }; answer: string | null };
  /** `folder` `null` lets the runtime draw one under `~/streams`; answers once the runtime has queued the creation, which the window follows with `describe_stream_action`. */
  create_stream_project: { commandArguments: { folder: string | null }; answer: ProjectCreationQueued };
  /** Answers once the runtime has queued the run of every stream asset in the folder, which the window follows with `describe_stream_action`. */
  run_stream_project: { commandArguments: { folder: string }; answer: ProjectRunQueued };
  /** Answers once the runtime has queued `run_project` on a project it lists, which the window follows with `describe_stream_action`. */
  reload_project: { commandArguments: { project_directory: string }; answer: ProjectRunQueued };
  /** The action's description, or the runtime's words that it no longer holds it; refused when the runtime could not be asked. */
  describe_stream_action: { commandArguments: { action: string }; answer: StreamActionFollowed };
  /** Answers once the runtime has dropped the action or begun stopping it, which the listing and `describe_stream_action` then show; refused in the runtime's own words, as for a stop past cancelling. */
  cancel_stream_action: { commandArguments: { action: string }; answer: StreamActionCancelAnswer };
  describe_runtime: { commandArguments: undefined; answer: RuntimeDescription };
  restart_runtime: { commandArguments: undefined; answer: null };
  open_runtime_log_folder: { commandArguments: undefined; answer: null };
  /** Refused when the choice could not be remembered, though it holds until the app quits. */
  set_stream_failure_notifications: { commandArguments: { enabled: boolean }; answer: null };
  /** Refused when the choice could not be remembered, though it holds until the app quits. */
  set_developer_mode: { commandArguments: { enabled: boolean }; answer: null };
  /** Answers once the desktop has; refused in its words, or with why this build does not offer it. */
  set_open_tatolab_at_login: { commandArguments: { enabled: boolean }; answer: null };
  /** `chosen_in_a_file_dialog` opens the app's own file dialog and answers once the person picks or cancels; refused naming why, the choice unchanged. */
  /** The app's folder dialog; the chosen project folder becomes the open project, first among the recent projects. `null` when the person cancels; refused in the dialog's own words. */
  choose_project_folder: { commandArguments: { chosen_for: ProjectFolderChosenFor }; answer: ChosenProjectFolder | null };
  /** Where the New project sheet starts, and the name it suggests. */
  read_new_project_defaults: { commandArguments: undefined; answer: NewProjectDefaults };
  /** The desktop's folder dialog, opened at `starting_at`, for the folder a new project goes in; `null` when the person cancels. */
  choose_new_project_location: { commandArguments: { starting_at: string }; answer: string | null };
  /** `name` a folder name and `location` absolute: `<location>/<name>` is created with the runtime's `create_project` and opens in its own studio window; refused with nothing created for a name that is no folder name or is taken there, and in the runtime's own words. */
  create_new_project: { commandArguments: { name: string; location: string }; answer: ChosenProjectFolder };
  /** The asking window's project as last read from disk; `none_open` for the Projects window. */
  read_open_project: { commandArguments: undefined; answer: OpenProjectReading };
  /** The projects opened before, recent first, for the Projects window. */
  read_recent_projects: { commandArguments: undefined; answer: RecentProject[] };
  /** `folder` one of the recent projects; it opens in its own studio window, or that window comes forward, and it moves first among them. */
  open_recent_project: { commandArguments: { folder: string }; answer: null };
  /** Shows the Projects window and brings it forward. */
  show_projects_window: { commandArguments: undefined; answer: null };
  /** From a studio window only: opens the view in a window of its own, or brings forward the one already popped out with the same view type and pin; it closes with the studio window. */
  pop_out_view: { commandArguments: PoppedOutView; answer: null };
  /** The view the asking window shows when it is a popped-out view; `null` in the Projects and studio windows. */
  read_popped_out_view: { commandArguments: undefined; answer: PoppedOutView | null };
  /** From a studio window only: opens its Module manager window, its project the workspace, or brings that window forward; it closes with the studio window. */
  open_module_manager_window: { commandArguments: undefined; answer: null };
  /** The asking Module manager window's workspace project as last read from disk; `null` in any other window. Each later reading arrives on `tatolab-open-project-changed`. */
  read_module_manager_workspace: { commandArguments: undefined; answer: OpenProjectReading | null };
  /** The catalog get.tatolab.com serves, fetched afresh, or why it was not read; never refused. */
  read_package_catalog: { commandArguments: undefined; answer: PackageCatalogReading };
  /** From a Module manager window only: the workspace's imports from the runtime's `list_dependencies`, each source read for a newer version with `check_for_newer`; refused in the runtime's own words. */
  list_workspace_dependencies: { commandArguments: { check_for_newer: boolean }; answer: WorkspaceDependency[] };
  /** From a Module manager window only: the desktop's open dialog for a project's folder or a `.zip` of one, as `source_kind` says; `null` when the person cancels. */
  choose_dependency_source: { commandArguments: { source_kind: DependencySourceKind }; answer: string | null };
  /** From a Module manager window only: the runtime's `add_dependency` copies `source`, an absolute folder or `.zip`, into the workspace's `imports/`; refused in the runtime's own words. */
  add_dependency_to_the_workspace: { commandArguments: { source: string }; answer: ProjectDependency };
  /** From a Module manager window only: the runtime's `update_dependency` copies the import `project` again from its source; files edited since its copy are overwritten only with `overwrite_edited_files`. */
  update_workspace_dependency: { commandArguments: { project: string; overwrite_edited_files: boolean }; answer: WorkspaceDependencyUpdate };
  /** From a Module manager window only: the catalog entry `name` downloaded as its `.zip`, checked against the catalog's SHA-256, then imported as `add_dependency_to_the_workspace` imports one; refused in words. */
  import_from_the_marketplace: { commandArguments: { name: string }; answer: ProjectDependency };
  /** From a Module manager window only: the workspace's `imports/<folder>/` opens in its own studio window; refused for a folder the workspace does not import. */
  open_import_to_edit: { commandArguments: { folder: string }; answer: null };
  /** `file` absolute, inside the open project's folder or a folder import's, links resolved; refused for any other file, or in the filesystem's words. */
  read_project_file: { commandArguments: { file: string }; answer: ProjectFileRead };
  /** Written whole when the file on disk still has `based_on_version` (`null` for a new file), and only inside the open project's own folder; refused with nothing written otherwise. */
  save_project_file: { commandArguments: { file: string; text: string; based_on_version: string | null }; answer: ProjectFileSaved };
  /** `project_folder` the folder of the open project or of one of its imports. */
  list_project_files: { commandArguments: { project_folder: string }; answer: ProjectFiles };
  /** From a studio window only: the runtime's `list_project_views` of its open project, each view's folder served under the window page's scheme; refused while no project is open, and in the runtime's own words. */
  list_studio_views_of_the_open_project: { commandArguments: undefined; answer: ListedStudioView[] };
  /** The runtime's `run_project` queued on the open project's folder, which the window never names; refused in the runtime's own words, or while no project is open. */
  run_open_project: { commandArguments: undefined; answer: ProjectRunQueued };
  /** The asking studio window's project's change feed as last read; refused in the Projects window. */
  read_open_project_transactions: { commandArguments: undefined; answer: ProjectTransactionsReading };
  /** The runtime's `undo` by `author` on the asking studio window's project, answering the undo it applied; refused in the runtime's own words. */
  undo_in_the_open_project: { commandArguments: { author: ProjectTransactionAuthor }; answer: ProjectTransaction };
  /** The runtime's `transact` of `operations` on the graphs of the asking studio window's project's streams, as one transaction by the person editing; a stream outside the project is refused in Studio's words, a refusal the runtime structures is answered as `refused`, any other refusal in its own words. */
  transact_in_the_open_project: { commandArguments: ProjectGraphTransactionSentByTheWindow; answer: ProjectGraphTransactionTheRuntimeAnswered };
  /** The person editing in Studio, whose graph edits the runtime records under them. */
  read_the_person_editing_in_studio: { commandArguments: undefined; answer: ProjectTransactionAuthor };
  /** The runtime's `redo` by `author` on the asking studio window's project, answering the redo it applied; refused in the runtime's own words. */
  redo_in_the_open_project: { commandArguments: { author: ProjectTransactionAuthor }; answer: ProjectTransaction };
  /** The runtime's `stop_project` queued on the open project's folder, which the window never names; every stream of the project shows `stopping` until it has run. Refused in the runtime's own words, or while no project is open. */
  stop_open_project: { commandArguments: undefined; answer: null };
  /** Starts Pyright's language server in `project_folder`, the folder of the open project or of one of its imports; its messages arrive on `tatolab-python-language-server-event` under the session answered. */
  start_python_language_server: { commandArguments: { project_folder: string }; answer: { session: string } };
  /** `message` one JSON-RPC message, framed onto the server's input; refused for a session that has ended. */
  send_to_python_language_server: { commandArguments: { session: string; message: JsonValue }; answer: null };
  stop_python_language_server: { commandArguments: { session: string }; answer: null };
  /** From a studio window or a popped-out view: the runtime's `open_viewer` on `node`'s output `port`, read as the main process; its events arrive under the port viewer answered, refused in the runtime's own words. */
  open_port_viewer: { commandArguments: PortViewerTarget; answer: { port_viewer: string } };
  /** Closes the port viewer; one already closed is left as it is. */
  close_port_viewer: { commandArguments: { port_viewer: string }; answer: null };
  /** macOS: the asking window's menus, which the system menu bar shows while that window is focused, each choice arriving back on `tatolab-system-menu-bar-entry-chosen`; kept and never shown on Linux, whose windows draw their own. Refused for menus not in the contract's shape. */
  show_menus_in_the_system_menu_bar: { commandArguments: { menus: SystemMenuBarMenu[] }; answer: null };
}>;

/** What the command `CommandName` answers, typed by its signature. */
export type TatolabCommandAnswerTo<CommandName extends TatolabCommandName> =
  | { ok: true; value: TatolabCommandSignatures[CommandName]["answer"] }
  | { ok: false; refusal: string };

/** What the window's preload exposes to the page as `window.tatolabElectronBridge`: the only way the page reaches the main process. */
export interface TatolabElectronBridge {
  invokeTatolabCommand<CommandName extends TatolabCommandName>(
    commandName: CommandName,
    commandArguments: TatolabCommandSignatures[CommandName]["commandArguments"],
  ): Promise<TatolabCommandAnswerTo<CommandName>>;
  /** Calls `listener` with each status the main process sends; the returned function stops it. */
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): () => void;
  /** Calls `listener` with the id of the stream each request to show a stream's page names; the returned function stops it. */
  onStreamPageRequested(listener: (stream: string) => void): () => void;
  /** Calls `listener` with each reading of the open project the main process sends; the returned function stops it. */
  onOpenProjectChanged(listener: (reading: OpenProjectReading) => void): () => void;
  /** Calls `listener` with each reading of the window's project's change feed the main process sends; the returned function stops it. */
  onProjectTransactionsChanged(listener: (reading: ProjectTransactionsReading) => void): () => void;
  /** Calls `listener` with each message a Python language server sends and each server's end; the returned function stops it. */
  onPythonLanguageServerEvent(listener: (event: PythonLanguageServerEvent) => void): () => void;
  /** Calls `listener` with each event of every port viewer the window opened; the returned function stops it. */
  onPortViewerEvent(listener: (event: PortViewerEvent) => void): () => void;
  /** Calls `listener` with each Image frame a port viewer hands over as a shared texture, a WebCodecs `VideoFrame` the listener closes once drawn; the returned function stops it. */
  onPortViewerImageFrame(listener: (videoFrame: PortViewerVideoFrame, frameFacts: PortViewerImageFrameFacts) => void): () => void;
  /** Calls `listener` with the `entry_id` of each entry the person chooses in the system menu bar from this window's menus; the returned function stops it. */
  onSystemMenuBarEntryChosen(listener: (entryId: string) => void): () => void;
  /** Tell the main process the window has drawn its first status, so it can put the window on screen. */
  tellTheAppTheWindowDrewItsFirstStatus(): void;
  /** The full path of a file or folder dropped on the window, or `""` for an item with none. */
  pathOfADroppedFile(droppedFile: File): string;
}
