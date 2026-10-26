// The wire between the window and the Electron main process: the commands the window invokes,
// under their snake_case names, the event each status change arrives on, and how a
// command answers.

import type {
  PythonForNewEnvironmentsChoice,
  RuntimeDescription,
  StreamGraphSummary,
  StreamLogRecordsPage,
  StreamProjectFolderChosenFor,
  StreamProjectFolderReport,
  StreamProjectRunOutcome,
  StreamStopAnswer,
  TatolabStatus,
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
  "read_stream_log_records",
  "describe_stream_graph",
  "check_for_tatolab_app_updates",
  "stop_stream",
  "start_stream",
  "remove_stream",
  "open_stream_project_folder",
  "open_terminal_at_stream_project",
  "open_stream_log_folder",
  "choose_stream_project_folder",
  "propose_new_stream_project_folder",
  "create_stream_project",
  "run_stream_project",
  "describe_runtime",
  "restart_runtime",
  "open_runtime_log_folder",
  "set_stream_failure_notifications",
  "set_open_tatolab_at_login",
  "choose_python_for_new_environments",
] as const;

/**
 * One command the window invokes. Arguments: `set_run_tatolab`, `set_stream_failure_notifications` and `set_open_tatolab_at_login` `{ enabled }`, `read_stream_log_records` `{ stream, after }`, `describe_stream_graph`, `stop_stream`,
 * `start_stream`, `remove_stream`, `open_stream_project_folder`, `open_terminal_at_stream_project` and `open_stream_log_folder` `{ stream }`,
 * `choose_stream_project_folder` `{ chosen_for }`, `create_stream_project` `{ folder }`, `run_stream_project` `{ folder, stream_function, name }`,
 * `choose_python_for_new_environments` `{ python }`, the rest none. A command naming a stream opens the folder the runtime listed for it, or its log folder; one naming a folder
 * acts only on a folder the app handed the window, from its folder dialog or its proposal. `check_for_tatolab_app_updates` checks and, finding a newer Tatolab,
 * takes it: the person choosing it is the confirmation. `restart_runtime` answers once the service manager has; `open_runtime_log_folder` opens the
 * folder the runtime names when the app asks it, never one the window names.
 */
export type TatolabCommandName = (typeof TATOLAB_COMMAND_NAMES)[number];

/** The event each status change, and the status again each time the window is shown, arrives on; it carries a `TatolabStatus`. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** The event the app asks the window to show a stream's page on, as a click on that stream's failure notification does; it carries a `TatolabStreamPageRequest`. */
export const TATOLAB_STREAM_PAGE_REQUESTED_EVENT = "tatolab-stream-page-requested";

/** What `tatolab-stream-page-requested` carries: the stream whose page to show. */
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
  read_stream_log_records: { commandArguments: { stream: string; after: number }; answer: StreamLogRecordsPage };
  describe_stream_graph: { commandArguments: { stream: string }; answer: StreamGraphSummary };
  check_for_tatolab_app_updates: { commandArguments: undefined; answer: null };
  stop_stream: { commandArguments: { stream: string }; answer: StreamStopAnswer };
  start_stream: { commandArguments: { stream: string }; answer: null };
  remove_stream: { commandArguments: { stream: string }; answer: null };
  open_stream_project_folder: { commandArguments: { stream: string }; answer: null };
  open_terminal_at_stream_project: { commandArguments: { stream: string }; answer: null };
  open_stream_log_folder: { commandArguments: { stream: string }; answer: null };
  /** `null` when the person cancels the dialog. */
  choose_stream_project_folder: { commandArguments: { chosen_for: StreamProjectFolderChosenFor }; answer: StreamProjectFolderReport | null };
  propose_new_stream_project_folder: { commandArguments: undefined; answer: StreamProjectFolderReport };
  create_stream_project: { commandArguments: { folder: string }; answer: StreamProjectFolderReport };
  /** `stream_function` as `tatolab run` takes it, `null` for the project's sole `@stream`; `name` in place of the function's own, or `null`. */
  run_stream_project: { commandArguments: { folder: string; stream_function: string | null; name: string | null }; answer: StreamProjectRunOutcome };
  describe_runtime: { commandArguments: undefined; answer: RuntimeDescription };
  restart_runtime: { commandArguments: undefined; answer: null };
  open_runtime_log_folder: { commandArguments: undefined; answer: null };
  /** Refused when the choice could not be remembered, though it holds until the app quits. */
  set_stream_failure_notifications: { commandArguments: { enabled: boolean }; answer: null };
  /** Answers once the desktop has; refused in its words, or with why this build does not offer it. */
  set_open_tatolab_at_login: { commandArguments: { enabled: boolean }; answer: null };
  /** `chosen_in_a_file_dialog` opens the app's own file dialog and answers once the person picks or cancels; refused naming why, the choice unchanged. */
  choose_python_for_new_environments: { commandArguments: { python: PythonForNewEnvironmentsChoice }; answer: null };
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
  /** Calls `listener` with the stream each request to show a stream's page names; the returned function stops it. */
  onStreamPageRequested(listener: (streamName: string) => void): () => void;
}
