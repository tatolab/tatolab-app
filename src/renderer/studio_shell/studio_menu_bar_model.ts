// The studio's menus as data, in the concept canvas's order. An entry whose work a later issue builds
// is listed dim, with why, so the menus keep their shape as each one lands.

import type { TatolabAppUpdateState, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import type { StudioMenu, StudioMenuEntry } from "../design_system/menu_bar";
import { presentTatolabAppUpdateMenuEntry } from "../presentation/app_update_presentation";
import { shortcutHint } from "../presentation/platform_presentation";
import { STUDIO_LAYOUTS, type StudioLayoutName } from "./studio_layouts";

/** Why an entry whose work a later issue builds cannot run. */
export const NOT_IN_THIS_BUILD_REASON = "Not in this build yet";

/** What the studio's menus do. */
export interface StudioMenuBarCommands {
  /** File › Projects: show the Projects window, the recent projects, over the open project. */
  showProjects(): void;
  openAProject(): void;
  createAProject(): void;
  openPreferences(): void;
  openAbout(): void;
  /** Check for Updates…: check for a newer Tato Studio, which downloads in the background. */
  checkForAppUpdates(): void;
  /** Restart to Update, or a newer version's download: take the version a check found. */
  takeTheNewerAppVersion(): void;
  chooseLayout(layoutName: StudioLayoutName): void;
  /** Run › Live: run the open project, which loads every `@stream` in it again. */
  runTheProjectLive(): void;
  /** Run › Stop: stop the open project's running streams. */
  stopTheProject(): void;
  /** Stream › Open stream.py: show the open project's `stream.py` in a code area. */
  openTheProjectStreamPy(): void;
  /** File › Get more…: open the project's Get more window. */
  openGetMore(): void;
}

/** Why an entry that acts on the open project cannot run while none is open. */
export const NO_PROJECT_OPEN_REASON = "Open a project first";

/** The keys that run the project live, and stop it. */
export const RUN_LIVE_KEY = "F5";
export const STOP_KEY_HINT = "Shift F5";

function laterCommand(label: string, shortcut?: string): StudioMenuEntry {
  return shortcut === undefined
    ? { kind: "unavailable_command", label, unavailableBecause: NOT_IN_THIS_BUILD_REASON }
    : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NOT_IN_THIS_BUILD_REASON };
}

/** Why the updates entry is dim while a check, a download or an install is under way. */
export const APP_UPDATE_UNDER_WAY_REASON = "An update is under way";

/** The updates entry for `appUpdate`, which follows About Tato Studio: dim, with why, in an app that cannot update itself or while an update is under way. */
function appUpdateMenuEntry(appUpdate: TatolabAppUpdateState, commands: StudioMenuBarCommands): StudioMenuEntry {
  const menuEntry = presentTatolabAppUpdateMenuEntry(appUpdate);
  if (menuEntry === null) {
    return { kind: "unavailable_command", label: "Check for Updates…", unavailableBecause: appUpdate.kind === "not_offered" ? appUpdate.reason : APP_UPDATE_UNDER_WAY_REASON };
  }
  if (!menuEntry.isEnabled) return { kind: "unavailable_command", label: menuEntry.label, unavailableBecause: APP_UPDATE_UNDER_WAY_REASON };
  return { kind: "command", label: menuEntry.label, onChosen: menuEntry.command === "check_for_updates" ? commands.checkForAppUpdates : commands.takeTheNewerAppVersion };
}

/** The studio's menus on `platform`, Window › Layout ticking `chosenLayout`, or naming why it waits while no project is open, and Help's updates entry following `appUpdate`. */
export function studioMenuBarMenus(platform: TatolabPlatform, chosenLayout: StudioLayoutName | null, appUpdate: TatolabAppUpdateState, commands: StudioMenuBarCommands): StudioMenu[] {
  const projectCommand = (label: string, onChosen: () => void, shortcut?: string): StudioMenuEntry => {
    if (chosenLayout === null) return shortcut === undefined ? { kind: "unavailable_command", label, unavailableBecause: NO_PROJECT_OPEN_REASON } : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NO_PROJECT_OPEN_REASON };
    return shortcut === undefined ? { kind: "command", label, onChosen } : { kind: "command", label, shortcutHint: shortcut, onChosen };
  };
  const studioLayoutEntry: StudioMenuEntry =
    chosenLayout === null
      ? { kind: "unavailable_command", label: "Layout", unavailableBecause: "Open a project to lay out its areas" }
      : {
          kind: "submenu",
          label: "Layout",
          entries: STUDIO_LAYOUTS.map(({ name, title, shortcut_digit }) => ({
            kind: "choice",
            label: title,
            shortcutHint: shortcutHint(platform, shortcut_digit),
            isChosen: name === chosenLayout,
            onChosen: () => commands.chooseLayout(name),
          })),
        };
  return [
    {
      label: "File",
      entries: [
        { kind: "command", label: "Projects", onChosen: commands.showProjects },
        { kind: "separator" },
        { kind: "command", label: "Open project…", shortcutHint: shortcutHint(platform, "O"), onChosen: commands.openAProject },
        { kind: "command", label: "New project…", onChosen: commands.createAProject },
        { kind: "separator" },
        laterCommand("Import project…"),
        laterCommand("New stream"),
        laterCommand("Save version…"),
        projectCommand("Get more…", commands.openGetMore),
      ],
    },
    {
      label: "Edit",
      entries: [
        laterCommand("Undo"),
        laterCommand("Redo"),
        { kind: "separator" },
        { kind: "command", label: "Preferences…", shortcutHint: shortcutHint(platform, ","), onChosen: commands.openPreferences },
      ],
    },
    { label: "Add", entries: [laterCommand("Node…", "Shift A"), laterCommand("Connection…"), laterCommand("Variable…"), laterCommand("Frame")] },
    { label: "Stream", entries: [laterCommand("Run on…"), laterCommand("Stream clock"), projectCommand("Open stream.py", commands.openTheProjectStreamPy)] },
    {
      label: "Run",
      entries: [projectCommand("Live", commands.runTheProjectLive, RUN_LIVE_KEY), projectCommand("Stop", commands.stopTheProject, STOP_KEY_HINT), laterCommand("Render to file…")],
    },
    { label: "Window", entries: [studioLayoutEntry, laterCommand("Save layout as…"), laterCommand("Maximise area"), laterCommand("New window")] },
    {
      label: "Help",
      entries: [{ kind: "command", label: "About Tato Studio", onChosen: commands.openAbout }, appUpdateMenuEntry(appUpdate, commands), { kind: "separator" }, laterCommand("Documentation")],
    },
  ];
}
