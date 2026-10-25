// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { RuntimeDescription, TatolabStatus } from "../backend/tatolab_backend_contract";
import {
  presentAboutVersions,
  presentCommandLineToolVersion,
  presentLoginItemsRow,
  presentOpenAtLogin,
  presentRuntimeLogFolder,
  presentRuntimeStatusRow,
  presentRuntimeUptime,
  presentStreamFailureNotifications,
  presentUsrLocalBinLink,
  restartRuntimeUnavailableBecause,
  settingsSectionNamed,
  settingsSectionPath,
} from "./settings_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.45.0",
    platform: "macos",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: "ada-macbook-pro",
    streams: [],
    first_run_finished: true,
    command_line_tool_linked_at: "/Users/ada/.local/bin/tatolab",
    command_line_tool_usr_local_bin_link: { kind: "not_linked" },
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
    ...statusChanges,
  };
}

function describedAs(runtimeDescriptionChanges: Partial<RuntimeDescription>) {
  return {
    kind: "read" as const,
    description: {
      version: "0.55.2",
      build_id: "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60",
      up_for_ms: ((3 * 24 + 2) * 60 + 14) * 60_000,
      runtime_log_directory: "/Users/ada/Library/Application Support/Tatolab/logs",
      ...runtimeDescriptionChanges,
    },
  };
}

describe("Settings' sections", () => {
  it("names a section by its path, General for none or one it does not have", () => {
    expect(settingsSectionNamed("runtime")).toBe("runtime");
    expect(settingsSectionNamed("command-line")).toBe("command-line");
    expect(settingsSectionNamed(undefined)).toBe("general");
    expect(settingsSectionNamed("permissions")).toBe("general");
    expect(settingsSectionPath("about")).toBe("/settings/about");
  });
});

describe("Runtime › Status", () => {
  it("words uptime in days and hours, hours and minutes, or minutes", () => {
    expect(presentRuntimeUptime(((3 * 24 + 2) * 60 + 14) * 60_000)).toBe("up 3d 2h");
    expect(presentRuntimeUptime((5 * 60 + 12) * 60_000 + 59_000)).toBe("up 5h 12m");
    expect(presentRuntimeUptime(4 * 60_000)).toBe("up 4m");
    expect(presentRuntimeUptime(59_999)).toBe("up less than a minute");
  });

  it("names the running runtime's version and uptime once it has described itself", () => {
    expect(presentRuntimeStatusRow(statusWith({}), describedAs({}))).toEqual({
      statusWords: "Running · tatolabd 0.55.2 · up 3d 2h",
      tone: "ok",
      problemExplanation: null,
      refusal: null,
    });
    expect(presentRuntimeStatusRow(statusWith({}), { kind: "not_read" }).statusWords).toBe("Running");
  });

  it("shows only the state word while the runtime is not running, with why where that is a problem", () => {
    expect(presentRuntimeStatusRow(statusWith({ runtime_state: "starting" }), describedAs({}))).toEqual({
      statusWords: "Starting",
      tone: "progress",
      problemExplanation: null,
      refusal: null,
    });
    expect(presentRuntimeStatusRow(statusWith({ runtime_state: "unreachable" }), describedAs({}))).toEqual({
      statusWords: "Not responding",
      tone: "error",
      problemExplanation: "It was answering, then stopped, and hasn't answered for over 20 seconds. macOS restarts it if it exits.",
      refusal: null,
    });
    expect(presentRuntimeStatusRow(statusWith({ run_tatolab: false, runtime_agent: "not_registered", runtime_state: "stopped" }), describedAs({}))).toMatchObject({
      statusWords: "Stopped",
      tone: "idle",
      problemExplanation: null,
    });
  });

  it("shows a runtime's refusal to describe itself in its own words", () => {
    expect(presentRuntimeStatusRow(statusWith({}), { kind: "refused", refusal: "the runtime refused `describe_runtime` (200): tool not found" }).refusal).toBe(
      "the runtime refused `describe_runtime` (200): tool not found",
    );
  });

  it("offers Restart runtime only while Run Tatolab is on and its agent enabled", () => {
    expect(restartRuntimeUnavailableBecause(statusWith({}))).toBeNull();
    expect(restartRuntimeUnavailableBecause(statusWith({ runtime_state: "unreachable" }))).toBeNull();
    expect(restartRuntimeUnavailableBecause(statusWith({ run_tatolab: false }))).toBe("Run Tatolab is off, so there is no runtime to restart.");
    expect(restartRuntimeUnavailableBecause(statusWith({ runtime_agent: "requires_approval" }))).toBe(
      "The runtime's login item isn't enabled, so there is no runtime to restart.",
    );
  });
});

describe("Runtime › Runtime logs", () => {
  it("opens the folder the running runtime names, and says why it can't otherwise", () => {
    expect(presentRuntimeLogFolder(statusWith({}), describedAs({}))).toEqual({
      folder: "/Users/ada/Library/Application Support/Tatolab/logs",
      openUnavailableBecause: null,
    });
    expect(presentRuntimeLogFolder(statusWith({}), describedAs({ runtime_log_directory: null })).openUnavailableBecause).toBe("The runtime keeps no log of its own.");
    expect(presentRuntimeLogFolder(statusWith({ runtime_state: "stopped" }), describedAs({})).openUnavailableBecause).toBe(
      "The runtime names its log folder while it runs.",
    );
    expect(presentRuntimeLogFolder(statusWith({}), { kind: "not_read" }).openUnavailableBecause).toBe("The runtime has not said where it writes its log.");
  });
});

