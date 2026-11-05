import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp, type TatolabRunningApp } from "./main.js";
import { TatolabMainWindow } from "./tatolab_main_window.js";
import { TatolabTrayMenu } from "./tatolab_tray_menu.js";
import { tatolabPlatformItemsFor } from "./platform/tatolab_platform_items.js";
import { succeeded } from "./result.js";
import { APP_UPDATE_CHECK_INTERVAL_MS, type TatolabAppUpdateFeed } from "./tatolab_app_updater.js";
import { tatolabAppCopyOnTheSingleInstanceLock } from "./tatolab_app_copy_handoff.js";
import { FakeCarriedRuntimeInstall } from "./fake_tatolab_platform_for_this_build.js";

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
        chrome: { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 13 } },
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

  test("a second copy of the same build shows the running app's window and the running app stays", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.launchASecondCopy(tatolabAppCopyOnTheSingleInstanceLock({ ...fakeShell.thisCopyOfTatolab, executableThatOpensTheCopy: "/Users/someone/Downloads/Tatolab.app/Contents/MacOS/Tatolab" }));
    expect(fakeShell.askedFor()).toEqual(["set_activation_policy", "unminimize", "show", "focus", "send_window_event"]);
  });

  test("a second copy of another version makes the running app open it and quit", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    fakeShell.launchASecondCopy(tatolabAppCopyOnTheSingleInstanceLock({ ...fakeShell.thisCopyOfTatolab, appVersion: "0.46.0" }));
    expect(fakeShell.records).toEqual([
      { asked: "open_another_copy_once_this_one_exits", executable: "/Applications/Tato Studio.app/Contents/MacOS/Tato Studio" },
      { asked: "exit", exitCode: 0 },
    ]);
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
  });

  test("a second copy of the same version carrying a runtime from another streamlib commit makes the running app open it and quit", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    fakeShell.launchASecondCopy(
      tatolabAppCopyOnTheSingleInstanceLock({
        ...fakeShell.thisCopyOfTatolab,
        executableThatOpensTheCopy: "/Users/someone/proof/Tatolab.app/Contents/MacOS/Tatolab",
        carriedStreamlibCommit: "0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e",
      }),
    );
    expect(fakeShell.records).toEqual([
      { asked: "open_another_copy_once_this_one_exits", executable: "/Users/someone/proof/Tatolab.app/Contents/MacOS/Tatolab" },
      { asked: "exit", exitCode: 0 },
    ]);
  });

  test("a second copy older than the handoff hands over nothing and shows the running app's window", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.launchASecondCopy({});
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
    expect(firstStatus).toMatchObject({
      app_version: "0.45.0",
      app_build: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: false },
      platform: "macos",
      run_tatolab: true,
      runtime_agent: "enabled",
    });
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
    expect(fakeShell.singleInstanceLockAdditionalData).toEqual([
      {
        tatolab_app_copy: {
          executable_that_opens_the_copy: "/Applications/Tato Studio.app/Contents/MacOS/Tato Studio",
          app_version: "0.45.0",
          app_build: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: false },
          carried_streamlib_commit: "5e1f0c2a9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f",
        },
      },
    ]);
  });

  test("an OS Tatolab does not run on is refused with why, and the app exits failed", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    expect(await startTatolabApp(fakeShell.tatolabElectronAppShell, null, fakeShell.tatolabAppLog)).toBeNull();
    expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 1 }]);
    expect(fakeShell.writtenLogLines[0]).toContain("Tato Studio runs on macOS and Linux only");
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

  test("each opening reconciles the runtime's agent with Run Tatolab: the first registers it, and opening again registers it once more after it went", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.runtimeAgent.status = "not_registered";
    await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => fakeShell.runtimeAgent.calls).toContain("register");
    fakeShell.runtimeAgent.status = "not_registered";
    fakeShell.runtimeAgent.calls.length = 0;
    fakeShell.openTheAppAgain();
    await expect.poll(() => fakeShell.runtimeAgent.calls).toContain("register");
  });

  test("the tray's Open Login Items reaches the service manager", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);

    fakeShell.runtimeAgent.calls.length = 0;
    fakeShell.clickTheTrayMenuItem("open_login_items_settings");
    await expect.poll(() => fakeShell.runtimeAgent.calls).toContain("open_login_items_settings");
  });

});

/** A feed offering `newerVersion`, counting each time it was taken from; taking it installs at once. */
function fakeAppUpdateFeedOffering(newerVersion: string | null) {
  const takenFrom = { count: 0 };
  const feed: TatolabAppUpdateFeed = {
    delivery: "install_and_relaunch",
    findANewerVersion: async () => succeeded(newerVersion),
    takeTheNewerVersion: async (progress) => {
      takenFrom.count += 1;
      progress.onDownloadProgress(100);
      progress.onInstalling();
      return succeeded(undefined);
    },
  };
  return { feed, takenFrom };
}

