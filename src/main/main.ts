// Tatolab.app: opening it shows its window and puts it in the tray, opening it again shows the
// window of the one app already running — or, when the copy opened is another build, quits the
// running one and opens it — closing the window leaves the app in the tray, and
// quitting quits only the app — the runtime stays on. Each opening reconciles the runtime's agent
// with "Run Tatolab"; the first also links the `tatolab` command in the home folder, restarts a
// runtime left running from the bundle before an update, and starts checking for updates on its
// own.

import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import type { DockIconHost } from "./platform/main_window_chrome.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TatolabPlatformItems } from "./platform/tatolab_platform_items.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import {
  checkForTatolabAppUpdatesOnRequest,
  quitTheTatolabApp,
  runInTheBackgroundWithTheController,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
import { tatolabWindowCommandHandlers, type TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import { TatolabMainWindow, type MainWindowHostFactory } from "./tatolab_main_window.js";
import { TatolabAppUpdater, tatolabAppUpdateNotifierOver, type RepeatingTimer, type TatolabAppUpdateFeedForThisBuild } from "./tatolab_app_updater.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { StreamFailureNotifications } from "./stream_failure_notifications.js";
import { TatolabCommandLineToolVersionReadOncePerLaunch } from "./tatolab_command_line_tool_version.js";
import type { SystemNotifications } from "./system_notifications.js";
import { TatolabStatusPublisher } from "./tatolab_status_publisher.js";
import { TatolabTrayMenu, type TrayIconHostFactory, type TrayMenuChoice } from "./tatolab_tray_menu.js";
import type { Result } from "./result.js";
import { isAnExistingFolderOnThisMachine } from "./file_system_entries_on_this_machine.js";
import { StreamProjectAdding, type StreamProjectFolderDialog } from "./stream_project_adding.js";
import { StreamProjectPythonEnvironments, type PythonInterpreterFileDialog } from "./stream_project_python_environments.js";
import { runProgramToCompletion } from "./platform/run_program_to_completion.js";
import { isAnotherBuildOfTatolab, type TatolabAppCopy } from "./tatolab_app_copy_handoff.js";

/** The Electron app as the lifecycle drives it. */
export interface TatolabElectronAppShell {
  /** Which build this copy of the app is and the executable that opens it. */
  readThisCopyOfTatolab(): Promise<TatolabAppCopy>;
  /** Whether this is the one running app; a second launch gets false and hands `thisCopy` to the first. */
  requestTheSingleInstanceLock(thisCopy: TatolabAppCopy): boolean;
  whenReady(): Promise<void>;
  /**
   * Calls `listener` when the user opens the running app again: a second launch, with the copy it handed over, or macOS
   * reopening it from the Dock or Finder, with `null`.
   */
  onTheAppOpenedAgain(listener: (openedCopy: TatolabAppCopy | null) => void): void;
  /** Open `executable` once this process exits. */
  openAnotherCopyOnceThisOneExits(executable: string): void;
  /** Calls `listener` as the app begins to quit, from the tray, the window or the system. */
  onTheAppQuitting(listener: () => void): void;
  exitTheApp(exitCode: number): void;
  setTheApplicationMenu(applicationMenu: ApplicationMenu): void;
  /** This platform's runtime agent, machine setup, local API socket and uninstall, built from `platformItems` with the app's host services. */
  buildTheTatolabPlatformForThisBuild(platformItems: TatolabPlatformItems): Promise<TatolabPlatformForThisBuild>;
  /** Answer each command the window invokes with its handler. */
  answerTheWindowsCommands(tatolabWindowCommandHandlers: TatolabWindowCommandHandlers): void;
  /** Show `folder` in the desktop's file manager, refused in its own words. */
  openAFolderInTheFileManager(folder: string): Promise<Result<void, string>>;
  /** The desktop's folder dialog over the window, which the window's Add stream asks through. */
  askThePersonForAStreamProjectFolder: StreamProjectFolderDialog;
  /** The desktop's file dialog over the window, which Settings picks a Python interpreter through. */
  askThePersonForAPythonInterpreter: PythonInterpreterFileDialog;
  /** The person's home directory, under which new projects are proposed. */
  homeDirectory: string;
  /** The update feed `appUpdatePackaging` reads and takes from, or why this app cannot update itself. */
  createTheAppUpdateFeed(appUpdatePackaging: TatolabAppUpdatePackaging): TatolabAppUpdateFeedForThisBuild;
  /** The desktop's notifications, which updates and failing streams are told through. */
  systemNotifications: SystemNotifications;
  /** The timer the daily update check repeats on. */
  repeatingTimer: RepeatingTimer;
  /** The app's own config directory, where "Run Tatolab" is remembered. */
  appConfigDirectory: string;
  /** Where the runtime this build reads serves its loopback HTTP: the window's content security policy frames it, and the graph's preview pages sit under it. */
  runtimeLoopbackHttpOrigin: string;
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
  const thisCopyOfTatolab = await tatolabElectronAppShell.readThisCopyOfTatolab();
  if (!tatolabElectronAppShell.requestTheSingleInstanceLock(thisCopyOfTatolab)) {
    tatolabAppLog.info("Tatolab is already running; this copy hands it its build", {
      app_version: thisCopyOfTatolab.appVersion,
      executable: thisCopyOfTatolab.executableThatOpensTheCopy,
    });
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
  tatolabElectronAppShell.onTheAppOpenedAgain((openedCopy) => {
    if (openedCopy !== null && isAnotherBuildOfTatolab(thisCopyOfTatolab, openedCopy)) {
      tatolabAppLog.info("another build of Tatolab was opened; this copy quits and opens it", {
        running_app_version: thisCopyOfTatolab.appVersion,
        opened_app_version: openedCopy.appVersion,
        opened_executable: openedCopy.executableThatOpensTheCopy,
      });
      tatolabElectronAppShell.openAnotherCopyOnceThisOneExits(openedCopy.executableThatOpensTheCopy);
      quitTheTatolabApp(tatolabMainWindow, (exitCode) => tatolabElectronAppShell.exitTheApp(exitCode), tatolabAppLog);
      return;
    }
    tatolabMainWindow.show();
    if (sharedStateOnceBuilt === null) return;
    sharedStateOnceBuilt.statusPublisher.sendTheLastPublishedStatusToTheWindow();
    runInTheBackgroundWithTheController(sharedStateOnceBuilt, "tatolab-app-reopened", async (controller, statusPublisher) => {
      await controller.reconcileTheAgentWithTheRunTatolabSwitch();
      statusPublisher.requestRefresh();
    });
  });
  const platformForThisBuild = await tatolabElectronAppShell.buildTheTatolabPlatformForThisBuild(platformItems);
  let statusPublisherOnceBuilt: TatolabStatusPublisher | null = null;
  const tatolabAppUpdater = new TatolabAppUpdater(
    tatolabElectronAppShell.createTheAppUpdateFeed(platformForThisBuild.appUpdatePackaging),
    tatolabAppUpdateNotifierOver(tatolabElectronAppShell.systemNotifications, () => {
      tatolabMainWindow.show();
      statusPublisherOnceBuilt?.sendTheLastPublishedStatusToTheWindow();
    }),
    () => statusPublisherOnceBuilt?.requestRefresh(),
    tatolabAppLog,
  );
  const streamFailureNotifications = await StreamFailureNotifications.load(
    RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(tatolabElectronAppShell.appConfigDirectory, tatolabAppLog),
    tatolabElectronAppShell.systemNotifications,
    (streamId) => {
      tatolabMainWindow.showTheStreamsPage(streamId);
      statusPublisherOnceBuilt?.sendTheLastPublishedStatusToTheWindow();
    },
    tatolabAppLog,
  );
  const tatolabCommandLineToolVersion = new TatolabCommandLineToolVersionReadOncePerLaunch(
    platformForThisBuild.tatolabCommandLineTool,
    runProgramToCompletion,
    tatolabAppLog,
  );
  const streamProjectPythonEnvironments = await StreamProjectPythonEnvironments.load({
    bundledPythonToolchain: platformForThisBuild.bundledPythonToolchain,
    appConfigDirectory: tatolabElectronAppShell.appConfigDirectory,
    pythonInterpreterFileDialog: tatolabElectronAppShell.askThePersonForAPythonInterpreter,
    runProgramToCompletion,
    tatolabAppLog,
  });
  const controller = await TatolabAppController.create({
    platform: platformItems.platform,
    platformForThisBuild,
    appConfigDirectory: tatolabElectronAppShell.appConfigDirectory,
    appLaunchedAtMs,
    appVersion: thisCopyOfTatolab.appVersion,
    appBuild: thisCopyOfTatolab.appBuild,
    runtimeLoopbackHttpOrigin: tatolabElectronAppShell.runtimeLoopbackHttpOrigin,
    readMonotonicClockMs: () => tatolabElectronAppShell.readMonotonicClockMs(),
    readTheAppUpdateState: () => tatolabAppUpdater.state(),
    readStreamFailureNotifications: () => streamFailureNotifications.stateNow(),
    readTheCommandLineToolVersion: () => tatolabCommandLineToolVersion.versionNow(),
    readPythonForNewEnvironments: () => streamProjectPythonEnvironments.pythonForNewEnvironmentsNow(),
    tatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(
    controller,
    (status) => tatolabMainWindow.sendTheWindowTheStatus(status),
    () => tatolabElectronAppShell.readMonotonicClockMs(),
    tatolabAppLog,
  );
  statusPublisherOnceBuilt = statusPublisher;
  statusPublisher.attachStreamFailureNotifications(streamFailureNotifications);
  tatolabElectronAppShell.onTheAppQuitting(() => statusPublisher.stopPolling());
  const sharedState: TatolabAppSharedState = {
    controller,
    statusPublisher,
    tatolabAppUpdater,
    tatolabUninstall: platformForThisBuild.tatolabUninstall,
    streamProjectFolderOpeners: {
      openAFolderInTheFileManager: (folder) => tatolabElectronAppShell.openAFolderInTheFileManager(folder),
      terminalOpenedInAFolder: platformForThisBuild.terminalOpenedInAFolder,
      isAnExistingFolder: isAnExistingFolderOnThisMachine,
    },
    streamProjectAdding: new StreamProjectAdding({
      homeDirectory: tatolabElectronAppShell.homeDirectory,
      streamProjectFolderDialog: tatolabElectronAppShell.askThePersonForAStreamProjectFolder,
      tatolabCommandLineTool: platformForThisBuild.tatolabCommandLineTool,
      runProgramToCompletion,
      makePythonEnvironmentUnlessOneWorks: (projectFolder) => streamProjectPythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder),
      streamRunsOnTheRuntime: controller,
    }),
    streamProjectPythonEnvironments,
    streamFailureNotifications,
    tatolabAppLog,
  };
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
      case "open_login_items_settings":
        runInTheBackgroundWithTheController(sharedState, "tatolab-tray-opened-login-items", async (controller) => {
          const opened = await controller.openLoginItemsSettings();
          if (!opened.ok) tatolabAppLog.warn("Login Items could not be opened from the tray", { failure: opened.failure });
        });
        return;
      case "check_for_app_updates":
        checkForTatolabAppUpdatesOnRequest(sharedState, "tray");
        return;
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
    tatolabAppUpdater.startCheckingOnItsOwn(tatolabElectronAppShell.repeatingTimer);
    await controller.linkTheCommandLineToolInTheHomeFolderAsTheAppOpens();
    await controller.restartTheBundledRuntimeIfTheAppChanged();
    statusPublisher.requestRefresh();
  });
  return { tatolabMainWindow, tatolabTrayMenu, statusPublisher };
}
