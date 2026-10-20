// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The status the tray and the window show, and the pure rules that derive the runtime's state
// from what the poller observed. The status's own types are the window's contract.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus, RuntimeState, TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";

/** How long an enabled runtime may fail its health check before it reads unreachable rather than starting. */
export const RUNTIME_STARTING_GRACE_PERIOD_MS = 20_000;

/** What the poller saw of the runtime's local API in one round. */
export type RuntimeHealthObservation = "healthy" | "failing";

/**
 * The runtime's state from the switch, the agent's registration, the health check, and how long the
 * runtime has had to come up since it was last registered, launched or healthy.
 */
export function deriveRuntimeState(
  runTatolab: boolean,
  runtimeAgent: RuntimeAgentRegistrationStatus,
  runtimeHealth: RuntimeHealthObservation,
  timeSinceTheRuntimeWasExpectedUpMs: number,
): RuntimeState {
  if (runtimeHealth === "healthy") return "running";
  if (!runTatolab) return "stopped";
  switch (runtimeAgent) {
    case "not_registered":
    case "not_found":
    case "requires_approval":
      return "stopped";
    case "enabled":
      return timeSinceTheRuntimeWasExpectedUpMs < RUNTIME_STARTING_GRACE_PERIOD_MS ? "starting" : "unreachable";
  }
}

/** Whether this round is the one the runtime turned unreachable in, after `previousRuntimeState`. */
export function theRuntimeJustBecameUnreachable(previousRuntimeState: RuntimeState | null, runtimeState: RuntimeState): boolean {
  return runtimeState === "unreachable" && previousRuntimeState !== "unreachable";
}

/** The tray's one-line status, the disabled first item of its menu. */
export function trayStatusLine(status: TatolabStatus): string {
  switch (status.machine_setup_state) {
    case "complete":
      break;
    case "needs_administrator":
      return "Setup unfinished";
    case "waiting_for_administrator":
      return "Setting up Tatolab…";
  }
  if (status.runtime_state !== "running" && status.run_tatolab && status.runtime_agent === "requires_approval") {
    return "Needs approval in Login Items";
  }
  switch (status.runtime_state) {
    case "running":
      if (status.streams === null) return "Runtime running";
      return status.streams.length === 1 ? "Runtime running · 1 stream" : `Runtime running · ${status.streams.length} streams`;
    case "starting":
      return "Starting…";
    case "stopped":
      return "Runtime stopped";
    case "unreachable":
      return "Runtime not responding";
  }
}
