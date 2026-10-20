// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux: the window and tray over the systemd user service the installer registers. The runtime,
// its service and the CLI come only from the installer, so this app installs nothing, sets
// nothing up and uninstalls nothing; "Run Tatolab" enables and disables the service. A second
// launch hands itself to the running app, the window keeps the desktop's own title bar, and the
// tray's mark keeps its colours.

import type { DockIconHost, MainWindowChrome, TrayIconImage } from "../mod.js";

/** The Tatolab mark at 64×64 in its own colours, which a panel shows as they are. */
export const LINUX_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-coloured.png", isATemplate: false };

/** The desktop's own title bar and borders, which the window keeps. */
export const LINUX_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "default" };

/** Nothing to show or hide: Linux has no Dock, and the window's own taskbar entry comes and goes with the window. */
export function setLinuxDockIconVisible(_dockIconHost: DockIconHost, _dockIconVisible: boolean): void {}
