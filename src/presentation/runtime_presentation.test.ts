// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { TatolabStatus } from "../backend/tatolab_backend_contract";
import { chooseTatolabWindowScreen, deriveRuntimeDisplayState, presentRuntimeStatus } from "./runtime_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.45.0",
    platform: "macos",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: "ada-macbook-pro",
    streams: [],
    machine_setup_state: "complete",
    command_line_tool_linked_at: "/usr/local/bin/tatolab",
    app_update: { kind: "not_checked" },
    ...statusChanges,
  };
}

function linuxStatusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return statusWith({
    platform: "linux",
    machine_name: "ada-workstation",
    command_line_tool_linked_at: "/home/ada/.local/bin/tatolab",
    ...statusChanges,
  });
}

const RUNTIME_AGENT_REGISTRATIONS = ["enabled", "requires_approval", "not_registered", "not_found"] as const;

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

describe("on Linux", () => {
  it("explains a stopped runtime with no tatolabd.service by the missing install, whatever the switch says", () => {
    for (const runTatolab of [true, false]) {
      expect(
        deriveRuntimeDisplayState(linuxStatusWith({ runtime_state: "stopped", runtime_agent: "not_found", run_tatolab: runTatolab })),
      ).toBe("runtime_not_installed");
    }
  });

  it("shows a disabled unit as Tatolab is off, with the button that turns Run Tatolab on", () => {
    for (const runTatolab of [true, false]) {
      const presentation = presentRuntimeStatus(
        linuxStatusWith({ runtime_state: "stopped", runtime_agent: "not_registered", run_tatolab: runTatolab }),
      );
      expect(presentation.displayState).toBe("switched_off");
      expect(presentation.banner?.title).toBe("Tatolab is off");
      expect(presentation.banner?.action).toBe("turn_on_run_tatolab");
    }
  });

  it("never asks for Login Items approval", () => {
    for (const runtimeAgent of RUNTIME_AGENT_REGISTRATIONS) {
      for (const runTatolab of [true, false]) {
        const presentation = presentRuntimeStatus(
          linuxStatusWith({ runtime_state: "stopped", runtime_agent: runtimeAgent, run_tatolab: runTatolab }),
        );
        expect(presentation.displayState).not.toBe("needs_login_items_approval");
        expect(presentation.banner?.action).not.toBe("open_login_items");
      }
    }
  });

  it("shows a runtime that answers as running, even one no unit started", () => {
    expect(deriveRuntimeDisplayState(linuxStatusWith({ runtime_agent: "not_found" }))).toBe("running");
  });

  it("says what systemd does where macOS's banners name macOS", () => {
    expect(presentRuntimeStatus(linuxStatusWith({ runtime_state: "starting" })).banner?.explanation).toBe(
      "systemd is starting tatolabd.service. This usually takes a few seconds.",
    );
    expect(presentRuntimeStatus(linuxStatusWith({ runtime_state: "unreachable" })).banner?.explanation).toContain(
      "systemd restarts tatolabd.service if it fails",
    );
    expect(presentRuntimeStatus(statusWith({ runtime_state: "starting" })).banner?.explanation).toBe(
      "macOS is launching it. This usually takes a few seconds.",
    );
  });
});

describe("chooseTatolabWindowScreen", () => {
  it("holds macOS on setup until the administrator prompt has set the machine up", () => {
    expect(chooseTatolabWindowScreen(statusWith({ machine_setup_state: "needs_administrator" }))).toBe("setup");
    expect(chooseTatolabWindowScreen(statusWith({ machine_setup_state: "waiting_for_administrator" }))).toBe("setup");
    expect(chooseTatolabWindowScreen(statusWith({ runtime_state: "stopped", runtime_agent: "not_found" }))).toBe("pages");
    expect(chooseTatolabWindowScreen(statusWith({}))).toBe("pages");
  });

  it("holds Linux on the installer until tatolabd.service exists", () => {
    expect(chooseTatolabWindowScreen(linuxStatusWith({ runtime_state: "stopped", runtime_agent: "not_found" }))).toBe("setup");
    expect(chooseTatolabWindowScreen(linuxStatusWith({ runtime_state: "stopped", runtime_agent: "not_registered" }))).toBe("pages");
    expect(chooseTatolabWindowScreen(linuxStatusWith({ runtime_state: "starting", runtime_agent: "enabled" }))).toBe("pages");
    expect(chooseTatolabWindowScreen(linuxStatusWith({ runtime_agent: "not_found" }))).toBe("pages");
  });
});
