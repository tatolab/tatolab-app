import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { FakeLocalApiServer, toolFailureResponse, toolResultResponse } from "./fake_local_api_server.js";
import { FakeTatolabElectronAppShell, PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp, type TatolabRunningApp } from "./main.js";
import { TatolabAppWindows } from "./tatolab_app_windows.js";
import { TatolabTrayMenu } from "./tatolab_tray_menu.js";
import { tatolabPlatformItemsFor } from "./platform/tatolab_platform_items.js";
import { failedWith, succeeded } from "./result.js";
import { APP_UPDATE_CHECK_INTERVAL_MS, type TatolabAppUpdateFeedInstallingInPlace } from "./tatolab_app_updater.js";
import { LAST_OPENED_APP_VERSION_FILE_NAME } from "./tatolab_app_update_announcements.js";
import { tatolabAppCopyOnTheSingleInstanceLock } from "./tatolab_app_copy_handoff.js";

const MACOS_PLATFORM_ITEMS = tatolabPlatformItemsFor("darwin");
const LINUX_PLATFORM_ITEMS = tatolabPlatformItemsFor("linux");

const startedFakeShells: FakeTatolabElectronAppShell[] = [];
const fakeRuntimesStarted: FakeLocalApiServer[] = [];

afterEach(async () => {
  for (const fakeRuntime of fakeRuntimesStarted.splice(0)) await fakeRuntime.close();
  for (const startedFakeShell of startedFakeShells.splice(0)) {
    startedFakeShell.beginQuitting();
    startedFakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await startedFakeShell.quitHeldUntil;
    await startedFakeShell.removeTheAppConfigDirectory();
  }
});

/** A fake shell for a test, which quits its app and removes its config directory after the test. */
function fakeShellQuitAfterTheTest(): FakeTatolabElectronAppShell {
  const fakeShell = new FakeTatolabElectronAppShell();
  startedFakeShells.push(fakeShell);
  return fakeShell;
}

/** A project's `tatolab-project.json` as the fake runtime reads it: its UUID, its name and each project it imports. */
interface FakeProjectFile {
  project: string;
  name: string;
  dependencies: Array<{ project: string; folder: string; source: string; version: string }>;
}

const FAKE_IMPORT_VERSION = "907fd8c1c2e70a58c1a4c6113cc043dc6522f67406da53a3ea6cc3af72976e82";

async function readAFakeProjectFile(projectDirectory: string): Promise<FakeProjectFile | null> {
  try {
    const projectFile: FakeProjectFile = JSON.parse(await readFile(path.join(projectDirectory, "tatolab-project.json"), "utf8"));
    return projectFile;
  } catch {
    return null;
  }
}

function refusalOfAFolderHoldingNoProject(toolName: string, projectDirectory: string): Buffer {
  return toolFailureResponse(`${toolName} failed: ${projectDirectory} holds no project: it has no tatolab-project.json`);
}

/** A runtime that answers `list_assets`, `list_dependencies` and `add_dependency` from each project's `tatolab-project.json`, copying an import whole, and no other request. */
async function aRuntimeReadingEachProjectsFile(): Promise<FakeLocalApiServer> {
  const fakeRuntime = await FakeLocalApiServer.answeringEachToolCall(async (toolName, toolArguments) => {
    const projectDirectory = String(toolArguments["project_directory"]);
    const projectFile = await readAFakeProjectFile(projectDirectory);
    switch (toolName) {
      case "list_assets":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return toolResultResponse({ project_directory: projectDirectory, project: projectFile.project, project_name: projectFile.name, assets: [] });
      case "list_dependencies":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return toolResultResponse({ dependencies: projectFile.dependencies.map((dependency) => ({ dependency })) });
      case "add_dependency": {
        const source = String(toolArguments["source"]);
        const sourceProjectFile = await readAFakeProjectFile(source);
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        if (sourceProjectFile === null) return toolFailureResponse(`add_dependency failed: ${source} holds no tatolab-project.json`);
        const folder = path.basename(source);
        if (projectFile.dependencies.some((dependency) => dependency.project === sourceProjectFile.project)) {
          return toolFailureResponse(`add_dependency failed: the project already imports ${sourceProjectFile.project} in imports/${folder}`);
        }
        const dependency = { project: sourceProjectFile.project, folder, source, version: FAKE_IMPORT_VERSION };
        await cp(source, path.join(projectDirectory, "imports", folder), { recursive: true });
        await writeFile(path.join(projectDirectory, "tatolab-project.json"), JSON.stringify({ ...projectFile, dependencies: [...projectFile.dependencies, dependency] }));
        return toolResultResponse({ dependency, transaction: "400abda2-8e24-4e95-bef0-7139fd68d853", commit: "7402198987b8ef4b1d2f370b8f090ccde0865a56" });
      }
      case "list_streams":
        return toolResultResponse({ streams: [] });
      case "start_project":
        if (projectFile === null) return refusalOfAFolderHoldingNoProject(toolName, projectDirectory);
        return toolResultResponse({ action: "5d0c9a51-6a8b-4f3e-9d7e-2b1c0f4e8a77", project_directory: projectDirectory });
      default:
        return null;
    }
  });
  fakeRuntimesStarted.push(fakeRuntime);
  return fakeRuntime;
}

