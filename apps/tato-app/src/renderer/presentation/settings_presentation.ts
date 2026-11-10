import type {
  RuntimeDescription,
  StreamFailureNotificationsState,
  TatolabAppBuild,
  TatolabAppOpenAtLogin,
  TatolabCommandLineToolVersion,
  TatolabPlatform,
  TatolabStatus,
} from "../../shared/tatolab_backend_contract";
import { presentRuntimeStatus, type StatusTone } from "./runtime_presentation";

/** A section of Preferences. */
export type SettingsSection = "general" | "developer" | "runtime" | "command-line" | "about";

/** Preferences' sections in the order its list shows them, under the group each sits in. */
export const SETTINGS_SECTION_GROUPS: readonly { groupLabel: string; sections: readonly { section: SettingsSection; label: string }[] }[] = [
  {
    groupLabel: "App",
    sections: [
      { section: "general", label: "General" },
      { section: "developer", label: "Developer" },
    ],
  },
  {
    groupLabel: "This machine",
    sections: [
      { section: "runtime", label: "Runtime" },
      { section: "command-line", label: "Command line" },
    ],
  },
  { groupLabel: "Tato Studio", sections: [{ section: "about", label: "About" }] },
];

/** The words Preferences' list names `section` by. */
export function settingsSectionLabel(section: SettingsSection): string {
  const named = SETTINGS_SECTION_GROUPS.flatMap((sectionGroup) => sectionGroup.sections).find((listedSection) => listedSection.section === section);
  return named?.label ?? "Preferences";
}

/** What the Developer mode switch adds, as its row describes it. */
export const DEVELOPER_MODE_DESCRIPTION = "Adds the Transactions view, which lists every change the runtime recorded in the open project, exactly as it sent it. Find it in each area's view menu.";

/** The licence the runtime the app runs is under, as streamlib states it. */
export const RUNTIME_LICENCE = "BUSL-1.1";

/** The command a coding agent runs to reach this machine's runtime over MCP. */
export const TATOLAB_MCP_COMMAND = "tatolab mcp";

/** The `.mcp.json` a coding agent reads to start `tatolab mcp`. */
export const TATOLAB_MCP_CONFIG = `{
  "mcpServers": {
    "tatolab": {
      "command": "tatolab",
      "args": ["mcp"]
    }
  }
}`;

/** How long the runtime has been up, as `up 3d 2h`, `up 5h 12m`, `up 4m` or `up less than a minute`. */
export function presentRuntimeUptime(upForMs: number): string {
  const upForMinutes = Math.floor(upForMs / 60_000);
  const days = Math.floor(upForMinutes / (24 * 60));
  const hours = Math.floor(upForMinutes / 60) % 24;
  const minutes = upForMinutes % 60;
  if (days > 0) return `up ${days}d ${hours}h`;
  if (hours > 0) return `up ${hours}h ${minutes}m`;
  if (minutes > 0) return `up ${minutes}m`;
  return "up less than a minute";
}

/** What the window holds of the runtime's description: nothing yet, what it last answered, or why it did not. */
export type RuntimeDescriptionReading =
  | { kind: "not_read" }
  | { kind: "read"; description: RuntimeDescription }
  | { kind: "refused"; refusal: string };

/**
 * Runtime › Status: the state word in its tone, then the runtime's version and uptime while it runs and has described
 * itself; why it is in a problem state; and a running runtime's refusal to describe itself, in its own words.
 */
export interface RuntimeStatusRowPresentation {
  /** `Running · tatolabd 0.55.2 · up 3d 2h`, or the state word alone. */
  statusWords: string;
  tone: StatusTone;
  /** Why the runtime is in a warning or error state, as the window's banner says it; `null` otherwise. */
  problemExplanation: string | null;
  refusal: string | null;
}

/** Runtime › Status for `status` and what the runtime last said of itself. */
export function presentRuntimeStatusRow(status: TatolabStatus, runtimeDescription: RuntimeDescriptionReading): RuntimeStatusRowPresentation {
  const { tone, shortLabel, banner } = presentRuntimeStatus(status);
  const problemExplanation = (tone === "error" || tone === "warning") && banner !== null ? banner.explanation : null;
  if (status.runtime_state !== "running" || runtimeDescription.kind === "not_read") {
    return { statusWords: shortLabel, tone, problemExplanation, refusal: null };
  }
  if (runtimeDescription.kind === "refused") return { statusWords: shortLabel, tone, problemExplanation, refusal: runtimeDescription.refusal };
  const { version, up_for_ms } = runtimeDescription.description;
  return { statusWords: `${shortLabel} · tatolabd ${version} · ${presentRuntimeUptime(up_for_ms)}`, tone, problemExplanation, refusal: null };
}

