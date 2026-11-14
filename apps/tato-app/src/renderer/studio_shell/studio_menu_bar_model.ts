// The studio's menus as data, in the concept canvas's order. An entry whose work a later issue builds
// is listed dim, with why, so the menus keep their shape as each one lands. Linux draws them along
// the top of the window; macOS shows them in its one system menu bar, laid out as a Mac app's are.

import type { ModulesShown } from "../../shared/tatolab_electron_bridge_contract";
import type { SystemMenuBarEntry, SystemMenuBarItems, SystemMenuBarMenu, SystemMenuOfTheDesktop, TatolabAppUpdateState, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import type { StudioMenu, StudioMenuEntry } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import { presentTatolabAppUpdateMenuEntry } from "../presentation/app_update_presentation";
import type { ProjectPlaybackAskedFor, ProjectPlaybackChoice, ProjectPlaybackControls } from "../presentation/project_playback_presentation";
import { controlShortcutHint, shiftedShortcutHint, shortcutHint } from "../presentation/platform_presentation";
import { STUDIO_LAYOUT_PRESETS_ON_A_DIGIT } from "./studio_layout";
import { STUDIO_LAYOUT_SHAPES, studioLayoutShapePicture, type StudioLayoutShape } from "./studio_layout_shapes";

/** Why an entry whose work a later issue builds cannot run. */
export const NOT_IN_THIS_BUILD_REASON = "Not in this build yet";

/** What the studio's menus do. */
export interface StudioMenuBarCommands {
  /** File › Projects: show the Projects window, the recent projects, over the open project. */
  showProjects(): void;
  openAProject(): void;
  createAProject(): void;
  /** Import project .zip…: ask for a project `.zip`, then open the Import project sheet for it. */
  importAProjectArchive(): void;
  openSettings(): void;
  openAbout(): void;
  /** Check for Updates…: check for a newer Tato Studio, which downloads in the background. */
  checkForAppUpdates(): void;
  /** Restart to Update, or a newer version's download: take the version a check found. */
  takeTheNewerAppVersion(): void;
  /** Window › Layout's shapes: reshape the layout, keeping its views where they fit. */
  shapeTheLayout(shape: StudioLayoutShape): void;
  /** Window › Layout's saved presets: lay the window out as the one saved at `presetIndex`. */
  applyTheSavedLayoutPreset(presetIndex: number): void;
  /** Window › Layout › Save layout as preset…: ask for the preset's name. */
  askToSaveTheLayoutAsAPreset(): void;
  /** Run › Play, or Resume while it is paused: play the open project. */
  runTheProjectLive(): void;
  /** Run › Pause: pause the open project's playback, every stream of it held where it stands. */
  pauseTheProject(): void;
  /** Run › Stop: stop the open project's running streams. */
  stopTheProject(): void;
  /** Edit › Undo: undo the last edit the person made in the open project that is not undone yet. */
  undoYourLastEdit(): void;
  /** Edit › Redo: redo what the person's last undo in the open project reversed. */
  redoYourLastUndo(): void;
  /** File › Marketplace… and Modules…: open the project's Module manager window on the section `shows`. */
  openModuleManager(shows: ModulesShown): void;
  /** Stream › New stream…: ask for a name, then make the stream in the open project. */
  createAStream(): void;
  /** Stream › Rename stream…: ask for the shown tab's stream's new name. */
  renameTheShownStream(): void;
  /** Stream › Delete stream…: ask, naming the shown tab's stream, before deleting it. */
  deleteTheShownStream(): void;
  /** Stream › Close tab. */
  closeTheShownStreamTab(): void;
  /** Stream › Reopen closed tab: open again the tab closed last. */
  reopenTheLastClosedStreamTab(): void;
  /** Stream › Next tab and Previous tab. */
  showTheStreamTabBeside(direction: "next" | "previous"): void;
}

/** What Window › Layout lists of the open project's layout: the titles of the presets the person saved. */
export interface StudioLayoutInTheMenus {
  preset_titles_saved: readonly string[];
}

/** The stream tabs the Stream menu acts on: the shown one, how many are open, and whether a closed one is left to reopen. */
export interface StreamTabsInTheMenus {
  shown_stream_display_name: string | null;
  open_tab_count: number;
  has_a_closed_tab_to_reopen: boolean;
}

/** Why an entry that acts on the shown tab's stream cannot run while no tab is shown. */
export const NO_STREAM_TAB_SHOWN_REASON = "Open a stream's tab first";

/** Why Next tab and Previous tab cannot run with fewer than two tabs open. */
export const ONE_STREAM_TAB_AT_MOST_REASON = "Open another stream's tab first";

/** Why Reopen closed tab cannot run while no tab has been closed. */
export const NO_CLOSED_STREAM_TAB_REASON = "No tab has been closed";

/** Why an entry that acts on the open project cannot run while none is open. */
export const NO_PROJECT_OPEN_REASON = "Open a project first";

/** The keys that play the project, and stop it. */
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

/** The command each playback choice runs. */
export function projectPlaybackCommandOf(askedFor: ProjectPlaybackAskedFor, commands: StudioMenuBarCommands): () => void {
  switch (askedFor) {
    case "run":
      return commands.runTheProjectLive;
    case "pause":
      return commands.pauseTheProject;
    case "stop":
      return commands.stopTheProject;
  }
}

const PROJECT_PLAYBACK_SHORTCUT_HINTS: Readonly<Record<ProjectPlaybackAskedFor, string | undefined>> = { run: RUN_LIVE_KEY, pause: undefined, stop: STOP_KEY_HINT };

/** Run's playback entries, the same in the Run menu and behind the title row's player control: each choice `playbackControls` offers, the rest dim with why. */
export function projectPlaybackMenuEntries(playbackControls: ProjectPlaybackControls, commands: StudioMenuBarCommands): StudioMenuEntry[] {
  return playbackControls.choices.map((choice: ProjectPlaybackChoice): StudioMenuEntry => {
    const shortcutHint = PROJECT_PLAYBACK_SHORTCUT_HINTS[choice.asked_for];
    const unavailableBecause = choice.unavailable_because;
    if (unavailableBecause !== null) {
      return shortcutHint === undefined ? { kind: "unavailable_command", label: choice.label, unavailableBecause } : { kind: "unavailable_command", label: choice.label, shortcutHint, unavailableBecause };
    }
    const onChosen = projectPlaybackCommandOf(choice.asked_for, commands);
    return shortcutHint === undefined ? { kind: "command", label: choice.label, onChosen } : { kind: "command", label: choice.label, shortcutHint, onChosen };
  });
}

/** The studio's own menus, each listed once for both platforms' bars to arrange. */
interface StudioMenuParts {
  fileEntries: StudioMenuEntry[];
  undoAndRedoEntries: StudioMenuEntry[];
  /** Undo and Redo beside macOS's own text editing, which keeps ⌘Z and ⇧⌘Z in its menu while the window's keys undo the project outside a text field. */
  undoAndRedoBesideTextEditing: StudioMenuEntry[];
  settingsEntry: StudioMenuEntry;
  addMenu: StudioMenu;
  streamMenu: StudioMenu;
  runMenu: StudioMenu;
  windowEntries: StudioMenuEntry[];
  aboutEntry: StudioMenuEntry;
  appUpdateEntry: StudioMenuEntry;
  documentationEntry: StudioMenuEntry;
}

/** The layout menu's entries, the same under Window › Layout and behind the title row's layout button: the shapes, the presets saved, the first ones on the digits, and Save layout as preset…. */
export function studioLayoutMenuEntries(platform: TatolabPlatform, layout: StudioLayoutInTheMenus, commands: StudioMenuBarCommands): StudioMenuEntry[] {
  const presetEntries = layout.preset_titles_saved.map((title, presetIndex): StudioMenuEntry => {
    const onChosen = () => commands.applyTheSavedLayoutPreset(presetIndex);
    return presetIndex < STUDIO_LAYOUT_PRESETS_ON_A_DIGIT ? { kind: "command", label: title, shortcutHint: shortcutHint(platform, String(presetIndex + 1)), onChosen } : { kind: "command", label: title, onChosen };
  });
  return [
    ...STUDIO_LAYOUT_SHAPES.map(({ shape, title }): StudioMenuEntry => ({ kind: "command", label: title, picture: studioLayoutShapePicture(shape), onChosen: () => commands.shapeTheLayout(shape) })),
    { kind: "separator" },
    ...presetEntries,
    ...(presetEntries.length > 0 ? [{ kind: "separator" } as const] : []),
    { kind: "command", label: "Save layout as preset…", onChosen: commands.askToSaveTheLayoutAsAPreset },
  ];
}

function studioMenuParts(
  platform: TatolabPlatform,
  layout: StudioLayoutInTheMenus | null,
  streamTabs: StreamTabsInTheMenus,
  playbackControls: ProjectPlaybackControls,
  appUpdate: TatolabAppUpdateState,
  commands: StudioMenuBarCommands,
  settingsLabel: string,
): StudioMenuParts {
  const projectCommand = (label: string, onChosen: () => void, shortcut?: string): StudioMenuEntry => {
    if (layout === null) return shortcut === undefined ? { kind: "unavailable_command", label, unavailableBecause: NO_PROJECT_OPEN_REASON } : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause: NO_PROJECT_OPEN_REASON };
    return shortcut === undefined ? { kind: "command", label, onChosen } : { kind: "command", label, shortcutHint: shortcut, onChosen };
  };
  const streamTabCommand = (label: string, onChosen: () => void, unavailableBecause: string | null, shortcut?: string): StudioMenuEntry => {
    if (layout === null || unavailableBecause === null) return projectCommand(label, onChosen, shortcut);
    return shortcut === undefined ? { kind: "unavailable_command", label, unavailableBecause } : { kind: "unavailable_command", label, shortcutHint: shortcut, unavailableBecause };
  };
  const studioLayoutEntry: StudioMenuEntry =
    layout === null
      ? { kind: "unavailable_command", label: "Layout", unavailableBecause: "Open a project to lay out its areas" }
      : { kind: "submenu", label: "Layout", entries: studioLayoutMenuEntries(platform, layout, commands) };
  return {
    fileEntries: [
      { kind: "command", label: "Projects", onChosen: commands.showProjects },
      { kind: "separator" },
      { kind: "command", label: "Open project…", shortcutHint: shortcutHint(platform, "O"), onChosen: commands.openAProject },
      { kind: "command", label: "New project…", shortcutHint: shortcutHint(platform, "N"), onChosen: commands.createAProject },
      { kind: "separator" },
      { kind: "command", label: "Import project .zip…", onChosen: commands.importAProjectArchive },
      laterCommand("Save version…"),
      projectCommand("Marketplace…", () => commands.openModuleManager("marketplace")),
      projectCommand("Modules…", () => commands.openModuleManager("added_to_this_project")),
    ],
    undoAndRedoEntries: [projectCommand("Undo", commands.undoYourLastEdit, shortcutHint(platform, "Z")), projectCommand("Redo", commands.redoYourLastUndo, shiftedShortcutHint(platform, "Z"))],
    undoAndRedoBesideTextEditing: [projectCommand("Undo Your Last Edit", commands.undoYourLastEdit), projectCommand("Redo Your Last Undo", commands.redoYourLastUndo)],
    settingsEntry: { kind: "command", label: settingsLabel, shortcutHint: shortcutHint(platform, ","), onChosen: commands.openSettings },
    addMenu: { label: "Add", entries: [laterCommand("Node…", "Shift A"), laterCommand("Connection…"), laterCommand("Variable…"), laterCommand("Frame")] },
    streamMenu: {
      label: "Stream",
      entries: [
        projectCommand("New stream…", commands.createAStream),
        streamTabCommand("Rename stream…", commands.renameTheShownStream, streamTabs.shown_stream_display_name === null ? NO_STREAM_TAB_SHOWN_REASON : null),
        streamTabCommand("Delete stream…", commands.deleteTheShownStream, streamTabs.shown_stream_display_name === null ? NO_STREAM_TAB_SHOWN_REASON : null),
        { kind: "separator" },
        streamTabCommand("Close tab", commands.closeTheShownStreamTab, streamTabs.shown_stream_display_name === null ? NO_STREAM_TAB_SHOWN_REASON : null, layout === null ? undefined : shortcutHint(platform, "W")),
        streamTabCommand("Reopen closed tab", commands.reopenTheLastClosedStreamTab, streamTabs.has_a_closed_tab_to_reopen ? null : NO_CLOSED_STREAM_TAB_REASON, shiftedShortcutHint(platform, "T")),
        streamTabCommand("Next tab", () => commands.showTheStreamTabBeside("next"), streamTabs.open_tab_count < 2 ? ONE_STREAM_TAB_AT_MOST_REASON : null, controlShortcutHint(platform, "Tab", false)),
        streamTabCommand("Previous tab", () => commands.showTheStreamTabBeside("previous"), streamTabs.open_tab_count < 2 ? ONE_STREAM_TAB_AT_MOST_REASON : null, controlShortcutHint(platform, "Tab", true)),
      ],
    },
    runMenu: {
      label: "Run",
      entries: projectPlaybackMenuEntries(playbackControls, commands),
    },
    windowEntries: [studioLayoutEntry, laterCommand("Maximise area"), laterCommand("New window")],
    aboutEntry: { kind: "command", label: "About Tato Studio", onChosen: commands.openAbout },
    appUpdateEntry: appUpdateMenuEntry(appUpdate, commands),
    documentationEntry: laterCommand("Documentation"),
  };
}