/** A fake shell whose app reads each project through a runtime that reads its `tatolab-project.json`, quit after the test. */
async function fakeShellOverARuntimeReadingEachProjectsFile(): Promise<FakeTatolabElectronAppShell> {
  const fakeShell = fakeShellQuitAfterTheTest();
  fakeShell.localApiSocketPath = (await aRuntimeReadingEachProjectsFile()).localApiSocketPath;
  return fakeShell;
}

/** The status the app published first, once its first status round is done. */
async function theFirstPublishedStatus(tatolabRunningApp: TatolabRunningApp | null): Promise<TatolabStatus | null> {
  return (await tatolabRunningApp?.statusPublisher.lastPublishedStatusWaitingUpTo(5_000)) ?? null;
}

test("an app launched by a click on a camera refusal in Notification Center opens the camera's privacy pane while macOS still refuses it", async () => {
  const fakeShell = fakeShellQuitAfterTheTest();
  fakeShell.notificationThatLaunchedTheApp = "com.tatolab.tatolab.media-access-refused.camera";
  fakeShell.systemMediaAccess.answerByDevice = { camera: "refused" };
  await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  await vi.waitFor(() => expect(fakeShell.systemMediaAccess.privacyPanesOpened).toEqual(["camera"]));
});

test("a running app opens the microphone's privacy pane when an earlier run's microphone refusal is clicked in Notification Center", async () => {
  const fakeShell = fakeShellQuitAfterTheTest();
  fakeShell.systemMediaAccess.answerByDevice = { microphone: "refused" };
  await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  fakeShell.systemNotifications.clickAnEarlierRunsNotification("com.tatolab.tatolab.media-access-refused.microphone");
  await vi.waitFor(() => expect(fakeShell.systemMediaAccess.privacyPanesOpened).toEqual(["microphone"]));
});

test("an app launched any other way asks the system for nothing as it starts", async () => {
  const fakeShell = fakeShellQuitAfterTheTest();
  await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  expect(fakeShell.systemMediaAccess.devicesAsked).toEqual([]);
});

