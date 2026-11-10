// A test's stand-in for Electron: it records what the app asked of the window, the tray and the
// Dock and the notifications it showed, builds a platform of fakes over the update feed the test sets, and lets the test open the
// app again, launch a second copy, quit it, click a tray item or a notification, or invoke a command as the window does.

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DependencySourceKind, PortViewerImageFrameFacts, StreamProjectFolderChosenFor, SystemMenuBarMenu } from "../shared/tatolab_backend_contract.js";
import type { ProjectFolderDialogPurpose } from "./open_project.js";
import type { AnswerAProjectViewFileRequest } from "./project_view_files.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { FakeCarriedRuntimeStarts, FakeTatolabCommandLineToolLink, fakeTatolabPlatformForThisBuild } from "./fake_tatolab_platform_for_this_build.js";
import type { CarriedRuntime } from "./platform/carried_runtime.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { failedWith, succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabElectronAppShell } from "./main.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import type { MacosActivationPolicy } from "./platform/main_window_chrome.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_commands.js";
import type { MainWindowCloseRequestAnswer, MainWindowSpecification, QuestionOverTheWindow } from "./tatolab_main_window.js";
import type { TrayMenuItemDescription, TrayMenuItemId } from "./tatolab_tray_menu.js";
import type { TatolabAppUpdateFeedForThisBuild } from "./tatolab_app_updater.js";
import type { TatolabAppUpdatePackaging } from "./platform/tatolab_app_update_packaging.js";
import {
  tatolabAppCopyHandedOverOnTheSingleInstanceLock,
  tatolabAppCopyOnTheSingleInstanceLock,
  type TatolabAppCopy,
} from "./tatolab_app_copy_handoff.js";

/** The Projects window's contents id: the first window the app makes. */
export const PROJECTS_WINDOW_CONTENTS_ID = 1;

/** A window the app made, as the fake keeps it. */
interface FakeWindowCreated {
  windowContentsId: number;
  title: string;
  showing: boolean;
  closed: boolean;
  answerCloseRequest: () => MainWindowCloseRequestAnswer;
  whenClosed: () => void;
}

/** One thing the app asked of the fake shell, in order; a studio window's records name its contents id. */
export type FakeShellRecord = (
  | { asked: "create_main_window"; mainWindowSpecification: MainWindowSpecification }
  | { asked: "unminimize" | "show" | "focus" | "hide" | "close" }
  | { asked: "send_window_event"; eventChannel: string; eventPayload: unknown }
  | { asked: "ask_a_question_over_the_window"; question: QuestionOverTheWindow }
  | { asked: "send_window_shared_texture"; frameFacts: PortViewerImageFrameFacts }
  | { asked: "set_activation_policy"; activationPolicy: MacosActivationPolicy }
  | { asked: "show_tray_menu"; trayMenuItems: readonly TrayMenuItemDescription[] }
  | { asked: "exit"; exitCode: number }
  | { asked: "open_another_copy_once_this_one_exits"; executable: string }
  | { asked: "notify"; title: string; body: string }
  | { asked: "repeat_every"; intervalMs: number }
  | { asked: "set_application_menu"; applicationMenu: ApplicationMenu; menusOfTheFocusedWindow: readonly SystemMenuBarMenu[] | null }
  | { asked: "open_folder_in_the_file_manager"; folder: string }
  | { asked: "ask_for_a_stream_project_folder"; chosenFor: StreamProjectFolderChosenFor; defaultFolder: string }
  | { asked: "ask_for_a_project_folder"; chosenFor: ProjectFolderDialogPurpose; defaultFolder: string }
  | { asked: "ask_for_a_dependency_source"; sourceKind: DependencySourceKind; defaultFolder: string }
  | { asked: "ask_for_files_to_import_as_assets"; defaultFolder: string }
  | { asked: "ask_for_a_project_archive"; defaultFolder: string }
  | { asked: "ask_for_a_project_cover_image"; defaultFolder: string }
) & { windowContentsId?: number };

