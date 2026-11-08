// The app's windows: one Projects window, one studio window per open project, and the Viewers
// popped out of a studio window and its Get more window, all sharing the one runtime. Opening a
// project that already has a window brings that window forward. Closing a studio window closes it
// and the windows it opened; closing the Projects window hides it; with every window gone the app
// stays in the tray. On macOS the Dock icon shows while any window is on screen.

import path from "node:path";
import type { OpenProjectReading, PoppedOutViewerTarget, PythonLanguageServerEvent, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { OpenProjectFiles } from "./open_project_files.js";
import { OpenProjectOfAStudioWindow, type FolderEntriesWatch } from "./open_project.js";
import type { DockIconHost } from "./platform/main_window_chrome.js";
import type { TatolabPlatformItems } from "./platform/tatolab_platform_items.js";
import type { LanguageServerOfAStudioWindow } from "./python_language_servers.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import { TatolabMainWindow, type MainWindowHostFactory } from "./tatolab_main_window.js";

/** The Projects window's title. */
export const PROJECTS_WINDOW_TITLE = "Tato Studio";

/** A project's studio window: the window, the project it shows, that project's files, and the language servers it started. */
export interface StudioWindowOfAProject {
  readonly tatolabMainWindow: TatolabMainWindow;
  readonly openProject: OpenProjectOfAStudioWindow;
  readonly openProjectFiles: OpenProjectFiles;
  /** Where language servers this window starts send their events, and which folders they may serve. */
  readonly languageServerOfTheWindow: LanguageServerOfAStudioWindow;
  /** The Viewers popped out of this window, by the stream and node each is pinned to. */
  readonly poppedOutViewers: Map<string, PoppedOutViewerWindow>;
}

/** A Viewer popped out of a studio window into a window of its own, and what it is pinned to. */
export interface PoppedOutViewerWindow {
  readonly tatolabMainWindow: TatolabMainWindow;
  readonly target: PoppedOutViewerTarget;
}

/** What the windows reach: how a window is made, the platform's window chrome and Dock, a folder watch and a timer for each project, and what a closed window stops. */
export interface TatolabAppWindowsSources {
  mainWindowHostFactory: MainWindowHostFactory;
  platformItems: Pick<TatolabPlatformItems, "mainWindowChrome" | "setDockIconVisible">;
  dockIconHost: DockIconHost;
  watchFolderEntries: FolderEntriesWatch;
  /** Runs `work` once after `delayMs`; the answer cancels it. */
  runAfter: (delayMs: number, work: () => void) => () => void;
  /** A studio window closed: stop the language servers its page started. */
  whenAStudioWindowClosed: (studioWindow: StudioWindowOfAProject) => void;
  tatolabAppLog: TatolabAppLog;
}

/** The Projects window and every project's studio window. */
export class TatolabAppWindows {
  readonly projectsWindow: TatolabMainWindow;
  private readonly studioWindowsByProjectFolder = new Map<string, StudioWindowOfAProject>();
  private readonly studioWindowsOpening = new Map<string, Promise<void>>();
  private readonly getMoreWindowsByStudioWindow = new Map<StudioWindowOfAProject, TatolabMainWindow>();
  private lastStatusSent: TatolabStatus | null = null;

  constructor(private readonly sources: TatolabAppWindowsSources) {
    this.projectsWindow = new TatolabMainWindow(
      sources.mainWindowHostFactory,
      sources.platformItems.mainWindowChrome,
      "projects",
      PROJECTS_WINDOW_TITLE,
      { whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(), whenItClosed: () => {} },
      sources.tatolabAppLog,
    );
  }

  /** Show the Projects window and bring it forward. */
  showTheProjectsWindow(): void {
    this.projectsWindow.show();
  }

  /** Open the project in `projectFolder` in its own studio window, reading it first, or bring its window forward when one is open; answers once the window shows it. */
  openTheProjectInItsStudioWindow(projectFolder: string): Promise<void> {
    const studioWindowOpen = this.studioWindowsByProjectFolder.get(projectFolder);
    if (studioWindowOpen !== undefined) {
      studioWindowOpen.tatolabMainWindow.show();
      return Promise.resolve();
    }
    const opening = this.studioWindowsOpening.get(projectFolder) ?? this.openANewStudioWindow(projectFolder);
    this.studioWindowsOpening.set(projectFolder, opening);
    return opening;
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

  /** The studio window of the project in `projectFolder`; `null` when none is open. */
  studioWindowOfTheProjectIn(projectFolder: string): StudioWindowOfAProject | null {
    return this.studioWindowsByProjectFolder.get(projectFolder) ?? null;
  }

  /** Pop a Viewer pinned to `target` out of `studioWindow` into a window of its own, or bring forward the one already pinned to the same stream and node. */
  popOutTheViewerOf(studioWindow: StudioWindowOfAProject, target: PoppedOutViewerTarget): void {
    const pinKey = poppedOutViewerPinKeyOf(target);
    const poppedOutViewerOpen = studioWindow.poppedOutViewers.get(pinKey);
    if (poppedOutViewerOpen !== undefined) {
      poppedOutViewerOpen.tatolabMainWindow.show();
      return;
    }
    let poppedOutViewerOnceMade: PoppedOutViewerWindow | null = null;
    const tatolabMainWindow = new TatolabMainWindow(
      this.sources.mainWindowHostFactory,
      this.sources.platformItems.mainWindowChrome,
      "popped_out_viewer",
      poppedOutViewerWindowTitleOf(target),
      {
        whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(),
        whenItClosed: () => {
          if (poppedOutViewerOnceMade !== null && studioWindow.poppedOutViewers.get(pinKey) === poppedOutViewerOnceMade) studioWindow.poppedOutViewers.delete(pinKey);
        },
      },
      this.sources.tatolabAppLog,
    );
    const poppedOutViewer: PoppedOutViewerWindow = { tatolabMainWindow, target };
    poppedOutViewerOnceMade = poppedOutViewer;
    studioWindow.poppedOutViewers.set(pinKey, poppedOutViewer);
    this.sources.tatolabAppLog.info("popped a Viewer out into its own window", { stream: target.stream, node: target.node });
    tatolabMainWindow.show();
    if (this.lastStatusSent !== null) tatolabMainWindow.sendTheWindowTheStatus(this.lastStatusSent);
  }

  /** Open `studioWindow`'s Get more window, its project the workspace imports go into, or bring it forward when it is open. */
  openTheGetMoreWindowOf(studioWindow: StudioWindowOfAProject): void {
    const getMoreWindowOpen = this.getMoreWindowsByStudioWindow.get(studioWindow);
    if (getMoreWindowOpen !== undefined) {
      getMoreWindowOpen.show();
      return;
    }
    let getMoreWindowOnceMade: TatolabMainWindow | null = null;
    const getMoreWindow = new TatolabMainWindow(
      this.sources.mainWindowHostFactory,
      this.sources.platformItems.mainWindowChrome,
      "get_more",
      `Get more · ${studioWindowTitleOf(studioWindow.openProject.readOpenProject(), studioWindow.openProject.projectFolder)}`,
      {
        whenItCameOnScreenOrWentOff: () => this.showTheDockIconWhileAWindowIsShown(),
        whenItClosed: () => {
          if (getMoreWindowOnceMade !== null && this.getMoreWindowsByStudioWindow.get(studioWindow) === getMoreWindowOnceMade) this.getMoreWindowsByStudioWindow.delete(studioWindow);
        },
      },
      this.sources.tatolabAppLog,
    );
    getMoreWindowOnceMade = getMoreWindow;
    this.getMoreWindowsByStudioWindow.set(studioWindow, getMoreWindow);
    getMoreWindow.show();
    if (this.lastStatusSent !== null) getMoreWindow.sendTheWindowTheStatus(this.lastStatusSent);
  }

  /** The studio window whose Get more window's page is `windowContentsId`; `null` for any other window. */
  studioWindowOfTheGetMoreWindowWithContents(windowContentsId: number): StudioWindowOfAProject | null {
    for (const [studioWindow, getMoreWindow] of this.getMoreWindowsByStudioWindow) {
      if (getMoreWindow.isTheWindowWithContents(windowContentsId)) return studioWindow;
    }
    return null;
  }

  /** What the popped-out Viewer whose page is `windowContentsId` is pinned to; `null` for the Projects window, a studio window, or a window that has closed. */
  poppedOutViewerTargetOfTheWindowWithContents(windowContentsId: number): PoppedOutViewerTarget | null {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) {
      for (const poppedOutViewer of studioWindow.poppedOutViewers.values()) {
        if (poppedOutViewer.tatolabMainWindow.isTheWindowWithContents(windowContentsId)) return poppedOutViewer.target;
      }
    }
    return null;
  }

  /** Whether `windowContentsId` is the Projects window's page. */
  isTheProjectsWindow(windowContentsId: number): boolean {
    return this.projectsWindow.isTheWindowWithContents(windowContentsId);
  }

  /** Send every window `status`, and any window opened later the last one sent. */
  sendEveryWindowTheStatus(status: TatolabStatus): void {
    this.lastStatusSent = status;
    for (const tatolabMainWindow of this.everyWindow()) tatolabMainWindow.sendTheWindowTheStatus(status);
  }

  /** Let every window close, rather than hide, from here on: the app is quitting. */
  letEveryWindowCloseAsTheAppQuits(): void {
    for (const tatolabMainWindow of this.everyWindow()) tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  }

  /** Stop watching every studio window's project, as the app quits. */
  stopWatchingEveryProject(): void {
    for (const studioWindow of this.studioWindowsByProjectFolder.values()) studioWindow.openProject.stopWatching();
  }

  private everyWindow(): TatolabMainWindow[] {
    return [
      this.projectsWindow,
      ...[...this.studioWindowsByProjectFolder.values()].flatMap((studioWindow) => [
        studioWindow.tatolabMainWindow,
        ...[...studioWindow.poppedOutViewers.values()].map((poppedOutViewer) => poppedOutViewer.tatolabMainWindow),
        ...[this.getMoreWindowsByStudioWindow.get(studioWindow)].filter((getMoreWindow) => getMoreWindow !== undefined),
      ]),
    ];
  }

  private async openANewStudioWindow(projectFolder: string): Promise<void> {
    let windowOfTheProject: TatolabMainWindow | null = null;
    let studioWindowOnceMade: StudioWindowOfAProject | null = null;
    const openProject = new OpenProjectOfAStudioWindow(projectFolder, {
      watchFolderEntries: this.sources.watchFolderEntries,
      runAfter: this.sources.runAfter,
      sendTheWindowTheOpenProject: (reading) => {
        windowOfTheProject?.sendTheWindowTheOpenProject(reading);
        if (studioWindowOnceMade !== null) this.getMoreWindowsByStudioWindow.get(studioWindowOnceMade)?.sendTheWindowTheOpenProject(reading);
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
        whenItClosed: () => {
          if (studioWindowOnceMade !== null) this.forgetTheClosedStudioWindow(studioWindowOnceMade);
        },
      },
      this.sources.tatolabAppLog,
    );
    windowOfTheProject = tatolabMainWindow;
    const openProjectFiles = new OpenProjectFiles(() => openProject.readOpenProject());
    const studioWindow: StudioWindowOfAProject = {
      tatolabMainWindow,
      openProject,
      openProjectFiles,
      languageServerOfTheWindow: {
        projectFolderOfTheOpenProject: (folder) => openProjectFiles.projectFolderOfTheOpenProject(folder),
        sendTheWindowALanguageServerEvent: (event: PythonLanguageServerEvent) => tatolabMainWindow.sendTheWindowALanguageServerEvent(event),
      },
      poppedOutViewers: new Map(),
    };
    studioWindowOnceMade = studioWindow;
    this.studioWindowsByProjectFolder.set(projectFolder, studioWindow);
    this.studioWindowsOpening.delete(projectFolder);
    this.sources.tatolabAppLog.info("opened a project in its own window", { project_folder: projectFolder });
    tatolabMainWindow.show();
    if (this.lastStatusSent !== null) tatolabMainWindow.sendTheWindowTheStatus(this.lastStatusSent);
  }

  private forgetTheClosedStudioWindow(studioWindow: StudioWindowOfAProject): void {
    const projectFolder = studioWindow.openProject.projectFolder;
    if (this.studioWindowsByProjectFolder.get(projectFolder) !== studioWindow) return;
    this.studioWindowsByProjectFolder.delete(projectFolder);
    studioWindow.openProject.stopWatching();
    for (const poppedOutViewer of [...studioWindow.poppedOutViewers.values()]) poppedOutViewer.tatolabMainWindow.close();
    studioWindow.poppedOutViewers.clear();
    this.getMoreWindowsByStudioWindow.get(studioWindow)?.close();
    this.getMoreWindowsByStudioWindow.delete(studioWindow);
    this.sources.whenAStudioWindowClosed(studioWindow);
    this.sources.tatolabAppLog.info("closed a project's window", { project_folder: projectFolder });
  }

  private showTheDockIconWhileAWindowIsShown(): void {
    this.sources.platformItems.setDockIconVisible(
      this.sources.dockIconHost,
      this.everyWindow().some((tatolabMainWindow) => tatolabMainWindow.isShownNow()),
    );
  }
}

/** A studio window's title: its project's name, or its folder's when the project doesn't read. */
function studioWindowTitleOf(reading: OpenProjectReading, projectFolder: string): string {
  return reading.kind === "read" ? reading.open_project.project.name : path.basename(projectFolder);
}

/** The key a popped-out Viewer is kept under in its studio window: the stream and node it is pinned to. */
function poppedOutViewerPinKeyOf(target: PoppedOutViewerTarget): string {
  return JSON.stringify([target.stream, target.node]);
}

/** A popped-out Viewer's title: the stream it plays, and the node where it is pinned to one. */
export function poppedOutViewerWindowTitleOf(target: PoppedOutViewerTarget): string {
  return target.node === null ? `${target.display_name} · Viewer` : `${target.display_name} › ${target.node} · Viewer`;
}

/** The reading a window with no project of its own is answered, the Projects window's and a popped-out Viewer's. */
export const NO_PROJECT_OPEN_IN_THE_WINDOW: OpenProjectReading = { kind: "none_open" };
