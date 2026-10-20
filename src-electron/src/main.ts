// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Tatolab.app: opening it shows its window and puts it in the tray, opening it again shows the
// window of the one app already running, closing the window leaves the app in the tray, and
// quitting quits only the app — the runtime stays on. Each opening reconciles the runtime's agent
// with "Run Tatolab"; the first also offers the machine setup still missing.

import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { ApplicationMenu, DockIconHost, TatolabPlatformForThisBuild, TatolabPlatformItems } from "./platform/mod.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import {
  quitTheTatolabApp,
  runInTheBackgroundWithTheController,
  setUpTatolabOnRequest,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
import { tatolabWindowCommandHandlers, type TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import { TatolabMainWindow, type MainWindowHostFactory } from "./tatolab_main_window.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { TatolabTrayMenu, type TrayIconHostFactory, type TrayMenuChoice } from "./tatolab_tray_menu.js";

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
  /** This platform's runtime agent, machine setup, local API socket and uninstall, built from `platformItems` with the app's host services. */
  buildTheTatolabPlatformForThisBuild(platformItems: TatolabPlatformItems): Promise<TatolabPlatformForThisBuild>;
  /** Answer each command the window invokes with its handler. */
  answerTheWindowsCommands(tatolabWindowCommandHandlers: TatolabWindowCommandHandlers): void;
  /** The app's own config directory, where "Run Tatolab" is remembered. */
  appConfigDirectory: string;
  appVersion: string;
  readMonotonicClockMs(): number;
  mainWindowHostFactory: MainWindowHostFactory;
  trayIconHostFactory: TrayIconHostFactory;
  dockIconHost: DockIconHost;
}

/** The running app's window, tray and status publisher, which the process holds for its whole life: a tray nothing references is collected and leaves the menu bar or panel. */
export interface TatolabRunningApp {
  tatolabMainWindow: TatolabMainWindow;
  tatolabTrayMenu: TatolabTrayMenu;
  statusPublisher: TatolabStatusPublisher;
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
  const appLaunchedAtMs = tatolabElectronAppShell.readMonotonicClockMs();
  const tatolabMainWindow = new TatolabMainWindow(
    tatolabElectronAppShell.mainWindowHostFactory,
    platformItems,
    tatolabElectronAppShell.dockIconHost,
    tatolabAppLog,
  );
  tatolabElectronAppShell.onTheAppQuitting(() => tatolabMainWindow.letTheWindowCloseAsTheAppQuits());
  await tatolabElectronAppShell.whenReady();
  tatolabElectronAppShell.setTheApplicationMenu(platformItems.applicationMenu);
  let sharedStateOnceBuilt: TatolabAppSharedState | null = null;
  tatolabElectronAppShell.onTheAppOpenedAgain(() => {
    tatolabMainWindow.show();
    if (sharedStateOnceBuilt === null) return;
    sharedStateOnceBuilt.statusPublisher.sendTheLastPublishedStatusToTheWindow();
    runInTheBackgroundWithTheController(sharedStateOnceBuilt, "tatolab-app-reopened", async (controller, statusPublisher) => {
      await controller.reconcileTheAgentWithTheRunTatolabSwitch();
      statusPublisher.requestRefresh();
    });
  });
  const platformForThisBuild = await tatolabElectronAppShell.buildTheTatolabPlatformForThisBuild(platformItems);
  const controller = await TatolabAppController.create({
    platform: platformItems.platform,
    platformForThisBuild,
    appConfigDirectory: tatolabElectronAppShell.appConfigDirectory,
    appLaunchedAtMs,
    appVersion: tatolabElectronAppShell.appVersion,
    readMonotonicClockMs: () => tatolabElectronAppShell.readMonotonicClockMs(),
    tatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(
    controller,
    (status) => tatolabMainWindow.sendTheWindowTheStatus(status),
    () => tatolabElectronAppShell.readMonotonicClockMs(),
    tatolabAppLog,
  );
  tatolabElectronAppShell.onTheAppQuitting(() => statusPublisher.stopPolling());
  const sharedState: TatolabAppSharedState = { controller, statusPublisher, tatolabUninstall: platformForThisBuild.tatolabUninstall, tatolabAppLog };
  const quitTheApp = () => quitTheTatolabApp(tatolabMainWindow, (exitCode) => tatolabElectronAppShell.exitTheApp(exitCode), tatolabAppLog);
  const showTheWindowWithTheLastStatus = () => {
    tatolabMainWindow.show();
    statusPublisher.sendTheLastPublishedStatusToTheWindow();
  };
  tatolabElectronAppShell.answerTheWindowsCommands(tatolabWindowCommandHandlers(sharedState, quitTheApp));
  sharedStateOnceBuilt = sharedState;
  const onTrayMenuChoice = (trayMenuChoice: TrayMenuChoice) => {
    switch (trayMenuChoice) {
      case "open_tatolab":
        showTheWindowWithTheLastStatus();
        return;
      case "toggle_run_tatolab_switch":
        runInTheBackgroundWithTheController(sharedState, "tatolab-run-tatolab-toggled", async (controller, statusPublisher) => {
          await controller.toggleRunTatolab();
          statusPublisher.requestRefresh();
        });
        return;
      case "set_up_tatolab": {
        const setUpTatolab = setUpTatolabOnRequest(sharedState);
        if (!setUpTatolab.ok) tatolabAppLog.warn("Set Up Tatolab… was refused", { refusal: setUpTatolab.failure });
        return;
      }
      case "quit_the_app":
        quitTheApp();
        return;
    }
  };
  const tatolabTrayMenu = TatolabTrayMenu.build(
    tatolabElectronAppShell.trayIconHostFactory,
    platformItems.trayIconImage,
    controller.runTatolab(),
    onTrayMenuChoice,
  );
  statusPublisher.attachTrayMenu(tatolabTrayMenu);
  showTheWindowWithTheLastStatus();
  runInTheBackgroundWithTheController(sharedState, "tatolab-app-opened", async (controller, statusPublisher) => {
    await controller.reconcileTheAgentWithTheRunTatolabSwitch();
    statusPublisher.startPolling();
    await controller.setUpTheMachineOnAppOpened();
    statusPublisher.requestRefresh();
  });
  return { tatolabMainWindow, tatolabTrayMenu, statusPublisher };
}
