import { describe, expect, it, vi } from "vitest";
import type { TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";
import type { StudioMenuEntry } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import type { ProjectPlayback } from "../../shared/project_playback";
import { ALREADY_PLAYING_REASON, NOT_PLAYING_REASON, presentProjectPlaybackControls, STOPPING_REASON, type ProjectPlaybackControls } from "../presentation/project_playback_presentation";
import {
  APP_UPDATE_UNDER_WAY_REASON,
  NO_PROJECT_OPEN_REASON,
  studioLayoutMenuEntries,
  studioMenuBarMenus,
  studioMenusInTheSystemMenuBar,
  studioMenusSentToTheSystemMenuBar,
  NO_STREAM_TAB_SHOWN_REASON,
  type StreamTabsInTheMenus,
  type StudioLayoutInTheMenus,
  type StudioMenuBarCommands,
} from "./studio_menu_bar_model";

function commandsCounted(): StudioMenuBarCommands {
  return {
    showProjects: vi.fn(),
    openAProject: vi.fn(),
    importAProjectArchive: vi.fn(),
    createAProject: vi.fn(),
    openSettings: vi.fn(),
    openAbout: vi.fn(),
    checkForAppUpdates: vi.fn(),
    takeTheNewerAppVersion: vi.fn(),
    runTheProjectLive: vi.fn(),
    pauseTheProject: vi.fn(),
    stopTheProject: vi.fn(),
    undoYourLastEdit: vi.fn(),
    redoYourLastUndo: vi.fn(),
    openModuleManager: vi.fn(),
    createAStream: vi.fn(),
    renameTheShownStream: vi.fn(),
    deleteTheShownStream: vi.fn(),
    closeTheShownStreamTab: vi.fn(),
    reopenTheLastClosedStreamTab: vi.fn(),
    showTheStreamTabBeside: vi.fn(),
    shapeTheLayout: vi.fn(),
    applyTheSavedLayoutPreset: vi.fn(),
    askToSaveTheLayoutAsAPreset: vi.fn(),
  };
}

const LAYOUT_WITH_NO_PRESET: StudioLayoutInTheMenus = { preset_titles_saved: [] };

const NO_STREAM_TABS: StreamTabsInTheMenus = { shown_stream_display_name: null, open_tab_count: 0, has_a_closed_tab_to_reopen: false };

const UP_TO_DATE: TatolabAppUpdateState = { kind: "up_to_date" };

const STOPPED_PROJECT: ProjectPlaybackControls = presentProjectPlaybackControls({ kind: "listed", listed: { playback: "stopped", a_stream_has_failed: false } });

const NO_PROJECT_PLAYBACK: ProjectPlaybackControls = presentProjectPlaybackControls({ kind: "not_listed", because: NO_PROJECT_OPEN_REASON });

function playbackOf(playback: ProjectPlayback, aStreamHasFailed = false): ProjectPlaybackControls {
  return presentProjectPlaybackControls({ kind: "listed", listed: { playback, a_stream_has_failed: aStreamHasFailed } });
}

function entryOf(menus: ReturnType<typeof studioMenuBarMenus>, menuLabel: string, entryLabel: string): StudioMenuEntry | undefined {
  return menus.find((menu) => menu.label === menuLabel)?.entries.find((entry) => entry.kind !== "separator" && entry.label === entryLabel);
}

describe("the studio's File menu", () => {
  it("leads with Projects, which shows the Projects window with or without a project open", () => {
    for (const layoutInTheMenus of [null, LAYOUT_WITH_NO_PRESET]) {
      const commands = commandsCounted();
      const fileMenu = studioMenuBarMenus("macos", layoutInTheMenus, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands).find((menu) => menu.label === "File");
      const projects = fileMenu?.entries[0];
      expect(projects).toMatchObject({ kind: "command", label: "Projects" });
      if (projects?.kind === "command") projects.onChosen();
      expect(commands.showProjects).toHaveBeenCalledOnce();
    }
  });

  it("opens the Module manager window on the marketplace or on the project's modules while a project is open, and says why each waits while none is", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("macos", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands);
    const marketplace = entryOf(menus, "File", "Marketplace…");
    const modules = entryOf(menus, "File", "Modules…");
    if (marketplace?.kind !== "command" || modules?.kind !== "command") throw new Error("File › Marketplace… or Modules… is not a command");
    marketplace.onChosen();
    modules.onChosen();
    expect(commands.openModuleManager).toHaveBeenNthCalledWith(1, "marketplace");
    expect(commands.openModuleManager).toHaveBeenNthCalledWith(2, "added_to_this_project");
    expect(entryOf(menus, "File", "Module manager…")).toBeUndefined();
    for (const label of ["Marketplace…", "Modules…"]) {
      expect(entryOf(studioMenuBarMenus("macos", null, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands), "File", label)).toEqual({ kind: "unavailable_command", label, unavailableBecause: NO_PROJECT_OPEN_REASON });
    }
  });
});

