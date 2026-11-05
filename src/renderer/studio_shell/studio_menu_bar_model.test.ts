import { describe, expect, it, vi } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import type { StudioMenuEntry } from "../design_system/menu_bar";
import { NO_WORKSPACE_OPEN_REASON, studioMenuBarMenus, type StudioMenuBarCommands } from "./studio_menu_bar_model";
import { streamsOfTheProjectToStop } from "./studio_window_model";

function commandsCounted(): StudioMenuBarCommands {
  return {
    openAWorkspace: vi.fn(),
    createAWorkspace: vi.fn(),
    openPreferences: vi.fn(),
    openAbout: vi.fn(),
    chooseLayout: vi.fn(),
    runTheWorkspaceLive: vi.fn(),
    stopTheWorkspace: vi.fn(),
    openTheWorkspaceStreamPy: vi.fn(),
  };
}

function entryOf(menus: ReturnType<typeof studioMenuBarMenus>, menuLabel: string, entryLabel: string): StudioMenuEntry | undefined {
  return menus.find((menu) => menu.label === menuLabel)?.entries.find((entry) => entry.kind !== "separator" && entry.label === entryLabel);
}

describe("the studio's Run and Stream menus", () => {
  it("runs, stops and opens stream.py while a workspace is open", () => {
    const commands = commandsCounted();
    const menus = studioMenuBarMenus("linux", "code", commands);
    for (const [menuLabel, entryLabel] of [
      ["Run", "Live"],
      ["Run", "Stop"],
      ["Stream", "Open stream.py"],
    ] as const) {
      const entry = entryOf(menus, menuLabel, entryLabel);
      if (entry?.kind !== "command") throw new Error(`${menuLabel} › ${entryLabel} is not a command`);
      entry.onChosen();
    }
    expect(entryOf(menus, "Run", "Live")).toMatchObject({ shortcutHint: "F5" });
    expect(entryOf(menus, "Run", "Stop")).toMatchObject({ shortcutHint: "Shift F5" });
    expect(commands.runTheWorkspaceLive).toHaveBeenCalledOnce();
    expect(commands.stopTheWorkspace).toHaveBeenCalledOnce();
    expect(commands.openTheWorkspaceStreamPy).toHaveBeenCalledOnce();
  });

  it("says why they wait while no workspace is open", () => {
    const menus = studioMenuBarMenus("macos", null, commandsCounted());
    expect(entryOf(menus, "Run", "Live")).toEqual({ kind: "unavailable_command", label: "Live", shortcutHint: "F5", unavailableBecause: NO_WORKSPACE_OPEN_REASON });
    expect(entryOf(menus, "Stream", "Open stream.py")).toEqual({ kind: "unavailable_command", label: "Open stream.py", unavailableBecause: NO_WORKSPACE_OPEN_REASON });
  });
});

describe("Run › Stop", () => {
  function listing(stream: string, projectDirectory: string, state: string): ListedStream {
    return {
      stream,
      display_name: stream,
      location: { project_directory: projectDirectory, stream_function: `stream:${stream}` },
      state,
      node_count: null,
      failed_because: null,
      capture_devices_whose_access_was_never_asked_for: [],
      action: null,
      step: null,
    };
  }

  it("stops the workspace project's running and preparing streams, and nothing of another project", () => {
    const streams = [listing("main", "/p", "running"), listing("two", "/p", "preparing"), listing("old", "/p", "stopped"), listing("cam", "/camera", "running")];
    expect(streamsOfTheProjectToStop({ kind: "listed", streams }, "/p")).toEqual(["main", "two"]);
    expect(streamsOfTheProjectToStop({ kind: "not_listed", because: "Stopped" }, "/p")).toEqual([]);
  });
});
