// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabPlatform } from "../backend/tatolab_backend_contract";

/**
 * Where "Uninstall Tatolab…" stands. macOS confirms, then uninstalls until the app quits or the backend refuses, and a
 * refusal closes the sheet with its reason left for Settings to show. Linux only shows the installer's two steps.
 */
export type UninstallFlowState =
  | { phase: "closed"; refusalReason: string | null }
  | { phase: "confirming" }
  | { phase: "uninstalling" }
  | { phase: "uninstalled" }
  | { phase: "showing_linux_steps" };

/** What happens to the flow: the person's choices, and how the backend answers the uninstall. */
export type UninstallFlowEvent =
  | { kind: "sheet_opened"; platform: TatolabPlatform }
  | { kind: "sheet_dismissed" }
  | { kind: "uninstall_confirmed" }
  | { kind: "uninstall_finished" }
  | { kind: "uninstall_refused"; reason: string };

/** No sheet, and no refusal to show. */
export const UNINSTALL_FLOW_AT_REST: UninstallFlowState = { phase: "closed", refusalReason: null };

/** The state `event` moves `state` to; an event that doesn't apply in `state` answers `state` itself. */
export function advanceUninstallFlow(state: UninstallFlowState, event: UninstallFlowEvent): UninstallFlowState {
  switch (event.kind) {
    case "sheet_opened":
      if (state.phase !== "closed") return state;
      return event.platform === "linux" ? { phase: "showing_linux_steps" } : { phase: "confirming" };
    case "sheet_dismissed":
      return canDismissUninstallSheet(state) ? UNINSTALL_FLOW_AT_REST : state;
    case "uninstall_confirmed":
      return state.phase === "confirming" ? { phase: "uninstalling" } : state;
    case "uninstall_finished":
      return state.phase === "uninstalling" ? { phase: "uninstalled" } : state;
    case "uninstall_refused":
      return state.phase === "uninstalling" ? { phase: "closed", refusalReason: event.reason } : state;
  }
}

/** Whether Cancel, Close or Esc closes the sheet: not while the uninstall runs, and not once it has finished. */
export function canDismissUninstallSheet(state: UninstallFlowState): boolean {
  return state.phase === "confirming" || state.phase === "showing_linux_steps";
}

/** Whether an uninstall is running or done, so the window keeps showing it until the app quits. */
export function isUninstallUnderway(state: UninstallFlowState): boolean {
  return state.phase === "uninstalling" || state.phase === "uninstalled";
}
