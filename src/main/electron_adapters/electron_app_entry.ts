// The main process's entry: Electron's app, windows, tray and Dock behind the shell the
// lifecycle in main.ts drives.

import path from "node:path";
import { app, autoUpdater as electronNativeAutoUpdater, Menu } from "electron";
import { startTatolabApp, type TatolabElectronAppShell, type TatolabRunningApp } from "../main.js";
import { describeCaughtFailure } from "../result.js";
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
import { TATOLAB_WINDOW_PAGE_URL } from "../tatolab_window_page_source.js";
import { runtimeLoopbackHttpOriginForThisBuild } from "../runtime_loopback_watch_page.js";
import { electronApplicationMenu } from "./electron_application_menu.js";
import { openAFolderInTheFileManagerThroughElectron } from "./electron_folder_in_the_file_manager.js";
import { askThePersonForAStreamProjectFolderThroughElectron } from "./electron_stream_project_folder_dialog.js";
import { askThePersonForAWorkspaceFolderThroughElectron } from "./electron_workspace_folder_dialog.js";
import { startAProgramSpeakingOnItsStandardStreams } from "../platform/start_a_program_speaking_on_its_standard_streams.js";
import { startANodeLanguageServerInAUtilityProcess } from "./electron_node_language_server_in_a_utility_process.js";
import { watchFolderEntriesOnThisMachine } from "../folder_entries_watch_on_this_machine.js";
import { createElectronMainWindowHostFactory } from "./electron_main_window_host.js";
import { answerTheWindowsCommandsOverIpc } from "./electron_tatolab_command_handlers.js";
import { createElectronTatolabAppUpdateFeed } from "./electron_tatolab_app_update_feed.js";
import { createElectronSystemNotifications } from "./electron_system_notifications.js";
import { ELECTRON_APP_LOGIN_ITEM_SETTINGS } from "./electron_app_login_item_settings.js";
import { ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE } from "./electron_tatolab_uninstall_app_surface.js";
import { createElectronTrayIconHostFactory } from "./electron_tray_icon.js";
import { registerTheWindowPageSchemeBeforeReady, serveTheBuiltWindow } from "./electron_window_page_protocol.js";

const tatolabAppLog = createTatolabAppLogToStandardError();
const tatolabPlatformItems = tatolabPlatformItemsForThisBuild();
process.on("unhandledRejection", (unhandledRejection) => {
  tatolabAppLog.error("a promise was rejected and nothing handled it", { failure: describeCaughtFailure(unhandledRejection) });
});

/** electron-vite's renderer dev server, which an unpackaged app loads the window from when `electron-vite dev` names it in `ELECTRON_RENDERER_URL`; a packaged app always serves its built window. */
const windowDevServerUrl = app.isPackaged ? null : windowDevServerUrlNamedIn(process.env["ELECTRON_RENDERER_URL"]);
const windowPageUrl = windowDevServerUrl ?? TATOLAB_WINDOW_PAGE_URL;
const runtimeLoopbackHttpOrigin = runtimeLoopbackHttpOriginForThisBuild();
const builtWindowDirectory = path.join(app.getAppPath(), "out", "renderer");
const builtWindowPreloadScript = path.join(app.getAppPath(), "out", "preload", "tatolab_window_preload.cjs");
const tatolabPlatformHostServices: TatolabPlatformHostServices = {
  homeDirectory: app.getPath("home"),
  appExecutable: process.execPath,
  appIsPackaged: app.isPackaged,
  appConfigDirectory: path.join(app.getPath("appData"), TATOLAB_APP_IDENTIFIER),
  appResourcesDirectory: process.resourcesPath,
  tatolabUninstallAppSurface: ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE,
  appLoginItemSettings: ELECTRON_APP_LOGIN_ITEM_SETTINGS,
};
// Chromium's profile would otherwise land in `<appData>/<productName>`, which is the runtime's own
// state directory on macOS (`~/Library/Application Support/Tatolab`).
app.setPath("userData", tatolabPlatformHostServices.appConfigDirectory);
registerTheWindowPageSchemeBeforeReady();

function windowDevServerUrlNamedIn(windowDevServerUrlText: string | undefined): string | null {
  if (windowDevServerUrlText === undefined) return null;
  if (URL.canParse(windowDevServerUrlText)) return windowDevServerUrlText;
  tatolabAppLog.warn("ELECTRON_RENDERER_URL is not a URL; the built window loads instead", {
    window_dev_server_url: windowDevServerUrlText,
  });
  return null;
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
    if (windowDevServerUrl === null) await serveTheBuiltWindow(builtWindowDirectory, runtimeLoopbackHttpOrigin, tatolabAppLog);
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
  exitTheApp: (exitCode) => app.exit(exitCode),
  setTheApplicationMenu: (applicationMenu) => Menu.setApplicationMenu(electronApplicationMenu(applicationMenu)),
  buildTheTatolabPlatformForThisBuild: (platformItems) => platformItems.tatolabPlatformForThisBuild(tatolabAppLog, tatolabPlatformHostServices),
  answerTheWindowsCommands: (tatolabWindowCommandHandlers) => answerTheWindowsCommandsOverIpc(windowPageUrl, tatolabWindowCommandHandlers, tatolabAppLog),
  openAFolderInTheFileManager: openAFolderInTheFileManagerThroughElectron,
  askThePersonForAStreamProjectFolder: askThePersonForAStreamProjectFolderThroughElectron,
  askThePersonForAWorkspaceFolder: askThePersonForAWorkspaceFolderThroughElectron,
  startANodeLanguageServer: startANodeLanguageServerInAUtilityProcess,
  startAProgramSpeakingOnItsStandardStreams,
  loginShell: process.env["SHELL"] ?? null,
  appsOwnPath: process.env["PATH"] ?? "",
  // A packaged app carries Pyright outside app.asar, in app.asar.unpacked, so its worker threads and typeshed stubs load from plain files.
  pyrightLanguageServerModulePath: path.join(app.isPackaged ? `${app.getAppPath()}.unpacked` : app.getAppPath(), "node_modules", "pyright", "langserver.index.js"),
  watchFolderEntries: watchFolderEntriesOnThisMachine,
  homeDirectory: app.getPath("home"),
  createTheAppUpdateFeed: (appUpdatePackaging) => createElectronTatolabAppUpdateFeed(appUpdatePackaging, TATOLAB_APP_BUILD_FEATURES.appUpdateFeedUrl, tatolabAppLog),
  systemNotifications: createElectronSystemNotifications(),
  repeatingTimer: (intervalMs, work) => {
    setInterval(work, intervalMs);
  },
  appConfigDirectory: tatolabPlatformHostServices.appConfigDirectory,
  runtimeLoopbackHttpOrigin,
  readMonotonicClockMs: () => performance.now(),
  mainWindowHostFactory: createElectronMainWindowHostFactory(
    windowPageUrl,
    builtWindowPreloadScript,
    runtimeLoopbackHttpOrigin,
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
