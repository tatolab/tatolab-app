// The wire between the window and the Electron main process: the commands the window invokes,
// under their snake_case names, the event each status change arrives on, and how a
// command answers.

import type {
  AgentEvent,
  AgentsOnThisMachine,
  AgentStarted,
  ChosenWorkspaceFolder,
  NodeCatalog,
  JsonValue,
  OpenWorkspaceReading,
  ProjectCreationQueued,
  PythonLanguageServerEvent,
  ProjectLogNarrowing,
  ProjectLogRecordsPage,
  ProjectRunQueued,
  RelaySettingsByName,
  RelaysDescription,
  RuntimeDescription,
  StreamActionCancelAnswer,
  StreamActionFollowed,
  StreamGraphSummary,
  StreamProjectFolderChosenFor,
  TatolabStatus,
  WorkspaceFileRead,
  WorkspaceFileSaved,
  WorkspaceFolderChosenFor,
  WorkspaceProjectFiles,
} from "./tatolab_backend_contract.js";

/** The scheme the Electron app serves its window's page under: a page on it with no bridge is the app's window whose preload did not load. */
export const TATOLAB_WINDOW_PAGE_SCHEME = "tatolab-app";

/** Every command the window invokes, each an IPC channel the main process handles. */
export const TATOLAB_COMMAND_NAMES = [
  "get_tatolab_status",
  "set_run_tatolab",
  "open_login_items_settings",
  "remember_first_run_finished",
  "link_command_line_tool_in_usr_local_bin",
  "uninstall_tatolab",
  "quit_tatolab_app",
  "read_project_log_records",
  "describe_stream_graph",
  "describe_node_catalog",
  "check_for_tatolab_app_updates",
  "stop_stream",
  "start_stream",
  "remove_project",
  "rename_stream",
  "open_stream_project_folder",
  "open_terminal_at_stream_project",
  "open_stream_log_folder",
  "choose_stream_project_folder",
  "create_stream_project",
  "run_stream_project",
  "reload_project",
  "describe_stream_action",
  "cancel_stream_action",
  "describe_runtime",
  "restart_runtime",
  "install_the_carried_runtime_again",
  "open_runtime_log_folder",
  "set_stream_failure_notifications",
  "set_open_tatolab_at_login",
  "describe_relays",
  "add_relay",
  "configure_relay",
  "remove_relay",
  "choose_workspace_folder",
  "read_open_workspace",
  "read_workspace_file",
  "save_workspace_file",
  "list_workspace_project_files",
  "run_workspace_project",
  "start_python_language_server",
  "send_to_python_language_server",
  "stop_python_language_server",
  "describe_agents",
  "start_agent",
  "send_to_agent",
  "stop_agent",
] as const;

/**
 * One command the window invokes. Arguments: `set_run_tatolab`, `set_stream_failure_notifications` and `set_open_tatolab_at_login` `{ enabled }`, `read_project_log_records` `{ project_directory, stream, action, after }`,
 * `remove_project` and `reload_project` `{ project_directory }`, `describe_stream_graph`, `describe_node_catalog`, `stop_stream`, `start_stream`, `open_stream_project_folder`, `open_terminal_at_stream_project` and `open_stream_log_folder` `{ stream }`, `rename_stream` `{ stream, display_name }`,
 * `choose_stream_project_folder` `{ chosen_for }`, `create_stream_project` and `run_stream_project` `{ folder }`, `describe_stream_action` and `cancel_stream_action` `{ action }`,
 * `add_relay` `{ adapter, settings }`, `configure_relay` `{ relay_id, settings }`, `remove_relay` `{ relay_id }`, `choose_workspace_folder` `{ chosen_for }`, the workspace file and language server commands as their signatures below give, the rest none. A command naming a stream opens the folder the runtime listed for it, or its log folder; one naming a folder
 * acts only on a folder the app handed the window from its folder dialog, and `read_project_log_records`, `remove_project` and `reload_project` only on a project the runtime last listed a stream from. `check_for_tatolab_app_updates` checks and, finding a newer Tatolab,
 * takes it: the person choosing it is the confirmation. `restart_runtime` answers once the service manager has; `install_the_carried_runtime_again` once the installer ends, refused in its words; `open_runtime_log_folder` opens the
 * folder the runtime names when the app asks it, never one the window names.
 */