describe("the studio's Edit menu", () => {
  it("undoes and redoes the person's edits while a project is open, and says why they wait while none is", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands);
    for (const entryLabel of ["Undo", "Redo"]) {
      const entry = entryOf(menus, "Edit", entryLabel);
      if (entry?.kind !== "command") throw new Error(`Edit › ${entryLabel} is not a command`);
      entry.onChosen();
    }
    expect(commands.undoYourLastEdit).toHaveBeenCalledOnce();
    expect(commands.redoYourLastUndo).toHaveBeenCalledOnce();
    expect(entryOf(studioMenuBarMenus("linux", null, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands), "Edit", "Undo")).toEqual({ kind: "unavailable_command", label: "Undo", shortcutHint: "Ctrl Z", unavailableBecause: NO_PROJECT_OPEN_REASON });
  });
});

describe("the layout menu", () => {
  it("lists the shapes, then the presets saved, the first nine on the digits, then Save layout as preset…", () => {
    const commands = commandsCounted();
    const presetTitles = ["Show night", "Rehearsal", "3", "4", "5", "6", "7", "8", "9", "Tenth"];
    const entries = studioLayoutMenuEntries("macos", { preset_titles_saved: presetTitles }, commands);
    const labels = entries.map((entry) => (entry.kind === "separator" ? "—" : entry.label));
    expect(labels).toEqual(["Single", "Two columns", "Two rows", "Three columns", "Grid 2×2", "Main + right", "Left + main + right", "Main + bottom", "—", ...presetTitles, "—", "Save layout as preset…"]);
    expect(entries.find((entry) => entry.kind === "command" && entry.label === "Rehearsal")).toMatchObject({ shortcutHint: "⌘2" });
    expect(entries.find((entry) => entry.kind === "command" && entry.label === "Tenth")).not.toHaveProperty("shortcutHint");
    for (const entry of entries) if (entry.kind === "command") entry.onChosen();
    expect(commands.shapeTheLayout).toHaveBeenCalledWith("grid");
    expect(commands.applyTheSavedLayoutPreset).toHaveBeenCalledWith(0);
    expect(commands.applyTheSavedLayoutPreset).toHaveBeenCalledWith(9);
    expect(commands.askToSaveTheLayoutAsAPreset).toHaveBeenCalledOnce();
  });

  it("goes from the shapes straight to Save layout as preset… while no preset is saved", () => {
    const labels = studioLayoutMenuEntries("linux", LAYOUT_WITH_NO_PRESET, commandsCounted()).map((entry) => (entry.kind === "separator" ? "—" : entry.label));
    expect(labels.slice(-3)).toEqual(["Main + bottom", "—", "Save layout as preset…"]);
  });

  it("draws each shape's picture, and no preset or Save layout as preset… with one", () => {
    const entries = studioLayoutMenuEntries("macos", { preset_titles_saved: ["Show night"] }, commandsCounted());
    const labelsWithAPicture = entries.flatMap((entry) => (entry.kind === "command" && entry.picture !== undefined ? [entry.label] : []));
    expect(labelsWithAPicture).toEqual(["Single", "Two columns", "Two rows", "Three columns", "Grid 2×2", "Main + right", "Left + main + right", "Main + bottom"]);
  });

  it("is the Window menu's Layout submenu", () => {
    const menus = studioMenuBarMenus("linux", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commandsCounted());
    const layoutEntry = entryOf(menus, "Window", "Layout");
    expect(layoutEntry?.kind === "submenu" ? layoutEntry.entries.length : 0).toBe(studioLayoutMenuEntries("linux", LAYOUT_WITH_NO_PRESET, commandsCounted()).length);
  });
});

