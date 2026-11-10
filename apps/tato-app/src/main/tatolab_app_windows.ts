// The app's windows: one Projects window, one studio window per open project, and the views
// popped out of a studio window and its Module manager window, all sharing the one runtime. Opening a
// project that already has a window brings that window forward. Closing a studio window closes it
// and the windows it opened, first asking to stop its project while any stream of it runs; closing
// the Projects window hides it; with every window gone the app stays in the tray. On macOS the Dock icon shows while any window is on screen.

import path from "node:path";
import type { OpenProjectReading, PoppedOutView, ProjectTransactionAuthor, PythonLanguageServerEvent, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { OpenProjectFiles, type ProjectFilesOfTheRuntime } from "./open_project_files.js";
import { OpenProjectOfAStudioWindow, type FolderEntriesWatch, type ProjectReadingsOfTheRuntime, type StudioWindowOfTheProjectShown } from "./open_project.js";
import { ProjectTransactionsFeedOfAStudioWindow, type ProjectTransactionsFeedOfAStudioWindowSources } from "./project_transactions_feed.js";
import type { DockIconHost } from "./platform/main_window_chrome.js";
import type { TatolabPlatformItems } from "./platform/tatolab_platform_items.js";
import type { LanguageServerOfAWindow } from "./python_language_servers.js";
import type { Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { TatolabMainWindow, type MainWindowHostFactory, type QuestionOverTheWindow } from "./tatolab_main_window.js";

/** The button of the question asked before a running project's window closes that stops the project and closes the window. */
export const STOP_AND_CLOSE_BUTTON_LABEL = "Stop and Close";

/** The Projects window's title. */
export const PROJECTS_WINDOW_TITLE = "Tato Studio";

/** A project's studio window: the window, the project it shows, that project's files, and the language servers it started. */
export interface StudioWindowOfAProject {
  readonly tatolabMainWindow: TatolabMainWindow;
  readonly openProject: OpenProjectOfAStudioWindow;
  readonly openProjectFiles: OpenProjectFiles;
  /** The project's change feed, followed while the window is open. */
  readonly projectTransactionsFeed: ProjectTransactionsFeedOfAStudioWindow;
  /** Where language servers this window starts send their events, and which folders they may serve. */
  readonly languageServerOfTheWindow: LanguageServerOfAWindow;
  /** The views popped out of this window, by the view type and what each is pinned to. */
  readonly poppedOutViews: Map<string, PoppedOutViewWindow>;
}

/** A view popped out of a studio window into a window of its own, what it is pinned to, and where the language servers it starts send their events. */
export interface PoppedOutViewWindow {
  readonly tatolabMainWindow: TatolabMainWindow;
  readonly target: PoppedOutView;
  readonly languageServerOfTheWindow: LanguageServerOfAWindow;
}

/** What the windows reach: how a window is made, the platform's window chrome and Dock, a folder watch and a timer for each project, and what a closed window stops. */
export interface TatolabAppWindowsSources {
  mainWindowHostFactory: MainWindowHostFactory;
  platformItems: Pick<TatolabPlatformItems, "mainWindowChrome" | "setDockIconVisible">;
  dockIconHost: DockIconHost;
  watchFolderEntries: FolderEntriesWatch;
  /** The runtime's list of what a project imports. */
  projectReadingsOfTheRuntime: ProjectReadingsOfTheRuntime;
  /** The runtime's file tools, which every project file a window reads or saves goes through. */
  projectFilesOfTheRuntime: ProjectFilesOfTheRuntime;
  /** Who a save in a studio window is by, as the project's history records it. */
  personSavingTheFiles: ProjectTransactionAuthor;
  /** A fresh idempotency key, one for each save. */
  mintAnIdempotencyKey: () => string;
  /** A connection each studio window follows its project's change feed over. */
  openTheProjectTransactionsFeedConnection: ProjectTransactionsFeedOfAStudioWindowSources["openTheFeedConnection"];
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  /** Queue the stop of every stream of the project in `projectFolder`, as the person chose in closing its window; refused in the runtime's own words. */
  stopTheProjectAsItsWindowCloses: (projectFolder: string) => Promise<Result<void, string>>;
  /** A studio window or a popped-out view closed: stop the language servers its page started. */
  whenAWindowStartingLanguageServersClosed: (languageServerOfTheWindow: LanguageServerOfAWindow) => void;
  /** A studio window or a popped-out view closed: close the port viewers its page opened. */
  whenAWindowShowingPortViewersClosed: (tatolabMainWindow: TatolabMainWindow) => void;
  tatolabAppLog: TatolabAppLog;
}

/** The Projects window and every project's studio window. */
export class TatolabAppWindows {
  readonly projectsWindow: TatolabMainWindow;
  private readonly studioWindowsByProjectFolder = new Map<string, StudioWindowOfAProject>();
  private readonly studioWindowsOpening = new Map<string, Promise<void>>();
  private readonly moduleManagerWindowsByStudioWindow = new Map<StudioWindowOfAProject, TatolabMainWindow>();
  private lastStatusSent: TatolabStatus | null = null;
  private readonly studioWindowsAskingToStopTheirProject = new Set<StudioWindowOfAProject>();
  private isTheAppQuitting = false;
  private lastFocusedWindowContentsId: number | null = null;

  constructor(private readonly sources: TatolabAppWindowsSources) {
    this.projectsWindow = new TatolabMainWindow(
      sources.mainWindowHostFactory,
      sources.platformItems.mainWindowChrome,
      "projects",
      PROJECTS_WINDOW_TITLE,
      { whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(), answerItsCloseRequest: () => "let_it_close", whenItClosed: () => {} },
      sources.tatolabAppLog,
    );
  }

  /** Show the Projects window and bring it forward. */
  showTheProjectsWindow(): void {
    this.projectsWindow.show();
  }

  /** Keep `windowContentsId` as the window last in focus, which a question for the window in front is asked over. */
  noticeTheWindowFocused(windowContentsId: number): void {
    this.lastFocusedWindowContentsId = windowContentsId;
  }

  /** Ask `question` over the window last in focus while it is on screen, else over a studio window on screen, else over the Projects window, shown for it; answers the index of the button chosen. */
  askAQuestionOverTheWindowInFront(question: QuestionOverTheWindow): Promise<Result<number, string>> {
    const lastFocusedWindow = this.lastFocusedWindowContentsId === null ? null : this.windowWithContents(this.lastFocusedWindowContentsId);
    if (lastFocusedWindow?.isShowing() === true) return lastFocusedWindow.askAQuestionOverTheWindow(question);
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      if (studioWindow.tatolabMainWindow.isShowing()) return studioWindow.tatolabMainWindow.askAQuestionOverTheWindow(question);
    }
    this.showTheProjectsWindow();
    return this.projectsWindow.askAQuestionOverTheWindow(question);
  }

  /** Open the project in `projectFolder` in its own studio window, reading it first, or bring its window forward when one is open; answers once the window shows it, with which of the two it did. */
  async openTheProjectInItsStudioWindow(projectFolder: string): Promise<StudioWindowOfTheProjectShown> {
    const studioWindowOpen = this.studioWindowsByProjectFolder.get(projectFolder);
    if (studioWindowOpen !== undefined) {
      studioWindowOpen.tatolabMainWindow.show();
      return "brought_its_studio_window_forward";
    }
    const opening = this.studioWindowsOpening.get(projectFolder) ?? this.openANewStudioWindow(projectFolder);
    this.studioWindowsOpening.set(projectFolder, opening);
    await opening;
    return "opened_its_studio_window";
  }

  /** Show the page of the stream `streamId` in the studio window of its project in `projectFolder`, opening that window when none is; the Projects window when the stream's project is not known. */
  async showTheStreamsPageInItsProjectsWindow(streamId: string, projectFolder: string | null): Promise<void> {
    if (projectFolder === null) {
      this.showTheProjectsWindow();
      return;
    }
    await this.openTheProjectInItsStudioWindow(projectFolder);
    this.studioWindowOfTheProjectIn(projectFolder)?.tatolabMainWindow.showTheStreamsPage(streamId);
  }

  /** The studio window whose page is `windowContentsId`; `null` for the Projects window or a window that has closed. */
  studioWindowWithContents(windowContentsId: number): StudioWindowOfAProject | null {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      if (studioWindow.tatolabMainWindow.isTheWindowWithContents(windowContentsId)) return studioWindow;
    }
    return null;
  }

  /** The studio window whose page is `windowContentsId`, or that the popped-out view whose page it is came from, with that view; `null` for any other window. */
  private studioWindowAndPoppedOutViewWithContents(windowContentsId: number): { studioWindow: StudioWindowOfAProject; poppedOutView: PoppedOutViewWindow | null } | null {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      if (studioWindow.tatolabMainWindow.isTheWindowWithContents(windowContentsId)) return { studioWindow, poppedOutView: null };
      for (const poppedOutView of studioWindow.poppedOutViews.values()) {
        if (poppedOutView.tatolabMainWindow.isTheWindowWithContents(windowContentsId)) return { studioWindow, poppedOutView };
      }
    }
    return null;
  }

  /** The studio window whose project the page `windowContentsId` reads: the studio window's own page, or a view popped out of it; `null` for any other window. */
  studioWindowServingTheContents(windowContentsId: number): StudioWindowOfAProject | null {
    return this.studioWindowAndPoppedOutViewWithContents(windowContentsId)?.studioWindow ?? null;
  }

  /** Where the language servers the page `windowContentsId` starts send their events, a studio window's or a popped-out view's; `null` for any other window. */
  languageServerOfTheWindowWithContents(windowContentsId: number): LanguageServerOfAWindow | null {
    const windows = this.studioWindowAndPoppedOutViewWithContents(windowContentsId);
    if (windows === null) return null;
    return (windows.poppedOutView ?? windows.studioWindow).languageServerOfTheWindow;
  }

  /** Whether a studio window holds the project in `projectFolder` open, as the runtime named its folder. */
  aStudioWindowHoldsTheProjectIn(projectFolder: string): boolean {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      const reading = studioWindow.openProject.readOpenProject();
      if (reading.kind === "read" && reading.open_project.project.folder === projectFolder) return true;
    }
    return false;
  }

  /** The studio window of the project in `projectFolder`; `null` when none is open. */
  studioWindowOfTheProjectIn(projectFolder: string): StudioWindowOfAProject | null {
    return this.studioWindowsByProjectFolder.get(projectFolder) ?? null;
  }

  /** Pop the view `target` names out of `studioWindow` into a window of its own, or bring forward the one already pinned the same way. */
  popOutTheViewOf(studioWindow: StudioWindowOfAProject, target: PoppedOutView): void {
    const pinKey = poppedOutViewPinKeyOf(target);
    const poppedOutViewOpen = studioWindow.poppedOutViews.get(pinKey);
    if (poppedOutViewOpen !== undefined) {
      poppedOutViewOpen.tatolabMainWindow.show();
      return;
    }
    let poppedOutViewOnceMade: PoppedOutViewWindow | null = null;
    const tatolabMainWindow = new TatolabMainWindow(
      this.sources.mainWindowHostFactory,
      this.sources.platformItems.mainWindowChrome,
      "popped_out_view",
      target.window_title,
      {
        whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(),
        answerItsCloseRequest: () => "let_it_close",
        whenItClosed: () => {
          if (poppedOutViewOnceMade !== null && studioWindow.poppedOutViews.get(pinKey) === poppedOutViewOnceMade) studioWindow.poppedOutViews.delete(pinKey);
          if (poppedOutViewOnceMade === null) return;
          this.sources.whenAWindowShowingPortViewersClosed(poppedOutViewOnceMade.tatolabMainWindow);
          this.sources.whenAWindowStartingLanguageServersClosed(poppedOutViewOnceMade.languageServerOfTheWindow);
        },
      },
      this.sources.tatolabAppLog,
    );
    const poppedOutView: PoppedOutViewWindow = {
      tatolabMainWindow,
      target,
      languageServerOfTheWindow: {
        projectFolderOfTheOpenProject: (folder) => studioWindow.languageServerOfTheWindow.projectFolderOfTheOpenProject(folder),
        sendTheWindowALanguageServerEvent: (event: PythonLanguageServerEvent) => tatolabMainWindow.sendTheWindowALanguageServerEvent(event),
      },
    };
    poppedOutViewOnceMade = poppedOutView;
    studioWindow.poppedOutViews.set(pinKey, poppedOutView);
    this.sources.tatolabAppLog.info("popped a view out into its own window", { view_type_id: target.view_type_id });
    tatolabMainWindow.show();
    if (this.lastStatusSent !== null) tatolabMainWindow.sendTheWindowTheStatus(this.lastStatusSent);
  }

  /** Open `studioWindow`'s Module manager window, its project the workspace imports go into, or bring it forward when it is open. */
  openTheModuleManagerWindowOf(studioWindow: StudioWindowOfAProject): void {
    const moduleManagerWindowOpen = this.moduleManagerWindowsByStudioWindow.get(studioWindow);
    if (moduleManagerWindowOpen !== undefined) {
      moduleManagerWindowOpen.show();
      return;
    }
    let moduleManagerWindowOnceMade: TatolabMainWindow | null = null;
    const moduleManagerWindow = new TatolabMainWindow(
      this.sources.mainWindowHostFactory,
      this.sources.platformItems.mainWindowChrome,
      "module_manager",
      `Module manager · ${studioWindowTitleOf(studioWindow.openProject.readOpenProject(), studioWindow.openProject.projectFolder)}`,
      {
        whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(),
        answerItsCloseRequest: () => "let_it_close",
        whenItClosed: () => {
          if (moduleManagerWindowOnceMade !== null && this.moduleManagerWindowsByStudioWindow.get(studioWindow) === moduleManagerWindowOnceMade) this.moduleManagerWindowsByStudioWindow.delete(studioWindow);
        },
      },
      this.sources.tatolabAppLog,
    );
    moduleManagerWindowOnceMade = moduleManagerWindow;
    this.moduleManagerWindowsByStudioWindow.set(studioWindow, moduleManagerWindow);
    moduleManagerWindow.show();
    if (this.lastStatusSent !== null) moduleManagerWindow.sendTheWindowTheStatus(this.lastStatusSent);
  }

  /** The studio window whose Module manager window's page is `windowContentsId`; `null` for any other window. */
  studioWindowOfTheModuleManagerWindowWithContents(windowContentsId: number): StudioWindowOfAProject | null {
    for (const [studioWindow, moduleManagerWindow] of this.moduleManagerWindowsByStudioWindow) {
      if (moduleManagerWindow.isTheWindowWithContents(windowContentsId)) return studioWindow;
    }
    return null;
  }

  /** The studio window or popped-out view whose page is `windowContentsId`, the windows that show port viewers; `null` for any other window. */
  windowShowingPortViewersWithContents(windowContentsId: number): TatolabMainWindow | null {
    const windows = this.studioWindowAndPoppedOutViewWithContents(windowContentsId);
    if (windows === null) return null;
    return (windows.poppedOutView ?? windows.studioWindow).tatolabMainWindow;
  }

  /** What the popped-out view whose page is `windowContentsId` is pinned to; `null` for the Projects window, a studio window, or a window that has closed. */
  poppedOutViewOfTheWindowWithContents(windowContentsId: number): PoppedOutView | null {
    return this.studioWindowAndPoppedOutViewWithContents(windowContentsId)?.poppedOutView?.target ?? null;
  }

  /** The window whose page is `windowContentsId`, whatever it is; `null` for a window that has closed. */
  windowWithContents(windowContentsId: number): TatolabMainWindow | null {
    return this.everyWindow().find((tatolabMainWindow) => tatolabMainWindow.isTheWindowWithContents(windowContentsId)) ?? null;
  }

  /** Whether `windowContentsId` is the Projects window's page. */
  isTheProjectsWindow(windowContentsId: number): boolean {
    return this.projectsWindow.isTheWindowWithContents(windowContentsId);
  }

  /** Send every window `status`, and any window opened later the last one sent. */
  sendEveryWindowTheStatus(status: TatolabStatus): void {
    const theRuntimeStartedAnswering = status.runtime_state === "running" && this.lastStatusSent?.runtime_state !== "running";
    this.lastStatusSent = status;
    if (theRuntimeStartedAnswering) {
      for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
        void studioWindow.openProject.readAgain();
        void studioWindow.projectTransactionsFeed.followAgain();
      }
    }
    for (const tatolabMainWindow of this.everyWindow()) tatolabMainWindow.sendTheWindowTheStatus(status);
  }

  /** Let every window close, rather than hide, from here on: the app is quitting. */
  letEveryWindowCloseAsTheAppQuits(): void {
    this.isTheAppQuitting = true;
    for (const tatolabMainWindow of this.everyWindow()) tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  }

  /** Stop watching every studio window's project, as the app quits. */
  stopWatchingEveryProject(): void {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      studioWindow.openProject.stopWatching();
      studioWindow.projectTransactionsFeed.stopFollowing();
    }
  }

  private everyWindow(): TatolabMainWindow[] {
    return [
      this.projectsWindow,
      ...[...this.studioWindowsByProjectFolder.values()].flatMap((studioWindow) => [
        studioWindow.tatolabMainWindow,
        ...[...studioWindow.poppedOutViews.values()].map((poppedOutView) => poppedOutView.tatolabMainWindow),
        ...[this.moduleManagerWindowsByStudioWindow.get(studioWindow)].filter((moduleManagerWindow) => moduleManagerWindow !== undefined),
      ]),
    ];
  }

  private async openANewStudioWindow(projectFolder: string): Promise<void> {
    let windowOfTheProject: TatolabMainWindow | null = null;
    let studioWindowOnceMade: StudioWindowOfAProject | null = null;
    const openProject = new OpenProjectOfAStudioWindow(projectFolder, {
      watchFolderEntries: this.sources.watchFolderEntries,
      projectReadingsOfTheRuntime: this.sources.projectReadingsOfTheRuntime,
      runAfter: this.sources.runAfter,
      sendTheWindowTheOpenProject: (reading) => {
        windowOfTheProject?.sendTheWindowTheOpenProject(reading);
        if (studioWindowOnceMade === null) return;
        this.moduleManagerWindowsByStudioWindow.get(studioWindowOnceMade)?.sendTheWindowTheOpenProject(reading);
        for (const poppedOutView of studioWindowOnceMade.poppedOutViews.values()) poppedOutView.tatolabMainWindow.sendTheWindowTheOpenProject(reading);
      },
    });
    await openProject.readAndWatch();
    const tatolabMainWindow = new TatolabMainWindow(
      this.sources.mainWindowHostFactory,
      this.sources.platformItems.mainWindowChrome,
      "studio",
      studioWindowTitleOf(openProject.readOpenProject(), projectFolder),
      {
        whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(),
        answerItsCloseRequest: () => (studioWindowOnceMade === null ? "let_it_close" : this.answerTheCloseRequestOfTheStudioWindow(studioWindowOnceMade)),
        whenItClosed: () => {
          if (studioWindowOnceMade !== null) this.forgetTheClosedStudioWindow(studioWindowOnceMade);
        },
      },
      this.sources.tatolabAppLog,
    );
    windowOfTheProject = tatolabMainWindow;
    const openProjectFiles = new OpenProjectFiles({
      readOpenProject: () => openProject.readOpenProject(),
      projectFilesOfTheRuntime: this.sources.projectFilesOfTheRuntime,
      personSavingTheFiles: this.sources.personSavingTheFiles,
      mintAnIdempotencyKey: this.sources.mintAnIdempotencyKey,
    });
    const openedProject = openProject.readOpenProject();
    const projectTransactionsFeed = new ProjectTransactionsFeedOfAStudioWindow(openedProject.kind === "read" ? openedProject.open_project.project.folder : projectFolder, {
      openTheFeedConnection: this.sources.openTheProjectTransactionsFeedConnection,
      runAfter: this.sources.runAfter,
      sendTheWindowTheProjectTransactions: (reading) => {
        tatolabMainWindow.sendTheWindowTheProjectTransactions(reading);
        for (const poppedOutView of studioWindowOnceMade?.poppedOutViews.values() ?? []) poppedOutView.tatolabMainWindow.sendTheWindowTheProjectTransactions(reading);
      },
    });
    const studioWindow: StudioWindowOfAProject = {
      tatolabMainWindow,
      openProject,
      openProjectFiles,
      projectTransactionsFeed,
      languageServerOfTheWindow: {
        projectFolderOfTheOpenProject: (folder) => openProjectFiles.projectFolderOfTheOpenProject(folder),
        sendTheWindowALanguageServerEvent: (event: PythonLanguageServerEvent) => tatolabMainWindow.sendTheWindowALanguageServerEvent(event),
      },
      poppedOutViews: new Map(),
    };
    studioWindowOnceMade = studioWindow;
    this.studioWindowsByProjectFolder.set(projectFolder, studioWindow);
    this.studioWindowsOpening.delete(projectFolder);
    this.sources.tatolabAppLog.info("opened a project in its own window", { project_folder: projectFolder });
    tatolabMainWindow.show();
    if (this.lastStatusSent !== null) tatolabMainWindow.sendTheWindowTheStatus(this.lastStatusSent);
    void projectTransactionsFeed.follow();
  }

  /** Close a studio window whose project runs no stream; for one that runs any, keep it open and ask whether to stop the project and close it. */
  private answerTheCloseRequestOfTheStudioWindow(studioWindow: StudioWindowOfAProject): "let_it_close" | "keep_it_open" {
    if (!isAnyStreamOfTheProjectRunningIn(this.lastStatusSent, studioWindow.openProject.projectFolder)) return "let_it_close";
    if (!this.studioWindowsAskingToStopTheirProject.has(studioWindow)) {
      this.studioWindowsAskingToStopTheirProject.add(studioWindow);
      void this.askToStopTheProjectThenCloseItsWindow(studioWindow).finally(() => this.studioWindowsAskingToStopTheirProject.delete(studioWindow));
    }
    return "keep_it_open";
  }

  private async askToStopTheProjectThenCloseItsWindow(studioWindow: StudioWindowOfAProject): Promise<void> {
    const projectFolder = studioWindow.openProject.projectFolder;
    const projectName = studioWindowTitleOf(studioWindow.openProject.readOpenProject(), projectFolder);
    const choice = await studioWindow.tatolabMainWindow.askAQuestionOverTheWindow({
      message: `Closing this window stops ${projectName}.`,
      detail: `Every stream of ${projectName} stops running. Open the project and run it again to start it.`,
      buttonLabels: [STOP_AND_CLOSE_BUTTON_LABEL, "Cancel"],
      defaultButtonIndex: 0,
      cancelButtonIndex: 1,
    });
    if (!choice.ok) {
      this.sources.tatolabAppLog.error("the question before closing a running project's window was not asked", { project_folder: projectFolder, failure: choice.failure });
      return;
    }
    if (choice.value !== 0) return;
    const stopped = await this.sources.stopTheProjectAsItsWindowCloses(projectFolder);
    if (stopped.ok) {
      studioWindow.tatolabMainWindow.close();
      return;
    }
    this.sources.tatolabAppLog.warn("a project did not stop as its window closed", { project_folder: projectFolder, refusal: stopped.failure });
    await studioWindow.tatolabMainWindow.askAQuestionOverTheWindow({
      message: `${projectName} did not stop, so its window stays open.`,
      detail: stopped.failure,
      buttonLabels: ["OK"],
      defaultButtonIndex: 0,
      cancelButtonIndex: 0,
    });
  }

  private forgetTheClosedStudioWindow(studioWindow: StudioWindowOfAProject): void {
    const projectFolder = studioWindow.openProject.projectFolder;
    if (this.studioWindowsByProjectFolder.get(projectFolder) !== studioWindow) return;
    this.studioWindowsByProjectFolder.delete(projectFolder);
    studioWindow.openProject.stopWatching();
    studioWindow.projectTransactionsFeed.stopFollowing();
    for (const poppedOutView of [...studioWindow.poppedOutViews.values()]) poppedOutView.tatolabMainWindow.close();
    studioWindow.poppedOutViews.clear();
    this.moduleManagerWindowsByStudioWindow.get(studioWindow)?.close();
    this.moduleManagerWindowsByStudioWindow.delete(studioWindow);
    this.sources.whenAWindowStartingLanguageServersClosed(studioWindow.languageServerOfTheWindow);
    this.sources.whenAWindowShowingPortViewersClosed(studioWindow.tatolabMainWindow);
    this.sources.tatolabAppLog.info("closed a project's window", { project_folder: projectFolder });
    if (!this.isTheAppQuitting && this.studioWindowsByProjectFolder.size === 0 && this.studioWindowsOpening.size === 0) this.showTheProjectsWindow();
  }

  private showTheDockIconWhileAWindowIsShown(): void {
    this.sources.platformItems.setDockIconVisible(
      this.sources.dockIconHost,
      this.everyWindow().some((tatolabMainWindow) => tatolabMainWindow.isShownNow()),
    );
  }
}

/** A studio window's title: its project's name, or its folder's when the project doesn't read. */
/** Whether `status` lists a stream of the project in `projectFolder` running or on its way to running. */
export function isAnyStreamOfTheProjectRunningIn(status: TatolabStatus | null, projectFolder: string): boolean {
  return (status?.streams ?? []).some(
    (listedStream) => listedStream.location?.project_directory === projectFolder && (listedStream.state === "running" || listedStream.state === "preparing"),
  );
}

function studioWindowTitleOf(reading: OpenProjectReading, projectFolder: string): string {
  return reading.kind === "read" ? reading.open_project.project.name : path.basename(projectFolder);
}

/** The key a popped-out view is kept under in its studio window: its view type and its window's title, which names the stream and node it shows. */
function poppedOutViewPinKeyOf(target: PoppedOutView): string {
  return JSON.stringify([target.view_type_id, target.window_title]);
}

/** The reading a window with no project of its own is answered: the Projects window's. */
export const NO_PROJECT_OPEN_IN_THE_WINDOW: OpenProjectReading = { kind: "none_open" };
