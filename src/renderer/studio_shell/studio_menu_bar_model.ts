// The studio's menus as data, in the concept canvas's order. An entry whose work a later issue builds
// is listed dim, with why, so the menus keep their shape as each one lands.

import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import type { StudioMenu, StudioMenuEntry } from "../design_system/menu_bar";
import { shortcutHint } from "../presentation/platform_presentation";
import { WORKSPACE_LAYOUTS, type WorkspaceLayoutName } from "./workspace_layouts";

/** Why an entry whose work a later issue builds cannot run. */
export const NOT_IN_THIS_BUILD_REASON = "Not in this build yet";

/** What the studio's menus do. */
export interface StudioMenuBarCommands {
  /** File › Home: show Home, the recent projects, over the open workspace. */
  showHome(): void;
  openAWorkspace(): void;
  createAWorkspace(): void;
  openPreferences(): void;
  openAbout(): void;
  chooseLayout(layoutName: WorkspaceLayoutName): void;
  /** Run › Live: run the workspace project, which loads every `@stream` in it again. */
  runTheWorkspaceLive(): void;
  /** Run › Stop: stop the workspace project's running streams. */
  stopTheWorkspace(): void;
  /** Stream › Open stream.py: show the workspace project's `stream.py` in a code area. */
  openTheWorkspaceStreamPy(): void;
}

/** Why an entry that acts on the open workspace cannot run while none is open. */
export const NO_WORKSPACE_OPEN_REASON = "Open a workspace first";

/** The keys that run the workspace live, and stop it. */
export const RUN_LIVE_KEY = "F5";
export const STOP_KEY_HINT = "Shift F5";

function laterCommand(label: string, shortcut?: string): StudioMenuEntry {
  return shortcut === undefined
    ? { kind: "unavailable_command", label, unavailableBecause: NOT_IN_THIS_BUILD_REASON }
    : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NOT_IN_THIS_BUILD_REASON };
}

/** The studio's menus on `platform`, Window › Workspace layout ticking `chosenLayout`, or naming why it waits while no workspace is open. */
export function studioMenuBarMenus(platform: TatolabPlatform, chosenLayout: WorkspaceLayoutName | null, commands: StudioMenuBarCommands): StudioMenu[] {
  const workspaceCommand = (label: string, onChosen: () => void, shortcut?: string): StudioMenuEntry => {
    if (chosenLayout === null) return shortcut === undefined ? { kind: "unavailable_command", label, unavailableBecause: NO_WORKSPACE_OPEN_REASON } : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NO_WORKSPACE_OPEN_REASON };
    return shortcut === undefined ? { kind: "command", label, onChosen } : { kind: "command", label, shortcutHint: shortcut, onChosen };
  };
  const workspaceLayoutEntry: StudioMenuEntry =
    chosenLayout === null
      ? { kind: "unavailable_command", label: "Workspace layout", unavailableBecause: "Open a workspace to lay out its areas" }
      : {
          kind: "submenu",
          label: "Workspace layout",
          entries: WORKSPACE_LAYOUTS.map(({ name, title, shortcut_digit }) => ({
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
        { kind: "command", label: "Home", onChosen: commands.showHome },
        { kind: "separator" },
        { kind: "command", label: "Open workspace…", shortcutHint: shortcutHint(platform, "O"), onChosen: commands.openAWorkspace },
        { kind: "command", label: "New workspace…", onChosen: commands.createAWorkspace },
        { kind: "separator" },
        laterCommand("Import project…"),
        laterCommand("New stream"),
        laterCommand("Save version…"),
        laterCommand("Get more…"),
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
    { label: "Stream", entries: [laterCommand("Run on…"), laterCommand("Stream clock"), workspaceCommand("Open stream.py", commands.openTheWorkspaceStreamPy)] },
    {
      label: "Run",
      entries: [workspaceCommand("Live", commands.runTheWorkspaceLive, RUN_LIVE_KEY), workspaceCommand("Stop", commands.stopTheWorkspace, STOP_KEY_HINT), laterCommand("Render to file…")],
    },
    { label: "Window", entries: [workspaceLayoutEntry, laterCommand("Save layout as…"), laterCommand("Maximise area"), laterCommand("New window")] },
    { label: "Help", entries: [{ kind: "command", label: "About Tatolab", onChosen: commands.openAbout }, laterCommand("Documentation")] },
  ];
}