describe("the studio's Run menu", () => {
  it("plays a stopped project, its Pause and Stop dim with why", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands);
    const play = entryOf(menus, "Run", "Play");
    if (play?.kind !== "command") throw new Error("Run › Play is not a command");
    play.onChosen();
    expect(play).toMatchObject({ shortcutHint: "F5" });
    expect(commands.runTheProjectLive).toHaveBeenCalledOnce();
    expect(entryOf(menus, "Run", "Pause")).toEqual({ kind: "unavailable_command", label: "Pause", unavailableBecause: NOT_PLAYING_REASON });
    expect(entryOf(menus, "Run", "Stop")).toMatchObject({ kind: "unavailable_command", shortcutHint: "Shift F5" });
  });

  it("pauses and stops a playing project, its Play dim", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, playbackOf("playing"), UP_TO_DATE, commands);
    for (const entryLabel of ["Pause", "Stop"]) {
      const entry = entryOf(menus, "Run", entryLabel);
      if (entry?.kind !== "command") throw new Error(`Run › ${entryLabel} is not a command`);
      entry.onChosen();
    }
    expect(commands.pauseTheProject).toHaveBeenCalledOnce();
    expect(commands.stopTheProject).toHaveBeenCalledOnce();
    expect(entryOf(menus, "Run", "Play")).toEqual({ kind: "unavailable_command", label: "Play", shortcutHint: "F5", unavailableBecause: ALREADY_PLAYING_REASON });
  });

  it("offers Resume in Play's place while the project is paused", () => {
    const menus = studioMenuBarMenus("macos", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, playbackOf("paused"), UP_TO_DATE, commandsCounted());
    expect(entryOf(menus, "Run", "Resume")).toMatchObject({ kind: "command", shortcutHint: "F5" });
    expect(entryOf(menus, "Run", "Pause")).toMatchObject({ kind: "unavailable_command" });
    expect(entryOf(menus, "Run", "Stop")).toMatchObject({ kind: "command" });
  });

  it("dims every playback entry while the project is stopping", () => {
    const menus = studioMenuBarMenus("macos", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, playbackOf("stopping"), UP_TO_DATE, commandsCounted());
    for (const entryLabel of ["Play", "Pause", "Stop"]) expect(entryOf(menus, "Run", entryLabel)).toMatchObject({ kind: "unavailable_command", unavailableBecause: STOPPING_REASON });
  });

  it("says why they wait while no project is open", () => {
    const menus = studioMenuBarMenus("macos", null, NO_STREAM_TABS, NO_PROJECT_PLAYBACK, UP_TO_DATE, commandsCounted());
    expect(entryOf(menus, "Run", "Play")).toEqual({ kind: "unavailable_command", label: "Play", shortcutHint: "F5", unavailableBecause: NO_PROJECT_OPEN_REASON });
  });
});

