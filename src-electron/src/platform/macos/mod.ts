// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// macOS: the window draws under a hidden title bar with the Dock icon following it, and the tray's
// mark is a template image.

import type { TrayIconImage } from "../mod.js";

export { MACOS_MAIN_WINDOW_CHROME, setMacosDockIconVisible } from "./main_window_chrome.js";

/** The tray's mark, shown at 18pt in the menu bar from its @2x file and tinted to it as a template image. */
export const MACOS_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-template.png", isATemplate: true };
