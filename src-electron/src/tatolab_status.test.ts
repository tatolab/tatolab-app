// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import type {
  ListedStream,
  RuntimeAgentRegistration as RuntimeAgentRegistrationStatus,
  RuntimeState,
  TatolabStatus,
} from "../../src/backend/tatolab_backend_contract.js";
import { deriveRuntimeState, RUNTIME_STARTING_GRACE_PERIOD_MS, theRuntimeJustBecameUnreachable, trayStatusLine } from "./tatolab_status.js";

function listedStreams(streamCount: number): ListedStream[] {
  return Array.from({ length: streamCount }, (_, streamIndex) => ({
    name: `stream-${streamIndex}`,
    state: "kept",
    project_directory: `/projects/stream-${streamIndex}`,
    node_count: 2,
    failed_because: null,
  }));
}

function statusWith(runtimeState: RuntimeState, runtimeAgent: RuntimeAgentRegistrationStatus, streamCount: number | null): TatolabStatus {
  return {
    app_version: "0.45.0",
    platform: "macos",
    run_tatolab: true,
    runtime_agent: runtimeAgent,
    runtime_state: runtimeState,
    machine_name: null,
    streams: streamCount === null ? null : listedStreams(streamCount),
    machine_setup_state: "complete",
    command_line_tool_linked_at: null,
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
  };
}

test("a_healthy_runtime_is_running_whatever_the_switch_says", () => {
  for (const runTatolab of [true, false]) {
    expect(deriveRuntimeState(runTatolab, "not_registered", "healthy", 600_000)).toBe("running");
  }
});

test("the_switch_off_or_an_unregistered_agent_is_stopped", () => {
  expect(deriveRuntimeState(false, "enabled", "failing", 0)).toBe("stopped");
  for (const runtimeAgent of ["not_registered", "not_found", "requires_approval"] as const) {
    expect(deriveRuntimeState(true, runtimeAgent, "failing", 0), runtimeAgent).toBe("stopped");
  }
});

test("an_enabled_agent_failing_health_is_starting_inside_the_grace_period_then_unreachable", () => {
  expect(deriveRuntimeState(true, "enabled", "failing", 19_000)).toBe("starting");
  expect(deriveRuntimeState(true, "enabled", "failing", RUNTIME_STARTING_GRACE_PERIOD_MS)).toBe("unreachable");
});

test("the_runtime_becomes_unreachable_only_on_the_round_it_turns_unreachable", () => {
  const cases: [RuntimeState | null, RuntimeState, boolean][] = [
    [null, "unreachable", true],
    ["starting", "unreachable", true],
    ["running", "unreachable", true],
    ["unreachable", "unreachable", false],
    ["unreachable", "starting", false],
    [null, "stopped", false],
  ];
  for (const [previousRuntimeState, runtimeState, expected] of cases) {
    expect(theRuntimeJustBecameUnreachable(previousRuntimeState, runtimeState), `${previousRuntimeState} -> ${runtimeState}`).toBe(expected);
  }
});

test("the_tray_line_says_setup_is_unfinished_until_the_administrator_prompt_succeeds", () => {
  const status = statusWith("stopped", "not_registered", null);
  expect(trayStatusLine({ ...status, machine_setup_state: "waiting_for_administrator" })).toBe("Setting up Tatolab…");
  expect(trayStatusLine({ ...status, machine_setup_state: "needs_administrator" })).toBe("Setup unfinished");
});

test("the_tray_line_names_the_runtime_state_and_stream_count", () => {
  const running = (streamCount: number | null) => trayStatusLine(statusWith("running", "enabled", streamCount));
  expect(running(3)).toBe("Runtime running · 3 streams");
  expect(running(1)).toBe("Runtime running · 1 stream");
  expect(running(0)).toBe("Runtime running · 0 streams");
  expect(running(null)).toBe("Runtime running");
  expect(trayStatusLine(statusWith("stopped", "not_registered", null))).toBe("Runtime stopped");
  expect(trayStatusLine(statusWith("starting", "enabled", null))).toBe("Starting…");
  expect(trayStatusLine(statusWith("stopped", "requires_approval", null))).toBe("Needs approval in Login Items");
});
