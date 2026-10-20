// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The requests the tray and the window both make.

import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { TatolabMainWindow } from "./tatolab_main_window.js";

/** Quit the app from the tray or the window. The runtime is the service manager's, and keeps running. */
export function quitTheTatolabApp(
  tatolabMainWindow: TatolabMainWindow,
  exitTheApp: (exitCode: number) => void,
  tatolabAppLog: TatolabAppLog,
): void {
  tatolabAppLog.info("quitting the Tatolab app; the runtime keeps running");
  tatolabMainWindow.letTheWindowCloseAsTheAppQuits();
  exitTheApp(0);
}
