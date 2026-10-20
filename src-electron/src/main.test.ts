// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { beforeEach, describe, expect, test } from "vitest";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp } from "./main.js";
import { MACOS_MAIN_WINDOW_CHROME, MACOS_TRAY_ICON_IMAGE, setMacosDockIconVisible } from "./platform/macos/mod.js";
import { LINUX_MAIN_WINDOW_CHROME, LINUX_TRAY_ICON_IMAGE, setLinuxDockIconVisible } from "./platform/linux/mod.js";
import type { TatolabPlatformItems } from "./platform/mod.js";

const MACOS_PLATFORM_ITEMS: TatolabPlatformItems = {
  platform: "macos",
  trayIconImage: MACOS_TRAY_ICON_IMAGE,
  mainWindowChrome: MACOS_MAIN_WINDOW_CHROME,
  keepsTheDefaultApplicationMenu: true,
  setDockIconVisible: setMacosDockIconVisible,
};
const LINUX_PLATFORM_ITEMS: TatolabPlatformItems = {
  platform: "linux",
  trayIconImage: LINUX_TRAY_ICON_IMAGE,
  mainWindowChrome: LINUX_MAIN_WINDOW_CHROME,
  keepsTheDefaultApplicationMenu: false,
  setDockIconVisible: setLinuxDockIconVisible,
};

describe("the app on macOS", () => {
  let fakeShell: FakeTatolabElectronAppShell;
  beforeEach(async () => {
    fakeShell = new FakeTatolabElectronAppShell();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  });

  test("opening the app puts it in the tray and shows its one window, with the Dock icon, under the hidden title bar", () => {
    expect(fakeShell.askedFor()).toEqual(["show_tray_menu", "set_activation_policy", "create_main_window", "unminimize", "show", "focus"]);
    expect(fakeShell.records[1]).toEqual({ asked: "set_activation_policy", activationPolicy: "regular" });
    expect(fakeShell.records[2]).toEqual({
      asked: "create_main_window",
      mainWindowSpecification: {
        title: "Tatolab",
        width: 1040,
        height: 700,
        minimumWidth: 860,
        minimumHeight: 580,
        chrome: { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 26 } },
      },
    });
  });

  test("closing the window hides it and the Dock icon, and the app stays in the tray", () => {
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("hide_instead");
    expect(fakeShell.records).toEqual([{ asked: "hide" }, { asked: "set_activation_policy", activationPolicy: "accessory" }]);
  });

  test("opening the app again shows the same window rather than a second one", () => {
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.openTheAppAgain();
    expect(fakeShell.askedFor()).toEqual(["set_activation_policy", "unminimize", "show", "focus"]);
  });

  test("Open Tatolab in the tray shows the window", () => {
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("open_tatolab");
    expect(fakeShell.askedFor()).toEqual(["set_activation_policy", "unminimize", "show", "focus"]);
  });

  test("Quit Tatolab in the tray quits only the app and lets the window close", () => {
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("quit_tatolab");
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]);
    expect(fakeShell.writtenLogLines).toContain(" INFO quitting the Tatolab app; the runtime keeps running");
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
  });

  test("a quit the system asks for, such as Cmd-Q, lets the window close rather than hide", () => {
    fakeShell.beginQuitting();
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
    expect(fakeShell.records).toEqual([]);
  });
});

describe("the app on Linux", () => {
  test("the window keeps the desktop's title bar with no menu bar, and nothing asks for a Dock", async () => {
    const fakeShell = new FakeTatolabElectronAppShell();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.askedFor()).toEqual(["remove_the_application_menu", "show_tray_menu", "create_main_window", "unminimize", "show", "focus"]);
    expect(fakeShell.records[2]).toMatchObject({ mainWindowSpecification: { chrome: { titleBarStyle: "default" } } });
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("hide_instead");
    expect(fakeShell.records).toEqual([{ asked: "hide" }]);
  });
});

describe("starting the app", () => {
  test("a second launch hands itself to the running app and exits without a window or a tray icon", async () => {
    const fakeShell = new FakeTatolabElectronAppShell();
    fakeShell.holdsTheSingleInstanceLock = false;
    await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]);
  });

  test("an OS Tatolab does not run on is refused with why, and the app exits failed", async () => {
    const fakeShell = new FakeTatolabElectronAppShell();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, null, fakeShell.tatolabAppLog);
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 1 }]);
    expect(fakeShell.writtenLogLines[0]).toContain("Tatolab runs on macOS and Linux only");
  });

  test("a window that cannot be created is logged, the Dock icon goes again, and the tray still serves", async () => {
    const fakeShell = new FakeTatolabElectronAppShell();
    fakeShell.mainWindowCreationFailure = "no display";
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.records).toEqual([
      { asked: "show_tray_menu", trayMenuItems: expect.any(Array) },
      { asked: "set_activation_policy", activationPolicy: "regular" },
      { asked: "set_activation_policy", activationPolicy: "accessory" },
    ]);
    expect(fakeShell.writtenLogLines).toContain("ERROR the Tatolab window could not be created failure=\"no display\"");
  });
});
