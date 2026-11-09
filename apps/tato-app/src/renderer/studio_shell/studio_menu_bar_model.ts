// The studio's menus as data, in the concept canvas's order. An entry whose work a later issue builds
// is listed dim, with why, so the menus keep their shape as each one lands. Linux draws them along
// the top of the window; macOS shows them in its one system menu bar, laid out as a Mac app's are.

import type { SystemMenuBarEntry, SystemMenuBarItems, SystemMenuBarMenu, SystemMenuOfTheDesktop, TatolabAppUpdateState, TatolabPlatform } from "../../shared/tatolab_backend_contract";
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
  /** Run › Live: run the open project, which loads every stream asset in it again. */
  runTheProjectLive(): void;
  /** Run › Stop: stop the open project's running streams. */
  stopTheProject(): void;
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

/** The studio's own menus, each listed once for both platforms' bars to arrange. */
interface StudioMenuParts {
  fileEntries: StudioMenuEntry[];
  undoAndRedoEntries: StudioMenuEntry[];
  preferencesEntry: StudioMenuEntry;
  addMenu: StudioMenu;
  streamMenu: StudioMenu;
  runMenu: StudioMenu;
  windowEntries: StudioMenuEntry[];
  aboutEntry: StudioMenuEntry;
  appUpdateEntry: StudioMenuEntry;
  documentationEntry: StudioMenuEntry;
}