describe("the app on macOS", () => {
  let fakeShell: FakeTatolabElectronAppShell;
  let tatolabRunningApp: TatolabRunningApp | null;
  beforeEach(async () => {
    fakeShell = fakeShellQuitAfterTheTest();
    tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
  });

  test("the running app hands back its windows and tray for the process to hold", async () => {
    const otherFakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(otherFakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, otherFakeShell.tatolabAppLog);
    expect(tatolabRunningApp?.tatolabTrayMenu).toBeInstanceOf(TatolabTrayMenu);
    expect(tatolabRunningApp?.tatolabAppWindows).toBeInstanceOf(TatolabAppWindows);
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
    expect(fakeShell.records[0]).toEqual({ asked: "set_application_menu", applicationMenu: "macos_menu_bar", menusOfTheFocusedWindow: null });
    expect(fakeShell.records[2]).toEqual({ asked: "set_activation_policy", activationPolicy: "regular" });
    expect(fakeShell.records[3]).toEqual({
      asked: "create_main_window",
      mainWindowSpecification: {
        title: "Tato Studio",
        width: 1040,
        height: 700,
        minimumWidth: 860,
        minimumHeight: 580,
        chrome: { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 13 } },
      },
    });
  });

  test("the focused window's menus show in the system menu bar, and an entry chosen there reaches that window", async () => {
    const menus = [
      {
        label: "File",
        system_menu: null,
        entries: [{ kind: "command", entry_id: "File/Open project…", label: "Open project…", shortcut_hint: "⌘O", unavailable_because: null }],
      },
    ];
    fakeShell.forgetTheRecords();
    fakeShell.focusTheWindow(PROJECTS_WINDOW_CONTENTS_ID);
    expect(await fakeShell.invokeTheCommand("show_menus_in_the_system_menu_bar", { menus })).toEqual({ ok: true, value: null });
    fakeShell.chooseTheSystemMenuBarEntry("File/Open project…");
    fakeShell.requestTheCloseOfTheWindow(PROJECTS_WINDOW_CONTENTS_ID);

    expect(fakeShell.records).toEqual([
      { asked: "set_application_menu", applicationMenu: "macos_menu_bar", menusOfTheFocusedWindow: null },
      { asked: "set_application_menu", applicationMenu: "macos_menu_bar", menusOfTheFocusedWindow: menus },
      { asked: "send_window_event", eventChannel: "tatolab-system-menu-bar-entry-chosen", eventPayload: { entry_id: "File/Open project…" } },
      expect.objectContaining({ asked: "hide" }),
      expect.objectContaining({ asked: "set_activation_policy" }),
    ]);
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
    expect(fakeShell.records).toEqual([{ asked: "open_another_copy_once_this_one_exits", executable: "/Applications/Tato Studio.app/Contents/MacOS/Tato Studio" }]);
    fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await vi.waitFor(() =>
      expect(fakeShell.records).toEqual([
        { asked: "open_another_copy_once_this_one_exits", executable: "/Applications/Tato Studio.app/Contents/MacOS/Tato Studio" },
        { asked: "exit", exitCode: 0 },
      ]),
    );
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
    expect(fakeShell.records).toEqual([{ asked: "open_another_copy_once_this_one_exits", executable: "/Users/someone/proof/Tatolab.app/Contents/MacOS/Tatolab" }]);
    fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await vi.waitFor(() =>
      expect(fakeShell.records).toEqual([
        { asked: "open_another_copy_once_this_one_exits", executable: "/Users/someone/proof/Tatolab.app/Contents/MacOS/Tatolab" },
        { asked: "exit", exitCode: 0 },
      ]),
    );
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

  test("Quit Tato Studio in the tray stops the runtime with the app and lets the window close", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.forgetTheRecords();
    fakeShell.clickTheTrayMenuItem("quit_tatolab");
    expect(fakeShell.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
    expect(fakeShell.writtenLogLines).toContain(" INFO quitting Tato Studio and its runtime");
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
    await Promise.resolve();
    expect(fakeShell.records).toEqual([]);
    fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await vi.waitFor(() => expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]));
  });

  test("the first status round shows in the tray and reaches the window, and showing the window again sends it the status again", async () => {
    const firstStatus = await theFirstPublishedStatus(tatolabRunningApp);
    expect(firstStatus).toMatchObject({
      app_version: "0.45.0",
      app_build: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: false },
      platform: "macos",
      runtime_state: "starting",
    });
    expect(fakeShell.records).toContainEqual({ asked: "send_window_event", eventChannel: "tatolab-status-changed", eventPayload: firstStatus });
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1)).toMatchObject({
      trayMenuItems: [{ id: "tray_status_line", label: "Starting the runtime…" }, { id: "open_tatolab" }, { kind: "separator" }, { id: "quit_tatolab" }],
    });
    fakeShell.requestTheWindowClose();
    fakeShell.forgetTheRecords();
    fakeShell.openTheAppAgain();
    expect(fakeShell.records.at(-1)).toEqual({ asked: "send_window_event", eventChannel: "tatolab-status-changed", eventPayload: firstStatus });
  });

  test("opening the app starts the runtime it carries as its child, with no prompt, and only one while it starts", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(fakeShell.carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
    await tatolabRunningApp?.statusPublisher.refreshAndPublish();
    expect(fakeShell.carriedRuntimeStarts.runtimesStarted).toHaveLength(1);
    expect(fakeShell.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(false);
  });

  test("the window's commands are answered: the status, and quitting the app with its runtime", async () => {
    const firstStatus = await theFirstPublishedStatus(tatolabRunningApp);
    expect(await fakeShell.invokeTheCommand("get_tatolab_status")).toEqual({ ok: true, value: firstStatus });
    fakeShell.forgetTheRecords();
    expect(await fakeShell.invokeTheCommand("quit_tatolab_app")).toEqual({ ok: true, value: null });
    expect(fakeShell.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
    expect(fakeShell.records).toEqual([]);
    fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await vi.waitFor(() => expect(fakeShell.records).toEqual([{ asked: "exit", exitCode: 0 }]));
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
  });

  test("a quit the system asks for, such as Cmd-Q, lets the window close rather than hide", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.beginQuitting();
    fakeShell.forgetTheRecords();
    expect(fakeShell.requestTheWindowClose()).toBe("let_it_close");
    expect(fakeShell.records).toEqual([]);
  });

  test("a quit the system asks for is held until the runtime the app started has exited", async () => {
    await theFirstPublishedStatus(tatolabRunningApp);
    fakeShell.beginQuitting();
    expect(fakeShell.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
    let quitWentOn = false;
    void fakeShell.quitHeldUntil?.then(() => {
      quitWentOn = true;
    });
    await Promise.resolve();
    expect(quitWentOn).toBe(false);
    fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
    await fakeShell.quitHeldUntil;
    expect(quitWentOn).toBe(true);
    expect(fakeShell.writtenLogLines.some((logLine) => logLine.startsWith(" INFO the runtime stopped as the app quits"))).toBe(true);
  });
});

