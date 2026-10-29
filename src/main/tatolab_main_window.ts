// The app's one window. It shows when the app opens, when the app is opened again, and from the
// tray's "Open Tatolab"; closing it hides it and the app keeps running in the tray. On macOS the
// Dock icon shows only while the window does.

import type { TatolabStatus } from "../shared/tatolab_backend_contract.js";
import {
  TATOLAB_STATUS_CHANGED_EVENT,
  TATOLAB_STREAM_PAGE_REQUESTED_EVENT,
  type TatolabStreamPageRequest,
} from "../shared/tatolab_electron_bridge_contract.js";
import type { Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { DockIconHost, MainWindowChrome } from "./platform/main_window_chrome.js";
import type { TatolabPlatformItems } from "./platform/tatolab_platform_items.js";

/** The main window's title, sizes and title bar. */
export interface MainWindowSpecification {
  title: string;
  width: number;
  height: number;
  minimumWidth: number;
  minimumHeight: number;
  chrome: MainWindowChrome;
}

/** Whether a close request closes the window or hides it instead. */
export type MainWindowCloseRequestAnswer = "hide_instead" | "let_it_close";

/** The window as the platform shows it. */
export interface MainWindowHost {
  unminimize(): void;
  show(): void;
  focus(): void;
  hide(): void;
  /** Send the window's page `eventPayload` on `eventChannel`; a page still loading misses it. */
  sendTheWindowAnEvent(eventChannel: string, eventPayload: unknown): void;
}

/** What creates the window, hidden, asking `answerCloseRequest` at each close request whether to close it. */
export interface MainWindowHostFactory {
  createMainWindowHost(
    mainWindowSpecification: MainWindowSpecification,
    answerCloseRequest: () => MainWindowCloseRequestAnswer,
  ): Result<MainWindowHost, string>;
}

/** The window: created on its first show, at 1040×700 and never smaller than 860×580, centred. */
export class TatolabMainWindow {
  private mainWindowHost: MainWindowHost | null = null;
  private theAppIsQuitting = false;

  constructor(
    private readonly mainWindowHostFactory: MainWindowHostFactory,
    private readonly platformItems: Pick<TatolabPlatformItems, "mainWindowChrome" | "setDockIconVisible">,
    private readonly dockIconHost: DockIconHost,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Show the window, creating it the first time, and bring the app forward. */
  show(): void {
    this.platformItems.setDockIconVisible(this.dockIconHost, true);
    const mainWindowHost = this.mainWindowHost ?? this.createMainWindowHost();
    if (mainWindowHost === null) {
      this.platformItems.setDockIconVisible(this.dockIconHost, false);
      return;
    }
    mainWindowHost.unminimize();
    mainWindowHost.show();
    mainWindowHost.focus();
  }

  /** Send the window `status` as `tatolab-status-changed`; nothing, before the window is first shown. */
  sendTheWindowTheStatus(status: TatolabStatus): void {
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_STATUS_CHANGED_EVENT, status);
  }

  /** Show the window on the page of the stream whose id is `stream`, as a click on its failure notification asks. */
  showTheStreamsPage(stream: string): void {
    this.show();
    this.mainWindowHost?.sendTheWindowAnEvent(TATOLAB_STREAM_PAGE_REQUESTED_EVENT, { stream } satisfies TatolabStreamPageRequest);
  }

  /** Let the window close, rather than hide, from here on: the app is quitting. */
  letTheWindowCloseAsTheAppQuits(): void {
    this.theAppIsQuitting = true;
  }

  private createMainWindowHost(): MainWindowHost | null {
    const createdMainWindowHost = this.mainWindowHostFactory.createMainWindowHost(
      {
        title: "Tatolab",
        width: 1040,
        height: 700,
        minimumWidth: 860,
        minimumHeight: 580,
        chrome: this.platformItems.mainWindowChrome,
      },
      () => this.answerCloseRequest(),
    );
    if (!createdMainWindowHost.ok) {
      this.tatolabAppLog.error("the Tatolab window could not be created", { failure: createdMainWindowHost.failure });
      return null;
    }
    this.mainWindowHost = createdMainWindowHost.value;
    return this.mainWindowHost;
  }

  private answerCloseRequest(): MainWindowCloseRequestAnswer {
    if (this.theAppIsQuitting) return "let_it_close";
    this.mainWindowHost?.hide();
    this.platformItems.setDockIconVisible(this.dockIconHost, false);
    return "hide_instead";
  }
}
