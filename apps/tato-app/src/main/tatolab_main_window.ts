// One of the app's windows: the Projects window, which closing hides while the app keeps running
// in the tray, or a project's studio window or a Viewer popped out of one, which closing closes.
// `TatolabAppWindows` holds them all and shows the Dock icon on macOS while any is on screen.

import type { OpenProjectReading, ProjectTransactionsReading, PortViewerEvent, PortViewerImageFrameFacts, PythonLanguageServerEvent, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import {
  TATOLAB_OPEN_PROJECT_CHANGED_EVENT,
  TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT,
  TATOLAB_PORT_VIEWER_EVENT,
  TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT,
  TATOLAB_STATUS_CHANGED_EVENT,
  TATOLAB_STREAM_PAGE_REQUESTED_EVENT,
  TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT,
  type SystemMenuBarEntryChosen,
  type TatolabStreamPageRequest,
} from "../shared/tatolab_electron_bridge_contract.js";
import { failedWith, type Result } from "./result.js";
import type { WindowShowingPortViewers } from "./runtime_port_viewers.js";
import type { SharedTextureImportOfARuntimeViewerFrame } from "./runtime_viewer_image_frame_import.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { MainWindowChrome } from "./platform/main_window_chrome.js";

/** The main window's title, sizes and title bar. */
export interface MainWindowSpecification {
  title: string;
  width: number;
  height: number;
  minimumWidth: number;
  minimumHeight: number;
  chrome: MainWindowChrome;
}

/** Whether a close request closes the window, hides it instead, or keeps it open while the app asks the person first. */
export type MainWindowCloseRequestAnswer = "hide_instead" | "let_it_close" | "keep_it_open";

/** A question the desktop asks in a message box over the window: its words, and the buttons it offers, the first the default. */
export interface QuestionOverTheWindow {
  message: string;
  detail: string;
  buttonLabels: readonly string[];
  /** The button Escape, or closing the message box, chooses. */
  cancelButtonIndex: number;
}

/** The window as the platform shows it. */
export interface MainWindowHost {
  /** The id the window's page sends its commands under, Electron's `webContents.id`. */
  readonly windowContentsId: number;
  unminimize(): void;
  show(): void;
  focus(): void;
  hide(): void;
  /** Close the window for good; its close request is not asked. */
  close(): void;
  /** Whether the window is on screen: shown and not minimized. */
  isShowing(): boolean;
  /** Ask `question` in a message box over the window, answering the index of the button chosen; refused when the desktop could not show it. */
  askAQuestionOverTheWindow(question: QuestionOverTheWindow): Promise<Result<number, string>>;
  /** Send the window's page `eventPayload` on `eventChannel`; a page still loading misses it. */
  sendTheWindowAnEvent(eventChannel: string, eventPayload: unknown): void;
  /** Import `sharedTextureImport` and hand it to the window's page with `frameFacts` beside it; `whenEveryReferenceIsReleased` is called once no process holds it, whether or not it reached the page. */
  sendTheWindowASharedTexture(
    sharedTextureImport: SharedTextureImportOfARuntimeViewerFrame,
    frameFacts: PortViewerImageFrameFacts,
    whenEveryReferenceIsReleased: () => void,
  ): Promise<Result<void, string>>;
}

/** What creates a window, hidden, asking `answerCloseRequest` at each close request whether to close it, and calling `whenClosed` once it has closed. */
export interface MainWindowHostFactory {
  createMainWindowHost(
    mainWindowSpecification: MainWindowSpecification,
    answerCloseRequest: () => MainWindowCloseRequestAnswer,
    whenClosed: () => void,
  ): Result<MainWindowHost, string>;
}

/** What a window is: the one Projects window, the studio window of one project, a Viewer popped out of a studio window, or a studio window's Module manager window. */
export type TatolabWindowRole = "projects" | "studio" | "popped_out_viewer" | "module_manager";

/** A window's size when created, and the smallest it can be made: a popped-out Viewer is small enough to sit on a second monitor's corner, Module manager sits beside the studio, every other window is the studio's size. */
export function mainWindowSizesOf(windowRole: TatolabWindowRole): Pick<MainWindowSpecification, "width" | "height" | "minimumWidth" | "minimumHeight"> {
  if (windowRole === "popped_out_viewer") return { width: 720, height: 450, minimumWidth: 320, minimumHeight: 200 };
  if (windowRole === "module_manager") return { width: 960, height: 660, minimumWidth: 680, minimumHeight: 480 };
  return { width: 1040, height: 700, minimumWidth: 860, minimumHeight: 580 };
}

/** What a window tells the windows around it: that it came on screen or went off it, that the person asked to close it, and that it closed for good. */
export interface TatolabMainWindowListeners {
  whenItCameOnScreenOrWentOff(): void;
  /** Whether a close request the window does not hide on closes it now, or keeps it open while the person is asked. */
  answerItsCloseRequest(): "let_it_close" | "keep_it_open";
  whenItClosed(): void;
}

/** One window of the app, created the first time it is shown. */
export class TatolabMainWindow implements WindowShowingPortViewers {
  private mainWindowHost: MainWindowHost | null = null;
  private theAppIsQuitting = false;
  private isShownByTheApp = false;

  constructor(
    private readonly mainWindowHostFactory: MainWindowHostFactory,
    private readonly mainWindowChrome: MainWindowChrome,
    private readonly windowRole: TatolabWindowRole,
    private readonly windowTitle: string,
    private readonly listeners: TatolabMainWindowListeners,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Show the window, creating it the first time, and bring it forward. */
  show(): void {
    this.isShownByTheApp = true;
    this.listeners.whenItCameOnScreenOrWentOff();
    const mainWindowHost = this.mainWindowHost ?? this.createMainWindowHost();
    if (mainWindowHost === null) {
      this.isShownByTheApp = false;
      this.listeners.whenItCameOnScreenOrWentOff();
      return;
    }
    mainWindowHost.unminimize();
    mainWindowHost.show();
    mainWindowHost.focus();
  }

  /** Hide the window, keeping it for the next show. */
  hide(): void {
    if (this.mainWindowHost === null) return;
    this.mainWindowHost.hide();
    this.isShownByTheApp = false;
    this.listeners.whenItCameOnScreenOrWentOff();
  }

  /** Close the window for good. */
  close(): void {
    this.mainWindowHost?.close();
  }

  /** Ask `question` in a message box over the window, answering the index of the button chosen; refused when the window is not open. */
  askAQuestionOverTheWindow(question: QuestionOverTheWindow): Promise<Result<number, string>> {
    return this.mainWindowHost?.askAQuestionOverTheWindow(question) ?? Promise.resolve(failedWith("the window is not open"));
  }

  /** Whether the app has the window shown: shown and neither hidden nor closed since. */
  isShownNow(): boolean {
    return this.isShownByTheApp;
  }

  /** Whether the window is on screen; not before it is first shown. */
  isShowing(): boolean {
    return this.mainWindowHost?.isShowing() ?? false;
  }

  /** Whether `windowContentsId` is this window's page. */
  isTheWindowWithContents(windowContentsId: number): boolean {
    return this.mainWindowHost?.windowContentsId === windowContentsId;
  }

  /** Send the window `status` as `tatolab-status-changed`; nothing, before the window is first shown. */
  sendTheWindowTheStatus(status: TatolabStatus): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_STATUS_CHANGED_EVENT, status);
  }

  /** Send the window `reading` as `tatolab-open-project-changed`; nothing, before the window is first shown, which reads its project when it opens. */
  sendTheWindowTheOpenProject(reading: OpenProjectReading): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_OPEN_PROJECT_CHANGED_EVENT, reading);
  }

  /** Send the window `reading` as `tatolab-project-transactions-changed`; nothing, before the window is first shown, which reads the feed when it opens. */
  sendTheWindowTheProjectTransactions(reading: ProjectTransactionsReading): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT, reading);
  }

  /** Send the window `event` as `tatolab-python-language-server-event`; nothing, before the window is first shown. */
  sendTheWindowALanguageServerEvent(event: PythonLanguageServerEvent): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT, event);
  }

  /** Send the window `event` as `tatolab-port-viewer-event`; nothing, before the window is first shown. */
  sendTheWindowAPortViewerEvent(event: PortViewerEvent): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_PORT_VIEWER_EVENT, event);
  }

  /** Send the window the system menu bar entry `entryId` the person chose from its menus, as `tatolab-system-menu-bar-entry-chosen`. */
  sendTheWindowTheChosenSystemMenuBarEntry(entryId: string): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT, { entry_id: entryId } satisfies SystemMenuBarEntryChosen);
  }

  /** Hand the window `imageFrame` as a shared texture; refused, and let go of at once, when the window is not open. */
  sendTheWindowAnImageFrame(
    imageFrame: SharedTextureImportOfARuntimeViewerFrame,
    frameFacts: PortViewerImageFrameFacts,
    whenTheWindowLetsGo: () => void,
  ): Promise<Result<void, string>> {
    if (this.mainWindowHost === null) {
      whenTheWindowLetsGo();
      return Promise.resolve(failedWith("the window is not open"));
    }
    return this.mainWindowHost.sendTheWindowASharedTexture(imageFrame, frameFacts, whenTheWindowLetsGo);
  }

  /** Show the window on the page of the stream whose id is `streamId`, as a click on its failure notification asks. */
  showTheStreamsPage(streamId: string): void {
    this.show();
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_STREAM_PAGE_REQUESTED_EVENT, { stream: streamId } satisfies TatolabStreamPageRequest);
  }

  /** Let the window close, rather than hide, from here on: the app is quitting. */
  letTheWindowCloseAsTheAppQuits(): void {
    this.theAppIsQuitting = true;
  }

  private createMainWindowHost(): MainWindowHost | null {
    const createdMainWindowHost = this.mainWindowHostFactory.createMainWindowHost(
      {
        title: this.windowTitle,
        ...mainWindowSizesOf(this.windowRole),
        chrome: this.mainWindowChrome,
      },
      () => this.answerCloseRequest(),
      () => this.noticeItClosed(),
    );
    if (!createdMainWindowHost.ok) {
      this.tatolabAppLog.error("a Tato Studio window could not be created", { window_role: this.windowRole, failure: createdMainWindowHost.failure });
      return null;
    }
    this.mainWindowHost = createdMainWindowHost.value;
    return this.mainWindowHost;
  }

  private answerCloseRequest(): MainWindowCloseRequestAnswer {
    if (this.theAppIsQuitting) return "let_it_close";
    if (this.windowRole !== "projects") return this.listeners.answerItsCloseRequest();
    this.hide();
    return "hide_instead";
  }

  private noticeItClosed(): void {
    this.mainWindowHost = null;
    this.isShownByTheApp = false;
    this.listeners.whenItCameOnScreenOrWentOff();
    this.listeners.whenItClosed();
  }
}
