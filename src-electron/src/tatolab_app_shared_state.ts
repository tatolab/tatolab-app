// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// What the tray, the window's commands and the app's events reach once the app is set up: the
// controller, the status publisher, the updater and uninstalling, and the requests the tray and
// the window both make.

import type { TatolabUninstall } from "./platform/mod.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppController } from "./tatolab_app_controller.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppUpdateCheckChosenFrom, TatolabAppUpdater } from "./tatolab_app_updater.js";
import type { TatolabMainWindow } from "./tatolab_main_window.js";
import type { TatolabStatusPublisher } from "./tatolab_status_publisher.js";

/** The controller, the status publisher, the updater and uninstalling, which the tray's choices and the window's commands reach. */
export interface TatolabAppSharedState {
  controller: TatolabAppController;
  statusPublisher: TatolabStatusPublisher;
  tatolabAppUpdater: TatolabAppUpdater;
  tatolabUninstall: TatolabUninstall;
  tatolabAppLog: TatolabAppLog;
}

/**
 * Start `work` without waiting for it: it may wait on the service manager, the filesystem, the local
 * API or the administrator prompt, and its outcome reaches the window as the next status. A failure
 * nothing expected is logged under `workName`.
 */
export function runInTheBackgroundWithTheController(
  sharedState: TatolabAppSharedState,
  workName: string,
  work: (controller: TatolabAppController, statusPublisher: TatolabStatusPublisher) => Promise<void>,
): void {
  work(sharedState.controller, sharedState.statusPublisher).catch((unexpectedFailure: unknown) => {
    sharedState.tatolabAppLog.error("work started for the tray or the window ended without finishing", {
      work_name: workName,
      failure: describeCaughtFailure(unexpectedFailure),
    });
  });
}

/** "Set Up Tatolab…" from the tray or the window: the administrator prompt for whatever machine setup is missing, then a status round; refused at once where the platform has no machine setup. */
export function setUpTatolabOnRequest(sharedState: TatolabAppSharedState): Result<void, string> {
  const setUpTatolabRefusal = sharedState.controller.setUpTatolabRefusal();
  if (setUpTatolabRefusal !== null) return failedWith(setUpTatolabRefusal);
  runInTheBackgroundWithTheController(sharedState, "tatolab-set-up-tatolab", async (controller, statusPublisher) => {
    await controller.setUpTheMachineOnRequest();
    statusPublisher.requestRefresh();
  });
  return succeeded(undefined);
}

/** Check for Updates…, from the tray, the window or the notification: check and take a newer Tatolab, its progress reaching the window as the next statuses. */
export function checkForTatolabAppUpdatesOnRequest(sharedState: TatolabAppSharedState, chosenFrom: TatolabAppUpdateCheckChosenFrom): void {
  sharedState.tatolabAppUpdater.checkAndTakeANewerVersion(chosenFrom).catch((unexpectedFailure: unknown) => {
    sharedState.tatolabAppLog.error("the update chosen from the tray or the window ended without finishing", {
      chosen_from: chosenFrom,
      failure: describeCaughtFailure(unexpectedFailure),
    });
  });
}

/** Quit the app from the tray or the window. The runtime is the service manager's, and keeps running. */
export function quitTheTatolabApp(
  tatolabMainWindow: TatolabMainWindow,
  exitTheApp: (exitCode: number) => void,
  tatolabAppLog: TatolabAppLog,
): void {
  tatolabAppLog.info("quitting the Tatolab app; the runtime keeps running");
  tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  exitTheApp(0);
}
