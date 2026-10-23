// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The main process's entry: Electron's app, windows, tray and Dock behind the shell the
// lifecycle in main.ts drives.

import path from "node:path";
import { app, autoUpdater as electronNativeAutoUpdater, Menu } from "electron";
import { startTatolabApp, type TatolabElectronAppShell, type TatolabRunningApp } from "../main.js";
import { describeCaughtFailure } from "../result.js";
import { createTatolabAppLogToStandardError } from "../tatolab_app_log.js";
import { TATOLAB_APP_BUILD_FEATURES } from "../tatolab_app_build_features.js";
import { TATOLAB_APP_IDENTIFIER, tatolabPlatformItemsForThisBuild, type TatolabPlatformHostServices } from "../platform/mod.js";
import { TATOLAB_WINDOW_PAGE_URL } from "../tatolab_window_page_source.js";
import { runtimeLoopbackHttpOriginForThisBuild } from "../runtime_loopback_watch_page.js";
import { electronApplicationMenu } from "./electron_application_menu.js";
import { openAFolderInTheFileManagerThroughElectron } from "./electron_folder_in_the_file_manager.js";
import { createElectronMainWindowHostFactory } from "./electron_main_window_host.js";
import { answerTheWindowsCommandsOverIpc } from "./electron_tatolab_command_handlers.js";
import { createElectronTatolabAppUpdateFeed } from "./electron_tatolab_app_update_feed.js";
import { createElectronTatolabAppUpdateNotifier } from "./electron_tatolab_app_update_notifier.js";
import { ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE } from "./electron_tatolab_uninstall_app_surface.js";
import { createElectronTrayIconHostFactory } from "./electron_tray_icon.js";
import { registerTheWindowPageSchemeBeforeReady, serveTheBuiltWindow } from "./electron_window_page_protocol.js";

const tatolabAppLog = createTatolabAppLogToStandardError();
process.on("unhandledRejection", (unhandledRejection) => {
  tatolabAppLog.error("a promise was rejected and nothing handled it", { failure: describeCaughtFailure(unhandledRejection) });
});

/** Vite's dev server, which an unpackaged app loads the window from when `TATOLAB_APP_WINDOW_DEV_SERVER_URL` names it; a packaged app always serves its built window. */
const windowDevServerUrl = app.isPackaged ? null : windowDevServerUrlNamedIn(process.env["TATOLAB_APP_WINDOW_DEV_SERVER_URL"]);
const windowPageUrl = windowDevServerUrl ?? TATOLAB_WINDOW_PAGE_URL;
const runtimeLoopbackHttpOrigin = runtimeLoopbackHttpOriginForThisBuild();
const builtWindowDirectory = path.join(app.getAppPath(), "dist");
const builtWindowPreloadScript = path.join(app.getAppPath(), "src-electron", "build", "preload", "tatolab_window_preload.cjs");
const tatolabPlatformHostServices: TatolabPlatformHostServices = {
  appPath: app.getAppPath(),
  appExecutable: process.execPath,
  appIsPackaged: app.isPackaged,
  appConfigDirectory: path.join(app.getPath("appData"), TATOLAB_APP_IDENTIFIER),
  tatolabUninstallAppSurface: ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE,
};
// Chromium's profile would otherwise land in `<appData>/<productName>`, which is the runtime's own
// state directory on macOS (`~/Library/Application Support/Tatolab`).
app.setPath("userData", tatolabPlatformHostServices.appConfigDirectory);
registerTheWindowPageSchemeBeforeReady();

function windowDevServerUrlNamedIn(windowDevServerUrlText: string | undefined): string | null {
  if (windowDevServerUrlText === undefined) return null;
  if (URL.canParse(windowDevServerUrlText)) return windowDevServerUrlText;
  tatolabAppLog.warn("TATOLAB_APP_WINDOW_DEV_SERVER_URL is not a URL; the built window loads instead", {
    window_dev_server_url: windowDevServerUrlText,
  });
  return null;
}

const tatolabElectronAppShell: TatolabElectronAppShell = {
  requestTheSingleInstanceLock: () => app.requestSingleInstanceLock(),
  whenReady: async () => {
    await app.whenReady();
    if (windowDevServerUrl === null) await serveTheBuiltWindow(builtWindowDirectory, runtimeLoopbackHttpOrigin, tatolabAppLog);
  },
  onTheAppOpenedAgain: (listener) => {
    app.on("second-instance", listener);
    app.on("activate", listener);
  },
  onTheAppQuitting: (listener) => {
    app.on("before-quit", listener);
    // An update's quitAndInstall closes the windows before `before-quit`, so the window learns here that it may close.
    electronNativeAutoUpdater.on("before-quit-for-update", listener);
  },
  exitTheApp: (exitCode) => app.exit(exitCode),
  setTheApplicationMenu: (applicationMenu) => Menu.setApplicationMenu(electronApplicationMenu(applicationMenu)),
  buildTheTatolabPlatformForThisBuild: (platformItems) => platformItems.tatolabPlatformForThisBuild(tatolabAppLog, tatolabPlatformHostServices),
  answerTheWindowsCommands: (tatolabWindowCommandHandlers) => answerTheWindowsCommandsOverIpc(windowPageUrl, tatolabWindowCommandHandlers, tatolabAppLog),
  openAFolderInTheFileManager: openAFolderInTheFileManagerThroughElectron,
  createTheAppUpdateFeed: (appUpdatePackaging) => createElectronTatolabAppUpdateFeed(appUpdatePackaging, TATOLAB_APP_BUILD_FEATURES.appUpdateFeedUrl, tatolabAppLog),
  createTheAppUpdateNotifier: createElectronTatolabAppUpdateNotifier,
  repeatingTimer: (intervalMs, work) => {
    setInterval(work, intervalMs);
  },
  appConfigDirectory: tatolabPlatformHostServices.appConfigDirectory,
  appVersion: app.getVersion(),
  runtimeLoopbackHttpOrigin,
  readMonotonicClockMs: () => performance.now(),
  mainWindowHostFactory: createElectronMainWindowHostFactory(
    windowPageUrl,
    builtWindowPreloadScript,
    runtimeLoopbackHttpOrigin,
    !app.isPackaged,
    tatolabAppLog,
  ),
  trayIconHostFactory: createElectronTrayIconHostFactory(path.join(app.getAppPath(), "src-electron", "icons")),
  dockIconHost: {
    setActivationPolicy: (activationPolicy) => app.setActivationPolicy(activationPolicy),
  },
};

/** The running app, held by this module for the life of the process so the tray is never collected. */
export const tatolabRunningApp: Promise<TatolabRunningApp | null> = startTatolabApp(
  tatolabElectronAppShell,
  tatolabPlatformItemsForThisBuild(),
  tatolabAppLog,
).catch((startFailure: unknown) => {
  tatolabAppLog.error("Tatolab could not start", { failure: describeCaughtFailure(startFailure) });
  app.exit(1);
  return null;
});
