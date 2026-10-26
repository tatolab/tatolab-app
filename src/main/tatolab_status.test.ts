import { expect, test } from "vitest";
import type {
  ListedStream,
  RuntimeAgentRegistration as RuntimeAgentRegistrationStatus,
  RuntimeState,
  TatolabStatus,
} from "../shared/tatolab_backend_contract.js";
import {
  deriveRuntimeState,
  RUNTIME_STARTING_GRACE_PERIOD_MS,
  isARuntimeNotAnswering,
  trayRuntimeRemedy,
  trayStatusLine,
  type RuntimeStateObservations,
} from "./tatolab_status.js";

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
    first_run_finished: true,
    command_line_tool_linked_at: null,
    command_line_tool_usr_local_bin_link: { kind: "not_linked" },
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
  };
}

/** A round with the switch on, the agent enabled, the runtime failing its health check `timeSinceTheRuntimeWasExpectedUpMs` after it was started, never having answered, and the service manager not given up. */
function roundObserving(observed: Partial<RuntimeStateObservations>): RuntimeStateObservations {
  return {
    runTatolab: true,
    runtimeAgent: "enabled",
    runtimeHealth: "failing",
    serviceManagerGaveUpOnTheRuntime: false,
    runtimeAnsweredSinceItWasLastStarted: false,
    timeSinceTheRuntimeWasExpectedUpMs: 0,
    ...observed,
  };
}

test("a_healthy_runtime_is_running_whatever_the_switch_says", () => {
  for (const runTatolab of [true, false]) {
    expect(deriveRuntimeState(roundObserving({ runTatolab, runtimeAgent: "not_registered", runtimeHealth: "healthy", timeSinceTheRuntimeWasExpectedUpMs: 600_000 }))).toBe(
      "running",
    );
  }
});

test("the_switch_off_or_an_agent_not_enabled_is_stopped", () => {
  expect(deriveRuntimeState(roundObserving({ runTatolab: false }))).toBe("stopped");
  for (const runtimeAgent of ["not_registered", "not_found", "requires_approval"] as const) {
    expect(deriveRuntimeState(roundObserving({ runtimeAgent, serviceManagerGaveUpOnTheRuntime: true })), runtimeAgent).toBe("stopped");
  }
});

test("a_start_is_starting_inside_the_grace_period_then_never_answered_until_the_runtime_has_answered_once", () => {
  expect(deriveRuntimeState(roundObserving({ timeSinceTheRuntimeWasExpectedUpMs: 19_000 }))).toBe("starting");
  expect(deriveRuntimeState(roundObserving({ timeSinceTheRuntimeWasExpectedUpMs: RUNTIME_STARTING_GRACE_PERIOD_MS }))).toBe("never_answered");
  expect(
    deriveRuntimeState(roundObserving({ runtimeAnsweredSinceItWasLastStarted: true, timeSinceTheRuntimeWasExpectedUpMs: 19_000 })),
    "a runtime that answered and stopped gets the grace period to come back",
  ).toBe("starting");
  expect(deriveRuntimeState(roundObserving({ runtimeAnsweredSinceItWasLastStarted: true, timeSinceTheRuntimeWasExpectedUpMs: RUNTIME_STARTING_GRACE_PERIOD_MS }))).toBe(
    "unreachable",
  );
});

test("the_service_manager_giving_up_is_blocked_even_inside_the_grace_period", () => {
  for (const runtimeAnsweredSinceItWasLastStarted of [true, false]) {
    expect(deriveRuntimeState(roundObserving({ serviceManagerGaveUpOnTheRuntime: true, runtimeAnsweredSinceItWasLastStarted }))).toBe(
      "blocked_by_the_service_manager",
    );
  }
});

test("unreachable_never_answered_and_blocked_are_the_states_of_a_runtime_not_answering", () => {
  const cases: [RuntimeState, boolean][] = [
    ["unreachable", true],
    ["never_answered", true],
    ["blocked_by_the_service_manager", true],
    ["running", false],
    ["starting", false],
    ["stopped", false],
  ];
  for (const [runtimeState, expected] of cases) expect(isARuntimeNotAnswering(runtimeState), runtimeState).toBe(expected);
});

test("the_tray_line_names_the_runtime_state_and_stream_count", () => {
  const running = (streamCount: number | null) => trayStatusLine(statusWith("running", "enabled", streamCount));
  expect(running(3)).toBe("Runtime running · 3 streams");
  expect(running(1)).toBe("Runtime running · 1 stream");
  expect(running(0)).toBe("Runtime running · 0 streams");
  expect(running(null)).toBe("Runtime running");
  expect(trayStatusLine(statusWith("stopped", "not_registered", null))).toBe("Runtime stopped");
  expect(trayStatusLine(statusWith("starting", "enabled", null))).toBe("Starting…");
  expect(trayStatusLine(statusWith("stopped", "requires_approval", null))).toBe("Needs your approval in Login Items");
  expect(trayStatusLine({ ...statusWith("stopped", "requires_approval", null), run_tatolab: false })).toBe("Runtime stopped");
  expect(trayStatusLine(statusWith("unreachable", "enabled", null))).toBe("Runtime not responding");
  expect(trayStatusLine(statusWith("never_answered", "enabled", null))).toBe("Runtime didn't start");
  expect(trayStatusLine(statusWith("blocked_by_the_service_manager", "enabled", null))).toBe("Runtime blocked by macOS");
  expect(trayStatusLine({ ...statusWith("blocked_by_the_service_manager", "enabled", null), platform: "linux" })).toBe("Runtime stopped by systemd");
});

test("the_tray_offers_login_items_for_approval_and_nothing_for_a_runtime_the_app_recovers_itself", () => {
  expect(trayRuntimeRemedy(statusWith("stopped", "requires_approval", null))).toBe("open_login_items");
  expect(trayRuntimeRemedy({ ...statusWith("stopped", "requires_approval", null), run_tatolab: false })).toBeNull();
  for (const runtimeState of ["running", "starting", "unreachable", "never_answered", "blocked_by_the_service_manager"] as const) {
    expect(trayRuntimeRemedy(statusWith(runtimeState, "enabled", null)), runtimeState).toBeNull();
  }
});
