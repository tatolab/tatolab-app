import { describe, expect, it } from "vitest";
import type { RuntimeDescription, TatolabStatus } from "../../shared/tatolab_backend_contract";
import {
  presentAboutBuild,
  presentAboutCopyright,
  presentAboutVersions,
  presentCommandLineToolVersion,
  presentOpenAtLogin,
  presentRuntimeLogFolder,
  presentRuntimeStatusRow,
  presentRuntimeUptime,
  presentStreamFailureNotifications,
  restartRuntimeUnavailableBecause,
  SETTINGS_SECTION_GROUPS,
  settingsSectionLabel,
} from "./settings_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "ada-macbook-pro",
    streams: [],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "linked", path: "/Users/ada/.local/bin/tatolab" },
    app_update: { kind: "not_checked" },
    app_update_announcement: null,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
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
  it("lists General, Developer, Project, Runtime, Command line and About, in that order", () => {
    expect(SETTINGS_SECTION_GROUPS.flatMap((group) => group.sections.map(({ section }) => section))).toEqual(["general", "developer", "project", "runtime", "command-line", "about"]);
  });

  it("titles a section with the words its list names it by", () => {
    expect(settingsSectionLabel("command-line")).toBe("Command line");
    expect(settingsSectionLabel("general")).toBe("General");
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
    expect(
      presentRuntimeStatusRow(
        statusWith({ runtime_state: "not_running", runtime_not_running_because: "The runtime is running but not answering." }),
        describedAs({}),
      ),
    ).toEqual({
      statusWords: "Not running",
      tone: "error",
      problemExplanation: "The runtime is running but not answering.",
      refusal: null,
    });
  });

  it("shows a runtime's refusal to describe itself in its own words", () => {
    expect(presentRuntimeStatusRow(statusWith({}), { kind: "refused", refusal: "the runtime refused `describe_runtime` (200): tool not found" }).refusal).toBe(
      "the runtime refused `describe_runtime` (200): tool not found",
    );
  });

  it("offers Restart runtime except while the runtime is starting", () => {
    expect(restartRuntimeUnavailableBecause(statusWith({}))).toBeNull();
    expect(restartRuntimeUnavailableBecause(statusWith({ runtime_state: "not_running" }))).toBeNull();
    expect(restartRuntimeUnavailableBecause(statusWith({ runtime_state: "starting" }))).toBe("The runtime is starting.");
  });
});

describe("Runtime › Runtime logs", () => {
  it("opens the folder the running runtime names, and says why it can't otherwise", () => {
    expect(presentRuntimeLogFolder(statusWith({}), describedAs({}))).toEqual({
      folder: "/Users/ada/Library/Application Support/Tatolab/logs",
      openUnavailableBecause: null,
    });
    expect(presentRuntimeLogFolder(statusWith({}), describedAs({ runtime_log_directory: null })).openUnavailableBecause).toBe("The runtime keeps no log of its own.");
    expect(presentRuntimeLogFolder(statusWith({ runtime_state: "not_running" }), describedAs({})).openUnavailableBecause).toBe(
      "The runtime names its log folder while it runs.",
    );
    expect(presentRuntimeLogFolder(statusWith({}), { kind: "not_read" }).openUnavailableBecause).toBe("The runtime has not said where it writes its log.");
  });
});

describe("General", () => {
  it("shows the open-at-login switch as the desktop reports it, and says why where it is not offered", () => {
    expect(presentOpenAtLogin({ kind: "on" }, "macos")).toEqual({
      isSwitchedOn: true,
      description: "Opens Tato Studio in the tray when you log in, with the runtime ready for the tatolab command.",
    });
    expect(presentOpenAtLogin({ kind: "off" }, "linux").isSwitchedOn).toBe(false);
    expect(presentOpenAtLogin({ kind: "needs_approval_in_login_items" }, "macos")).toEqual({
      isSwitchedOn: true,
      description: "macOS is waiting for you to allow Tato Studio under Login Items.",
    });
    expect(presentOpenAtLogin({ kind: "not_offered", reason: "Only a packaged Tato Studio opens at login." }, "macos")).toEqual({
      isSwitchedOn: null,
      description: "Only a packaged Tato Studio opens at login.",
    });
  });

  it("says when the desktop shows no notifications", () => {
    expect(presentStreamFailureNotifications({ enabled: false, shown_by_this_desktop: true })).toEqual({
      isSwitchedOn: false,
      description: "Tells you when a stream fails to start. Clicking it opens the stream and why.",
    });
    expect(presentStreamFailureNotifications({ enabled: true, shown_by_this_desktop: false }).description).toBe(
      "This desktop shows no notifications, so Tato Studio can't tell you here when a stream fails.",
    );
  });
});

describe("About", () => {
  it("names the runtime's version beside the app's only while it runs and has described itself", () => {
    expect(presentAboutVersions(statusWith({}), describedAs({}))).toBe("Version 0.45.0 · tatolabd 0.55.2");
    expect(presentAboutVersions(statusWith({ runtime_state: "not_running" }), describedAs({}))).toBe("Version 0.45.0");
    expect(presentAboutVersions(statusWith({}), { kind: "not_read" })).toBe("Version 0.45.0");
  });

  it("names the short tatolab-app commit the build was built at, dev or release, and whether it was built with uncommitted changes", () => {
    const builtAt = { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", built_with_uncommitted_changes: false };
    expect(presentAboutBuild({ ...builtAt, build_kind: "release" })).toBe("Build 22b07a1-release");
    expect(presentAboutBuild({ ...builtAt, build_kind: "dev" })).toBe("Build 22b07a1-dev");
    expect(presentAboutBuild({ ...builtAt, build_kind: "dev", built_with_uncommitted_changes: true })).toBe("Build 22b07a1-dev (modified)");
    expect(presentAboutBuild(null)).toBe("Build not recorded");
  });

  it("dates the copyright in the year the clock reads as About is shown", () => {
    expect(presentAboutCopyright(new Date(2026, 9, 26, 13, 0))).toBe("© 2026 Tatolab LLC");
    expect(presentAboutCopyright(new Date(2027, 0, 1, 0, 0))).toBe("© 2027 Tatolab LLC");
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
