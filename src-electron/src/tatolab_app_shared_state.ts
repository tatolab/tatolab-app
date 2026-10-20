// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// What the tray, the window's commands and the app's events reach once the app is set up: the
// controller and the status publisher, and the requests the tray and the window both make.

import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppController } from "./tatolab_app_controller.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabMainWindow } from "./tatolab_main_window.js";
import type { TatolabStatusPublisher } from "./tatolab_status_publisher.js";

/** The controller and the status publisher, which the tray's choices and the window's commands reach. */
export interface TatolabAppSharedState {
  controller: TatolabAppController;
  statusPublisher: TatolabStatusPublisher;
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