/** A fake Electron app shell for the lifecycle's tests. */
export class FakeTatolabElectronAppShell {
  readonly records: FakeShellRecord[] = [];
  readonly writtenLogLines: string[] = [];
  readonly tatolabAppLog = createTatolabAppLog("debug", (logLine) => this.writtenLogLines.push(logLine));
  holdsTheSingleInstanceLock = true;
  /** The button the person chooses in each next question asked over a window, in order; past the last, its cancel button. */
  readonly buttonsChosenInTheNextQuestionsOverAWindow: number[] = [];
  /** The copy this app reads itself as. */
  thisCopyOfTatolab: TatolabAppCopy = {
    executableThatOpensTheCopy: "/Applications/Tato Studio.app/Contents/MacOS/Tato Studio",
    appVersion: "0.45.0",
    appBuild: { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: false },
    carriedStreamlibCommit: "5e1f0c2a9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f",
  };
  /** The additional data each single-instance lock request handed over, as Electron would carry it. */
  readonly singleInstanceLockAdditionalData: unknown[] = [];
  mainWindowCreationFailure: string | null = null;
  /** Whether the fake window is on screen: shown and not hidden since. */
  mainWindowShowing = false;
  /** The runtimes the app started, which the test ends. */
  readonly carriedRuntimeStarts = new FakeCarriedRuntimeStarts();
  /** The runtime this build carries; `undefined` for the fake's own, `null` for a build that carries none. */
  carriedRuntime: CarriedRuntime | null | undefined = undefined;
  commandLineToolLink = new FakeTatolabCommandLineToolLink();
  appUpdatePackaging: TatolabAppUpdatePackaging = { kind: "not_offered", reason: "this fake platform updates nothing" };
  appUpdateFeedForThisBuild: TatolabAppUpdateFeedForThisBuild = { kind: "not_offered", reason: "this fake platform updates nothing" };
  /** The folder the fake dialog answers with; `null` reads as the person cancelling it. */
  streamProjectFolderTheDialogAnswers: string | null = null;
  /** The package catalog the fake network serves; `null` refuses every fetch. */
  packageCatalogTextServed: string | null = null;
  /** The socket the app reads the runtime's local API at; `null` for one no runtime answers. */
  localApiSocketPath: string | null = null;
  /** The bytes each URL serves over HTTPS, a Marketplace `.zip` among them; any other URL is refused. */
  readonly bytesServedByUrl = new Map<string, Buffer>();
  /** Every URL the app fetched over HTTPS, in order. */
  readonly urlsFetched: string[] = [];
  /** How the running app answers a request for a project view's file, once it has handed that over. */
  answerAProjectViewFileRequest: AnswerAProjectViewFileRequest | null = null;
  /** The folder the project dialog answers, or `null` for the person cancelling. */
  projectFolderTheDialogAnswers: string | null = null;
  /** The folder or `.zip` the dependency source dialog answers, or `null` for the person cancelling. */
  dependencySourceTheDialogAnswers: string | null = null;
  assetFilesTheDialogAnswers: readonly string[] | null = null;
  /** The `.zip` the project archive dialog answers, or `null` for the person cancelling. */
  projectArchiveTheDialogAnswers: string | null = null;
  /** The image the project cover image dialog answers, or `null` for the person cancelling. */
  projectCoverImageTheDialogAnswers: string | null = null;
  readonly systemNotifications = new FakeSystemNotifications((notificationShown) => this.records.push({ asked: "notify", ...notificationShown }));
  readonly appConfigDirectory = path.join(os.tmpdir(), `tl-app-config-${randomUUID()}`);
  private tatolabWindowCommandHandlers: TatolabWindowCommandHandlers | null = null;
  private readonly appOpenedAgainListeners: ((openedCopy: TatolabAppCopy | null) => void)[] = [];
  private readonly appQuittingListeners: (() => void)[] = [];
  private readonly quitHoldingWork: (() => Promise<void> | null)[] = [];
  /** What the last quit the system asked for is held on; `null` before one, or when nothing held it. */
  quitHeldUntil: Promise<void> | null = null;
  private answerCloseRequest: (() => MainWindowCloseRequestAnswer) | null = null;
  private readonly windowsCreated: FakeWindowCreated[] = [];
  private clickTrayMenuItem: ((trayMenuItemId: TrayMenuItemId) => void) | null = null;
  private chooseTheShownSystemMenuBarEntry: (entryId: string) => void = () => {};
  private readonly windowFocusedListeners: ((windowContentsId: number) => void)[] = [];
  private readonly windowClosedListeners: ((windowContentsId: number) => void)[] = [];