/** The studio's menus along the top of its window, as Linux shows them, Window › Layout offering the shapes and the presets `layout` saved, or naming why it waits while no project is open, Run's playback entries following `playbackControls`, and Help's updates entry following `appUpdate`. */
export function studioMenuBarMenus(
  platform: TatolabPlatform,
  layout: StudioLayoutInTheMenus | null,
  streamTabs: StreamTabsInTheMenus,
  playbackControls: ProjectPlaybackControls,
  appUpdate: TatolabAppUpdateState,
  commands: StudioMenuBarCommands,
): StudioMenu[] {
  const parts = studioMenuParts(platform, layout, streamTabs, playbackControls, appUpdate, commands, "Settings…");
  return [
    { label: "File", entries: parts.fileEntries },
    { label: "Edit", entries: [...parts.undoAndRedoEntries, { kind: "separator" }, parts.settingsEntry] },
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

/** The studio's menus as macOS's one menu bar shows them, Run's playback entries following `playbackControls`, in the places a Mac app keeps them: About, the updates entry following `appUpdate`, and Settings in the app menu, the desktop's text editing in Edit, its window controls in Window. */
export function studioMenusInTheSystemMenuBar(
  layout: StudioLayoutInTheMenus | null,
  streamTabs: StreamTabsInTheMenus,
  playbackControls: ProjectPlaybackControls,
  appUpdate: TatolabAppUpdateState,
  commands: StudioMenuBarCommands,
): StudioMenuInTheSystemMenuBar[] {
  const parts = studioMenuParts("macos", layout, streamTabs, playbackControls, appUpdate, commands, "Settings…");
  return [
    {
      label: "Tato Studio",
      systemMenu: "app",
      entries: [parts.aboutEntry, parts.appUpdateEntry, { kind: "separator" }, parts.settingsEntry, { kind: "separator" }, { kind: "system_items", systemItems: "app_services_hide_and_quit" }],
    },
    { label: "File", systemMenu: null, entries: [...parts.fileEntries, { kind: "separator" }, { kind: "system_items", systemItems: layout === null ? "close_window" : "close_window_beside_close_tab" }] },
    { label: "Edit", systemMenu: null, entries: [{ kind: "system_items", systemItems: "text_editing" }, { kind: "separator" }, ...parts.undoAndRedoBesideTextEditing] },
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