describe("Help's updates entry", () => {
  it("follows About Tato Studio, checks for updates, and turns into Restart to Update once a newer version is staged", () => {
    const commands = commandsCounted();
    const helpEntries = studioMenuBarMenus("linux", null, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands).find((menu) => menu.label === "Help")?.entries ?? [];
    expect(helpEntries.slice(0, 2)).toMatchObject([
      { kind: "command", label: "About Tato Studio" },
      { kind: "command", label: "Check for Updates…" },
    ]);
    const checkForUpdates = entryOf(studioMenuBarMenus("linux", null, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands), "Help", "Check for Updates…");
    if (checkForUpdates?.kind !== "command") throw new Error("Help › Check for Updates… is not a command");
    checkForUpdates.onChosen();
    expect(commands.checkForAppUpdates).toHaveBeenCalledOnce();
    const restartToUpdate = entryOf(studioMenuBarMenus("macos", null, NO_STREAM_TABS, STOPPED_PROJECT, { kind: "ready_to_restart", version: "0.47.0" }, commands), "Help", "Restart to Update to 0.47.0");
    if (restartToUpdate?.kind !== "command") throw new Error("Help › Restart to Update is not a command");
    restartToUpdate.onChosen();
    expect(commands.takeTheNewerAppVersion).toHaveBeenCalledOnce();
  });

  it("is dim, with why, while an update is under way and in an app that cannot update itself", () => {
    const commands = commandsCounted();
    expect(entryOf(studioMenuBarMenus("macos", null, NO_STREAM_TABS, STOPPED_PROJECT, { kind: "downloading", version: "0.47.0", percent: 42 }, commands), "Help", "Downloading Update…")).toEqual({
      kind: "unavailable_command",
      label: "Downloading Update…",
      unavailableBecause: APP_UPDATE_UNDER_WAY_REASON,
    });
    expect(entryOf(studioMenuBarMenus("macos", null, NO_STREAM_TABS, STOPPED_PROJECT, { kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." }, commands), "Help", "Check for Updates…")).toEqual({
      kind: "unavailable_command",
      label: "Check for Updates…",
      unavailableBecause: "Only a packaged Tato Studio updates itself.",
    });
  });
});

describe("the studio's menus in macOS's system menu bar", () => {
  it("leave ⌘W to Close Window while no project is open, and give it to Close tab while one is", () => {
    const menusWith = (layoutInTheMenus: StudioLayoutInTheMenus | null) => studioMenusSentToTheSystemMenuBar(studioMenusInTheSystemMenuBar(layoutInTheMenus, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commandsCounted())).menus;
    const closeEntriesOf = (layoutInTheMenus: StudioLayoutInTheMenus | null) => {
      const menus = menusWith(layoutInTheMenus);
      const closeWindow = menus.find((menu) => menu.label === "File")?.entries.at(-1);
      const closeTab = menus.find((menu) => menu.label === "Stream")?.entries.find((entry) => entry.kind === "command" && entry.label === "Close tab");
      return { closeWindow, closeTabShortcut: closeTab?.kind === "command" ? closeTab.shortcut_hint : undefined };
    };
    expect(closeEntriesOf(null)).toEqual({ closeWindow: { kind: "system_items", system_items: "close_window" }, closeTabShortcut: null });
    expect(closeEntriesOf(LAYOUT_WITH_NO_PRESET)).toEqual({ closeWindow: { kind: "system_items", system_items: "close_window_beside_close_tab" }, closeTabShortcut: "⌘W" });
  });

  it("keep About and Settings… in the app menu, and the desktop's own items where a Mac app keeps them", () => {
    const { menus } = studioMenusSentToTheSystemMenuBar(studioMenusInTheSystemMenuBar(LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commandsCounted()));
    const labelsOf = (menuLabel: string) =>
      menus.find((menu) => menu.label === menuLabel)?.entries.map((entry) => (entry.kind === "system_items" ? `[${entry.system_items}]` : entry.kind === "separator" ? "—" : entry.label));
    expect(labelsOf("Tato Studio")).toEqual(["About Tato Studio", "Check for Updates…", "—", "Settings…", "—", "[app_services_hide_and_quit]"]);
    expect(labelsOf("File")?.slice(-2)).toEqual(["—", "[close_window_beside_close_tab]"]);
    expect(labelsOf("Edit")).toEqual(["[text_editing]", "—", "Undo Your Last Edit", "Redo Your Last Undo"]);
    expect(labelsOf("View")).toEqual(["[full_screen]"]);
    expect(labelsOf("Window")).toEqual(["[window_arrangement]", "—", "Layout", "Maximise area", "New window", "—", "[bring_all_to_front]"]);
    expect(labelsOf("Help")).toEqual(["Documentation"]);
  });

  it("send each entry under the path of labels down to it, running its command when chosen there, and a dim one with why", () => {
    const commands = commandsCounted();
    const { menus, onChosenByEntryId } = studioMenusSentToTheSystemMenuBar(studioMenusInTheSystemMenuBar(null, NO_STREAM_TABS, NO_PROJECT_PLAYBACK, UP_TO_DATE, commands));
    onChosenByEntryId.get("File › Open project…")?.();
    onChosenByEntryId.get("Tato Studio › About Tato Studio")?.();
    onChosenByEntryId.get("Tato Studio › Check for Updates…")?.();
    expect(commands.openAProject).toHaveBeenCalledOnce();
    expect(commands.openAbout).toHaveBeenCalledOnce();
    expect(commands.checkForAppUpdates).toHaveBeenCalledOnce();
    expect(menus.find((menu) => menu.label === "Run")?.entries[0]).toEqual({
      kind: "command",
      entry_id: "Run › Play",
      label: "Play",
      shortcut_hint: "F5",
      unavailable_because: NO_PROJECT_OPEN_REASON,
    });
    expect(onChosenByEntryId.has("Run › Play")).toBe(false);
  });
});

describe("the studio's Stream menu", () => {
  it("makes a stream with no shortcut, acts on the shown tab's stream, and moves between, closes and reopens tabs", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("macos", LAYOUT_WITH_NO_PRESET, { shown_stream_display_name: "main", open_tab_count: 2, has_a_closed_tab_to_reopen: true }, STOPPED_PROJECT, UP_TO_DATE, commands);
    const streamMenu = menus.find((menu) => menu.label === "Stream")?.entries ?? [];
    expect(streamMenu.map((entry) => (entry.kind === "separator" ? "—" : [entry.label, entry.kind, "shortcutHint" in entry ? entry.shortcutHint : null]))).toEqual([
      ["New stream…", "command", null],
      ["Rename stream…", "command", null],
      ["Delete stream…", "command", null],
      "—",
      ["Close tab", "command", "⌘W"],
      ["Reopen closed tab", "command", "⇧⌘T"],
      ["Next tab", "command", "⌃Tab"],
      ["Previous tab", "command", "⌃⇧Tab"],
    ]);
    for (const entry of streamMenu) if (entry.kind === "command") entry.onChosen();
    expect(commands.createAStream).toHaveBeenCalledOnce();
    expect(commands.renameTheShownStream).toHaveBeenCalledOnce();
    expect(commands.deleteTheShownStream).toHaveBeenCalledOnce();
    expect(commands.closeTheShownStreamTab).toHaveBeenCalledOnce();
    expect(commands.reopenTheLastClosedStreamTab).toHaveBeenCalledOnce();
    expect(commands.showTheStreamTabBeside).toHaveBeenNthCalledWith(1, "next");
    expect(commands.showTheStreamTabBeside).toHaveBeenNthCalledWith(2, "previous");
  });

  it("says why each entry waits while no project is open or no tab is shown, and File no longer lists New stream", () => {
    const commands = commandsCounted();
    expect(entryOf(studioMenuBarMenus("linux", null, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands), "Stream", "New stream…")).toEqual({ kind: "unavailable_command", label: "New stream…", unavailableBecause: NO_PROJECT_OPEN_REASON });
    const menus = studioMenuBarMenus("linux", LAYOUT_WITH_NO_PRESET, NO_STREAM_TABS, STOPPED_PROJECT, UP_TO_DATE, commands);
    expect(entryOf(menus, "Stream", "Delete stream…")).toEqual({ kind: "unavailable_command", label: "Delete stream…", unavailableBecause: NO_STREAM_TAB_SHOWN_REASON });
    expect(entryOf(menus, "Stream", "Close tab")).toEqual({ kind: "unavailable_command", label: "Close tab", shortcutHint: "Ctrl W", unavailableBecause: NO_STREAM_TAB_SHOWN_REASON });
    expect(entryOf(menus, "Stream", "Previous tab")).toMatchObject({ kind: "unavailable_command", shortcutHint: "Ctrl Shift Tab" });
    expect(entryOf(menus, "File", "New stream")).toBeUndefined();
    expect(entryOf(menus, "Stream", "Run on…")).toBeUndefined();
  });
});