function studioMenuParts(
  platform: TatolabPlatform,
  chosenLayout: StudioLayoutName | null,
  appUpdate: TatolabAppUpdateState,
  commands: StudioMenuBarCommands,
  preferencesLabel: string,
): StudioMenuParts {
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
  return {
    fileEntries: [
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
    undoAndRedoEntries: [laterCommand("Undo"), laterCommand("Redo")],
    preferencesEntry: { kind: "command", label: preferencesLabel, shortcutHint: shortcutHint(platform, ","), onChosen: commands.openPreferences },
    addMenu: { label: "Add", entries: [laterCommand("Node…", "Shift A"), laterCommand("Connection…"), laterCommand("Variable…"), laterCommand("Frame")] },
    streamMenu: { label: "Stream", entries: [laterCommand("Run on…"), laterCommand("Stream clock")] },
    runMenu: {
      label: "Run",
      entries: [projectCommand("Live", commands.runTheProjectLive, RUN_LIVE_KEY), projectCommand("Stop", commands.stopTheProject, STOP_KEY_HINT), laterCommand("Render to file…")],
    },
    windowEntries: [studioLayoutEntry, laterCommand("Save layout as…"), laterCommand("Maximise area"), laterCommand("New window")],
    aboutEntry: { kind: "command", label: "About Tato Studio", onChosen: commands.openAbout },
    appUpdateEntry: appUpdateMenuEntry(appUpdate, commands),
    documentationEntry: laterCommand("Documentation"),
  };
}

/** The studio's menus along the top of its window, as Linux shows them, Window › Layout ticking `chosenLayout`, or naming why it waits while no project is open, and Help's updates entry following `appUpdate`. */
export function studioMenuBarMenus(platform: TatolabPlatform, chosenLayout: StudioLayoutName | null, appUpdate: TatolabAppUpdateState, commands: StudioMenuBarCommands): StudioMenu[] {
  const parts = studioMenuParts(platform, chosenLayout, appUpdate, commands, "Preferences…");
  return [
    { label: "File", entries: parts.fileEntries },
    { label: "Edit", entries: [...parts.undoAndRedoEntries, { kind: "separator" }, parts.preferencesEntry] },
    parts.addMenu,
    parts.streamMenu,
    parts.runMenu,
    { label: "Window", entries: parts.windowEntries },
    { label: "Help", entries: [parts.aboutEntry, parts.appUpdateEntry, { kind: "separator" }, parts.documentationEntry] },
  ];
}

/** One entry of a studio menu in macOS's system menu bar: one of the studio's own, or items only the desktop draws. */
export type StudioMenuEntryInTheSystemMenuBar = StudioMenuEntry | { kind: "system_items"; systemItems: SystemMenuBarItems };

/** One menu of macOS's system menu bar as the studio lays it out: its name, which of the desktop's own menus it is, if any, and its entries. */
export interface StudioMenuInTheSystemMenuBar {
  label: string;
  systemMenu: SystemMenuOfTheDesktop | null;
  entries: readonly StudioMenuEntryInTheSystemMenuBar[];
}

/** The studio's menus as macOS's one menu bar shows them, in the places a Mac app keeps them: About, the updates entry following `appUpdate`, and Settings in the app menu, the desktop's text editing in Edit, its window controls in Window. */
export function studioMenusInTheSystemMenuBar(chosenLayout: StudioLayoutName | null, appUpdate: TatolabAppUpdateState, commands: StudioMenuBarCommands): StudioMenuInTheSystemMenuBar[] {
  const parts = studioMenuParts("macos", chosenLayout, appUpdate, commands, "Settings…");
  return [
    {
      label: "Tato Studio",
      systemMenu: "app",
      entries: [parts.aboutEntry, parts.appUpdateEntry, { kind: "separator" }, parts.preferencesEntry, { kind: "separator" }, { kind: "system_items", systemItems: "app_services_hide_and_quit" }],
    },
    { label: "File", systemMenu: null, entries: [...parts.fileEntries, { kind: "separator" }, { kind: "system_items", systemItems: "close_window" }] },
    { label: "Edit", systemMenu: null, entries: [{ kind: "system_items", systemItems: "text_editing" }] },
    { ...parts.addMenu, systemMenu: null },
    { ...parts.streamMenu, systemMenu: null },
    { ...parts.runMenu, systemMenu: null },
    { label: "View", systemMenu: null, entries: [{ kind: "system_items", systemItems: "full_screen" }] },
    {
      label: "Window",
      systemMenu: "window",
      entries: [
        { kind: "system_items", systemItems: "window_arrangement" },
        { kind: "separator" },
        ...parts.windowEntries,
        { kind: "separator" },
        { kind: "system_items", systemItems: "bring_all_to_front" },
      ],
    },
    { label: "Help", systemMenu: "help", entries: [parts.documentationEntry] },
  ];
}

/** The studio's menus as the window sends them to the system menu bar, and what each entry's `entry_id` runs when the person chooses it there. */
export interface StudioMenusSentToTheSystemMenuBar {
  menus: SystemMenuBarMenu[];
  onChosenByEntryId: ReadonlyMap<string, () => void>;
}

/** `menus` in the system menu bar's wire shape, each entry's `entry_id` the path of labels down to it, as `File › Open project…`. */
export function studioMenusSentToTheSystemMenuBar(menus: readonly StudioMenuInTheSystemMenuBar[]): StudioMenusSentToTheSystemMenuBar {
  const onChosenByEntryId = new Map<string, () => void>();
  const entriesOnTheWire = (entries: readonly StudioMenuEntryInTheSystemMenuBar[], labelsAbove: readonly string[]): SystemMenuBarEntry[] =>
    entries.map((entry): SystemMenuBarEntry => {
      switch (entry.kind) {
        case "separator":
          return { kind: "separator" };
        case "system_items":
          return { kind: "system_items", system_items: entry.systemItems };
        case "submenu":
          return { kind: "submenu", label: entry.label, entries: entriesOnTheWire(entry.entries, [...labelsAbove, entry.label]) };
        case "choice": {
          const entryId = [...labelsAbove, entry.label].join(" › ");
          onChosenByEntryId.set(entryId, entry.onChosen);
          return { kind: "choice", entry_id: entryId, label: entry.label, shortcut_hint: entry.shortcutHint ?? null, is_chosen: entry.isChosen };
        }
        case "command": {
          const entryId = [...labelsAbove, entry.label].join(" › ");
          onChosenByEntryId.set(entryId, entry.onChosen);
          return { kind: "command", entry_id: entryId, label: entry.label, shortcut_hint: entry.shortcutHint ?? null, unavailable_because: null };
        }
        case "unavailable_command":
          return {
            kind: "command",
            entry_id: [...labelsAbove, entry.label].join(" › "),
            label: entry.label,
            shortcut_hint: entry.shortcutHint ?? null,
            unavailable_because: entry.unavailableBecause,
          };
      }
    });
  return {
    menus: menus.map((menu) => ({ label: menu.label, system_menu: menu.systemMenu, entries: entriesOnTheWire(menu.entries, [menu.label]) })),
    onChosenByEntryId,
  };
}
