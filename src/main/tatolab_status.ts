// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The status the tray and the window show, and the pure rules that derive the runtime's state
// from what the poller observed. The status's own types are the window's contract.

import type { RuntimeAgentRegistration as RuntimeAgentRegistrationStatus, RuntimeState, TatolabStatus } from "../shared/tatolab_backend_contract.js";

/** How long an enabled runtime may go without answering its health check after it was started, or last answered, before it reads as not answering rather than starting. */
export const RUNTIME_STARTING_GRACE_PERIOD_MS = 20_000;

/** What the poller saw of the runtime's local API in one round. */
export type RuntimeHealthObservation = "healthy" | "failing";

/** Everything one status round observed that the runtime's state is derived from. */
export interface RuntimeStateObservations {
  runTatolab: boolean;
  runtimeAgent: RuntimeAgentRegistrationStatus;
  runtimeHealth: RuntimeHealthObservation;
  /**
   * Whether the service manager still gives up starting the runtime after the app registered its agent afresh once this
   * launch; asked only while it fails its health check with the agent enabled. Before that one fresh registration a
   * give-up reads as starting, since registering afresh is what clears launchd's stale job.
   */
  serviceManagerGaveUpOnTheRuntime: boolean;
  /** Whether the runtime has answered once since the app launched or last registered, restarted or registered it again. */
  runtimeAnsweredSinceItWasLastStarted: boolean;
  /** How long the runtime has had to come up since it was last started or answered. */
  timeSinceTheRuntimeWasExpectedUpMs: number;
}

/** Whether a round could find the service manager given up on the runtime: only with the switch on, the agent enabled and the runtime not answering, as `deriveRuntimeState` reads the give-up only then. */
export function theServiceManagerMayHaveGivenUp({
  runTatolab,
  runtimeAgent,
  runtimeHealth,
}: Pick<RuntimeStateObservations, "runTatolab" | "runtimeAgent" | "runtimeHealth">): boolean {
  return runTatolab && runtimeAgent === "enabled" && runtimeHealth === "failing";
}

/**
 * The runtime's state: running while it answers; stopped with the switch off or the agent not enabled; blocked once the
 * service manager has given up on it; starting within the grace period; past it, not responding when it has answered
 * since it was last started, and never answered when it has not.
 */
export function deriveRuntimeState(observations: RuntimeStateObservations): RuntimeState {
  if (observations.runtimeHealth === "healthy") return "running";
  if (!theServiceManagerMayHaveGivenUp(observations)) return "stopped";
  if (observations.serviceManagerGaveUpOnTheRuntime) return "blocked_by_the_service_manager";
  if (observations.timeSinceTheRuntimeWasExpectedUpMs < RUNTIME_STARTING_GRACE_PERIOD_MS) return "starting";
  return observations.runtimeAnsweredSinceItWasLastStarted ? "unreachable" : "never_answered";
}

/** Whether `runtimeState` is the switch on and the agent enabled but the runtime not answering, past its start: unreachable, never answered or blocked. */
export function isARuntimeNotAnswering(runtimeState: RuntimeState): boolean {
  return runtimeState === "unreachable" || runtimeState === "never_answered" || runtimeState === "blocked_by_the_service_manager";
}

/** What the tray offers to bring the runtime back: Login Items while macOS waits for the person's approval, Try Again once it never answered or the service manager gave up; `null` otherwise. */
export type TrayRuntimeRemedy = "open_login_items" | "register_the_runtime_again" | null;

/** The remedy the tray offers for `status`. */
export function trayRuntimeRemedy(status: TatolabStatus): TrayRuntimeRemedy {
  switch (status.runtime_state) {
    case "stopped":
      return status.run_tatolab && status.runtime_agent === "requires_approval" ? "open_login_items" : null;
    case "never_answered":
    case "blocked_by_the_service_manager":
      return "register_the_runtime_again";
    case "running":
    case "starting":
    case "unreachable":
      return null;
  }
}

/** The tray's one-line status, the disabled first item of its menu. */
export function trayStatusLine(status: TatolabStatus): string {
  switch (status.runtime_state) {
    case "running":
      if (status.streams === null) return "Runtime running";
      return status.streams.length === 1 ? "Runtime running · 1 stream" : `Runtime running · ${status.streams.length} streams`;
    case "starting":
      return "Starting…";
    case "stopped":
      return trayRuntimeRemedy(status) === "open_login_items" ? "Needs your approval in Login Items" : "Runtime stopped";
    case "unreachable":
      return "Runtime not responding";
    case "never_answered":
      return "Runtime didn't start";
    case "blocked_by_the_service_manager":
      return status.platform === "linux" ? "Runtime stopped by systemd" : "Runtime blocked by macOS";
  }
}
