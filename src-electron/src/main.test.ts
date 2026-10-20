// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import { FakeTatolabMachineSetup } from "./fake_tatolab_platform_for_this_build.js";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp, type TatolabRunningApp } from "./main.js";
import { TatolabMainWindow } from "./tatolab_main_window.js";
import { TatolabTrayMenu } from "./tatolab_tray_menu.js";
import { tatolabPlatformItemsFor } from "./platform/mod.js";

const MACOS_PLATFORM_ITEMS = tatolabPlatformItemsFor("darwin");
const LINUX_PLATFORM_ITEMS = tatolabPlatformItemsFor("linux");

const startedFakeShells: FakeTatolabElectronAppShell[] = [];

afterEach(async () => {
  for (const startedFakeShell of startedFakeShells.splice(0)) {
    startedFakeShell.beginQuitting();
    await startedFakeShell.removeTheAppConfigDirectory();
  }
});

/** A fake shell for a test, which quits its app and removes its config directory after the test. */
function fakeShellQuitAfterTheTest(): FakeTatolabElectronAppShell {
  const fakeShell = new FakeTatolabElectronAppShell();
  startedFakeShells.push(fakeShell);
  return fakeShell;
}

/** The status the app published first, once its first status round is done. */
async function theFirstPublishedStatus(tatolabRunningApp: TatolabRunningApp | null): Promise<TatolabStatus | null> {
  return (await tatolabRunningApp?.statusPublisher.lastPublishedStatusWaitingUpTo(5_000)) ?? null;
}

describe("the app on macOS", () => {
  let fakeShell: FakeTatolabElectronAppShell;
  let tatolabRunningApp: TatolabRunningApp | null;
  beforeEach(async () => {
    fakeShell = fakeShellQuitAfterTheTest();
    tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  });

  test("the running app hands back its window and tray for the process to hold", async () => {
    const otherFakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(otherFakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, otherFakeShell.tatolabAppLog);
    expect(tatolabRunningApp?.tatolabTrayMenu).toBeInstanceOf(TatolabTrayMenu);
    expect(tatolabRunningApp?.tatolabMainWindow).toBeInstanceOf(TatolabMainWindow);
  });

  test("opening the app puts it in the tray and shows its one window, with the Dock icon, under the hidden title bar", () => {
    expect(fakeShell.askedFor().slice(0, 7)).toEqual([
      "set_application_menu",
      "show_tray_menu",
      "set_activation_policy",
      "create_main_window",
      "unminimize",
      "show",
      "focus",
    ]);
    expect(fakeShell.records[0]).toEqual({ asked: "set_application_menu", applicationMenu: "macos_menu_bar" });
    expect(fakeShell.records[2]).toEqual({ asked: "set_activation_policy", activationPolicy: "regular" });
    expect(fakeShell.records[3]).toEqual({
      asked: "create_main_window",
      mainWindowSpecification: {
        title: "Tatolab",
        width: 1040,
        height: 700,
        minimumWidth: 860,
        minimumHeight: 580,
        chrome: { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 19 } },
      },
    });
  });

  test("closing the window hides it and the Dock icon, and the app stays in the tray", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("hide_instead");
    expect(fakeShell.records).toEqual([{ asked: "hide" }, { asked: "set_activation_policy", activationPolicy: "accessory" }]);
  });

  test("opening the app again shows the same window rather than a second one", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.openTheAppAgain();
    expect(fakeShell.askedFor()).toEqual(["set_activation_policy", "unminimize", "show", "focus", "send_window_event"]);
  });

  test("Open Tatolab in the tray shows the window", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("open_tatolab");
    expect(fakeShell.askedFor()).toEqual(["set_activation_policy", "unminimize", "show", "focus", "send_window_event"]);
  });

  test("Quit Tatolab in the tray quits only the app and lets the window close", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("quit_tatolab");
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]);
    expect(fakeShell.writtenLogLines).toContain(" INFO quitting the Tatolab app; the runtime keeps running");
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
  });

  test("the first status round shows in the tray and reaches the window, and showing the window again sends it the status again", async () => {
    const firstStatus = await theFirstPublishedStatus(tatolabRunningApp);
    expect(firstStatus).toMatchObject({ app_version: "0.45.0", platform: "macos", run_tatolab: true, runtime_agent: "enabled" });
    expect(fakeShell.records).toContainEqual({ asked: "send_window_event", eventChannel: "tatolab-status-changed", eventPayload: firstStatus });
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1)).toMatchObject({
      trayMenuItems: [{ id: "tray_status_line", label: "Starting…" }, { id: "open_tatolab" }, { id: "run_tatolab", checked: true }, { kind: "separator" }, { id: "quit_tatolab" }],
    });
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.openTheAppAgain();
    expect(fakeShell.records.at(-1)).toEqual({ asked: "send_window_event", eventChannel: "tatolab-status-changed", eventPayload: firstStatus });
  });

  test("Run Tatolab in the tray turns the switch off, unregistering the runtime, and the tray's check follows", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("run_tatolab");
    await expect.poll(() => fakeShell.runtimeAgent.calls).toContain("unregister");
    await expect
      .poll(() => fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1))
      .toMatchObject({ trayMenuItems: [{ id: "tray_status_line" }, { id: "open_tatolab" }, { id: "run_tatolab", checked: false }, { kind: "separator" }, { id: "quit_tatolab" }] });
  });

  test("the window's commands are answered: the status, a turned-off switch, and quitting only the app", async () => {
    const firstStatus = await theFirstPublishedStatus(tatolabRunningApp);
    expect(await fakeShell.invokeTheCommand("get_tatolab_status")).toEqual({ ok: true, value: firstStatus });
    expect(await fakeShell.invokeTheCommand("set_run_tatolab", { enabled: false })).toEqual({ ok: true, value: null });
    await expect.poll(() => fakeShell.runtimeAgent.calls).toContain("unregister");
    expect(await fakeShell.invokeTheCommand("uninstall_tatolab")).toEqual({ ok: false, refusal: "this fake platform uninstalls nothing" });
    fakeShell.forgetTheRecords();
    expect(await fakeShell.invokeTheCommand("quit_tatolab_app")).toEqual({ ok: true, value: null });
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]);
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
  });

  test("a quit the system asks for, such as Cmd-Q, lets the window close rather than hide", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.beginQuitting();
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
    expect(fakeShell.records).toEqual([]);
  });
});