  /** The shell `startTatolabApp` takes. */
  readonly tatolabElectronAppShell: TatolabElectronAppShell = {
    readThisCopyOfTatolab: async () => this.thisCopyOfTatolab,
    requestTheSingleInstanceLock: (thisCopy) => {
      this.singleInstanceLockAdditionalData.push(structuredClone(tatolabAppCopyOnTheSingleInstanceLock(thisCopy)));
      return this.holdsTheSingleInstanceLock;
    },
    whenReady: async () => {},
    onTheAppOpenedAgain: (listener) => this.appOpenedAgainListeners.push(listener),
    onTheAppQuitting: (listener) => this.appQuittingListeners.push(listener),
    holdTheQuitUntil: (workBeforeTheQuitGoesOn) => this.quitHoldingWork.push(workBeforeTheQuitGoesOn),
    exitTheApp: (exitCode) => this.records.push({ asked: "exit", exitCode }),
    openAnotherCopyOnceThisOneExits: (executable) => this.records.push({ asked: "open_another_copy_once_this_one_exits", executable }),
    setTheApplicationMenu: (applicationMenu, menusOfTheFocusedWindow, whenAnEntryIsChosen) => {
      this.chooseTheShownSystemMenuBarEntry = whenAnEntryIsChosen;
      this.records.push({ asked: "set_application_menu", applicationMenu, menusOfTheFocusedWindow: structuredClone(menusOfTheFocusedWindow) });
    },
    onAWindowFocused: (listener) => this.windowFocusedListeners.push(listener),
    onAWindowClosed: (listener) => this.windowClosedListeners.push(listener),
    buildTheTatolabPlatformForThisBuild: async () =>
      fakeTatolabPlatformForThisBuild({
        localApiSocket: this.localApiSocketPath ?? path.join(this.appConfigDirectory, "no-runtime.sock"),
        carriedRuntime: this.carriedRuntime,
        commandLineToolLink: this.commandLineToolLink,
        appUpdatePackaging: this.appUpdatePackaging,
      }),
    startTheCarriedRuntime: (carriedRuntime, whenItExits) => this.carriedRuntimeStarts.startTheCarriedRuntime(carriedRuntime, whenItExits),
    answerTheWindowsCommands: (tatolabWindowCommandHandlers) => {
      this.tatolabWindowCommandHandlers = tatolabWindowCommandHandlers;
    },
    openAFolderInTheFileManager: async (folder) => {
      this.records.push({ asked: "open_folder_in_the_file_manager", folder });
      return succeeded(undefined);
    },
    askThePersonForAStreamProjectFolder: async (chosenFor, defaultFolder) => {
      this.records.push({ asked: "ask_for_a_stream_project_folder", chosenFor, defaultFolder });
      return succeeded(this.streamProjectFolderTheDialogAnswers);
    },
    askThePersonForAProjectFolder: async (chosenFor, defaultFolder) => {
      this.records.push({ asked: "ask_for_a_project_folder", chosenFor, defaultFolder });
      return succeeded(this.projectFolderTheDialogAnswers);
    },
    askThePersonForAProjectArchive: async (defaultFolder) => {
      this.records.push({ asked: "ask_for_a_project_archive", defaultFolder });
      return succeeded(this.projectArchiveTheDialogAnswers);
    },
    askThePersonForAProjectCoverImage: async (defaultFolder) => {
      this.records.push({ asked: "ask_for_a_project_cover_image", defaultFolder });
      return succeeded(this.projectCoverImageTheDialogAnswers);
    },
    askThePersonForADependencySource: async (sourceKind, defaultFolder) => {
      this.records.push({ asked: "ask_for_a_dependency_source", sourceKind, defaultFolder });
      return succeeded(this.dependencySourceTheDialogAnswers);
    },
    askThePersonForFilesToImportAsAssets: async (defaultFolder) => {
      this.records.push({ asked: "ask_for_files_to_import_as_assets", defaultFolder });
      return succeeded(this.assetFilesTheDialogAnswers);
    },
    watchFolderEntries: () => null,
    fetchTextOverHttps: async (url) => {
      this.urlsFetched.push(url);
      return this.packageCatalogTextServed === null ? failedWith("the fake shell reaches no network") : succeeded(this.packageCatalogTextServed);
    },
    fetchBytesOverHttps: async (url) => {
      this.urlsFetched.push(url);
      const bytesServed = this.bytesServedByUrl.get(url);
      return bytesServed === undefined ? failedWith("the fake shell reaches no network") : succeeded(bytesServed);
    },
    startANodeLanguageServer: () => failedWith("the fake shell starts no language server"),
    pyrightLanguageServerModulePath: "/fake/node_modules/pyright/langserver.index.js",
    runtimeViewerFrameImportAddonPath: "/fake/out/native/tatolab_runtime_viewer_frame_import.node",
    mainProcessId: 4242,
    homeDirectory: path.join(this.appConfigDirectory, "home"),
    personSignedInToThisMachine: "sam",
    answerProjectViewFileRequestsWith: (answerAProjectViewFileRequest) => {
      this.answerAProjectViewFileRequest = answerAProjectViewFileRequest;
    },
    documentsDirectory: path.join(this.appConfigDirectory, "home", "Documents"),
    createTheAppUpdateFeed: () => this.appUpdateFeedForThisBuild,
    systemNotifications: this.systemNotifications,
    repeatingTimer: (intervalMs) => this.records.push({ asked: "repeat_every", intervalMs }),
    appConfigDirectory: this.appConfigDirectory,
    thePersonSignedInToThisComputer: { kind: "person", name: "sam" },
    readMonotonicClockMs: () => 0,
    readWallClockMsForDisplay: () => 1_790_000_000_000,
    mainWindowHostFactory: {
      createMainWindowHost: (mainWindowSpecification, answerCloseRequest, whenClosed) => {
        if (this.mainWindowCreationFailure !== null) return failedWith(this.mainWindowCreationFailure);
        const windowContentsId = this.windowsCreated.length + 1;
        // The first window is the Projects window, whose records name no window; each studio window's name its contents id.
        const recordOfThisWindow = (fakeShellRecord: FakeShellRecord): FakeShellRecord =>
          windowContentsId === PROJECTS_WINDOW_CONTENTS_ID ? fakeShellRecord : { ...fakeShellRecord, windowContentsId };
        const fakeWindow: FakeWindowCreated = { windowContentsId, title: mainWindowSpecification.title, showing: false, closed: false, answerCloseRequest, whenClosed };
        this.windowsCreated.push(fakeWindow);
        this.records.push(recordOfThisWindow({ asked: "create_main_window", mainWindowSpecification }));
        if (windowContentsId === PROJECTS_WINDOW_CONTENTS_ID) this.answerCloseRequest = answerCloseRequest;
        return succeeded({
          windowContentsId,
          unminimize: () => this.records.push(recordOfThisWindow({ asked: "unminimize" })),
          show: () => {
            fakeWindow.showing = true;
            if (windowContentsId === PROJECTS_WINDOW_CONTENTS_ID) this.mainWindowShowing = true;
            this.records.push(recordOfThisWindow({ asked: "show" }));
          },
          focus: () => this.records.push(recordOfThisWindow({ asked: "focus" })),
          hide: () => {
            fakeWindow.showing = false;
            if (windowContentsId === PROJECTS_WINDOW_CONTENTS_ID) this.mainWindowShowing = false;
            this.records.push(recordOfThisWindow({ asked: "hide" }));
          },
          close: () => this.closeTheFakeWindow(fakeWindow),
          isShowing: () => fakeWindow.showing,
          askAQuestionOverTheWindow: (question) => {
            this.records.push(recordOfThisWindow({ asked: "ask_a_question_over_the_window", question }));
            return Promise.resolve(succeeded(this.buttonsChosenInTheNextQuestionsOverAWindow.shift() ?? question.cancelButtonIndex));
          },
          sendTheWindowAnEvent: (eventChannel, eventPayload) => this.records.push(recordOfThisWindow({ asked: "send_window_event", eventChannel, eventPayload })),
          sendTheWindowASharedTexture: (_sharedTextureImport, frameFacts, whenEveryReferenceIsReleased) => {
            this.records.push(recordOfThisWindow({ asked: "send_window_shared_texture", frameFacts }));
            whenEveryReferenceIsReleased();
            return Promise.resolve(succeeded(undefined));
          },
        });
      },
    },
    trayIconHostFactory: {
      createTrayIcon: (_trayIconImage, _tooltip, onMenuItemClicked) => {
        this.clickTrayMenuItem = onMenuItemClicked;
        return { showMenu: (trayMenuItems) => this.records.push({ asked: "show_tray_menu", trayMenuItems }) };
      },
    },
    dockIconHost: {
      setActivationPolicy: (activationPolicy) => this.records.push({ asked: "set_activation_policy", activationPolicy }),
    },
  };

