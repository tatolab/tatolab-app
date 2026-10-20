// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux: the window keeps the desktop's own title bar with no menu bar, there is no Dock, and the
// tray's mark keeps its colours.

import type { DockIconHost, MainWindowChrome, TrayIconImage } from "../mod.js";

/** The Tatolab mark at 64×64 in its own colours, which a panel shows as they are. */
export const LINUX_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-coloured.png", isATemplate: false };

/** The desktop's own title bar and borders, which the window keeps. */
export const LINUX_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "default" };

/** Nothing to show or hide: Linux has no Dock, and the window's own taskbar entry comes and goes with the window. */
export function setLinuxDockIconVisible(_dockIconHost: DockIconHost, _dockIconVisible: boolean): void {}
