// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { BrowserWindow } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import type { MainWindowCloseRequestAnswer, MainWindowHost, MainWindowHostFactory, MainWindowSpecification } from "../tatolab_main_window.js";

/** Creates the window as a sandboxed, context-isolated page with no Node, loading `windowPageUrl`. */
export function createElectronMainWindowHostFactory(windowPageUrl: string, tatolabAppLog: TatolabAppLog): MainWindowHostFactory {
  const windowPageOrigin = new URL(windowPageUrl).origin;
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
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
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
        if (new URL(navigationEvent.url).origin !== windowPageOrigin) navigationEvent.preventDefault();
      });
      windowContents.session.setPermissionRequestHandler((_requestingContents, _permission, answerPermissionRequest) =>
        answerPermissionRequest(false),
      );
      mainBrowserWindow.loadURL(windowPageUrl).catch((loadFailure: unknown) => {
        tatolabAppLog.error("the Tatolab window's page did not load", { window_page_url: windowPageUrl, failure: describeCaughtFailure(loadFailure) });
      });
      return succeeded({
        unminimize: () => {
          if (mainBrowserWindow.isMinimized()) mainBrowserWindow.restore();
        },
        show: () => mainBrowserWindow.show(),
        focus: () => mainBrowserWindow.focus(),
        hide: () => mainBrowserWindow.hide(),
      });
    },
  };
}

