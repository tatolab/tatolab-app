import type { CommandLineToolLink, TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";

/** The platform `status` names; macOS, the app's first platform, for a status that names none this window knows. */
export function platformOf(status: TatolabStatus): TatolabPlatform {
  return status.platform === "linux" ? "linux" : "macos";
}

/** What the window draws and says differently on each platform. */
export interface PlatformPresentation {
  /** macOS draws the traffic lights over the window: the sidebar keeps a strip clear for them, and it and the title bar drag the window. */
  hasOverlayTitleBar: boolean;
  /** macOS shows an app's menus in its one menu bar at the top of the screen, so the window draws none of its own; Linux draws them along the top of the window. */
  menusLiveInTheSystemMenuBar: boolean;
  /** The key the window's shortcuts are held with. */
  windowShortcutModifier: "meta" | "control";
  thisMachineMidSentence: string;
  quitTatolabExplanation: string;
  /** Where the runtime keeps each stream's records. */
  streamRecordsDirectory: string;
  /** The shell profile a terminal reads its PATH from at login, where `~/.local/bin` is added. */
  loginShellProfile: string;
}

const PLATFORM_PRESENTATIONS: Record<TatolabPlatform, PlatformPresentation> = {
  macos: {
    hasOverlayTitleBar: true,
    menusLiveInTheSystemMenuBar: true,
    windowShortcutModifier: "meta",
    thisMachineMidSentence: "this Mac",
    quitTatolabExplanation: "Closes every window and the menu bar icon, and stops the runtime and your streams with it.",
    streamRecordsDirectory: "~/Library/Application Support/Tatolab",
    loginShellProfile: "~/.zprofile",
  },
  linux: {
    hasOverlayTitleBar: false,
    menusLiveInTheSystemMenuBar: false,
    windowShortcutModifier: "control",
    thisMachineMidSentence: "this computer",
    quitTatolabExplanation: "Closes every window and the tray icon, and stops the runtime and your streams with it.",
    streamRecordsDirectory: "~/.local/state/tatolab",
    loginShellProfile: "~/.profile",
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

/** The key cap of a window shortcut held with Shift too: ⇧⌘Z on macOS, Ctrl Shift Z on Linux. */
export function shiftedShortcutHint(platform: TatolabPlatform, key: string): string {
  return presentPlatform(platform).windowShortcutModifier === "meta" ? `⇧⌘${key}` : `Ctrl Shift ${key}`;
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

/** The line that puts `~/.local/bin` on a terminal's PATH, for its login shell profile. */
export const HOME_FOLDER_BIN_ON_THE_PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

/** What the Settings row shows for the `tatolab` command, why it works in a terminal, and whether the row offers to link it. */
export interface CommandLineToolPresentation {
  /** The link's path while it is linked; `null` otherwise. */
  linkedAt: string | null;
  /** The link's path, its home shortened to `~`, or what stands in for a missing one. */
  shownValue: string;
  explanation: string;
  /** The line a terminal that can't find the link adds, under what says where; `null` while it is not linked. */
  pathLineToAdd: { lead: string; line: string } | null;
  /** Whether the row offers its Link button: only while nothing is linked and nothing else holds the name. */
  isLinkOffered: boolean;
}

/** The `tatolab` command as Settings shows it on `platform`: `~/.local/bin/tatolab`, linked to the copy inside Tato Studio with no password. */
export function presentCommandLineTool(platform: TatolabPlatform, commandLineToolLink: CommandLineToolLink): CommandLineToolPresentation {
  switch (commandLineToolLink.kind) {
    case "linked":
      return {
        linkedAt: commandLineToolLink.path,
        shownValue: abbreviateHomeDirectory(commandLineToolLink.path),
        explanation: "Linked to the copy inside Tato Studio. It works in any terminal with ~/.local/bin on its PATH.",
        pathLineToAdd: {
          lead: `If a terminal can't find it, add this line to ${presentPlatform(platform).loginShellProfile} and open a new terminal:`,
          line: HOME_FOLDER_BIN_ON_THE_PATH_LINE,
        },
        isLinkOffered: false,
      };
    case "not_linked":
      return {
        linkedAt: null,
        shownValue: "Not linked",
        explanation: `Link ${abbreviateHomeDirectory(commandLineToolLink.path)} to the copy inside Tato Studio. No password is asked.`,
        pathLineToAdd: null,
        isLinkOffered: true,
      };
    case "taken_by_something_else":
      return {
        linkedAt: null,
        shownValue: "Not linked",
        explanation: `${abbreviateHomeDirectory(commandLineToolLink.path)} is not a link to Tatolab, so Tato Studio leaves it alone.`,
        pathLineToAdd: null,
        isLinkOffered: false,
      };
    case "not_offered":
      return { linkedAt: null, shownValue: "Not linked", explanation: commandLineToolLink.reason, pathLineToAdd: null, isLinkOffered: false };
  }
}

/** A home directory where macOS (`/Users/<name>`) and Linux (`/home/<name>`) put one. */
const HOME_DIRECTORY_PREFIX = /^\/(?:Users|home)\/[^/]+(?=\/|$)/;

/** Shortens `/Users/<name>/…` or `/home/<name>/…` to `~/…` for display. */
export function abbreviateHomeDirectory(absolutePath: string): string {
  return absolutePath.replace(HOME_DIRECTORY_PREFIX, "~");
}
