// What the tray, the window's commands and the app's events reach once the app is set up: the
// controller, the status publisher, the updater, and the requests the tray and the window both make.

import { describeCaughtFailure } from "./result.js";
import type { TatolabAppController } from "./tatolab_app_controller.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppUpdateCheckChosenFrom, TatolabAppUpdater } from "./tatolab_app_updater.js";
import type { TatolabMainWindow } from "./tatolab_main_window.js";
import type { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import type { StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";
import type { StreamProjectAdding } from "./stream_project_adding.js";
import type { StreamFailureNotifications } from "./stream_failure_notifications.js";
import type { OpenProjectFolder } from "./open_project.js";
import type { PythonLanguageServers } from "./python_language_servers.js";
import type { OpenProjectFiles } from "./open_project_files.js";

/** The controller, the status publisher, the updater, what opens a stream's project, adding a project, the stream-failure notifications, the open project, its files and its language servers, which the tray's choices and the window's commands reach. */
export interface TatolabAppSharedState {
  controller: TatolabAppController;
  statusPublisher: TatolabStatusPublisher;
  tatolabAppUpdater: TatolabAppUpdater;
  streamProjectFolderOpeners: StreamProjectFolderOpeners;
  streamProjectAdding: StreamProjectAdding;
  streamFailureNotifications: StreamFailureNotifications;
  openProjectFolder: OpenProjectFolder;
  /** The files of the open project and its imports, which the code pane reads and saves. */
  openProjectFiles: OpenProjectFiles;
  /** The code pane's Pyright language servers. */
  pythonLanguageServers: PythonLanguageServers;
  tatolabAppLog: TatolabAppLog;
}

/**
 * Start `work` without waiting for it: it may wait on the filesystem or the local API, and its outcome reaches the window as the next status. A failure
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

/** Check for Updates…, from the tray, the window or the notification: check and take a newer Tatolab, its progress reaching the window as the next statuses. */
export function checkForTatolabAppUpdatesOnRequest(sharedState: TatolabAppSharedState, chosenFrom: TatolabAppUpdateCheckChosenFrom): void {
  sharedState.tatolabAppUpdater.checkAndTakeANewerVersion(chosenFrom).catch((unexpectedFailure: unknown) => {
    sharedState.tatolabAppLog.error("the update chosen from the tray or the window ended without finishing", {
      chosen_from: chosenFrom,
      failure: describeCaughtFailure(unexpectedFailure),
    });
  });
}

/** How long a quit waits for the app's runtime to exit after SIGTERM: past `tatolabd`'s own graceful-then-forced shutdown, which takes up to 5s. */
export const RUNTIME_EXIT_WAIT_LIMIT_AS_THE_APP_QUITS_MS = 15_000;

/** Stop the app's runtime as it quits, answering once it has exited or the wait limit has passed, whichever is first. */
export async function stopTheRuntimeWithinTheQuitWaitLimit(
  stopTheRuntimeAsTheAppQuits: () => Promise<void>,
  tatolabAppLog: TatolabAppLog,
  waitLimitMs: number = RUNTIME_EXIT_WAIT_LIMIT_AS_THE_APP_QUITS_MS,
): Promise<void> {
  let waitLimitTimer: ReturnType<typeof setTimeout> | undefined;
  const runtimeExited = stopTheRuntimeAsTheAppQuits().then(() => "exited" as const);
  const waitLimitPassed = new Promise<"wait_limit_passed">((answer) => {
    waitLimitTimer = setTimeout(() => answer("wait_limit_passed"), waitLimitMs);
  });
  const outcome = await Promise.race([runtimeExited, waitLimitPassed]);
  clearTimeout(waitLimitTimer);
  if (outcome === "wait_limit_passed") tatolabAppLog.warn("the runtime had not exited when the quit stopped waiting for it; Tato Studio quits", { wait_limit_ms: waitLimitMs });
}

/** Quit the app from the tray or the window, stopping its runtime with it and exiting once that runtime has exited. */
export function quitTheTatolabApp(
  tatolabMainWindow: TatolabMainWindow,
  stopTheRuntimeAsTheAppQuits: () => Promise<void>,
  exitTheApp: (exitCode: number) => void,
  tatolabAppLog: TatolabAppLog,
): Promise<void> {
  tatolabAppLog.info("quitting Tato Studio and its runtime");
  tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  return stopTheRuntimeWithinTheQuitWaitLimit(stopTheRuntimeAsTheAppQuits, tatolabAppLog).then(
    () => exitTheApp(0),
    (unexpectedFailure: unknown) => {
      tatolabAppLog.error("stopping the runtime as the app quits ended without finishing; Tato Studio quits", { failure: describeCaughtFailure(unexpectedFailure) });
      exitTheApp(0);
    },
  );
}
