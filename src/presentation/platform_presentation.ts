// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { abbreviateHomeDirectory } from "./stream_presentation";

/** The platform `status` names; macOS, the app's first platform, for a status that names none this window knows. */
export function platformOf(status: TatolabStatus): TatolabPlatform {
  return status.platform === "linux" ? "linux" : "macos";
}

/** What the window draws and says differently on each platform. */
export interface PlatformPresentation {
  /** macOS draws the traffic lights over the window: the sidebar keeps a strip clear for them, and it and the title bar drag the window. */
  hasOverlayTitleBar: boolean;
  /** Login Items is where macOS approves the runtime's agent; Linux has no such list. */
  showsLoginItems: boolean;
  /** The key the window's shortcuts are held with. */
  windowShortcutModifier: "meta" | "control";
  thisMachineAtSentenceStart: string;
  thisMachineMidSentence: string;
  runTatolabExplanation: string;
  quitTatolabExplanation: string;
  uninstallTatolabExplanation: string;
  /** Where the runtime keeps each stream's records, which an uninstall leaves in place. */
  streamRecordsDirectory: string;
}

const PLATFORM_PRESENTATIONS: Record<TatolabPlatform, PlatformPresentation> = {
  macos: {
    hasOverlayTitleBar: true,
    showsLoginItems: true,
    windowShortcutModifier: "meta",
    thisMachineAtSentenceStart: "This Mac",
    thisMachineMidSentence: "this Mac",
    runTatolabExplanation: "Starts Tatolab at login and keeps the runtime running. Turning it off stops the runtime.",
    quitTatolabExplanation: "Closes this app and its menu bar icon. The runtime and your streams keep running.",
    uninstallTatolabExplanation: "Stops the runtime and removes Tatolab from this Mac. Your streams' records stay.",
    streamRecordsDirectory: "~/Library/Application Support/Tatolab",
  },
  linux: {
    hasOverlayTitleBar: false,
    showsLoginItems: false,
    windowShortcutModifier: "control",
    thisMachineAtSentenceStart: "This computer",
    thisMachineMidSentence: "this computer",
    runTatolabExplanation:
      "Runs tatolabd.service, your systemd user service, at login and keeps the runtime running. Turning it off stops the runtime.",
    quitTatolabExplanation: "Closes this app and its tray icon. The runtime and your streams keep running.",
    uninstallTatolabExplanation:
      "The installer removes the runtime, and your package manager removes this app. Your streams' records stay.",
    streamRecordsDirectory: "~/.local/state/tatolab",
  },
};

/** How the window looks and speaks on `platform`. */
export function presentPlatform(platform: TatolabPlatform): PlatformPresentation {
  return PLATFORM_PRESENTATIONS[platform];
}

/** The `data-window-drag-region` a top band takes: a band drags the window only under macOS's overlay title bar. */
export function windowDragRegionAttribute(platform: TatolabPlatform, reach: "self" | "deep"): string | null {
  if (!presentPlatform(platform).hasOverlayTitleBar) return null;
  return reach === "deep" ? "deep" : "";
}

/** The key cap a shortcut shows: `⌘K` on macOS, `Ctrl K` on Linux. */
export function shortcutHint(platform: TatolabPlatform, key: string): string {
  return presentPlatform(platform).windowShortcutModifier === "meta" ? `⌘${key}` : `Ctrl ${key}`;
}

/** A window shortcut as the window shows and announces it: its key cap, and its `aria-keyshortcuts` value. */
export interface WindowShortcutPresentation {
  hint: string;
  ariaKeyShortcuts: string;
}

/** `key` held with the platform's shortcut modifier: `⌘K` and `Meta+K` on macOS, `Ctrl K` and `Control+K` on Linux. */
export function presentWindowShortcut(platform: TatolabPlatform, key: string): WindowShortcutPresentation {
  const ariaModifier = presentPlatform(platform).windowShortcutModifier === "meta" ? "Meta" : "Control";
  return { hint: shortcutHint(platform, key), ariaKeyShortcuts: `${ariaModifier}+${key}` };
}

/** Whether exactly the platform's shortcut modifier is held: ⌘ on macOS, Ctrl on Linux, and never with Option or Alt. */
export function holdsWindowShortcutModifier(
  platform: TatolabPlatform,
  keyboardEvent: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  if (keyboardEvent.altKey) return false;
  return presentPlatform(platform).windowShortcutModifier === "meta"
    ? keyboardEvent.metaKey && !keyboardEvent.ctrlKey
    : keyboardEvent.ctrlKey && !keyboardEvent.metaKey;
}

/** The line that puts `~/.local/bin` on a zsh terminal's PATH, for `~/.zprofile`. */
export const HOME_FOLDER_BIN_ON_THE_PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

/** What the Settings row shows for the `tatolab` command, and why it works in a terminal. */
export interface CommandLineToolPresentation {
  isLinked: boolean;
  /** The link's path, its home shortened to `~`, or what stands in for a missing one. */
  shownValue: string;
  explanation: string;
  /** The line a terminal that can't find the app's link adds, under what says where; `null` where the installer's own link needs none. */
  pathLineToAdd: { lead: string; line: string } | null;
}

/** The `tatolab` command as Settings shows it: the app's own link in `~/.local/bin` on macOS, the installer's on Linux. */
export function presentCommandLineTool(platform: TatolabPlatform, linkedAt: string | null): CommandLineToolPresentation {
  if (platform === "linux") {
    return linkedAt === null
      ? { isLinked: false, shownValue: "Not installed", explanation: "The installer puts it in ~/.local/bin with the runtime.", pathLineToAdd: null }
      : {
          isLinked: true,
          shownValue: abbreviateHomeDirectory(linkedAt),
          explanation: "Installed with the runtime. It works in any terminal with ~/.local/bin on its PATH.",
          pathLineToAdd: null,
        };
  }
  return linkedAt === null
    ? { isLinked: false, shownValue: "Not linked", explanation: "Tatolab links it in ~/.local/bin each time it opens.", pathLineToAdd: null }
    : {
        isLinked: true,
        shownValue: abbreviateHomeDirectory(linkedAt),
        explanation: "Linked to the copy inside Tatolab.app. It works in any terminal with ~/.local/bin on its PATH.",
        pathLineToAdd: {
          lead: "If a terminal can't find it, add this line to ~/.zprofile and open a new terminal:",
          line: HOME_FOLDER_BIN_ON_THE_PATH_LINE,
        },
      };
}
