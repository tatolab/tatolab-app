import { BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import { isOnTheRuntimesWatchPage } from "../runtime_loopback_watch_page.js";
import { isACommandFromTheWindowsOwnPage, isOnTheWindowPagesOwnLocation } from "../tatolab_window_page_source.js";
import { MainWindowFirstShowGate } from "../main_window_first_show_gate.js";
import { TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE } from "../../shared/tatolab_electron_bridge_contract.js";
import type { MainWindowCloseRequestAnswer, MainWindowHost, MainWindowHostFactory, MainWindowSpecification } from "../tatolab_main_window.js";

/**
 * Creates the window as a sandboxed, context-isolated page with no Node, loading `windowPageUrl` with the preload at
 * `windowPreloadScriptPath`, whose frames go only to the runtime's preview page at `runtimeLoopbackHttpOrigin`; developer
 * tools open only where `developerToolsAllowed`.
 */
export function createElectronMainWindowHostFactory(
  windowPageUrl: string,
  windowPreloadScriptPath: string,
  runtimeLoopbackHttpOrigin: string,
  developerToolsAllowed: boolean,
  tatolabAppLog: TatolabAppLog,
): MainWindowHostFactory {
  return {
    createMainWindowHost(
      mainWindowSpecification: MainWindowSpecification,
      answerCloseRequest: () => MainWindowCloseRequestAnswer,
    ): Result<MainWindowHost, string> {
      let mainBrowserWindow: BrowserWindow;
      try {
        mainBrowserWindow = new BrowserWindow({
          title: mainWindowSpecification.title,
          width: mainWindowSpecification.width,
          height: mainWindowSpecification.height,
          minWidth: mainWindowSpecification.minimumWidth,
          minHeight: mainWindowSpecification.minimumHeight,
          center: true,
          show: false,
          ...mainWindowSpecification.chrome,
          webPreferences: {
            preload: windowPreloadScriptPath,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            devTools: developerToolsAllowed,
          },
        });
      } catch (caughtFailure) {
        return failedWith(describeCaughtFailure(caughtFailure));
      }
      mainBrowserWindow.on("close", (closeEvent) => {
        if (answerCloseRequest() === "hide_instead") closeEvent.preventDefault();
      });
      const windowContents = mainBrowserWindow.webContents;
      windowContents.setWindowOpenHandler(() => ({ action: "deny" }));
      windowContents.on("will-navigate", (navigationEvent) => {
        if (!isOnTheWindowPagesOwnLocation(windowPageUrl, navigationEvent.url)) navigationEvent.preventDefault();
      });
      windowContents.on("will-frame-navigate", (frameNavigationEvent) => {
        if (!frameNavigationEvent.isMainFrame && !isOnTheRuntimesWatchPage(runtimeLoopbackHttpOrigin, frameNavigationEvent.url)) {
          frameNavigationEvent.preventDefault();
        }
      });
      windowContents.session.setPermissionRequestHandler((_requestingContents, _permission, answerPermissionRequest) =>
        answerPermissionRequest(false),
      );
      windowContents.session.setPermissionCheckHandler(() => false);
      const diag127Folder = "/tmp/tatolab-diag127";
      try {
        mkdirSync(diag127Folder, { recursive: true });
      } catch {
        // diagnostic only
      }
      const diag127EpochMs = () => Math.round((performance.timeOrigin + performance.now()) * 10) / 10;
      const diag127 = (diagEvent: string, diagFields: Record<string, string | number | boolean | null> = {}) =>
        tatolabAppLog.info(`diag127 ${diagEvent}`, { epoch_ms: diag127EpochMs(), ...diagFields });
      const diag127Capture = (captureLabel: string) => {
        const askedAtMs = diag127EpochMs();
        windowContents
          .capturePage(undefined, { stayHidden: true })
          .then((capturedImage) => {
            const capturedSize = capturedImage.getSize();
            const capturedBitmap = capturedImage.toBitmap();
            let pixelsUnlikeTheCorner = 0;
            const cornerOffset = (Math.max(0, capturedSize.height - 5) * capturedSize.width + Math.max(0, capturedSize.width - 5)) * 4;
            for (let pixelOffset = 0; pixelOffset + 3 < capturedBitmap.length; pixelOffset += 16) {
              const colourDistance =
                Math.abs((capturedBitmap[pixelOffset] ?? 0) - (capturedBitmap[cornerOffset] ?? 0)) +
                Math.abs((capturedBitmap[pixelOffset + 1] ?? 0) - (capturedBitmap[cornerOffset + 1] ?? 0)) +
                Math.abs((capturedBitmap[pixelOffset + 2] ?? 0) - (capturedBitmap[cornerOffset + 2] ?? 0));
              if (colourDistance > 24) pixelsUnlikeTheCorner += 1;
            }
            const resolvedAtMs = diag127EpochMs();
            try {
              writeFileSync(`${diag127Folder}/${Math.round(askedAtMs)}-${captureLabel}.png`, capturedImage.toPNG());
            } catch {
              // diagnostic only
            }
            diag127("capture", {
              label: captureLabel,
              asked_epoch_ms: askedAtMs,
              resolved_after_ms: Math.round(resolvedAtMs - askedAtMs),
              width: capturedSize.width,
              height: capturedSize.height,
              sampled_pixels_unlike_corner: pixelsUnlikeTheCorner,
              is_empty: capturedImage.isEmpty(),
            });
          })
          .catch((captureFailure: unknown) => diag127("capture_failed", { label: captureLabel, failure: describeCaughtFailure(captureFailure) }));
      };
      diag127("window_created");
      windowContents.on("console-message", (consoleEvent) => {
        if (consoleEvent.message.startsWith("diag127 ")) diag127("renderer", { renderer_line: consoleEvent.message });
      });
      windowContents.on("did-finish-load", () => diag127("did_finish_load"));
      windowContents.on("dom-ready", () => diag127("dom_ready"));
      const firstShowGate = new MainWindowFirstShowGate(() => {
        diag127("show_called");
        diag127Capture("at_show");
        mainBrowserWindow.show();
        diag127("show_returned", { is_visible: mainBrowserWindow.isVisible() });
        for (const delayAfterShowMs of [16, 50, 100, 150, 200, 300, 500]) {
          setTimeout(() => diag127Capture(`show_plus_${delayAfterShowMs}ms`), delayAfterShowMs);
        }
      });
      mainBrowserWindow.once("show", () => diag127("show_event"));
      mainBrowserWindow.once("ready-to-show", () => {
        diag127("ready_to_show");
        diag127Capture("at_ready_to_show");
        firstShowGate.pageFirstPainted();
      });
      windowContents.ipc.on(TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE, (noticeEvent) => {
        if (isACommandFromTheWindowsOwnPage(windowPageUrl, noticeEvent.senderFrame?.url ?? null, noticeEvent.senderFrame === windowContents.mainFrame)) {
          diag127("first_status_drawn_notice");
          diag127Capture("at_notice");
          firstShowGate.pageDrewItsFirstStatus();
        }
      });
      windowContents.once("did-fail-load", () => firstShowGate.pageWillDrawNothing());
      windowContents.once("render-process-gone", () => firstShowGate.pageWillDrawNothing());
      mainBrowserWindow.loadURL(windowPageUrl).catch((loadFailure: unknown) => {
        tatolabAppLog.error("the Tatolab window's page did not load", { window_page_url: windowPageUrl, failure: describeCaughtFailure(loadFailure) });
      });
      return succeeded({
        unminimize: () => {
          if (mainBrowserWindow.isMinimized()) mainBrowserWindow.restore();
        },
        show: () => firstShowGate.show(),
        focus: () => mainBrowserWindow.focus(),
        hide: () => {
          firstShowGate.hide();
          mainBrowserWindow.hide();
        },
        isShowing: () => firstShowGate.showIsWaitingForThePage() || (mainBrowserWindow.isVisible() && !mainBrowserWindow.isMinimized()),
        sendTheWindowAnEvent: (eventChannel, eventPayload) => {
          if (!windowContents.isDestroyed()) windowContents.send(eventChannel, eventPayload);
        },
      });
    },
  };
}

