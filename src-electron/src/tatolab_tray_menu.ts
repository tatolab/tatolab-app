// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The tray item, in macOS's menu bar or a Linux panel: the Tatolab mark in this platform's tray
// image, and a native menu — a disabled status line, "Open Tatolab" and "Quit Tatolab" — on either
// click — and the rule for when "Set Up Tatolab…" shows.

import type { MachineSetupState } from "../../src/backend/tatolab_backend_contract.js";
import type { TrayIconImage } from "./platform/mod.js";

/** A tray menu item's id, which a click reports. */
export type TrayMenuItemId = "tray_status_line" | "open_tatolab" | "quit_tatolab";

/** One row of the tray menu as the tray icon host shows it. */
export type TrayMenuItemDescription =
  | { kind: "item"; id: TrayMenuItemId; label: string; enabled: boolean }
  | { kind: "separator" };

/** The tray icon as the platform shows it: its menu is replaced whole, since a Linux panel does not reliably update an item in place. */
export interface TrayIconHost {
  showMenu(trayMenuItems: readonly TrayMenuItemDescription[]): void;
}

/** What puts the tray icon in the menu bar or panel. */
export interface TrayIconHostFactory {
  createTrayIcon(trayIconImage: TrayIconImage, tooltip: string, onMenuItemClicked: (trayMenuItemId: TrayMenuItemId) => void): TrayIconHost;
}

/** What the user chose from the tray menu. */
export type TrayMenuChoice = "open_tatolab" | "quit_the_app";

/** How "Set Up Tatolab…" shows in the menu. */
export type SetUpTatolabMenuItemPresentation = "hidden" | "shown_enabled" | "shown_disabled";

/** "Set Up Tatolab…" shows only while machine setup is missing, and waits while the administrator prompt is already showing. */
export function setUpTatolabMenuItemPresentation(machineSetup: MachineSetupState): SetUpTatolabMenuItemPresentation {
  switch (machineSetup) {
    case "complete":
      return "hidden";
    case "needs_administrator":
      return "shown_enabled";
    case "waiting_for_administrator":
      return "shown_disabled";
  }
}

const TRAY_MENU_CHOICES_BY_ITEM_ID: Readonly<Record<TrayMenuItemId, TrayMenuChoice | null>> = {
  tray_status_line: null,
  open_tatolab: "open_tatolab",
  quit_tatolab: "quit_the_app",
};

/** The tray icon and its menu. */
export class TatolabTrayMenu {
  private readonly trayStatusLine = "Starting…";

  private constructor(private readonly trayIconHost: TrayIconHost) {}

  /** Put the tray icon in the menu bar or panel, calling `onChoice` with each menu choice. */
  static build(
    trayIconHostFactory: TrayIconHostFactory,
    trayIconImage: TrayIconImage,
    onChoice: (trayMenuChoice: TrayMenuChoice) => void,
  ): TatolabTrayMenu {
    const trayIconHost = trayIconHostFactory.createTrayIcon(trayIconImage, "Tatolab", (trayMenuItemId) => {
      const trayMenuChoice = TRAY_MENU_CHOICES_BY_ITEM_ID[trayMenuItemId];
      if (trayMenuChoice !== null) onChoice(trayMenuChoice);
    });
    const tatolabTrayMenu = new TatolabTrayMenu(trayIconHost);
    tatolabTrayMenu.showTheMenu();
    return tatolabTrayMenu;
  }

  private showTheMenu(): void {
    this.trayIconHost.showMenu([
      { kind: "item", id: "tray_status_line", label: this.trayStatusLine, enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true },
    ]);
  }
}