export type TatolabCommandName = (typeof TATOLAB_COMMAND_NAMES)[number];

/** The event each status change, and the status again each time the window is shown, arrives on; it carries a `TatolabStatus`. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** The event the app asks the window to show a stream's page on, as a click on that stream's failure notification does; it carries a `TatolabStreamPageRequest`. */
export const TATOLAB_STREAM_PAGE_REQUESTED_EVENT = "tatolab-stream-page-requested";

/** The event each change of the open workspace arrives on: another folder opened, or a `pyproject.toml` it reads changed on disk; it carries an `OpenWorkspaceReading`. */
export const TATOLAB_OPEN_WORKSPACE_CHANGED_EVENT = "tatolab-open-workspace-changed";

/** The event each message a Python language server sends, and each server's end, arrives on; it carries a `PythonLanguageServerEvent`. */
export const TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT = "tatolab-python-language-server-event";

/** The event each message an agent sends, and each agent's end, arrives on; it carries an `AgentEvent`. */
export const TATOLAB_AGENT_EVENT = "tatolab-agent-event";

/** The notice the window sends the main process once it has drawn its first status, carrying nothing; the window first goes on screen on it. */
export const TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE = "tatolab-window-drew-its-first-status";

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
  set_run_tatolab: { commandArguments: { enabled: boolean }; answer: null };
  open_login_items_settings: { commandArguments: undefined; answer: null };
  /** Refused when it could not be remembered, though first run stays finished until the app quits. */
  remember_first_run_finished: { commandArguments: undefined; answer: null };
  /** Answers once the administrator prompt closes; refused in words when cancelled or not offered. */
  link_command_line_tool_in_usr_local_bin: { commandArguments: undefined; answer: null };
  uninstall_tatolab: { commandArguments: undefined; answer: null };
  quit_tatolab_app: { commandArguments: undefined; answer: null };
  /** `stream` and `action` narrow the read, `null` for no narrowing; `after` is the `next_after` of the page before, `null` for the oldest record held. */
  read_project_log_records: { commandArguments: { project_directory: string; after: string | null } & ProjectLogNarrowing; answer: ProjectLogRecordsPage };
  describe_stream_graph: { commandArguments: { stream: string }; answer: StreamGraphSummary };
  describe_node_catalog: { commandArguments: { stream: string }; answer: NodeCatalog };
  check_for_tatolab_app_updates: { commandArguments: undefined; answer: null };
  /** Answers once the runtime has queued the stop; the stream shows `stopping` in the listing until it has run. */
  stop_stream: { commandArguments: { stream: string }; answer: null };
  /** Answers once the runtime has queued the start, a failed stream's retry among them; the stream shows `preparing` in the listing until it has run. */
  start_stream: { commandArguments: { stream: string }; answer: null };
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
  /** Answers once the runtime has queued the run of every `@stream` in the folder, which the window follows with `describe_stream_action`. */
  run_stream_project: { commandArguments: { folder: string }; answer: ProjectRunQueued };
  /** Answers once the runtime has queued `run_project` on a project it lists, which the window follows with `describe_stream_action`. */
  reload_project: { commandArguments: { project_directory: string }; answer: ProjectRunQueued };
  /** The action's description, or the runtime's words that it no longer holds it; refused when the runtime could not be asked. */
  describe_stream_action: { commandArguments: { action: string }; answer: StreamActionFollowed };
  /** Answers once the runtime has dropped the action or begun stopping it, which the listing and `describe_stream_action` then show; refused in the runtime's own words, as for a stop past cancelling. */
  cancel_stream_action: { commandArguments: { action: string }; answer: StreamActionCancelAnswer };
  describe_runtime: { commandArguments: undefined; answer: RuntimeDescription };
  restart_runtime: { commandArguments: undefined; answer: null };
  install_the_carried_runtime_again: { commandArguments: undefined; answer: null };
  open_runtime_log_folder: { commandArguments: undefined; answer: null };
  /** Refused when the choice could not be remembered, though it holds until the app quits. */
  set_stream_failure_notifications: { commandArguments: { enabled: boolean }; answer: null };
  /** Answers once the desktop has; refused in its words, or with why this build does not offer it. */
  set_open_tatolab_at_login: { commandArguments: { enabled: boolean }; answer: null };
  /** `chosen_in_a_file_dialog` opens the app's own file dialog and answers once the person picks or cancels; refused naming why, the choice unchanged. */
  /** The runtime's `list_relays` and its relay-adapter catalog, read together; refused in the runtime's own words. */
  describe_relays: { commandArguments: undefined; answer: RelaysDescription };
  /** `settings` as the adapter's settings take them, its secrets among them, sent once and kept by the app nowhere; answers the id the runtime gave the relay. */
  add_relay: { commandArguments: { adapter: string; settings: RelaySettingsByName }; answer: { relay_id: string } };
  /** Only the settings named change; `null` returns one to its default, and a secret named replaces the one held. */
  configure_relay: { commandArguments: { relay_id: string; settings: RelaySettingsByName }; answer: null };
  /** Refused by the runtime for a built-in relay. */
  remove_relay: { commandArguments: { relay_id: string }; answer: null };
  /** The app's folder dialog; the chosen folder becomes the open workspace, remembered for the next launch, and a new workspace's project is queued with the runtime's `create_project` first. `null` when the person cancels; refused in the dialog's or the runtime's own words. */
  choose_workspace_folder: { commandArguments: { chosen_for: WorkspaceFolderChosenFor }; answer: ChosenWorkspaceFolder | null };
  /** The open workspace as last read from disk. */
  read_open_workspace: { commandArguments: undefined; answer: OpenWorkspaceReading };
  /** `file` absolute, inside the open workspace's project folder or a folder import's, links resolved; refused for any other file, or in the filesystem's words. */
  read_workspace_file: { commandArguments: { file: string }; answer: WorkspaceFileRead };
  /** Written whole when the file on disk still has `based_on_version` (`null` for a new file), and only inside the workspace project's own folder; refused with nothing written otherwise. */
  save_workspace_file: { commandArguments: { file: string; text: string; based_on_version: string | null }; answer: WorkspaceFileSaved };
  /** `project_folder` a project folder of the open workspace. */
  list_workspace_project_files: { commandArguments: { project_folder: string }; answer: WorkspaceProjectFiles };
  /** The runtime's `run_project` queued on the open workspace's folder, which the window never names; refused in the runtime's own words, or while no workspace is open. */
  run_workspace_project: { commandArguments: undefined; answer: ProjectRunQueued };
  /** Starts Pyright's language server in `project_folder`, a project folder of the open workspace; its messages arrive on `tatolab-python-language-server-event` under the session answered. */
  start_python_language_server: { commandArguments: { project_folder: string }; answer: { session: string } };
  /** `message` one JSON-RPC message, framed onto the server's input; refused for a session that has ended. */
  send_to_python_language_server: { commandArguments: { session: string; message: JsonValue }; answer: null };
  stop_python_language_server: { commandArguments: { session: string }; answer: null };
  /** Every agent the studio knows, each found on the person's login-shell `PATH` or not. */
  describe_agents: { commandArguments: undefined; answer: AgentsOnThisMachine };
  /** Starts the agent `agent_id` names in the open workspace project's folder, which the window never names; its messages arrive on `tatolab-agent-event` under the session answered. Refused while no workspace is open, or for an agent not installed, naming its install command. */
  start_agent: { commandArguments: { agent_id: string }; answer: AgentStarted };
  /** `message` one JSON-RPC message, written to the agent's input as one line; refused for a session that has ended. */
  send_to_agent: { commandArguments: { session: string; message: JsonValue }; answer: null };
  stop_agent: { commandArguments: { session: string }; answer: null };
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
  /** Calls `listener` with each reading of the open workspace the main process sends; the returned function stops it. */
  onOpenWorkspaceChanged(listener: (reading: OpenWorkspaceReading) => void): () => void;
  /** Calls `listener` with each message a Python language server sends and each server's end; the returned function stops it. */
  onPythonLanguageServerEvent(listener: (event: PythonLanguageServerEvent) => void): () => void;
  /** Calls `listener` with each message an agent sends and each agent's end; the returned function stops it. */
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  /** Tell the main process the window has drawn its first status, so it can put the window on screen. */
  tellTheAppTheWindowDrewItsFirstStatus(): void;
}