describe("the app on Linux", () => {
  test("the window keeps the desktop's title bar with no menu bar, and nothing asks for a Dock", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(fakeShell.askedFor().slice(0, 6)).toEqual(["set_application_menu", "show_tray_menu", "create_main_window", "unminimize", "show", "focus"]);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(fakeShell.records[0]).toEqual({ asked: "set_application_menu", applicationMenu: "none", menusOfTheFocusedWindow: null });
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
      { asked: "set_application_menu", applicationMenu: "macos_menu_bar", menusOfTheFocusedWindow: null },
      { asked: "show_tray_menu", trayMenuItems: expect.any(Array) },
      { asked: "set_activation_policy", activationPolicy: "regular" },
      { asked: "set_activation_policy", activationPolicy: "accessory" },
    ]);
    expect(fakeShell.writtenLogLines).toContain("ERROR a Tato Studio window could not be created window_role=projects failure=\"no display\"");
  });

  test("an app that carries no runtime starts none and says why in its status", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.carriedRuntime = null;
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, LINUX_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    expect(await theFirstPublishedStatus(tatolabRunningApp)).toMatchObject({
      runtime_state: "not_running",
      runtime_not_running_because: "No runtime is running, and this build of Tato Studio carries none to start.",
    });
    expect(fakeShell.carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
  });

  test("opening the app links the tatolab command when the name is free, and leaves a name something else holds alone", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => fakeShell.commandLineToolLink.commandLineToolLink).toEqual({ kind: "linked", path: "/Users/someone/.local/bin/tatolab" });

    const shellWhereTheNameIsTaken = fakeShellQuitAfterTheTest();
    shellWhereTheNameIsTaken.commandLineToolLink.commandLineToolLink = { kind: "taken_by_something_else", path: "/Users/someone/.local/bin/tatolab" };
    const tatolabRunningApp = await startTatolabApp(shellWhereTheNameIsTaken.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, shellWhereTheNameIsTaken.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(shellWhereTheNameIsTaken.commandLineToolLink.linksAsked).toBe(0);
  });

});

/** A feed offering `newerVersion`, counting each download and each install; both succeed at once. */
function fakeAppUpdateFeedOffering(newerVersion: string | null) {
  const takenFrom = { downloads: 0, installs: 0 };
  const feed: TatolabAppUpdateFeedInstallingInPlace = {
    delivery: "install_and_relaunch",
    findANewerVersion: async () => succeeded(newerVersion),
    downloadTheNewerVersion: async (onDownloadProgress) => {
      takenFrom.downloads += 1;
      onDownloadProgress(100);
      return succeeded(undefined);
    },
    installTheDownloadedVersionAndRelaunch: async () => {
      takenFrom.installs += 1;
      return succeeded(undefined);
    },
  };
  return { feed, takenFrom };
}

/** The update announcement the windows show now, read through the window's status command. */
async function theAppUpdateAnnouncementShown(fakeShell: FakeTatolabElectronAppShell) {
  const statusAnswer = await fakeShell.invokeTheCommand("get_tatolab_status");
  return statusAnswer.ok ? statusAnswer.value.app_update_announcement : "the status could not be read";
}

