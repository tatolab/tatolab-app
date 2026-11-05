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

/** Quit the app from the tray or the window, stopping its runtime with it. */
export function quitTheTatolabApp(
  tatolabMainWindow: TatolabMainWindow,
  stopTheRuntimeAsTheAppQuits: () => void,
  exitTheApp: (exitCode: number) => void,
  tatolabAppLog: TatolabAppLog,
): void {
  tatolabAppLog.info("quitting Tato Studio and its runtime");
  stopTheRuntimeAsTheAppQuits();
  tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  exitTheApp(0);
}
