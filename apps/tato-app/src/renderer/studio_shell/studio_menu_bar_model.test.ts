import { describe, expect, it, vi } from "vitest";
import type { TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";
import type { StudioMenuEntry } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import {
  APP_UPDATE_UNDER_WAY_REASON,
  NO_PROJECT_OPEN_REASON,
  studioMenuBarMenus,
  studioMenusInTheSystemMenuBar,
  studioMenusSentToTheSystemMenuBar,
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
    chooseLayout: vi.fn(),
    runTheProjectLive: vi.fn(),
    stopTheProject: vi.fn(),
    undoYourLastEdit: vi.fn(),
    redoYourLastUndo: vi.fn(),
    openModuleManager: vi.fn(),
  };
}

const UP_TO_DATE: TatolabAppUpdateState = { kind: "up_to_date" };

function entryOf(menus: ReturnType<typeof studioMenuBarMenus>, menuLabel: string, entryLabel: string): StudioMenuEntry | undefined {
  return menus.find((menu) => menu.label === menuLabel)?.entries.find((entry) => entry.kind !== "separator" && entry.label === entryLabel);
}

describe("the studio's File menu", () => {
  it("leads with Projects, which shows the Projects window with or without a project open", () => {
    for (const chosenLayout of [null, "code" as const]) {
      const commands = commandsCounted();
      const fileMenu = studioMenuBarMenus("macos", chosenLayout, UP_TO_DATE, commands).find((menu) => menu.label === "File");
      const projects = fileMenu?.entries[0];
      expect(projects).toMatchObject({ kind: "command", label: "Projects" });
      if (projects?.kind === "command") projects.onChosen();
      expect(commands.showProjects).toHaveBeenCalledOnce();
    }
  });

  it("opens the Module manager window on the marketplace or on the project's modules while a project is open, and says why each waits while none is", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("macos", "build", UP_TO_DATE, commands);
    const marketplace = entryOf(menus, "File", "Marketplace…");
    const modules = entryOf(menus, "File", "Modules…");
    if (marketplace?.kind !== "command" || modules?.kind !== "command") throw new Error("File › Marketplace… or Modules… is not a command");
    marketplace.onChosen();
    modules.onChosen();
    expect(commands.openModuleManager).toHaveBeenNthCalledWith(1, "marketplace");
    expect(commands.openModuleManager).toHaveBeenNthCalledWith(2, "added_to_this_project");
    expect(entryOf(menus, "File", "Module manager…")).toBeUndefined();
    for (const label of ["Marketplace…", "Modules…"]) {
      expect(entryOf(studioMenuBarMenus("macos", null, UP_TO_DATE, commands), "File", label)).toEqual({ kind: "unavailable_command", label, unavailableBecause: NO_PROJECT_OPEN_REASON });
    }
  });
});

describe("the studio's Edit menu", () => {
  it("undoes and redoes the person's edits while a project is open, and says why they wait while none is", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", "build", UP_TO_DATE, commands);
    for (const entryLabel of ["Undo", "Redo"]) {
      const entry = entryOf(menus, "Edit", entryLabel);
      if (entry?.kind !== "command") throw new Error(`Edit › ${entryLabel} is not a command`);
      entry.onChosen();
    }
    expect(commands.undoYourLastEdit).toHaveBeenCalledOnce();
    expect(commands.redoYourLastUndo).toHaveBeenCalledOnce();
    expect(entryOf(studioMenuBarMenus("linux", null, UP_TO_DATE, commands), "Edit", "Undo")).toEqual({ kind: "unavailable_command", label: "Undo", shortcutHint: "Ctrl Z", unavailableBecause: NO_PROJECT_OPEN_REASON });
  });
});

describe("the studio's Run and Stream menus", () => {
  it("runs and stops while a project is open", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", "code", UP_TO_DATE, commands);
    for (const [menuLabel, entryLabel] of [
      ["Run", "Live"],
      ["Run", "Stop"],
    ] as const) {
      const entry = entryOf(menus, menuLabel, entryLabel);
      if (entry?.kind !== "command") throw new Error(`${menuLabel} › ${entryLabel} is not a command`);
      entry.onChosen();
    }
    expect(entryOf(menus, "Run", "Live")).toMatchObject({ shortcutHint: "F5" });
    expect(entryOf(menus, "Run", "Stop")).toMatchObject({ shortcutHint: "Shift F5" });
    expect(commands.runTheProjectLive).toHaveBeenCalledOnce();
    expect(commands.stopTheProject).toHaveBeenCalledOnce();
  });

  it("says why they wait while no project is open", () => {
    const menus = studioMenuBarMenus("macos", null, UP_TO_DATE, commandsCounted());
    expect(entryOf(menus, "Run", "Live")).toEqual({ kind: "unavailable_command", label: "Live", shortcutHint: "F5", unavailableBecause: NO_PROJECT_OPEN_REASON });
  });
});

