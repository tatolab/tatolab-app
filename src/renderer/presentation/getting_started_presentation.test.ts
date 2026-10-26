import { describe, expect, it } from "vitest";
import type { TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentGettingStarted } from "./getting_started_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.55.4",
    app_build: null,
    platform: "macos",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: "ada-macbook-pro",
    streams: [],
    first_run_finished: false,
    command_line_tool_linked_at: "/Users/ada/.local/bin/tatolab",
    command_line_tool_usr_local_bin_link: { kind: "not_linked" },
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.4" },
    ...statusChanges,
  };
}

describe("presentGettingStarted", () => {
  it("normally has one step, starting then ticked, and offers Get Started once the runtime answers", () => {
    const starting = presentGettingStarted(statusWith({ runtime_state: "starting" }));
    expect(starting.steps).toEqual([
      { step: "start_the_runtime", title: "Start the runtime", progressWords: "Starting…", explanation: null, progress: "in_progress", action: null },
    ]);
    expect(starting.getStartedIsOffered).toBe(false);

    const running = presentGettingStarted(statusWith({}));
    expect(running.steps.map(({ progress }) => progress)).toEqual(["done"]);
    expect(running.getStartedIsOffered).toBe(true);
  });

  it("adds an approval step naming the switch, with Open Login Items", () => {
    const approval = presentGettingStarted(statusWith({ runtime_state: "stopped", runtime_agent: "requires_approval" }));
    expect(approval.steps.map(({ step, progress, action }) => ({ step, progress, action }))).toEqual([
      { step: "start_the_runtime", progress: "waiting", action: null },
      { step: "approve_in_login_items", progress: "needs_you", action: "open_login_items" },
    ]);
    expect(approval.steps[1]?.explanation).toContain("Allow in the Background");
    expect(approval.getStartedIsOffered).toBe(false);
  });

  it("shows a blocked runtime as the one start step retrying, with what holds it up", () => {
    expect(presentGettingStarted(statusWith({ runtime_state: "blocked_by_the_service_manager" })).steps).toEqual([
      {
        step: "start_the_runtime",
        title: "Start the runtime",
        progressWords: "Retrying…",
        explanation: "Blocked by macOS",
        progress: "in_progress",
        action: null,
      },
    ]);
    const blockedOnLinux = presentGettingStarted(statusWith({ platform: "linux", runtime_state: "blocked_by_the_service_manager" }));
    expect(blockedOnLinux.steps[0]?.explanation).toBe("systemd stopped the runtime");
  });

  it("says a start that never answered in its own words, never as not responding", () => {
    const neverAnswered = presentGettingStarted(statusWith({ runtime_state: "never_answered" }));
    expect(neverAnswered.steps).toEqual([
      {
        step: "start_the_runtime",
        title: "Start the runtime",
        progressWords: "Retrying…",
        explanation: "The runtime didn't start",
        progress: "in_progress",
        action: null,
      },
    ]);
  });

  it("offers to turn Run Tatolab on when it is off", () => {
    expect(presentGettingStarted(statusWith({ run_tatolab: false, runtime_state: "stopped" })).steps[0]).toMatchObject({
      progress: "needs_you",
      action: "turn_on_run_tatolab",
    });
  });
});
