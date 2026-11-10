import { BrowserWindow, dialog, sharedTexture, type SharedTextureImported } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import { isACommandFromTheWindowsOwnPage, isAPermissionTheWindowGrants, isAViewPageTheWindowFrames, isOnTheWindowPagesOwnLocation } from "../tatolab_window_page_source.js";
import { MainWindowFirstShowGate } from "../main_window_first_show_gate.js";
import { TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE } from "../../shared/tatolab_electron_bridge_contract.js";
import type { MainWindowCloseRequestAnswer, MainWindowHost, MainWindowHostFactory, MainWindowSpecification } from "../tatolab_main_window.js";

/**
 * Creates the window as a sandboxed, context-isolated page with no Node, loading `windowPageUrl` with the preload at
 * `windowPreloadScriptPath`, with no frame navigating anywhere; developer tools open only where `developerToolsAllowed`.
 */
export function createElectronMainWindowHostFactory(
  windowPageUrl: string,
  windowPreloadScriptPath: string,
  developerToolsAllowed: boolean,
  tatolabAppLog: TatolabAppLog,
): MainWindowHostFactory {
  return {
    createMainWindowHost(
      mainWindowSpecification: MainWindowSpecification,
      answerCloseRequest: () => MainWindowCloseRequestAnswer,
      whenClosed: () => void,
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
        if (answerCloseRequest() !== "let_it_close") closeEvent.preventDefault();
      });
      mainBrowserWindow.once("closed", whenClosed);
      // Electron retitles a window with its page's `<title>` on every load; each window keeps the title its role gives it.
      mainBrowserWindow.on("page-title-updated", (pageTitleEvent) => pageTitleEvent.preventDefault());
      const windowContents = mainBrowserWindow.webContents;
      windowContents.setWindowOpenHandler(() => ({ action: "deny" }));
      windowContents.on("will-navigate", (navigationEvent) => {
        if (!isOnTheWindowPagesOwnLocation(windowPageUrl, navigationEvent.url)) navigationEvent.preventDefault();
      });
      windowContents.on("will-frame-navigate", (frameNavigationEvent) => {
        if (!frameNavigationEvent.isMainFrame && !isAViewPageTheWindowFrames(windowPageUrl, frameNavigationEvent.url)) frameNavigationEvent.preventDefault();
      });
      // Electron shows no permission prompt of its own: what these handlers answer is final for Chromium, and only a
      // granted camera or microphone goes on to macOS's own prompt (the bundle's NSCameraUsageDescription words).
      windowContents.session.setPermissionRequestHandler((_requestingContents, permission, answerPermissionRequest, requestDetails) =>
        answerPermissionRequest(
          isAPermissionTheWindowGrants(windowPageUrl, permission, "mediaTypes" in requestDetails ? (requestDetails.mediaTypes ?? []) : [], requestDetails.requestingUrl),
        ),
      );
      windowContents.session.setPermissionCheckHandler((_requestingContents, permission, _requestingOrigin, checkDetails) =>
        isAPermissionTheWindowGrants(windowPageUrl, permission, checkDetails.mediaType === undefined ? [] : [checkDetails.mediaType], checkDetails.requestingUrl),
      );
      const firstShowGate = new MainWindowFirstShowGate(() => mainBrowserWindow.show());
      mainBrowserWindow.once("ready-to-show", () => firstShowGate.pageFirstPainted());
      windowContents.ipc.on(TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE, (noticeEvent) => {
        if (isACommandFromTheWindowsOwnPage(windowPageUrl, noticeEvent.senderFrame?.url ?? null, noticeEvent.senderFrame === windowContents.mainFrame)) {
          firstShowGate.pageDrewItsFirstStatus();
        }
      });
      windowContents.once("did-fail-load", () => firstShowGate.pageWillDrawNothing());
      windowContents.once("render-process-gone", () => firstShowGate.pageWillDrawNothing());
      mainBrowserWindow.loadURL(windowPageUrl).catch((loadFailure: unknown) => {
        tatolabAppLog.error("the Tatolab window's page did not load", { window_page_url: windowPageUrl, failure: describeCaughtFailure(loadFailure) });
      });
      return succeeded({
        windowContentsId: windowContents.id,
        unminimize: () => {
          if (mainBrowserWindow.isMinimized()) mainBrowserWindow.restore();
        },
        show: () => firstShowGate.show(),
        focus: () => mainBrowserWindow.focus(),
        hide: () => {
          firstShowGate.hide();
          mainBrowserWindow.hide();
        },
        close: () => mainBrowserWindow.destroy(),
        isShowing: () => firstShowGate.showIsWaitingForThePage() || (mainBrowserWindow.isVisible() && !mainBrowserWindow.isMinimized()),
        askAQuestionOverTheWindow: async (question) => {
          try {
            const messageBoxAnswer = await dialog.showMessageBox(mainBrowserWindow, {
              type: "question",
              message: question.message,
              detail: question.detail,
              buttons: [...question.buttonLabels],
              defaultId: 0,
              cancelId: question.cancelButtonIndex,
              noLink: true,
            });
            return succeeded(messageBoxAnswer.response);
          } catch (caughtFailure) {
            return failedWith(`The message box did not open: ${describeCaughtFailure(caughtFailure)}`);
          }
        },
        sendTheWindowAnEvent: (eventChannel, eventPayload) => {
          if (!windowContents.isDestroyed()) windowContents.send(eventChannel, eventPayload);
        },
        sendTheWindowASharedTexture: async (sharedTextureImport, frameFacts, whenEveryReferenceIsReleased) => {
          let everyReferenceIsReleased = false;
          const noticeEveryReferenceReleased = () => {
            if (everyReferenceIsReleased) return;
            everyReferenceIsReleased = true;
            whenEveryReferenceIsReleased();
          };
          if (windowContents.isDestroyed()) {
            noticeEveryReferenceReleased();
            return failedWith("the window has closed");
          }
          let importedSharedTexture: SharedTextureImported;
          try {
            importedSharedTexture = sharedTexture.importSharedTexture({ textureInfo: sharedTextureImport, allReferencesReleased: noticeEveryReferenceReleased });
          } catch (importFailure) {
            noticeEveryReferenceReleased();
            return failedWith(describeCaughtFailure(importFailure));
          }
          try {
            await sharedTexture.sendSharedTexture({ frame: windowContents.mainFrame, importedSharedTexture }, frameFacts);
            return succeeded(undefined);
          } catch (sendFailure) {
            return failedWith(describeCaughtFailure(sendFailure));
          } finally {
            importedSharedTexture.release();
          }
        },
      });
    },
  };
}

