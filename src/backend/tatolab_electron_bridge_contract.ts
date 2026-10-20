// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The wire between the window and the Electron main process: the commands the window invokes,
// under the names the Tauri app gave them, the event each status change arrives on, and how a
// command answers.

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
] as const;

/** One command the window invokes. Arguments: `set_run_tatolab` `{ enabled }`, `read_stream_log_records` `{ stream, after }`, `describe_stream_graph` `{ stream }`, the rest none. */
export type TatolabCommandName = (typeof TATOLAB_COMMAND_NAMES)[number];

/** The event each status change, and the status again each time the window is shown, arrives on; it carries a `TatolabStatus`. */
export const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** What a command answers: its answer (`null` for a command that answers nothing), or a refusal in words, which the window shows as it is. A command never answers with a thrown error. */
export type TatolabCommandAnswer = { ok: true; value: unknown } | { ok: false; refusal: string };