describe("updating the app", () => {
  test("the app checks at launch and once a day, downloads a newer version, announces it ready over the window, and after Cancel the tray restarts into it", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed, takenFrom } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed };
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => theAppUpdateAnnouncementShown(fakeShell)).toEqual({ kind: "update_ready", version: "0.47.0" });
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "notify")).toEqual([]);
    expect(fakeShell.records).toContainEqual({ asked: "repeat_every", intervalMs: APP_UPDATE_CHECK_INTERVAL_MS });
    expect(await fakeShell.invokeTheCommand("answer_the_app_update_announcement", { kind: "update_ready", version: "0.47.0", answer: "dismiss" })).toEqual({ ok: true, value: null });
    await expect.poll(() => theAppUpdateAnnouncementShown(fakeShell)).toBeNull();
    await expect
      .poll(() => fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "show_tray_menu").at(-1))
      .toMatchObject({ trayMenuItems: expect.arrayContaining([{ kind: "item", id: "app_updates", label: "Restart to Update to 0.47.0", enabled: true }]) });
    expect(takenFrom).toEqual({ downloads: 1, installs: 0 });
    fakeShell.clickTheTrayMenuItem("app_updates");
    await expect.poll(() => takenFrom.installs).toBe(1);
  });

  test("Install Update in the update-ready dialog installs the downloaded version, and an answer for another version installs nothing", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed, takenFrom } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed };
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await expect.poll(() => theAppUpdateAnnouncementShown(fakeShell)).toEqual({ kind: "update_ready", version: "0.47.0" });
    expect(await fakeShell.invokeTheCommand("answer_the_app_update_announcement", { kind: "update_ready", version: "0.46.9", answer: "take_its_action" })).toEqual({ ok: true, value: null });
    expect(takenFrom.installs).toBe(0);
    expect(await fakeShell.invokeTheCommand("answer_the_app_update_announcement", { kind: "update_ready", version: "0.47.0", answer: "take_its_action" })).toEqual({ ok: true, value: null });
    await expect.poll(() => takenFrom.installs).toBe(1);
  });

  test("the first launch after an update announces which version the app is now, and Release Notes opens its notes; an app that cannot update itself announces nothing", async () => {
    const appThatCannotUpdateItself = fakeShellQuitAfterTheTest();
    await mkdir(appThatCannotUpdateItself.appConfigDirectory, { recursive: true });
    await writeFile(path.join(appThatCannotUpdateItself.appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), JSON.stringify({ app_version: "0.0.1" }));
    const tatolabRunningApp = await startTatolabApp(appThatCannotUpdateItself.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, appThatCannotUpdateItself.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(await theAppUpdateAnnouncementShown(appThatCannotUpdateItself)).toBeNull();

    const fakeShell = fakeShellQuitAfterTheTest();
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed: fakeAppUpdateFeedOffering(null).feed };
    await mkdir(fakeShell.appConfigDirectory, { recursive: true });
    await writeFile(path.join(fakeShell.appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), JSON.stringify({ app_version: "0.0.1" }));
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    const appVersion = fakeShell.thisCopyOfTatolab.appVersion;
    const releaseNotesUrl = `https://github.com/tatolab/tatolab-app/releases/tag/v${appVersion}`;
    await expect.poll(() => theAppUpdateAnnouncementShown(fakeShell)).toEqual({ kind: "update_landed", version: appVersion, release_notes_url: releaseNotesUrl });
    expect(await fakeShell.invokeTheCommand("answer_the_app_update_announcement", { kind: "update_landed", version: appVersion, answer: "take_its_action" })).toEqual({ ok: true, value: null });
    expect(fakeShell.records).toContainEqual({ asked: "open_web_page_in_the_browser", webPageUrl: releaseNotesUrl });
    await expect.poll(() => theAppUpdateAnnouncementShown(fakeShell)).toBeNull();
  });

  test("the window's Restart to Update installs the staged version, and the status follows it to installing", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed, takenFrom } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed };
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    expect(await fakeShell.invokeTheCommand("check_for_tatolab_app_updates")).toEqual({ ok: true, value: null });
    await expect.poll(() => takenFrom.downloads).toBe(1);
    expect(await fakeShell.invokeTheCommand("take_the_newer_tatolab_app_version")).toEqual({ ok: true, value: null });
    await expect.poll(() => takenFrom.installs).toBe(1);
    await expect
      .poll(async () => {
        const statusAnswer = await fakeShell.invokeTheCommand("get_tatolab_status");
        return statusAnswer.ok ? statusAnswer.value.app_update : null;
      })
      .toEqual({ kind: "installing", version: "0.47.0" });
  });

  test("clicking the notification shows the window", async () => {
    const fakeShell = fakeShellQuitAfterTheTest();
    const { feed } = fakeAppUpdateFeedOffering("0.47.0");
    fakeShell.appUpdateFeedForThisBuild = { kind: "offered", feed: { ...feed, downloadTheNewerVersion: async () => failedWith("net::ERR_CONNECTION_RESET") } };
    const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await theFirstPublishedStatus(tatolabRunningApp);
    await expect.poll(() => fakeShell.askedFor()).toContain("notify");
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
    expect(trayMenuShownLast).not.toMatchObject({ trayMenuItems: expect.arrayContaining([expect.objectContaining({ id: "app_updates" })]) });
  });


});

