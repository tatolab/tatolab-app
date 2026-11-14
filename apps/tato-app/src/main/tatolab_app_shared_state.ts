// What the tray, the window's commands and the app's events reach once the app is set up: the
// controller, the status publisher, the updater, and the requests the tray and the window both make.

import type { StudioWarningsOfThisRun } from "./studio_warnings.js";
import type { ProjectViewsListedToTheWindows } from "./project_view_files.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppController } from "./tatolab_app_controller.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabAppUpdater } from "./tatolab_app_updater.js";
import type { TatolabAppUpdateAnnouncements } from "./tatolab_app_update_announcements.js";
import type { TatolabAppWindows } from "./tatolab_app_windows.js";
import type { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import type { StreamProjectFolderOpeners } from "./stream_project_folder_opening.js";
import type { StreamProjectAdding } from "./stream_project_adding.js";
import type { StreamFailureNotifications } from "./stream_failure_notifications.js";
import type { HeldRememberedSwitch } from "./remembered_switch_file.js";
import type { ProjectOpening } from "./open_project.js";
import type { PythonLanguageServers } from "./python_language_servers.js";
import type { RuntimePortViewers } from "./runtime_port_viewers.js";
import type { StreamGraphChangesFollowedForTheWindows } from "./stream_graph_changes_followed_for_the_windows.js";
import type { ProjectLogRecordsFollowedForTheWindows } from "./project_log_records_followed_for_the_windows.js";
import type { FetchBytesOverHttps, FetchTextOverHttps } from "./package_catalog.js";
import type { DependencySourceDialog } from "./workspace_dependencies.js";
import type { ProjectAssetsImportedFromChosenFiles } from "./project_assets_imported_from_chosen_files.js";
import type { SystemMenuBarOfTheFocusedWindow } from "./system_menu_bar_of_the_focused_window.js";
import type { PackageCatalogMachine, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import type { SystemMediaAccessAskedAheadForViews } from "./system_media_access_asked_ahead_for_views.js";

/** The controller, the status publisher, the updater, what opens a stream's project, adding a project, the stream-failure notifications, Developer mode, opening projects, the app's windows, the language servers, the port viewers and the system menu bar, which the tray's choices and the window's commands reach. */
export interface TatolabAppSharedState {
  controller: TatolabAppController;
  statusPublisher: TatolabStatusPublisher;
  tatolabAppUpdater: TatolabAppUpdater;
  /** The update dialog the Projects and studio windows show. */
  tatolabAppUpdateAnnouncements: TatolabAppUpdateAnnouncements;
  /** Open a web page in the person's browser, as an update's release notes open. */
  openAWebPageInTheBrowser: (webPageUrl: string) => Promise<Result<void, string>>;
  streamProjectFolderOpeners: StreamProjectFolderOpeners;
  streamProjectAdding: StreamProjectAdding;
  streamFailureNotifications: StreamFailureNotifications;
  /** Whether Developer mode is on, which the status carries. */
  developerModeSwitch: HeldRememberedSwitch;
  /** The warnings the status carries, and whether each one's dialog was shown. */
  studioWarnings: StudioWarningsOfThisRun;
  /** Opening a project in its own studio window, from any window. */
  projectOpening: ProjectOpening;
  /** The Projects window and each project's studio window, each with its project and that project's files. */
  appWindows: TatolabAppWindows;
  /** The code pane's Pyright language servers. */
  pythonLanguageServers: PythonLanguageServers;
  /** The Node visualizer's reads of running nodes' output ports, for the studio windows and the Node visualizers popped out of them. */
  runtimePortViewers: RuntimePortViewers;
  /** The graph changes the runtime pushes of each stream a studio window or a popped-out view follows. */
  streamGraphChangesFollowed: StreamGraphChangesFollowedForTheWindows;
  /** The writes the runtime pushes to the log of each project a studio window or a popped-out view follows. */
  projectLogRecordsFollowed: ProjectLogRecordsFollowedForTheWindows;
  /** macOS's one menu bar, which shows the focused window's menus. */
  systemMenuBar: SystemMenuBarOfTheFocusedWindow;
  /** How the module manager fetches the package catalog. */
  fetchTextOverHttps: FetchTextOverHttps;
  /** How the Marketplace downloads a module's `.zip`. */
  fetchBytesOverHttps: FetchBytesOverHttps;
  /** This machine as the Marketplace catalog names one, which each entry is read against. */
  machineModulesInstallOn: PackageCatalogMachine;
  /** Where each Marketplace download is kept, inside the app's config directory. */
  moduleDownloadsFolder: string;
  /** How Module manager asks for a project's folder or `.zip` to import. */
  dependencySourceDialog: DependencySourceDialog;
  /** How the Library's Import asset… imports the files the person chooses. */
  projectAssetsImportedFromChosenFiles: ProjectAssetsImportedFromChosenFiles;
  /** The person signed in to this computer, the author Studio's graph edits are recorded under. */
  thePersonEditingInStudio: ProjectTransactionAuthor;
  /** The views each studio window listed as ones that open, the only ones whose files are served. */
  projectViewsListed: ProjectViewsListedToTheWindows;
  /** Asks the system for the camera and the microphone as a listed view declaring one arrives, never at its first use. */
  systemMediaAccessAskedAheadForViews: SystemMediaAccessAskedAheadForViews;
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

/** Start `updateWork`, a choice the person made from the tray or the window, without waiting for it: its progress reaches the window as the next statuses, and a failure nothing expected is logged under `updateWorkName`. */
export function runTatolabAppUpdateWorkInTheBackground(sharedState: TatolabAppSharedState, updateWorkName: string, updateWork: (tatolabAppUpdater: TatolabAppUpdater) => Promise<void>): void {
  updateWork(sharedState.tatolabAppUpdater).catch((unexpectedFailure: unknown) => {
    sharedState.tatolabAppLog.error("the update chosen from the tray or the window ended without finishing", {
      update_work_name: updateWorkName,
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
  tatolabAppWindows: TatolabAppWindows,
  stopTheRuntimeAsTheAppQuits: () => Promise<void>,
  exitTheApp: (exitCode: number) => void,
  tatolabAppLog: TatolabAppLog,
): Promise<void> {
  tatolabAppLog.info("quitting Tato Studio and its runtime");
  tatolabAppWindows.letEveryWindowCloseAsTheAppQuits();
  return stopTheRuntimeWithinTheQuitWaitLimit(stopTheRuntimeAsTheAppQuits, tatolabAppLog).then(
    () => exitTheApp(0),
    (unexpectedFailure: unknown) => {
      tatolabAppLog.error("stopping the runtime as the app quits ended without finishing; Tato Studio quits", { failure: describeCaughtFailure(unexpectedFailure) });
      exitTheApp(0);
    },
  );
}
