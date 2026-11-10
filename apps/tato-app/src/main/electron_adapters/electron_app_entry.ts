// The main process's entry: Electron's app, windows, tray and Dock behind the shell the
// lifecycle in main.ts drives.

import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { app, autoUpdater as electronNativeAutoUpdater, Menu } from "electron";
import { startTatolabApp, type TatolabElectronAppShell, type TatolabRunningApp } from "../main.js";
import { describeCaughtFailure } from "../result.js";
import { RUNTIME_VIEWER_FRAME_IMPORT_ADDON_FILE_NAME } from "../runtime_viewer_frame_import_addon.js";
import { createTatolabAppLogToStandardError } from "../tatolab_app_log.js";
import { TATOLAB_APP_BUILD_FEATURES, tatolabAppBuildForTheWindow } from "../tatolab_app_build_features.js";
import {
  streamlibCommitTheAppCarries,
  tatolabAppCopyHandedOverOnTheSingleInstanceLock,
  tatolabAppCopyOnTheSingleInstanceLock,
} from "../tatolab_app_copy_handoff.js";
import { TATOLAB_APP_IDENTIFIER } from "../platform/tatolab_app_identifier.js";
import { tatolabPlatformItemsForThisBuild } from "../platform/tatolab_platform_items.js";
import type { TatolabPlatformHostServices } from "../platform/tatolab_platform_for_this_build.js";
import { startTheCarriedRuntimeAsAChildProcess } from "../platform/carried_runtime_child_process.js";
import { TATOLAB_WINDOW_PAGE_URL } from "../tatolab_window_page_source.js";
import { electronApplicationMenu } from "./electron_application_menu.js";
import { openAFolderInTheFileManagerThroughElectron } from "./electron_folder_in_the_file_manager.js";
import { askThePersonForAStreamProjectFolderThroughElectron } from "./electron_stream_project_folder_dialog.js";
import { askThePersonForAProjectArchiveThroughElectron, askThePersonForAProjectCoverImageThroughElectron, askThePersonForAProjectFolderThroughElectron } from "./electron_project_folder_dialog.js";
import { askThePersonForADependencySourceThroughElectron } from "./electron_dependency_source_dialog.js";
import { startANodeLanguageServerInAUtilityProcess } from "./electron_node_language_server_in_a_utility_process.js";
import { fetchBytesOverHttpsThroughElectron, fetchTextOverHttpsThroughElectron } from "./electron_text_over_https.js";
import { watchFolderEntriesOnThisMachine } from "../folder_entries_watch_on_this_machine.js";
import { createElectronMainWindowHostFactory } from "./electron_main_window_host.js";
import { answerTheWindowsCommandsOverIpc } from "./electron_tatolab_command_handlers.js";
import { createElectronTatolabAppUpdateFeed } from "./electron_tatolab_app_update_feed.js";
import { createElectronSystemNotifications } from "./electron_system_notifications.js";
import { ELECTRON_APP_MEDIA_ACCESS_SETTINGS } from "./electron_app_media_access_settings.js";
import { ELECTRON_APP_LOGIN_ITEM_SETTINGS } from "./electron_app_login_item_settings.js";
import { createElectronTrayIconHostFactory } from "./electron_tray_icon.js";
import { answerProjectViewFileRequestsWith, registerTheWindowPageSchemeBeforeReady, serveTheWindowPageScheme } from "./electron_window_page_protocol.js";

const tatolabAppLog = createTatolabAppLogToStandardError();
const tatolabPlatformItems = tatolabPlatformItemsForThisBuild();
process.on("unhandledRejection", (unhandledRejection) => {
  tatolabAppLog.error("a promise was rejected and nothing handled it", { failure: describeCaughtFailure(unhandledRejection) });
});

/** electron-vite's renderer dev server, which an unpackaged app loads the window from when `electron-vite dev` names it in `ELECTRON_RENDERER_URL`; a packaged app always serves its built window. */
const windowDevServerUrl = app.isPackaged ? null : windowDevServerUrlNamedIn(process.env["ELECTRON_RENDERER_URL"]);
const windowPageUrl = windowDevServerUrl ?? TATOLAB_WINDOW_PAGE_URL;
const builtWindowDirectory = path.join(app.getAppPath(), "out", "renderer");
const builtWindowPreloadScript = path.join(app.getAppPath(), "out", "preload", "tatolab_window_preload.cjs");
const tatolabPlatformHostServices: TatolabPlatformHostServices = {
  homeDirectory: app.getPath("home"),
  appExecutable: process.execPath,
  appIsPackaged: app.isPackaged,
  appResourcesDirectory: process.resourcesPath,
  appLoginItemSettings: ELECTRON_APP_LOGIN_ITEM_SETTINGS,
  appMediaAccessSettings: ELECTRON_APP_MEDIA_ACCESS_SETTINGS,
};
const appConfigDirectory = path.join(app.getPath("appData"), TATOLAB_APP_IDENTIFIER);

