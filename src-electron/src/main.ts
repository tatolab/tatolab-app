// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Tatolab.app: opening it shows its window and puts it in the tray, opening it again shows the
// window of the one app already running, closing the window leaves the app in the tray, and
// quitting quits only the app — the runtime stays on.

import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { ApplicationMenu, DockIconHost, TatolabPlatformItems } from "./platform/mod.js";
import { quitTheTatolabApp } from "./tatolab_app_shared_state.js";
import { TatolabMainWindow, type MainWindowHostFactory } from "./tatolab_main_window.js";
import { TatolabTrayMenu, type TrayIconHostFactory } from "./tatolab_tray_menu.js";

/** The Electron app as the lifecycle drives it. */
export interface TatolabElectronAppShell {
  /** Whether this is the one running app; a second launch gets false and hands itself to the first. */
  requestTheSingleInstanceLock(): boolean;
  whenReady(): Promise<void>;
  /** Calls `listener` when the user opens the running app again: a second launch, or macOS reopening it from the Dock or Finder. */
  onTheAppOpenedAgain(listener: () => void): void;
  /** Calls `listener` as the app begins to quit, from the tray, the window or the system. */
  onTheAppQuitting(listener: () => void): void;
  exitTheApp(exitCode: number): void;
  setTheApplicationMenu(applicationMenu: ApplicationMenu): void;
  mainWindowHostFactory: MainWindowHostFactory;
  trayIconHostFactory: TrayIconHostFactory;
  dockIconHost: DockIconHost;
}

/** The running app's window and tray, which the process holds for its whole life: a tray nothing references is collected and leaves the menu bar or panel. */
export interface TatolabRunningApp {
  tatolabMainWindow: TatolabMainWindow;
  tatolabTrayMenu: TatolabTrayMenu;
}

/** Start the app on `tatolabElectronAppShell` with this build's platform items; `null` when it exits instead — a second launch, or an OS Tatolab does not run on. */
export async function startTatolabApp(
  tatolabElectronAppShell: TatolabElectronAppShell,
  platformItems: TatolabPlatformItems | null,
  tatolabAppLog: TatolabAppLog,
): Promise<TatolabRunningApp | null> {
  if (platformItems === null) {
    tatolabAppLog.error(
      "Tatolab runs on macOS and Linux only: on macOS it registers the runtime through Service Management, and on Linux it drives the installer's systemd user service, tatolabd.service",
    );
    tatolabElectronAppShell.exitTheApp(1);
    return null;
  }
  if (!tatolabElectronAppShell.requestTheSingleInstanceLock()) {
    tatolabAppLog.info("Tatolab is already running; it shows its window");
    tatolabElectronAppShell.exitTheApp(0);
    return null;
  }
  const tatolabMainWindow = new TatolabMainWindow(
    tatolabElectronAppShell.mainWindowHostFactory,
    platformItems,
    tatolabElectronAppShell.dockIconHost,
    tatolabAppLog,
  );
  tatolabElectronAppShell.onTheAppQuitting(() => tatolabMainWindow.letTheWindowCloseAsTheAppQuits());
  await tatolabElectronAppShell.whenReady();
  tatolabElectronAppShell.setTheApplicationMenu(platformItems.applicationMenu);
  tatolabElectronAppShell.onTheAppOpenedAgain(() => tatolabMainWindow.show());
  const tatolabTrayMenu = TatolabTrayMenu.build(tatolabElectronAppShell.trayIconHostFactory, platformItems.trayIconImage, (trayMenuChoice) => {
    switch (trayMenuChoice) {
      case "open_tatolab":
        tatolabMainWindow.show();
        return;
      case "quit_the_app":
        quitTheTatolabApp(tatolabMainWindow, (exitCode) => tatolabElectronAppShell.exitTheApp(exitCode), tatolabAppLog);
        return;
    }
  });
  tatolabMainWindow.show();
  return { tatolabMainWindow, tatolabTrayMenu };
}