describe("updating the app", () => {
  test("the app checks at launch and once a day, says a newer version is available, and the tray offers to install it", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed, takenFrom } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed };
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "notify")).toEqual([
      { asked: "notify", title: "Tato Studio 0.47.0 is available", body: "Click to open Settings and install it." },
    ]);
    expect(fakeShell.records).toContainEqual({ asked: "repeat_every", intervalMs: APP_UPDATE_CHECK_INTERVAL_MS });
    await expect
      .poll(() => fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1))
      .toMatchObject({ trayMenuItems: expect.arrayContaining([{ kind: "item", id: "check_for_app_updates", label: "Install Tato Studio 0.47.0…", enabled: true }]) });
    expect(takenFrom.count).toBe(0);
    fakeShell.clickTheTrayMenuItem("check_for_app_updates");
    await expect.poll(() => takenFrom.count).toBe(1);
  });

  test("the window's Check for Updates… takes a newer version, and the status follows it to installing", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed, takenFrom } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed };
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(await fakeShell.invokeTheCommand("check_for_tatolab_app_updates")).toEqual({ ok: true, value: null });
    await expect.poll(() => takenFrom.count).toBe(1);
    await expect
      .poll(async () => {
        const statusAnswer = await fakeShell.invokeTheCommand("get_tatolab_status");
        return statusAnswer.ok ? statusAnswer.value.app_update : null;
      })
      .toEqual({ kind: "installing", version: "0.47.0" });
  });

  test("clicking the notification shows the window", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed: fakeAppUpdateFeedOffering("0.47.0").feed };
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.clickTheNotification();
    expect(fakeShell.askedFor()).toContain("show");
  });

  test("an app that cannot update itself shows no updates item and schedules no check", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    const firstStatus = await theFirstPublishedStatus(tatolabRunningApp);
    expect(firstStatus?.app_update).toEqual({ kind: "not_offered", reason: "this fake platform updates nothing" });
    expect(fakeShell.askedFor()).not.toContain("repeat_every");
    const trayMenuShownLast = fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1);
    expect(trayMenuShownLast).not.toMatchObject({ trayMenuItems: expect.arrayContaining([expect.objectContaining({ id: "check_for_app_updates" })]) });
  });

  test("opening an app that carries another runtime than the installed one installs it, and the status names the installed build", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const carriedRuntimeInstall = new FakeCarriedRuntimeInstall("0.68.0-1111111", "0.67.0-2222222", fakeShell.runtimeAgent);
    fakeShell.carriedRuntimeInstall = carriedRuntimeInstall;
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);

    await expect.poll(() => carriedRuntimeInstall.installedBuilds).toEqual(["0.68.0-1111111"]);
    await expect
      .poll(() => tatolabRunningApp?.statusPublisher.lastPublishedStatusWaitingUpTo(0).then((status) => status?.installed_runtime?.build))
      .toBe("0.68.0-1111111");
  });

  test("a runtime install that ends while the window is closed says so in a notification, and clicking it shows the window", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    let releaseTheInstaller = () => {};
    const carriedRuntimeInstall = new FakeCarriedRuntimeInstall("0.68.0-1111111", "0.67.0-2222222", fakeShell.runtimeAgent);
    carriedRuntimeInstall.installerHeldUntil = new Promise((release) => {
      releaseTheInstaller = release;
    });
    fakeShell.carriedRuntimeInstall = carriedRuntimeInstall;
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => fakeShell.mainWindowShowing).toBe(true);
    fakeShell.mainWindowShowing = false;
    releaseTheInstaller();

    await expect
      .poll(() => fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "notify"))
      .toEqual([expect.objectContaining({ title: "The Tatolab runtime is updated", body: "Runtime 0.68.0-1111111 is running." })]);
    fakeShell.systemNotifications.clickTheLastNotification();
    expect(fakeShell.mainWindowShowing).toBe(true);
  });

  test("a runtime install that ends while the window shows sends no notification", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const carriedRuntimeInstall = new FakeCarriedRuntimeInstall("0.68.0-1111111", "0.67.0-2222222", fakeShell.runtimeAgent);
    fakeShell.carriedRuntimeInstall = carriedRuntimeInstall;
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);

    await expect.poll(() => carriedRuntimeInstall.installedBuilds).toEqual(["0.68.0-1111111"]);
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "notify")).toEqual([]);
  });
});
