// Tato Studio: opening it starts the runtime it carries as its own child, shows the Projects
// window and puts it in the tray; each project opens in its own studio window, and every window
// shares the one runtime. Opening the app again shows the Projects window of the one app already
// running — or, when the copy opened is another build, quits the running one and opens it.
// Closing every window leaves the app and its runtime in the tray, so the CLI and MCP keep
// working; quitting stops both. The first opening also links the `tatolab` command in the home
// folder and starts checking for updates on its own.

import type { FetchTextOverHttps } from "./package_catalog.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { SystemMenuBarMenu } from "../shared/tatolab_backend_contract.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import type { StartTheCarriedRuntimeAsAChildProcess } from "./platform/carried_runtime.js";
import type { DockIconHost } from "./platform/main_window_chrome.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import type { TatolabPlatformForThisBuild } from "./platform/tatolab_platform_for_this_build.js";
import type { TatolabPlatformItems } from "./platform/tatolab_platform_items.js";
import { TatolabAppController } from "./tatolab_app_controller.js";
import { describeCaughtFailure } from "./result.js";
import {
  runTatolabAppUpdateWorkInTheBackground,
  quitTheTatolabApp,
  stopTheRuntimeWithinTheQuitWaitLimit,
  runInTheBackgroundWithTheController,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";
import { tatolabWindowCommandHandlers, type TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import type { MainWindowHostFactory } from "./tatolab_main_window.js";
import { TatolabAppWindows } from "./tatolab_app_windows.js";
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
import { ProjectOpening, type FolderEntriesWatch, type ProjectFolderDialog } from "./open_project.js";
import { PythonLanguageServers, type StartANodeLanguageServer } from "./python_language_servers.js";
import { LocalApiMcpStdioConnection } from "./local_api_mcp_stdio_connection.js";
import { RuntimePortViewers } from "./runtime_port_viewers.js";
import { SystemMenuBarOfTheFocusedWindow } from "./system_menu_bar_of_the_focused_window.js";
import { runtimeViewerChannelReaderOpenerOver } from "./runtime_viewer_frame_import_addon.js";
import { recentProjectFoldersFileIn } from "./recent_project_folders_file.js";
import { runProgramToCompletion } from "./platform/run_program_to_completion.js";
import { isAnotherBuildOfTatolab, type TatolabAppCopy } from "./tatolab_app_copy_handoff.js";

/** How long a port viewer's `open_viewer` or `close_viewer` waits on the runtime. */
const PORT_VIEWER_REQUEST_TIMEOUT_MS = 5_000;

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
  /** As the system quits the app (Cmd-Q, logging out, an update's install), hold the quit until the work `workBeforeTheQuitGoesOn` hands back has finished; `null` lets the quit go on at once. */
  holdTheQuitUntil(workBeforeTheQuitGoesOn: () => Promise<void> | null): void;
  exitTheApp(exitCode: number): void;
  /** Show `menusOfTheFocusedWindow` in the system menu bar, or the default bar for `null`; `whenAnEntryIsChosen` hears each entry the person chooses. */
  setTheApplicationMenu(applicationMenu: ApplicationMenu, menusOfTheFocusedWindow: readonly SystemMenuBarMenu[] | null, whenAnEntryIsChosen: (entryId: string) => void): void;
  /** Calls `listener` with a window's page id each time that window comes into focus. */
  onAWindowFocused(listener: (windowContentsId: number) => void): void;
  /** Calls `listener` with a window's page id once that window has closed. */
  onAWindowClosed(listener: (windowContentsId: number) => void): void;
  /** This platform's carried runtime, the command's link and the local API socket, built from `platformItems` with the app's host services. */
  buildTheTatolabPlatformForThisBuild(platformItems: TatolabPlatformItems): Promise<TatolabPlatformForThisBuild>;
  /** Answer each command the window invokes with its handler. */
  answerTheWindowsCommands(tatolabWindowCommandHandlers: TatolabWindowCommandHandlers): void;
  /** Show `folder` in the desktop's file manager, refused in its own words. */
  openAFolderInTheFileManager(folder: string): Promise<Result<void, string>>;
  /** The desktop's folder dialog over the window, which the window's Add stream asks through. */
  askThePersonForAStreamProjectFolder: StreamProjectFolderDialog;
  /** The desktop's folder dialog over the window, which the studio opens and creates a project through. */
  askThePersonForAProjectFolder: ProjectFolderDialog;
  /** How the code pane's language servers start, each in its own process. */
  startANodeLanguageServer: StartANodeLanguageServer;
  /** Pyright's `langserver.index.js` as this build carries it. */
  pyrightLanguageServerModulePath: string;
  /** Tato Studio's viewer addon as this build carries it. */
  runtimeViewerFrameImportAddonPath: string;
  /** The main process's id, which `open_viewer` admits to import the runtime's frames. */
  mainProcessId: number;
  /** Watching the entries directly in one folder, which the open project reads again on. */
  watchFolderEntries: FolderEntriesWatch;
  /** Fetching a file over HTTPS, which Get more reads the package catalog through. */
  fetchTextOverHttps: FetchTextOverHttps;
  /** The person's home directory, where the folder dialog opens, or at `~/streams` for a new stream project once that folder exists. */
  homeDirectory: string;
  /** The platform's Documents folder, where new projects go under `Tato Studio/`. */
  documentsDirectory: string;
  /** The update feed `appUpdatePackaging` reads and takes from, or why this app cannot update itself. */
  createTheAppUpdateFeed(appUpdatePackaging: TatolabAppUpdatePackaging): TatolabAppUpdateFeedForThisBuild;
  /** The desktop's notifications, which updates and failing streams are told through. */
  systemNotifications: SystemNotifications;
  /** The timer the daily update check repeats on. */
  repeatingTimer: RepeatingTimer;
  /** How the carried runtime is started as the app's child. */
  startTheCarriedRuntime: StartTheCarriedRuntimeAsAChildProcess;
  /** The app's own config directory, where its switches and recent projects are remembered. */
  appConfigDirectory: string;
  readMonotonicClockMs(): number;
  /** The wall clock, in milliseconds since the epoch, only ever shown to the person, as when the Projects window says a project was opened. */
  readWallClockMsForDisplay(): number;
  mainWindowHostFactory: MainWindowHostFactory;
  trayIconHostFactory: TrayIconHostFactory;
  dockIconHost: DockIconHost;
}

/** The running app's windows, tray and status publisher, which the process holds for its whole life: a tray nothing references is collected and leaves the menu bar or panel. */
export interface TatolabRunningApp {
  tatolabAppWindows: TatolabAppWindows;
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
    tatolabAppLog.error("Tato Studio runs on macOS and Linux only");
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
  let pythonLanguageServersOnceBuilt: PythonLanguageServers | null = null;
  let runtimePortViewersOnceBuilt: RuntimePortViewers | null = null;
  const tatolabAppWindows = new TatolabAppWindows({
    mainWindowHostFactory: tatolabElectronAppShell.mainWindowHostFactory,
    platformItems,
    dockIconHost: tatolabElectronAppShell.dockIconHost,
    watchFolderEntries: tatolabElectronAppShell.watchFolderEntries,
    runAfter: (delayMs, work) => {
      const timer = setTimeout(work, delayMs);
      return () => clearTimeout(timer);
    },
    whenAStudioWindowClosed: (studioWindow) => pythonLanguageServersOnceBuilt?.stopTheLanguageServersOf(studioWindow.languageServerOfTheWindow),
    whenAWindowShowingPortViewersClosed: (tatolabMainWindow) => runtimePortViewersOnceBuilt?.closeThePortViewersOf(tatolabMainWindow),
    tatolabAppLog,
  });
  tatolabElectronAppShell.onTheAppQuitting(() => tatolabAppWindows.letEveryWindowCloseAsTheAppQuits());
  await tatolabElectronAppShell.whenReady();
  const systemMenuBar = new SystemMenuBarOfTheFocusedWindow({
    applicationMenu: platformItems.applicationMenu,
    setTheApplicationMenu: (applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen) =>
      tatolabElectronAppShell.setTheApplicationMenu(applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen),
    sendTheWindowTheChosenEntry: (windowContentsId, entryId) => tatolabAppWindows.windowWithContents(windowContentsId)?.sendTheWindowTheChosenSystemMenuBarEntry(entryId),
  });
  systemMenuBar.showTheDefaultMenuBar();
  tatolabElectronAppShell.onAWindowFocused((windowContentsId) => systemMenuBar.noticeTheWindowFocused(windowContentsId));
  tatolabElectronAppShell.onAWindowClosed((windowContentsId) => systemMenuBar.forgetTheWindow(windowContentsId));
  let sharedStateOnceBuilt: TatolabAppSharedState | null = null;
  tatolabElectronAppShell.onTheAppOpenedAgain((openedCopy) => {
    if (openedCopy !== null && isAnotherBuildOfTatolab(thisCopyOfTatolab, openedCopy)) {
      tatolabAppLog.info("another build of Tatolab was opened; this copy quits and opens it", {
        running_app_version: thisCopyOfTatolab.appVersion,
        opened_app_version: openedCopy.appVersion,
        opened_executable: openedCopy.executableThatOpensTheCopy,
      });
      tatolabElectronAppShell.openAnotherCopyOnceThisOneExits(openedCopy.executableThatOpensTheCopy);
      quitTheTatolabApp(
        tatolabAppWindows,
        () => sharedStateOnceBuilt?.controller.stopTheRuntimeAsTheAppQuits() ?? Promise.resolve(),
        (exitCode) => tatolabElectronAppShell.exitTheApp(exitCode),
        tatolabAppLog,
      );
      return;
    }
    tatolabAppWindows.showTheProjectsWindow();
    if (sharedStateOnceBuilt === null) return;
    sharedStateOnceBuilt.statusPublisher.sendTheLastPublishedStatusToTheWindow();
    sharedStateOnceBuilt.statusPublisher.requestRefresh();
  });
  const platformForThisBuild = await tatolabElectronAppShell.buildTheTatolabPlatformForThisBuild(platformItems);
  let statusPublisherOnceBuilt: TatolabStatusPublisher | null = null;
  const tatolabAppUpdater = new TatolabAppUpdater(
    tatolabElectronAppShell.createTheAppUpdateFeed(platformForThisBuild.appUpdatePackaging),
    tatolabAppUpdateNotifierOver(tatolabElectronAppShell.systemNotifications, () => {
      tatolabAppWindows.showTheProjectsWindow();
      statusPublisherOnceBuilt?.sendTheLastPublishedStatusToTheWindow();
    }),
    () => statusPublisherOnceBuilt?.requestRefresh(),
    tatolabAppLog,
  );
  const streamFailureNotifications = await StreamFailureNotifications.load(
    RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(tatolabElectronAppShell.appConfigDirectory, tatolabAppLog),
    tatolabElectronAppShell.systemNotifications,
    (streamId) => {
      const listedStream = statusPublisherOnceBuilt?.lastPublishedStatusNow()?.streams?.find((stream) => stream.stream === streamId);
      tatolabAppWindows
        .showTheStreamsPageInItsProjectsWindow(streamId, listedStream?.location?.project_directory ?? null)
        .then(() => statusPublisherOnceBuilt?.sendTheLastPublishedStatusToTheWindow())
        .catch((unexpectedFailure: unknown) =>
          tatolabAppLog.error("showing a failed stream's page ended without finishing", { stream: streamId, failure: describeCaughtFailure(unexpectedFailure) }),
        );
    },
    tatolabAppLog,
  );
  const tatolabCommandLineToolVersion = new TatolabCommandLineToolVersionReadOncePerLaunch(
    platformForThisBuild.tatolabCommandLineTool,
    runProgramToCompletion,
    tatolabAppLog,
  );
  const controller = TatolabAppController.create({
    platform: platformItems.platform,
    platformForThisBuild,
    startTheCarriedRuntime: tatolabElectronAppShell.startTheCarriedRuntime,
    appVersion: thisCopyOfTatolab.appVersion,
    appBuild: thisCopyOfTatolab.appBuild,
    readMonotonicClockMs: () => tatolabElectronAppShell.readMonotonicClockMs(),
    readTheAppUpdateState: () => tatolabAppUpdater.state(),
    readStreamFailureNotifications: () => streamFailureNotifications.stateNow(),
    readTheCommandLineToolVersion: () => tatolabCommandLineToolVersion.versionNow(),
    whenTheRuntimeExits: () => statusPublisherOnceBuilt?.requestRefresh(),
    tatolabAppLog,
  });
  const statusPublisher = new TatolabStatusPublisher(
    controller,
    (status) => tatolabAppWindows.sendEveryWindowTheStatus(status),
    () => tatolabElectronAppShell.readMonotonicClockMs(),
    tatolabAppLog,
  );
  statusPublisherOnceBuilt = statusPublisher;
  statusPublisher.attachStreamFailureNotifications(streamFailureNotifications);
  tatolabElectronAppShell.onTheAppQuitting(() => statusPublisher.stopPolling());
  tatolabElectronAppShell.holdTheQuitUntil(() => {
    const aRuntimeTheAppStartedIsRunning = controller.aRuntimeTheAppStartedIsRunning();
    const runtimeStopped = stopTheRuntimeWithinTheQuitWaitLimit(() => controller.stopTheRuntimeAsTheAppQuits(), tatolabAppLog);
    return aRuntimeTheAppStartedIsRunning ? runtimeStopped : null;
  });
  const projectOpening = new ProjectOpening({
    homeDirectory: tatolabElectronAppShell.homeDirectory,
    documentsDirectory: tatolabElectronAppShell.documentsDirectory,
    projectFolderDialog: tatolabElectronAppShell.askThePersonForAProjectFolder,
    recentProjectFolders: recentProjectFoldersFileIn(tatolabElectronAppShell.appConfigDirectory, tatolabAppLog),
    readWallClockNowMs: () => tatolabElectronAppShell.readWallClockMsForDisplay(),
    newProjectCreation: controller,
    openTheProjectInItsStudioWindow: (folder) => tatolabAppWindows.openTheProjectInItsStudioWindow(folder),
  });
  const pythonLanguageServers = new PythonLanguageServers({
    startANodeLanguageServer: tatolabElectronAppShell.startANodeLanguageServer,
    pyrightLanguageServerModulePath: tatolabElectronAppShell.pyrightLanguageServerModulePath,
    tatolabAppLog,
  });
  pythonLanguageServersOnceBuilt = pythonLanguageServers;
  const runtimePortViewers = new RuntimePortViewers({
    openTheViewerConnection: () => LocalApiMcpStdioConnection.open(platformForThisBuild.localApiSocket, PORT_VIEWER_REQUEST_TIMEOUT_MS, thisCopyOfTatolab.appVersion),
    openAChannelReader: runtimeViewerChannelReaderOpenerOver(tatolabElectronAppShell.runtimeViewerFrameImportAddonPath),
    viewerProcessId: tatolabElectronAppShell.mainProcessId,
    repeatEvery: (everyMs, tick) => {
      const repeatingTimer = setInterval(tick, everyMs);
      return () => clearInterval(repeatingTimer);
    },
    waitThen: (afterMs, then) => {
      setTimeout(then, afterMs);
    },
    tatolabAppLog,
  });
  runtimePortViewersOnceBuilt = runtimePortViewers;
  const sharedState: TatolabAppSharedState = {
    controller,
    statusPublisher,
    tatolabAppUpdater,
    streamProjectFolderOpeners: {
      openAFolderInTheFileManager: (folder) => tatolabElectronAppShell.openAFolderInTheFileManager(folder),
      terminalOpenedInAFolder: platformForThisBuild.terminalOpenedInAFolder,
      isAnExistingFolder: isAnExistingFolderOnThisMachine,
    },
    streamProjectAdding: new StreamProjectAdding({
      homeDirectory: tatolabElectronAppShell.homeDirectory,
      streamProjectFolderDialog: tatolabElectronAppShell.askThePersonForAStreamProjectFolder,
      projectLoadsOnTheRuntime: controller,
    }),
    streamFailureNotifications,
    projectOpening,
    appWindows: tatolabAppWindows,
    pythonLanguageServers,
    runtimePortViewers,
    systemMenuBar,
    fetchTextOverHttps: tatolabElectronAppShell.fetchTextOverHttps,
    tatolabAppLog,
  };
  tatolabElectronAppShell.onTheAppQuitting(() => tatolabAppWindows.stopWatchingEveryProject());
  tatolabElectronAppShell.onTheAppQuitting(() => sharedState.pythonLanguageServers.stopEveryLanguageServer());
  tatolabElectronAppShell.onTheAppQuitting(() => sharedState.runtimePortViewers.closeEveryPortViewer());
  const quitTheApp = () =>
    quitTheTatolabApp(
      tatolabAppWindows,
      () => controller.stopTheRuntimeAsTheAppQuits(),
      (exitCode) => tatolabElectronAppShell.exitTheApp(exitCode),
      tatolabAppLog,
    );
  const showTheWindowWithTheLastStatus = () => {
    tatolabAppWindows.showTheProjectsWindow();
    statusPublisher.sendTheLastPublishedStatusToTheWindow();
  };
  tatolabElectronAppShell.answerTheWindowsCommands(tatolabWindowCommandHandlers(sharedState, quitTheApp));
  sharedStateOnceBuilt = sharedState;
  const onTrayMenuChoice = (trayMenuChoice: TrayMenuChoice) => {
    switch (trayMenuChoice) {
      case "open_tatolab":
        showTheWindowWithTheLastStatus();
        return;
      case "respond_to_the_app_updates_item":
        runTatolabAppUpdateWorkInTheBackground(sharedState, "the tray's updates item", (tatolabAppUpdater) => tatolabAppUpdater.respondToTheTrayUpdatesItem());
        return;
      case "quit_the_app":
        quitTheApp();
        return;
    }
  };
  const tatolabTrayMenu = TatolabTrayMenu.build(tatolabElectronAppShell.trayIconHostFactory, platformItems.trayIconImage, onTrayMenuChoice);
  statusPublisher.attachTrayMenu(tatolabTrayMenu);
  showTheWindowWithTheLastStatus();
  runInTheBackgroundWithTheController(sharedState, "tatolab-app-opened", async (controller, statusPublisher) => {
    statusPublisher.startPolling();
    tatolabAppUpdater.startCheckingOnItsOwn(tatolabElectronAppShell.repeatingTimer);
    await controller.linkTheCommandLineToolUnlessSomethingElseHoldsTheName();
    statusPublisher.requestRefresh();
  });
  return { tatolabAppWindows, tatolabTrayMenu, statusPublisher };
}
