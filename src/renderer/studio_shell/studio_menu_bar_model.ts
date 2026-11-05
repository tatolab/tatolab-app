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
  openAWorkspace(): void;
  createAWorkspace(): void;
  openPreferences(): void;
  openAbout(): void;
  chooseLayout(layoutName: WorkspaceLayoutName): void;
}

function laterCommand(label: string, shortcut?: string): StudioMenuEntry {
  return shortcut === undefined
    ? { kind: "unavailable_command", label, unavailableBecause: NOT_IN_THIS_BUILD_REASON }
    : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NOT_IN_THIS_BUILD_REASON };
}

/** The studio's menus on `platform`, Window › Workspace layout ticking `chosenLayout`, or naming why it waits while no workspace is open. */
export function studioMenuBarMenus(platform: TatolabPlatform, chosenLayout: WorkspaceLayoutName | null, commands: StudioMenuBarCommands): StudioMenu[] {
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
    { label: "Stream", entries: [laterCommand("Run on…"), laterCommand("Stream clock"), laterCommand("Open stream.py")] },
    { label: "Run", entries: [laterCommand("Live", "F5"), laterCommand("Stop", "Shift F5"), laterCommand("Render to file…")] },
    { label: "Window", entries: [workspaceLayoutEntry, laterCommand("Save layout as…"), laterCommand("Maximise area"), laterCommand("New window")] },
    { label: "Help", entries: [{ kind: "command", label: "About Tatolab", onChosen: commands.openAbout }, laterCommand("Documentation")] },
  ];
}