  /** What the app asked for, as just the `asked` names. */
  askedFor(): string[] {
    return this.records.map((fakeShellRecord) => fakeShellRecord.asked);
  }

  forgetTheRecords(): void {
    this.records.length = 0;
  }

  /** Open the app again from the Dock or Finder, which hands over no copy. */
  openTheAppAgain(): void {
    for (const appOpenedAgainListener of this.appOpenedAgainListeners) appOpenedAgainListener(null);
  }

  /** Launch a second copy, which hands the running app `additionalDataOnTheLock` as Electron's `second-instance` does. */
  launchASecondCopy(additionalDataOnTheLock: unknown): void {
    const openedCopy = tatolabAppCopyHandedOverOnTheSingleInstanceLock(structuredClone(additionalDataOnTheLock));
    for (const appOpenedAgainListener of this.appOpenedAgainListeners) appOpenedAgainListener(openedCopy);
  }

  beginQuitting(): void {
    for (const appQuittingListener of this.appQuittingListeners) appQuittingListener();
    const workHoldingTheQuit = this.quitHoldingWork.map((work) => work()).filter((work) => work !== null);
    this.quitHeldUntil = workHoldingTheQuit.length === 0 ? null : Promise.all(workHoldingTheQuit).then(() => undefined);
  }

  /** The studio windows the app made and has not closed, by title and contents id. */
  studioWindowsOpen(): { title: string; windowContentsId: number; showing: boolean }[] {
    return this.windowsCreated
      .filter((fakeWindow) => fakeWindow.windowContentsId !== PROJECTS_WINDOW_CONTENTS_ID && !fakeWindow.closed)
      .map(({ title, windowContentsId, showing }) => ({ title, windowContentsId, showing }));
  }

