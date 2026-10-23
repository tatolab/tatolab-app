// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The wire between the window and the Electron main process: the commands the window invokes,
// under their snake_case names, the event each status change arrives on, and how a
// command answers.

import type { StreamGraphSummary, StreamLogRecordsPage, StreamStopAnswer, TatolabStatus } from "./tatolab_backend_contract.js";

/** The scheme the Electron app serves its window's page under: a page on it with no bridge is the app's window whose preload did not load. */
export const TATOLAB_WINDOW_PAGE_SCHEME = "tatolab-app";

/** Every command the window invokes, each an IPC channel the main process handles. */
export const TATOLAB_COMMAND_NAMES = [
  "get_tatolab_status",
  "set_run_tatolab",
  "open_login_items_settings",
  "set_up_tatolab",
  "uninstall_tatolab",
  "quit_tatolab_app",
  "read_stream_log_records",
  "describe_stream_graph",
  "check_for_tatolab_app_updates",
  "stop_stream",
  "start_stream",
  "remove_stream",
] as const;

/** One command the window invokes. Arguments: `set_run_tatolab` `{ enabled }`, `read_stream_log_records` `{ stream, after }`, `describe_stream_graph`, `stop_stream`, `start_stream` and `remove_stream` `{ stream }`, the rest none. `check_for_tatolab_app_updates` checks and, finding a newer Tatolab, takes it: the person choosing it is the confirmation. */
export type TatolabCommandName = (typeof TATOLAB_COMMAND_NAMES)[number];

/** The event each status change, and the status again each time the window is shown, arrives on; it carries a `TatolabStatus`. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** What a command answers: its answer (`null` for a command that answers nothing), or a refusal in words, which the window shows as it is. A command never answers with a thrown error. */
export type TatolabCommandAnswer = { ok: true; value: unknown } | { ok: false; refusal: string };

type EveryCommandHasASignature<CommandSignatures extends Record<TatolabCommandName, { commandArguments: unknown; answer: unknown }>> = CommandSignatures;

/** Each command's arguments and answer, as the window sends and reads them. */
export type TatolabCommandSignatures = EveryCommandHasASignature<{
  get_tatolab_status: { commandArguments: undefined; answer: TatolabStatus };
  set_run_tatolab: { commandArguments: { enabled: boolean }; answer: null };
  open_login_items_settings: { commandArguments: undefined; answer: null };
  set_up_tatolab: { commandArguments: undefined; answer: null };
  uninstall_tatolab: { commandArguments: undefined; answer: null };
  quit_tatolab_app: { commandArguments: undefined; answer: null };
  read_stream_log_records: { commandArguments: { stream: string; after: number }; answer: StreamLogRecordsPage };
  describe_stream_graph: { commandArguments: { stream: string }; answer: StreamGraphSummary };
  check_for_tatolab_app_updates: { commandArguments: undefined; answer: null };
  stop_stream: { commandArguments: { stream: string }; answer: StreamStopAnswer };
  start_stream: { commandArguments: { stream: string }; answer: null };
  remove_stream: { commandArguments: { stream: string }; answer: null };
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
}
