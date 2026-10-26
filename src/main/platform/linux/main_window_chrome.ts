// The main window's Linux looks: the desktop's own title bar, and no Dock.

import type { DockIconHost, MainWindowChrome } from "../main_window_chrome.js";

/** The desktop's own title bar and borders, which the window keeps. */
export const LINUX_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "default" };

/** Nothing to show or hide: Linux has no Dock, and the window's own taskbar entry comes and goes with the window. */
export function setLinuxDockIconVisible(_dockIconHost: DockIconHost, _dockIconVisible: boolean): void {}
