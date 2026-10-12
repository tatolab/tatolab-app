import { describe, expect, it } from "vitest";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { deriveRuntimeDisplayState, presentRuntimeStatus } from "./runtime_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.45.0",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: "ada-macbook-pro",
    streams: [],
    machine_setup_state: "complete",
    command_line_tool_linked_at: "/usr/local/bin/tatolab",
    ...statusChanges,
  };
}

describe("deriveRuntimeDisplayState", () => {
  it("shows a running runtime as running whatever the agent says", () => {
    expect(deriveRuntimeDisplayState(statusWith({ runtime_agent: "requires_approval" }))).toBe("running");
  });

  it("explains a stopped runtime by the switch first, then the agent's registration", () => {
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "stopped", run_tatolab: false }))).toBe("switched_off");
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "stopped", runtime_agent: "requires_approval" }))).toBe(
      "needs_login_items_approval",
    );
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "stopped", runtime_agent: "not_found" }))).toBe(
      "runtime_missing_from_app",
    );
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "stopped", runtime_agent: "not_registered" }))).toBe(
      "not_registered",
    );
  });

  it("passes starting and unreachable through", () => {
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "starting" }))).toBe("starting");
    expect(deriveRuntimeDisplayState(statusWith({ runtime_state: "unreachable" }))).toBe("unreachable");
  });
});

describe("presentRuntimeStatus", () => {
  it("offers the one action that helps each banner", () => {
    expect(presentRuntimeStatus(statusWith({})).banner).toBeNull();
    expect(presentRuntimeStatus(statusWith({ runtime_state: "stopped", run_tatolab: false })).banner?.action).toBe(
      "turn_on_run_tatolab",
    );
    expect(
      presentRuntimeStatus(statusWith({ runtime_state: "stopped", runtime_agent: "requires_approval" })).banner?.action,
    ).toBe("open_login_items");
    expect(presentRuntimeStatus(statusWith({ runtime_state: "unreachable" })).banner?.action).toBeNull();
  });
});