describe("Help's updates entry", () => {
  it("follows About Tato Studio, checks for updates, and turns into Restart to Update once a newer version is staged", () => {
    const commands = commandsCounted();
    const helpEntries = studioMenuBarMenus("linux", null, UP_TO_DATE, commands).find((menu) => menu.label === "Help")?.entries ?? [];
    expect(helpEntries.slice(0, 2)).toMatchObject([
      { kind: "command", label: "About Tato Studio" },
      { kind: "command", label: "Check for Updates…" },
    ]);
    const checkForUpdates = entryOf(studioMenuBarMenus("linux", null, UP_TO_DATE, commands), "Help", "Check for Updates…");
    if (checkForUpdates?.kind !== "command") throw new Error("Help › Check for Updates… is not a command");
    checkForUpdates.onChosen();
    expect(commands.checkForAppUpdates).toHaveBeenCalledOnce();
    const restartToUpdate = entryOf(studioMenuBarMenus("macos", null, { kind: "ready_to_restart", version: "0.47.0" }, commands), "Help", "Restart to Update to 0.47.0");
    if (restartToUpdate?.kind !== "command") throw new Error("Help › Restart to Update is not a command");
    restartToUpdate.onChosen();
    expect(commands.takeTheNewerAppVersion).toHaveBeenCalledOnce();
  });

  it("is dim, with why, while an update is under way and in an app that cannot update itself", () => {
    const commands = commandsCounted();
    expect(entryOf(studioMenuBarMenus("macos", null, { kind: "downloading", version: "0.47.0", percent: 42 }, commands), "Help", "Downloading Update…")).toEqual({
      kind: "unavailable_command",
      label: "Downloading Update…",
      unavailableBecause: APP_UPDATE_UNDER_WAY_REASON,
    });
    expect(entryOf(studioMenuBarMenus("macos", null, { kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." }, commands), "Help", "Check for Updates…")).toEqual({
      kind: "unavailable_command",
      label: "Check for Updates…",
      unavailableBecause: "Only a packaged Tato Studio updates itself.",
    });
  });
});

describe("the studio's menus in macOS's system menu bar", () => {
  it("keep About and Settings… in the app menu, and the desktop's own items where a Mac app keeps them", () => {
    const { menus } = studioMenusSentToTheSystemMenuBar(studioMenusInTheSystemMenuBar("build", UP_TO_DATE, commandsCounted()));
    const labelsOf = (menuLabel: string) =>
      menus.find((menu) => menu.label === menuLabel)?.entries.map((entry) => (entry.kind === "system_items" ? `[${entry.system_items}]` : entry.kind === "separator" ? "—" : entry.label));
    expect(labelsOf("Tato Studio")).toEqual(["About Tato Studio", "Check for Updates…", "—", "Settings…", "—", "[app_services_hide_and_quit]"]);
    expect(labelsOf("File")?.slice(-2)).toEqual(["—", "[close_window]"]);
    expect(labelsOf("Edit")).toEqual(["[text_editing]", "—", "Undo Your Last Edit", "Redo Your Last Undo"]);
    expect(labelsOf("View")).toEqual(["[full_screen]"]);
    expect(labelsOf("Window")).toEqual(["[window_arrangement]", "—", "Layout", "Save layout as…", "Maximise area", "New window", "—", "[bring_all_to_front]"]);
    expect(labelsOf("Help")).toEqual(["Documentation"]);
  });

  it("send each entry under the path of labels down to it, running its command when chosen there, and a dim one with why", () => {
    const commands = commandsCounted();
    const { menus, onChosenByEntryId } = studioMenusSentToTheSystemMenuBar(studioMenusInTheSystemMenuBar(null, UP_TO_DATE, commands));
    onChosenByEntryId.get("File › Open project…")?.();
    onChosenByEntryId.get("Tato Studio › About Tato Studio")?.();
    onChosenByEntryId.get("Tato Studio › Check for Updates…")?.();
    expect(commands.openAProject).toHaveBeenCalledOnce();
    expect(commands.openAbout).toHaveBeenCalledOnce();
    expect(commands.checkForAppUpdates).toHaveBeenCalledOnce();
    expect(menus.find((menu) => menu.label === "Run")?.entries[0]).toEqual({
      kind: "command",
      entry_id: "Run › Live",
      label: "Live",
      shortcut_hint: "F5",
      unavailable_because: NO_PROJECT_OPEN_REASON,
    });
    expect(onChosenByEntryId.has("Run › Live")).toBe(false);
  });
});