describe("one window per project", () => {
  /** A project folder on disk named `projectName`, which the fake dialog answers. */
  async function aProjectTheDialogAnswers(fakeShell: FakeTatolabElectronAppShell, projectName: string): Promise<string> {
    const projectFolder = path.join(fakeShell.appConfigDirectory, "projects", projectName);
    await mkdir(projectFolder, { recursive: true });
    await writeFile(path.join(projectFolder, "pyproject.toml"), `[project]\nname = "${projectName}"\ndependencies = []\n`);
    await writeFile(path.join(projectFolder, "tatolab-project.json"), JSON.stringify({ project: `uuid-of-${projectName}`, name: projectName, dependencies: [] } satisfies FakeProjectFile));
    fakeShell.projectFolderTheDialogAnswers = projectFolder;
    return projectFolder;
  }

  test("a project opened from the Projects window opens in its own studio window, and the Projects window steps aside", async () => {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    const projectFolder = await aProjectTheDialogAnswers(fakeShell, "night-show");

    expect(await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" })).toEqual({
      ok: true,
      value: { folder: projectFolder, project_creation: null },
    });
    expect(fakeShell.studioWindowsOpen()).toEqual([{ title: "night-show", windowContentsId: 2, showing: true }]);
    expect(fakeShell.mainWindowShowing).toBe(false);
    expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 2)).toMatchObject({ ok: true, value: { kind: "read", open_project: { project: { name: "night-show" } } } });
    expect(await fakeShell.invokeTheCommand("read_open_project")).toEqual({ ok: true, value: { kind: "none_open" } });
  });

  test("opening a project whose window is open brings that window forward rather than opening a second", async () => {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await aProjectTheDialogAnswers(fakeShell, "night-show");
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });
    fakeShell.forgetTheRecords();

    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" }, 2);
    expect(fakeShell.studioWindowsOpen()).toHaveLength(1);
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);
    expect(fakeShell.records).toContainEqual({ asked: "focus", windowContentsId: 2 });
  });

  test("two projects open side by side, each window answering about its own project", async () => {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await aProjectTheDialogAnswers(fakeShell, "night-show");
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });
    await aProjectTheDialogAnswers(fakeShell, "lobby-wall");
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" }, 2);

    expect(fakeShell.studioWindowsOpen().map(({ title, windowContentsId }) => [title, windowContentsId])).toEqual([
      ["night-show", 2],
      ["lobby-wall", 3],
    ]);
    expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 3)).toMatchObject({ ok: true, value: { open_project: { project: { name: "lobby-wall" } } } });
    expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 2)).toMatchObject({ ok: true, value: { open_project: { project: { name: "night-show" } } } });
  });

  test("closing a studio window closes it, forgets its project and brings back the Projects window, which refuses a project's commands", async () => {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await aProjectTheDialogAnswers(fakeShell, "night-show");
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });

    expect(fakeShell.requestTheCloseOfTheWindow(2)).toBe("let_it_close");
    expect(fakeShell.studioWindowsOpen()).toEqual([]);
    expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 2)).toEqual({ ok: true, value: { kind: "none_open" } });
    expect(await fakeShell.invokeTheCommand("run_open_project")).toEqual({ ok: false, refusal: "No project is open in this window." });
    expect(fakeShell.mainWindowShowing).toBe(true);
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "set_activation_policy").at(-1)).toEqual({ asked: "set_activation_policy", activationPolicy: "regular" });
  });

  test("File › Projects shows the Projects window again over a project's window", async () => {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    await aProjectTheDialogAnswers(fakeShell, "night-show");
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });

    expect(await fakeShell.invokeTheCommand("show_projects_window", undefined, 2)).toEqual({ ok: true, value: null });
    expect(fakeShell.mainWindowShowing).toBe(true);
    expect(fakeShell.studioWindowsOpen()).toEqual([{ title: "night-show", windowContentsId: 2, showing: true }]);
  });
  describe("Module manager", () => {
    async function aStudioWindowOfNightShowImportingLobbyWall(): Promise<{ fakeShell: FakeTatolabElectronAppShell; nightShowFolder: string; lobbyWallFolder: string }> {
      const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
      await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
      const lobbyWallFolder = await aProjectTheDialogAnswers(fakeShell, "lobby-wall");
      const nightShowFolder = await aProjectTheDialogAnswers(fakeShell, "night-show");
      await cp(lobbyWallFolder, path.join(nightShowFolder, "imports", "lobby-wall"), { recursive: true });
      await writeFile(
        path.join(nightShowFolder, "tatolab-project.json"),
        JSON.stringify({
          project: "uuid-of-night-show",
          name: "night-show",
          dependencies: [{ project: "uuid-of-lobby-wall", folder: "lobby-wall", source: lobbyWallFolder, version: FAKE_IMPORT_VERSION }],
        } satisfies FakeProjectFile),
      );
      await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });
      await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace" }, 2);
      return { fakeShell, nightShowFolder, lobbyWallFolder };
    }

    test("opens from a studio window in a window of its own beside it, which answers its workspace, and closes with it", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(fakeShell.studioWindowsOpen().map(({ title, windowContentsId }) => [title, windowContentsId])).toEqual([
        ["night-show", 2],
        ["Modules and Marketplace · night-show", 3],
      ]);
      expect(fakeShell.records).toContainEqual(
        expect.objectContaining({ asked: "create_main_window", windowContentsId: 3, mainWindowSpecification: expect.objectContaining({ width: 960, height: 660 }) }),
      );
      expect(await fakeShell.invokeTheCommand("read_module_manager_workspace", undefined, 3)).toMatchObject({ ok: true, value: { kind: "read", open_project: { project: { name: "night-show" } } } });
      expect(await fakeShell.invokeTheCommand("read_module_manager_workspace", undefined, 2)).toEqual({ ok: true, value: null });
      expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace" })).toEqual({ ok: false, refusal: "Only a project's studio window opens Module manager." });
      expect(await fakeShell.invokeTheCommand("open_module_manager_window", undefined, 2)).toEqual({
        ok: false,
        refusal: "open_module_manager_window needs `shows`, one of added_to_this_project, marketplace.",
      });

      fakeShell.forgetTheRecords();
      await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace" }, 2);
      expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);

      expect(fakeShell.requestTheCloseOfTheWindow(2)).toBe("let_it_close");
      expect(fakeShell.studioWindowsOpen()).toEqual([]);
    });

    test("answers the section it opened on, and asked again from the studio window comes forward and is told the section asked", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: "marketplace" });
      expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 2)).toEqual({ ok: true, value: null });

      fakeShell.forgetTheRecords();
      expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "added_to_this_project" }, 2)).toEqual({ ok: true, value: null });
      expect(fakeShell.records).toContainEqual(
        expect.objectContaining({ asked: "send_window_event", eventChannel: "tatolab-module-manager-section-asked", eventPayload: { shows: "added_to_this_project" }, windowContentsId: 3 }),
      );
      expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);
      expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: "added_to_this_project" });
    });

    test("closed and opened again on another section, answers that section", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(fakeShell.requestTheCloseOfTheWindow(3)).toBe("let_it_close");
      expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "added_to_this_project" }, 2)).toEqual({ ok: true, value: null });
      const reopenedWindow = fakeShell.studioWindowsOpen().find(({ title }) => title === "Modules and Marketplace · night-show") ?? expect.unreachable("no Modules and Marketplace window");

      expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, reopenedWindow.windowContentsId)).toEqual({ ok: true, value: "added_to_this_project" });
      expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: null });
    });

    test("reads the catalog from get.tatolab.com, and says why where it is not served", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(await fakeShell.invokeTheCommand("read_package_catalog", undefined, 3)).toEqual({
        ok: true,
        value: { kind: "not_read", because: "The catalog at https://get.tatolab.com/catalog/v1.json could not be fetched: the fake shell reaches no network" },
      });
      fakeShell.packageCatalogTextServed = JSON.stringify({ catalog_version: 1, entries: [] });
      expect(await fakeShell.invokeTheCommand("read_package_catalog", undefined, 3)).toEqual({ ok: true, value: { kind: "read", entries: [], unreadable_entry_count: 0 } });
      expect(fakeShell.urlsFetched).toEqual(["https://get.tatolab.com/catalog/v1.json", "https://get.tatolab.com/catalog/v1.json"]);
    });

    test("lists the project's imports as the runtime lists them, each named from its copy, and only to a Module manager window", async () => {
      const { fakeShell, nightShowFolder, lobbyWallFolder } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3)).toEqual({
        ok: true,
        value: [
          {
            project: "uuid-of-lobby-wall",
            folder: "lobby-wall",
            source: lobbyWallFolder,
            version: FAKE_IMPORT_VERSION,
            folder_path: path.join(nightShowFolder, "imports", "lobby-wall"),
            name: "lobby-wall",
            edited_files: [],
            newer_version_exists: null,
            check_refused_because: null,
          },
        ],
      });
      expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 2)).toMatchObject({
        ok: true,
        value: { kind: "read", open_project: { project: { name: "night-show", project: "uuid-of-night-show" }, imports: [{ project: "uuid-of-lobby-wall", name: "lobby-wall", folder: "lobby-wall" }] } },
      });
      expect(await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 2)).toEqual({ ok: false, refusal: "Only a Module manager window imports into a project." });
    });

    test("adds the project the dialog answers through the runtime, which the open project then lists, and says the runtime's refusal in its words", async () => {
      const { fakeShell, nightShowFolder } = await aStudioWindowOfNightShowImportingLobbyWall();
      const doorwaysFolder = await aProjectTheDialogAnswers(fakeShell, "doorways");
      fakeShell.dependencySourceTheDialogAnswers = doorwaysFolder;

      expect(await fakeShell.invokeTheCommand("choose_dependency_source", { source_kind: "folder" }, 3)).toEqual({ ok: true, value: doorwaysFolder });
      expect(fakeShell.records).toContainEqual(expect.objectContaining({ asked: "ask_for_a_dependency_source", sourceKind: "folder", defaultFolder: path.dirname(nightShowFolder) }));
      expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: doorwaysFolder }, 3)).toEqual({
        ok: true,
        value: { project: "uuid-of-doorways", folder: "doorways", source: doorwaysFolder, version: FAKE_IMPORT_VERSION },
      });
      expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: doorwaysFolder }, 3)).toEqual({
        ok: false,
        refusal: "add_dependency failed: the project already imports uuid-of-doorways in imports/doorways",
      });
      expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: "doorways" }, 3)).toMatchObject({ ok: false });

      const listed = await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3);
      expect(listed.ok && Array.isArray(listed.value) && listed.value.map((dependency) => ("folder" in dependency ? dependency.folder : null))).toEqual(["lobby-wall", "doorways"]);
    });

    test("opens an import to edit in its own studio window, and refuses a folder the runtime lists no import in", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

      expect(await fakeShell.invokeTheCommand("open_import_to_edit", { folder: "lobby-wall" }, 3)).toEqual({ ok: true, value: null });
      expect(fakeShell.studioWindowsOpen().map(({ title }) => title)).toEqual(["night-show", "Modules and Marketplace · night-show", "lobby-wall"]);
      expect(await fakeShell.invokeTheCommand("open_import_to_edit", { folder: "nothing-here" }, 3)).toEqual({ ok: false, refusal: "The project imports nothing in imports/nothing-here." });
    });
  });

  describe("a view popped out of a studio window", () => {
    const VIEWER_PINNED_TO_THE_DISPLAY = { view_type_id: "viewer", window_title: "main › display · Node visualizer", pinned_to: { stream_tab: { stream: "night-show-1a2b" }, node: "display" } };

    async function aStudioWindowOfNightShow(): Promise<FakeTatolabElectronAppShell> {
      const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
      await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
      await aProjectTheDialogAnswers(fakeShell, "night-show");
      await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });
      return fakeShell;
    }

    test("pops out into a small window of its own, titled as asked, which answers its pin and reads its studio window's project", async () => {
      const fakeShell = await aStudioWindowOfNightShow();
      fakeShell.forgetTheRecords();

      expect(await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2)).toEqual({ ok: true, value: null });
      expect(fakeShell.studioWindowsOpen()).toEqual([
        { title: "night-show", windowContentsId: 2, showing: true },
        { title: "main › display · Node visualizer", windowContentsId: 3, showing: true },
      ]);
      expect(fakeShell.records).toContainEqual({
        asked: "create_main_window",
        windowContentsId: 3,
        mainWindowSpecification: expect.objectContaining({ width: 720, height: 450, minimumWidth: 320, minimumHeight: 200 }),
      });
      expect(await fakeShell.invokeTheCommand("read_popped_out_view", undefined, 3)).toEqual({ ok: true, value: VIEWER_PINNED_TO_THE_DISPLAY });
      expect(await fakeShell.invokeTheCommand("read_popped_out_view", undefined, 2)).toEqual({ ok: true, value: null });
      expect(await fakeShell.invokeTheCommand("read_popped_out_view")).toEqual({ ok: true, value: null });
      const studioWindowsProject = await fakeShell.invokeTheCommand("read_open_project", undefined, 2);
      expect(studioWindowsProject).toMatchObject({ ok: true, value: { kind: "read" } });
      expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 3)).toEqual(studioWindowsProject);
      expect(await fakeShell.invokeTheCommand("read_open_project_transactions", undefined, 3)).toEqual(await fakeShell.invokeTheCommand("read_open_project_transactions", undefined, 2));

    });

    test("is sent the status the other windows were last sent as it opens", async () => {
      const fakeShell = await aStudioWindowOfNightShow();
      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);

      expect(fakeShell.records).toContainEqual(expect.objectContaining({ asked: "send_window_event", eventChannel: "tatolab-status-changed", windowContentsId: 3 }));
    });

    test("popping out the same view on the same stream and node again brings its window forward, whatever else it pins; another node gets a window of its own", async () => {
      const fakeShell = await aStudioWindowOfNightShow();
      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);
      fakeShell.forgetTheRecords();

      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);
      expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);
      expect(fakeShell.records).toContainEqual({ asked: "focus", windowContentsId: 3 });

      await fakeShell.invokeTheCommand("pop_out_view", { ...VIEWER_PINNED_TO_THE_DISPLAY, pinned_to: { stream_tab: { stream: "night-show-1a2b" }, node: "display", settings: { chosen_port: null } } }, 2);
      expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);
      await fakeShell.invokeTheCommand("pop_out_view", { ...VIEWER_PINNED_TO_THE_DISPLAY, window_title: "main · Node visualizer", pinned_to: { stream_tab: { stream: "night-show-1a2b" }, node: null } }, 2);
      await fakeShell.invokeTheCommand("pop_out_view", { view_type_id: "outliner", window_title: "night-show · Outliner", pinned_to: null }, 2);
      expect(fakeShell.studioWindowsOpen().map(({ title }) => title)).toEqual(["night-show", "main › display · Node visualizer", "main · Node visualizer", "night-show · Outliner"]);
    });

    test("closing it closes it alone; closing its studio window closes it too", async () => {
      const fakeShell = await aStudioWindowOfNightShow();
      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);

      expect(fakeShell.requestTheCloseOfTheWindow(3)).toBe("let_it_close");
      expect(fakeShell.studioWindowsOpen().map(({ windowContentsId }) => windowContentsId)).toEqual([2]);
      expect(await fakeShell.invokeTheCommand("read_popped_out_view", undefined, 3)).toEqual({ ok: true, value: null });

      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);
      expect(fakeShell.studioWindowsOpen().map(({ windowContentsId }) => windowContentsId)).toEqual([2, 4]);
      expect(fakeShell.requestTheCloseOfTheWindow(2)).toBe("let_it_close");
      expect(fakeShell.studioWindowsOpen()).toEqual([]);
    });

    test("is refused from the Projects window and from a popped-out view, and for arguments that name no pin", async () => {
      const fakeShell = await aStudioWindowOfNightShow();
      await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 2);

      const onlyAStudioWindow = { ok: false, refusal: "Only a project's studio window can pop out one of its views." };
      expect(await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY)).toEqual(onlyAStudioWindow);
      expect(await fakeShell.invokeTheCommand("pop_out_view", VIEWER_PINNED_TO_THE_DISPLAY, 3)).toEqual(onlyAStudioWindow);
      expect(await fakeShell.invokeTheCommand("pop_out_view", { view_type_id: "viewer" }, 2)).toMatchObject({ ok: false, refusal: expect.stringContaining("pop_out_view needs `view_type_id`") });
    });
  });
});