describe("the app on Linux", () => {
  test("the window keeps the desktop's title bar with no menu bar, and nothing asks for a Dock", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.askedFor().slice(0, 6)).toEqual(["set_application_menu", "show_tray_menu", "create_main_window", "unminimize", "show", "focus"]);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(fakeShell.records[0]).toEqual({ asked: "set_application_menu", applicationMenu: "none" });
    expect(fakeShell.records[2]).toMatchObject({ mainWindowSpecification: { chrome: { titleBarStyle: "default" } } });
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("hide_instead");
    expect(fakeShell.records).toEqual([{ asked: "hide" }]);
  });
});

describe("starting the app", () => {
  test("only macOS and Linux have platform items, with macOS's template tray mark and Linux's coloured one", () => {
    expect(MACOS_PLATFORM_ITEMS).toMatchObject({ platform: "macos", trayIconImage: { pngFileName: "tray-template.png", isATemplate: true } });
    expect(LINUX_PLATFORM_ITEMS).toMatchObject({ platform: "linux", trayIconImage: { pngFileName: "tray-coloured.png", isATemplate: false } });
    expect(tatolabPlatformItemsFor("win32")).toBeNull();
  });

  test("a second launch hands itself to the running app and exits without a window or a tray icon", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.holdsTheSingleInstanceLock = false;
    expect(await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog)).toBeNull();
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]);
  });

  test("an OS Tatolab does not run on is refused with why, and the app exits failed", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    expect(await startTatolabApp(fakeShell.tatolabElectronAppShell, null, fakeShell.tatolabAppLog)).toBeNull();
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 1 }]);
    expect(fakeShell.writtenLogLines[0]).toContain("Tatolab runs on macOS and Linux only");
  });

  test("a window that cannot be created is logged, the Dock icon goes again, and the tray still serves", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.mainWindowCreationFailure = "no display";
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.records.slice(0, 4)).toEqual([
      { asked: "set_application_menu", applicationMenu: "macos_menu_bar" },
      { asked: "show_tray_menu", trayMenuItems: expect.any(Array) },
      { asked: "set_activation_policy", activationPolicy: "regular" },
      { asked: "set_activation_policy", activationPolicy: "accessory" },
    ]);
    expect(fakeShell.writtenLogLines).toContain("ERROR the Tatolab window could not be created failure=\"no display\"");
  });

  test("the first opening offers the missing machine setup, and Set Up Tatolab… in the tray asks again; a refusal is logged", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.machineSetup = new FakeTatolabMachineSetup("needs_administrator", null);
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    await expect.poll(() => fakeShell.machineSetup.setUpTriggers).toContain("app_opened");
    expect(fakeShell.machineSetup.setUpTriggers).not.toContain("user_asked");
    fakeShell.clickTheTrayMenuItem("set_up_tatolab");
    await expect.poll(() => fakeShell.machineSetup.setUpTriggers).toContain("user_asked");

    const refusingFakeShell = fakeShellQuitAfterTheTest();
    refusingFakeShell.machineSetup = new FakeTatolabMachineSetup("complete", "On Linux the installer sets up Tatolab");
    await startTatolabApp(refusingFakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, refusingFakeShell.tatolabAppLog);
    refusingFakeShell.clickTheTrayMenuItem("set_up_tatolab");
    expect(refusingFakeShell.writtenLogLines).toContain(' WARN Set Up Tatolab… was refused refusal="On Linux the installer sets up Tatolab"');
    expect(await refusingFakeShell.invokeTheCommand("set_up_tatolab")).toEqual({ ok: false, refusal: "On Linux the installer sets up Tatolab" });
  });
});
