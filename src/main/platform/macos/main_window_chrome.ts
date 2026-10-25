// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The main window's macOS looks: the hidden title bar the window draws under, and the Dock icon,
// shown only while the window is.

import type { DockIconHost, MainWindowChrome } from "../mod.js";

/** The hidden title bar the window draws under, with the traffic lights level with the window's 44 px title bar, which sits 8 px down, inset from the window's edge. */
export const MACOS_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "hidden", trafficLightPosition: { x: 18, y: 23 } };

/** A regular app with a Dock icon while the window shows, an accessory without one otherwise. */
export function setMacosDockIconVisible(dockIconHost: DockIconHost, dockIconVisible: boolean): void {
  dockIconHost.setActivationPolicy(dockIconVisible ? "regular" : "accessory");
}
