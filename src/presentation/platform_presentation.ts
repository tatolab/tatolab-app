import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { abbreviateHomeDirectory } from "./stream_presentation";

/** The platform `status` names; macOS, the app's first platform, for a status that names none this window knows. */
export function platformOf(status: TatolabStatus): TatolabPlatform {
  return status.platform === "linux" ? "linux" : "macos";
}

/** What the window draws and says differently on each platform. */
export interface PlatformPresentation {
  /** macOS draws the traffic lights over the window: the sidebar keeps a 52 px band clear for them and the top bands drag it. */
  hasOverlayTitleBar: boolean;
  /** Login Items is where macOS approves the runtime's agent; Linux has no such list. */
  showsLoginItems: boolean;
  /** The key the window's shortcuts are held with. */
  windowShortcutModifier: "meta" | "control";
  thisMachineAtSentenceStart: string;
  thisMachineMidSentence: string;
  runTatolabExplanation: string;
  quitTatolabExplanation: string;
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
  },
};

/** How the window looks and speaks on `platform`. */
export function presentPlatform(platform: TatolabPlatform): PlatformPresentation {
  return PLATFORM_PRESENTATIONS[platform];
}

/** The `data-tauri-drag-region` a top band takes: a band drags the window only under macOS's overlay title bar. */
export function windowDragRegionAttribute(platform: TatolabPlatform, reach: "self" | "deep"): string | null {
  if (!presentPlatform(platform).hasOverlayTitleBar) return null;
  return reach === "deep" ? "deep" : "";
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

/** What the Settings row shows for the `tatolab` command, and why it works in a terminal. */
export interface CommandLineToolPresentation {
  isLinked: boolean;
  /** The link's path, its home shortened to `~`, or what stands in for a missing one. */
  shownValue: string;
  explanation: string;
}

/** The `tatolab` command as Settings shows it: the app's own link on macOS, the installer's on Linux. */
export function presentCommandLineTool(platform: TatolabPlatform, linkedAt: string | null): CommandLineToolPresentation {
  if (platform === "linux") {
    return linkedAt === null
      ? { isLinked: false, shownValue: "Not installed", explanation: "The installer puts it in ~/.local/bin with the runtime." }
      : {
          isLinked: true,
          shownValue: abbreviateHomeDirectory(linkedAt),
          explanation: "Installed with the runtime. It works in any terminal with ~/.local/bin on its PATH.",
        };
  }
  return linkedAt === null
    ? { isLinked: false, shownValue: "Not linked", explanation: "Setting up Tatolab links it, so it works in every terminal." }
    : { isLinked: true, shownValue: linkedAt, explanation: "Linked to the copy inside Tatolab.app, so it works in every terminal." };
}