describe("General", () => {
  it("shows the open-at-login switch as the desktop reports it, and says why where it is not offered", () => {
    expect(presentOpenAtLogin({ kind: "on" }, "macos")).toMatchObject({ isSwitchedOn: true, needsApprovalInLoginItems: false });
    expect(presentOpenAtLogin({ kind: "off" }, "linux").isSwitchedOn).toBe(false);
    expect(presentOpenAtLogin({ kind: "needs_approval_in_login_items" }, "macos")).toEqual({
      isSwitchedOn: true,
      description: "macOS is waiting for you to allow Tatolab under Login Items.",
      needsApprovalInLoginItems: true,
    });
    expect(presentOpenAtLogin({ kind: "not_offered", reason: "Only a packaged Tatolab opens at login." }, "macos")).toEqual({
      isSwitchedOn: null,
      description: "Only a packaged Tatolab opens at login.",
      needsApprovalInLoginItems: false,
    });
  });

  it("says when the desktop shows no notifications", () => {
    expect(presentStreamFailureNotifications({ enabled: false, shown_by_this_desktop: true })).toEqual({
      isSwitchedOn: false,
      description: "Tells you when a stream fails to start. Clicking it opens the stream and why.",
    });
    expect(presentStreamFailureNotifications({ enabled: true, shown_by_this_desktop: false }).description).toBe(
      "This desktop shows no notifications, so Tatolab can't tell you here when a stream fails.",
    );
  });
});

describe("About and Login Items", () => {
  it("names the runtime's version beside the app's only while it runs and has described itself", () => {
    expect(presentAboutVersions(statusWith({}), describedAs({}))).toBe("Version 0.45.0 · tatolabd 0.55.2");
    expect(presentAboutVersions(statusWith({ runtime_state: "stopped" }), describedAs({}))).toBe("Version 0.45.0");
    expect(presentAboutVersions(statusWith({}), { kind: "not_read" })).toBe("Version 0.45.0");
  });

  it("says what Service Management reports of the runtime's entry: listed, waiting for approval, or not listed", () => {
    expect(presentLoginItemsRow(statusWith({ runtime_agent: "requires_approval" }))).toBe(
      "Tatolab is waiting for you to switch it on under Allow in the Background.",
    );
    expect(presentLoginItemsRow(statusWith({}))).toBe("Tatolab is listed under Allow in the Background. Run Tatolab and that entry are the same setting.");
    for (const runtimeAgent of ["not_registered", "not_found"] as const) {
      expect(presentLoginItemsRow(statusWith({ run_tatolab: false, runtime_agent: runtimeAgent }))).toBe(
        "Tatolab isn't listed under Allow in the Background. Turning Run Tatolab on adds it.",
      );
    }
  });
});

describe("Command line", () => {
  it("shows the CLI's version, nothing while it is read, and why where it can't be read", () => {
    expect(presentCommandLineToolVersion({ kind: "read", version: "0.55.2" }, true)).toEqual({ version: "0.55.2", unreadableLine: null });
    expect(presentCommandLineToolVersion({ kind: "reading" }, true)).toEqual({ version: null, unreadableLine: null });
    expect(presentCommandLineToolVersion({ kind: "unreadable", reason: "/usr/local/bin/tatolab --version failed" }, true)).toEqual({
      version: null,
      unreadableLine: "Its version can't be read: /usr/local/bin/tatolab --version failed",
    });
    expect(presentCommandLineToolVersion({ kind: "not_offered", reason: "no CLI in this build" }, false).unreadableLine).toBeNull();
  });
});

describe("Command line › Link in /usr/local/bin", () => {
  it("offers the link behind the password, warning that the dialog says osascript, and shows it once linked", () => {
    expect(presentUsrLocalBinLink("macos", { kind: "not_linked" })).toMatchObject({ isShown: true, isOffered: true });
    expect(presentUsrLocalBinLink("macos", { kind: "not_linked" }).description).toContain("osascript wants to make changes");
    expect(presentUsrLocalBinLink("macos", { kind: "linked", path: "/usr/local/bin/tatolab" })).toEqual({
      isShown: true,
      description: "Linked at /usr/local/bin/tatolab, so it works in every terminal.",
      isOffered: false,
    });
  });

  it("gives a build that does not link there its reason, and shows nothing on Linux", () => {
    expect(presentUsrLocalBinLink("macos", { kind: "not_offered", reason: "A local-proof build never links tatolab in /usr/local/bin." })).toEqual({
      isShown: true,
      description: "A local-proof build never links tatolab in /usr/local/bin.",
      isOffered: false,
    });
    expect(presentUsrLocalBinLink("linux", { kind: "not_offered", reason: "On Linux the installer links tatolab." }).isShown).toBe(false);
  });
});
