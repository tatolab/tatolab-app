// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The main process's entry: Electron's app, windows, tray and Dock behind the shell the
// lifecycle in main.ts drives.

import path from "node:path";
import { app, Menu } from "electron";
import { startTatolabApp, type TatolabElectronAppShell, type TatolabRunningApp } from "../main.js";
import { describeCaughtFailure } from "../result.js";
import { createTatolabAppLogToStandardError } from "../tatolab_app_log.js";
import { TATOLAB_APP_IDENTIFIER, tatolabPlatformItemsForThisBuild, type TatolabPlatformHostServices } from "../platform/mod.js";
import { TATOLAB_WINDOW_PAGE_URL } from "../tatolab_window_page_source.js";
import { electronApplicationMenu } from "./electron_application_menu.js";
import { createElectronMainWindowHostFactory } from "./electron_main_window_host.js";
import { answerTheWindowsCommandsOverIpc } from "./electron_tatolab_command_handlers.js";
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
const builtWindowDirectory = path.join(app.getAppPath(), "dist");
const tatolabPlatformHostServices: TatolabPlatformHostServices = {
  appPath: app.getAppPath(),
  appExecutable: process.execPath,
  appIsPackaged: app.isPackaged,
  appConfigDirectory: path.join(app.getPath("appData"), TATOLAB_APP_IDENTIFIER),
  tatolabUninstallAppSurface: ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE,
};
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
    if (windowDevServerUrl === null) await serveTheBuiltWindow(builtWindowDirectory, tatolabAppLog);
  },
  onTheAppOpenedAgain: (listener) => {
    app.on("second-instance", listener);
    app.on("activate", listener);
  },
  onTheAppQuitting: (listener) => {
    app.on("before-quit", listener);
  },
  exitTheApp: (exitCode) => app.exit(exitCode),
  setTheApplicationMenu: (applicationMenu) => Menu.setApplicationMenu(electronApplicationMenu(applicationMenu)),
  buildTheTatolabPlatformForThisBuild: (platformItems) => platformItems.tatolabPlatformForThisBuild(tatolabAppLog, tatolabPlatformHostServices),
  answerTheWindowsCommands: (tatolabWindowCommandHandlers) => answerTheWindowsCommandsOverIpc(windowPageUrl, tatolabWindowCommandHandlers, tatolabAppLog),
  appConfigDirectory: tatolabPlatformHostServices.appConfigDirectory,
  appVersion: app.getVersion(),
  readMonotonicClockMs: () => performance.now(),
  mainWindowHostFactory: createElectronMainWindowHostFactory(windowPageUrl, !app.isPackaged, tatolabAppLog),
  trayIconHostFactory: createElectronTrayIconHostFactory(path.join(app.getAppPath(), "src-tauri", "icons")),
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