/** The account name of the person signed in; `os.userInfo()` throws when the account has no passwd entry, as in some containers, and the home folder's name stands in. */
function accountNameOfThePersonSignedIn(): string {
  try {
    return os.userInfo().username;
  } catch {
    return path.basename(os.homedir());
  }
}
// Chromium's profile would otherwise land in `<appData>/<productName>`, beside the app's own config
// directory rather than in it.
app.setPath("userData", appConfigDirectory);
registerTheWindowPageSchemeBeforeReady();

function windowDevServerUrlNamedIn(windowDevServerUrlText: string | undefined): string | null {
  if (windowDevServerUrlText === undefined) return null;
  if (URL.canParse(windowDevServerUrlText)) return windowDevServerUrlText;
  tatolabAppLog.warn("ELECTRON_RENDERER_URL is not a URL; the built window loads instead", {
    window_dev_server_url: windowDevServerUrlText,
  });
  return null;
}

/** The account the app runs as, which a save is recorded by; `os.userInfo()` throws for a uid with no passwd entry, as in some containers. */
function nameOfThePersonSignedInToThisMachine(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env["USER"] ?? "person";
  }
}

const tatolabElectronAppShell: TatolabElectronAppShell = {
  readThisCopyOfTatolab: async () => ({
    // An AppImage runs from a mount that goes when it exits; `APPIMAGE` names the file that opens it again.
    executableThatOpensTheCopy: process.env["APPIMAGE"] ?? process.execPath,
    appVersion: app.getVersion(),
    appBuild: tatolabAppBuildForTheWindow(TATOLAB_APP_BUILD_FEATURES.tatolabAppBuildId),
    carriedStreamlibCommit: await streamlibCommitTheAppCarries(tatolabPlatformItems?.streamlibCommitFileTheAppCarries(process.resourcesPath) ?? null),
  }),
  requestTheSingleInstanceLock: (thisCopy) => app.requestSingleInstanceLock(tatolabAppCopyOnTheSingleInstanceLock(thisCopy)),
  whenReady: async () => {
    await app.whenReady();
    await serveTheWindowPageScheme(windowDevServerUrl === null ? builtWindowDirectory : null, tatolabAppLog);
  },
  onTheAppOpenedAgain: (listener) => {
    app.on("second-instance", (_event, _argv, _workingDirectory, additionalData) => listener(tatolabAppCopyHandedOverOnTheSingleInstanceLock(additionalData)));
    app.on("activate", () => listener(null));
  },
  openAnotherCopyOnceThisOneExits: (executable) => app.relaunch({ execPath: executable, args: [] }),
  onTheAppQuitting: (listener) => {
    app.on("before-quit", listener);
    // An update's quitAndInstall closes the windows before `before-quit`, so the window learns here that it may close.
    electronNativeAutoUpdater.on("before-quit-for-update", listener);
  },
  holdTheQuitUntil: (workBeforeTheQuitGoesOn) => {
    let workHoldingTheQuit: Promise<void> | null = null;
    let theQuitMayGoOn = false;
    app.on("before-quit", (beforeQuitEvent) => {
      if (theQuitMayGoOn) return;
      if (workHoldingTheQuit === null) {
        const work = workBeforeTheQuitGoesOn();
        if (work === null) return;
        workHoldingTheQuit = work.finally(() => {
          theQuitMayGoOn = true;
          app.quit();
        });
      }
      // Squirrel.Mac's ShipIt waits for the app's process to end, so an update's install still runs once the held quit goes on.
      beforeQuitEvent.preventDefault();
    });
  },
  exitTheApp: (exitCode) => app.exit(exitCode),
  setTheApplicationMenu: (applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen) =>
    Menu.setApplicationMenu(electronApplicationMenu(applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen)),
  onAWindowFocused: (listener) => app.on("browser-window-focus", (_focusEvent, focusedWindow) => listener(focusedWindow.webContents.id)),
  onAWindowClosed: (listener) =>
    app.on("browser-window-created", (_createdEvent, createdWindow) => {
      // A closed window's webContents is gone, so its id is read while it is alive.
      const windowContentsId = createdWindow.webContents.id;
      createdWindow.on("closed", () => listener(windowContentsId));
    }),
  buildTheTatolabPlatformForThisBuild: (platformItems) => platformItems.tatolabPlatformForThisBuild(tatolabAppLog, tatolabPlatformHostServices),
  answerTheWindowsCommands: (tatolabWindowCommandHandlers) => answerTheWindowsCommandsOverIpc(windowPageUrl, tatolabWindowCommandHandlers, tatolabAppLog),
  openAFolderInTheFileManager: openAFolderInTheFileManagerThroughElectron,
  askThePersonForAStreamProjectFolder: askThePersonForAStreamProjectFolderThroughElectron,
  askThePersonForAProjectFolder: askThePersonForAProjectFolderThroughElectron,
  askThePersonForAProjectArchive: askThePersonForAProjectArchiveThroughElectron,
  askThePersonForAProjectCoverImage: askThePersonForAProjectCoverImageThroughElectron,
  askThePersonForADependencySource: askThePersonForADependencySourceThroughElectron,
  startANodeLanguageServer: startANodeLanguageServerInAUtilityProcess,
  // A packaged app carries Pyright outside app.asar, in app.asar.unpacked, so its worker threads and typeshed stubs load from plain files;
  // an unpackaged one finds it where the npm workspace installed it, which is usually the monorepo root's node_modules.
  pyrightLanguageServerModulePath: app.isPackaged
    ? path.join(`${app.getAppPath()}.unpacked`, "node_modules", "pyright", "langserver.index.js")
    : createRequire(import.meta.url).resolve("pyright/langserver.index.js"),
  runtimeViewerFrameImportAddonPath:
    app.isPackaged && tatolabPlatformItems !== null
      ? tatolabPlatformItems.viewerAddonThePackagedAppCarries(process.resourcesPath)
      : path.join(app.getAppPath(), "out", "native", RUNTIME_VIEWER_FRAME_IMPORT_ADDON_FILE_NAME),
  mainProcessId: process.pid,
  watchFolderEntries: watchFolderEntriesOnThisMachine,
  fetchTextOverHttps: fetchTextOverHttpsThroughElectron,
  fetchBytesOverHttps: fetchBytesOverHttpsThroughElectron,
  homeDirectory: app.getPath("home"),
  // On Linux Electron reads XDG_DOCUMENTS_DIR from user-dirs.dirs, falling back to ~/Documents.
  documentsDirectory: app.getPath("documents"),
  personSignedInToThisMachine: nameOfThePersonSignedInToThisMachine(),
  answerProjectViewFileRequestsWith,
  createTheAppUpdateFeed: (appUpdatePackaging) => createElectronTatolabAppUpdateFeed(appUpdatePackaging, TATOLAB_APP_BUILD_FEATURES.appUpdateFeedUrl, tatolabAppLog),
  systemNotifications: createElectronSystemNotifications(),
  repeatingTimer: (intervalMs, work) => {
    setInterval(work, intervalMs);
  },
  startTheCarriedRuntime: startTheCarriedRuntimeAsAChildProcess,
  appConfigDirectory,
  thePersonSignedInToThisComputer: { kind: "person", name: accountNameOfThePersonSignedIn() },
  readMonotonicClockMs: () => performance.now(),
  // The one wall-clock read in the main process: it stamps when a project was opened, which the Projects window only displays.
  // eslint-disable-next-line no-restricted-properties
  readWallClockMsForDisplay: () => Date.now(),
  mainWindowHostFactory: createElectronMainWindowHostFactory(
    windowPageUrl,
    builtWindowPreloadScript,
    !app.isPackaged,
    tatolabAppLog,
  ),
  trayIconHostFactory: createElectronTrayIconHostFactory(path.join(app.getAppPath(), "resources")),
  dockIconHost: {
    setActivationPolicy: (activationPolicy) => app.setActivationPolicy(activationPolicy),
  },
};

/** The running app, held by this module for the life of the process so the tray is never collected. */
export const tatolabRunningApp: Promise<TatolabRunningApp | null> = startTatolabApp(
  tatolabElectronAppShell,
  tatolabPlatformItems,
  tatolabAppLog,
).catch((startFailure: unknown) => {
  tatolabAppLog.error("Tatolab could not start", { failure: describeCaughtFailure(startFailure) });
  app.exit(1);
  return null;
});
