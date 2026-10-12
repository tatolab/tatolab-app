import { describe, expect, it } from "vitest";
import type { TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import {
  holdsWindowShortcutModifier,
  platformOf,
  presentCommandLineTool,
  presentPlatform,
  windowDragRegionAttribute,
} from "./platform_presentation";

function statusOn(platform: unknown): TatolabStatus {
  return {
    app_version: "0.45.0",
    platform: platform as TatolabPlatform,
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: "ada-workstation",
    streams: [],
    machine_setup_state: "complete",
    command_line_tool_linked_at: null,
  };
}

const NO_MODIFIERS = { metaKey: false, ctrlKey: false, altKey: false };

describe("platformOf", () => {
  it("reads the platform the status names", () => {
    expect(platformOf(statusOn("linux"))).toBe("linux");
    expect(platformOf(statusOn("macos"))).toBe("macos");
  });

  it("reads a status that names no platform, or one newer than this window, as macOS", () => {
    expect(platformOf(statusOn(undefined))).toBe("macos");
    expect(platformOf(statusOn("windows"))).toBe("macos");
  });
});

describe("presentPlatform", () => {
  it("keeps the traffic-light band and the top bands' dragging for macOS's overlay title bar only", () => {
    expect(presentPlatform("macos").hasOverlayTitleBar).toBe(true);
    expect(presentPlatform("linux").hasOverlayTitleBar).toBe(false);
    expect(windowDragRegionAttribute("macos", "deep")).toBe("deep");
    expect(windowDragRegionAttribute("macos", "self")).toBe("");
    expect(windowDragRegionAttribute("linux", "deep")).toBeNull();
    expect(windowDragRegionAttribute("linux", "self")).toBeNull();
  });

  it("offers Login Items on macOS only", () => {
    expect(presentPlatform("macos").showsLoginItems).toBe(true);
    expect(presentPlatform("linux").showsLoginItems).toBe(false);
  });

  it("says what Run Tatolab runs in the platform's own words", () => {
    expect(presentPlatform("macos").runTatolabExplanation).toMatch(/^Starts Tatolab at login/);
    expect(presentPlatform("linux").runTatolabExplanation).toMatch(/^Runs tatolabd\.service, your systemd user service, at login/);
  });

  it("names the machine, and where the app's icon lives, as each platform does", () => {
    expect(presentPlatform("macos").thisMachineAtSentenceStart).toBe("This Mac");
    expect(presentPlatform("linux").thisMachineAtSentenceStart).toBe("This computer");
    expect(presentPlatform("macos").quitTatolabExplanation).toContain("menu bar icon");
    expect(presentPlatform("linux").quitTatolabExplanation).toContain("tray icon");
  });
});

describe("holdsWindowShortcutModifier", () => {
  it("takes ⌘ on macOS and Ctrl on Linux", () => {
    expect(holdsWindowShortcutModifier("macos", { ...NO_MODIFIERS, metaKey: true })).toBe(true);
    expect(holdsWindowShortcutModifier("macos", { ...NO_MODIFIERS, ctrlKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", { ...NO_MODIFIERS, ctrlKey: true })).toBe(true);
    expect(holdsWindowShortcutModifier("linux", { ...NO_MODIFIERS, metaKey: true })).toBe(false);
  });

  it("refuses a chord with another modifier or none", () => {
    expect(holdsWindowShortcutModifier("macos", { metaKey: true, ctrlKey: true, altKey: false })).toBe(false);
    expect(holdsWindowShortcutModifier("macos", { metaKey: true, ctrlKey: false, altKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", { metaKey: false, ctrlKey: true, altKey: true })).toBe(false);
    expect(holdsWindowShortcutModifier("linux", NO_MODIFIERS)).toBe(false);
  });
});

describe("presentCommandLineTool", () => {
  it("shows macOS's link to the copy inside the app", () => {
    expect(presentCommandLineTool("macos", "/usr/local/bin/tatolab")).toEqual({
      isLinked: true,
      shownValue: "/usr/local/bin/tatolab",
      explanation: "Linked to the copy inside Tatolab.app, so it works in every terminal.",
    });
    expect(presentCommandLineTool("macos", null)).toMatchObject({ isLinked: false, shownValue: "Not linked" });
  });

  it("shows the installer's link on Linux with its home shortened", () => {
    expect(presentCommandLineTool("linux", "/home/ada/.local/bin/tatolab")).toEqual({
      isLinked: true,
      shownValue: "~/.local/bin/tatolab",
      explanation: "Installed with the runtime. It works in any terminal with ~/.local/bin on its PATH.",
    });
    expect(presentCommandLineTool("linux", null)).toEqual({
      isLinked: false,
      shownValue: "Not installed",
      explanation: "The installer puts it in ~/.local/bin with the runtime.",
    });
  });
});