  /** Press the close button of the window `windowContentsId`, as its close button does, answering what the app chose. */
  requestTheCloseOfTheWindow(windowContentsId: number): MainWindowCloseRequestAnswer | null {
    const fakeWindow = this.windowsCreated.find((windowCreated) => windowCreated.windowContentsId === windowContentsId && !windowCreated.closed);
    if (fakeWindow === undefined) return null;
    const answer = fakeWindow.answerCloseRequest();
    if (answer === "let_it_close") this.closeTheFakeWindow(fakeWindow);
    return answer;
  }

  private closeTheFakeWindow(fakeWindow: FakeWindowCreated): void {
    if (fakeWindow.closed) return;
    fakeWindow.closed = true;
    fakeWindow.showing = false;
    this.records.push({ asked: "close", ...(fakeWindow.windowContentsId === PROJECTS_WINDOW_CONTENTS_ID ? {} : { windowContentsId: fakeWindow.windowContentsId }) });
    fakeWindow.whenClosed();
    for (const windowClosedListener of this.windowClosedListeners) windowClosedListener(fakeWindow.windowContentsId);
  }

  /** Bring the window `windowContentsId` into focus, as a click on it does. */
  focusTheWindow(windowContentsId: number): void {
    for (const windowFocusedListener of this.windowFocusedListeners) windowFocusedListener(windowContentsId);
  }

  /** Choose `entryId` in the system menu bar as it was last shown. */
  chooseTheSystemMenuBarEntry(entryId: string): void {
    this.chooseTheShownSystemMenuBarEntry(entryId);
  }

  /** Close the window as its close button does, answering what the app chose. */
  requestTheWindowClose(): MainWindowCloseRequestAnswer | null {
    return this.answerCloseRequest?.() ?? null;
  }

  clickTheNotification(): void {
    this.systemNotifications.clickTheLastNotification();
  }

  clickTheTrayMenuItem(trayMenuItemId: TrayMenuItemId): void {
    this.clickTrayMenuItem?.(trayMenuItemId);
  }

  /** Invoke `commandName` as the window `fromWindowContentsId` (the Projects window unless named) does; refused when the app answers no commands. */
  invokeTheCommand<CommandName extends TatolabCommandName>(
    commandName: CommandName,
    commandArguments?: unknown,
    fromWindowContentsId: number = PROJECTS_WINDOW_CONTENTS_ID,
  ): Promise<TatolabCommandAnswerTo<CommandName>> {
    if (this.tatolabWindowCommandHandlers === null) return Promise.resolve({ ok: false, refusal: "the app answers no commands" });
    return this.tatolabWindowCommandHandlers[commandName](commandArguments, { windowContentsId: fromWindowContentsId });
  }

  removeTheAppConfigDirectory(): Promise<void> {
    // The launch's background work may still be writing into it, which `maxRetries` waits out.
    return rm(this.appConfigDirectory, { recursive: true, force: true, maxRetries: 5 });
  }
}