/** About: `Version 0.45.0`, and `· tatolabd 0.55.2` beside it while the runtime runs and has described itself. */
export function presentAboutVersions(status: TatolabStatus, runtimeDescription: RuntimeDescriptionReading): string {
  const appVersion = `Version ${status.app_version}`;
  return status.runtime_state === "running" && runtimeDescription.kind === "read"
    ? `${appVersion} · tatolabd ${runtimeDescription.description.version}`
    : appVersion;
}

/** About's Build line: `Build 22b07a1-release`, `Build 22b07a1-dev (modified)` for a build with uncommitted changes, or `Build not recorded`. */
export function presentAboutBuild(appBuild: TatolabAppBuild | null): string {
  if (appBuild === null) return "Build not recorded";
  const buildId = `${appBuild.tatolab_app_commit.slice(0, 7)}-${appBuild.build_kind}`;
  return appBuild.built_with_uncommitted_changes ? `Build ${buildId} (modified)` : `Build ${buildId}`;
}

/** About's copyright, in the year `wallClockNow` reads. */
export function presentAboutCopyright(wallClockNow: Date): string {
  return `© ${wallClockNow.getFullYear()} Tatolab LLC`;
}

/** Why Restart runtime cannot be pressed now; `null` when it can. */
export function restartRuntimeUnavailableBecause(status: TatolabStatus): string | null {
  return status.runtime_state === "starting" ? "The runtime is starting." : null;
}

/** Runtime › Runtime logs: where the runtime writes its own log, or why it cannot be opened. */
export interface RuntimeLogFolderPresentation {
  folder: string | null;
  openUnavailableBecause: string | null;
}

/** Runtime › Runtime logs for `status` and what the runtime last said of itself. */
export function presentRuntimeLogFolder(status: TatolabStatus, runtimeDescription: RuntimeDescriptionReading): RuntimeLogFolderPresentation {
  if (status.runtime_state !== "running") return { folder: null, openUnavailableBecause: "The runtime names its log folder while it runs." };
  if (runtimeDescription.kind !== "read") return { folder: null, openUnavailableBecause: "The runtime has not said where it writes its log." };
  const folder = runtimeDescription.description.runtime_log_directory;
  return folder === null ? { folder: null, openUnavailableBecause: "The runtime keeps no log of its own." } : { folder, openUnavailableBecause: null };
}

/** General › Open Tato Studio at login: whether the switch shows and how it is set, and what the row says under its name. */
export interface OpenAtLoginPresentation {
  /** `null` where the build does not offer it, and the row says why instead. */
  isSwitchedOn: boolean | null;
  description: string;
}

/** General › Open Tato Studio at login for what the desktop reports on `platform`. */
export function presentOpenAtLogin(openAtLogin: TatolabAppOpenAtLogin, platform: TatolabPlatform): OpenAtLoginPresentation {
  const runtimeEitherWay = "Opens Tato Studio in the tray when you log in, with the runtime ready for the tatolab command.";
  switch (openAtLogin.kind) {
    case "on":
      return { isSwitchedOn: true, description: runtimeEitherWay };
    case "off":
      return { isSwitchedOn: false, description: runtimeEitherWay };
    case "needs_approval_in_login_items":
      return {
        isSwitchedOn: true,
        description:
          platform === "macos"
            ? "macOS is waiting for you to allow Tato Studio under Login Items."
            : "The desktop is waiting for you to allow Tato Studio to open at login.",
      };
    case "not_offered":
      return { isSwitchedOn: null, description: openAtLogin.reason };
  }
}

/** General › When a stream fails: the switch, and what the row says under its name. */
export function presentStreamFailureNotifications(streamFailureNotifications: StreamFailureNotificationsState): { isSwitchedOn: boolean; description: string } {
  return {
    isSwitchedOn: streamFailureNotifications.enabled,
    description: streamFailureNotifications.shown_by_this_desktop
      ? "Tells you when a stream fails to start. Clicking it opens the stream and why."
      : "This desktop shows no notifications, so Tato Studio can't tell you here when a stream fails.",
  };
}

/** Command line › tatolab: the version beside the path, and, for a linked command whose version can't be read, a line saying why. */
export function presentCommandLineToolVersion(
  commandLineToolVersion: TatolabCommandLineToolVersion,
  isTheCommandLinked: boolean,
): { version: string | null; unreadableLine: string | null } {
  switch (commandLineToolVersion.kind) {
    case "read":
      return { version: commandLineToolVersion.version, unreadableLine: null };
    case "reading":
      return { version: null, unreadableLine: null };
    case "unreadable":
    case "not_offered":
      return { version: null, unreadableLine: isTheCommandLinked ? `Its version can't be read: ${commandLineToolVersion.reason}` : null };
  }
}
