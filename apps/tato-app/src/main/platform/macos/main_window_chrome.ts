// The main window's macOS looks: the hidden title bar the window draws under, and the Dock icon,
// shown only while the window is.

import type { DockIconHost, MainWindowChrome } from "../main_window_chrome.js";

/** The hidden title bar the window draws under, with the 14 px traffic lights centred on the studio's 40 px menu bar, at its left end. */
export const MACOS_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 13 } };

/** A regular app with a Dock icon while the window shows, an accessory without one otherwise. */
export function setMacosDockIconVisible(dockIconHost: DockIconHost, dockIconVisible: boolean): void {
  dockIconHost.setActivationPolicy(dockIconVisible ? "regular" : "accessory");
}
