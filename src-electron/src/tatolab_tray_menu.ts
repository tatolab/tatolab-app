// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The tray item, in macOS's menu bar or a Linux panel: the Tatolab mark in this platform's tray
// image, and a native menu on either click — a disabled status line, "Open Tatolab", the
// "Run Tatolab" check, "Open Login Items…" while macOS waits for the person's approval, "Try
// Again" once the runtime never answered or the service manager gave up on it, "Check for
// Updates…" in a packaged app, and "Quit Tatolab".

import type { TatolabAppUpdateState, TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import type { TrayIconImage } from "./platform/mod.js";
import { trayRuntimeRemedy, trayStatusLine, type TrayRuntimeRemedy } from "./tatolab_status.js";

/** A tray menu item's id, which a click reports. */
export type TrayMenuItemId =
  | "tray_status_line"
  | "open_tatolab"
  | "run_tatolab"
  | "open_login_items_settings"
  | "register_the_runtime_again"
  | "check_for_app_updates"
  | "quit_tatolab";

/** One row of the tray menu as the tray icon host shows it. */
export type TrayMenuItemDescription =
  | { kind: "item"; id: TrayMenuItemId; label: string; enabled: boolean }
  | { kind: "check_item"; id: TrayMenuItemId; label: string; enabled: boolean; checked: boolean }
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
export type TrayMenuChoice =
  | "open_tatolab"
  | "toggle_run_tatolab_switch"
  | "open_login_items_settings"
  | "register_the_runtime_again"
  | "check_for_app_updates"
  | "quit_the_app";

/** The item that brings the runtime back, as the menu shows it for `trayRuntimeRemedy`; `null` when there is none. */
export function trayRuntimeRemedyMenuItem(remedy: TrayRuntimeRemedy): TrayMenuItemDescription | null {
  switch (remedy) {
    case "open_login_items":
      return { kind: "item", id: "open_login_items_settings", label: "Open Login Items…", enabled: true };
    case "register_the_runtime_again":
      return { kind: "item", id: "register_the_runtime_again", label: "Try Again", enabled: true };
    case null:
      return null;
  }
}

/** How the updates item reads for `appUpdate`: its label and whether it can be chosen, or `null` in an app that cannot update itself. */
export function appUpdateTrayMenuItemPresentation(appUpdate: TatolabAppUpdateState): { label: string; enabled: boolean } | null {
  switch (appUpdate.kind) {
    case "not_offered":
      return null;
    case "not_checked":
    case "up_to_date":
    case "failed":
      return { label: "Check for Updates…", enabled: true };
    case "checking":
      return { label: "Checking for Updates…", enabled: false };
    case "available":
      return { label: appUpdate.delivery === "install_and_relaunch" ? `Install Tatolab ${appUpdate.version}…` : `Download Tatolab ${appUpdate.version}…`, enabled: true };
    case "downloading":
      return { label: `Downloading Tatolab ${appUpdate.version}…`, enabled: false };
    case "installing":
      return { label: `Installing Tatolab ${appUpdate.version}…`, enabled: false };
  }
}

const TRAY_MENU_CHOICES_BY_ITEM_ID: Readonly<Record<TrayMenuItemId, TrayMenuChoice | null>> = {
  tray_status_line: null,
  open_tatolab: "open_tatolab",
  run_tatolab: "toggle_run_tatolab_switch",
  open_login_items_settings: "open_login_items_settings",
  register_the_runtime_again: "register_the_runtime_again",
  check_for_app_updates: "check_for_app_updates",
  quit_tatolab: "quit_the_app",
};

/** The tray icon and its menu. */
export class TatolabTrayMenu {
  private trayStatusLine = "Starting…";
  private runtimeRemedyItem: TrayMenuItemDescription | null = null;
  private appUpdateItem: { label: string; enabled: boolean } | null = null;

  private constructor(
    private readonly trayIconHost: TrayIconHost,
    private runTatolab: boolean,
  ) {}

  /** Put the tray icon in the menu bar or panel, its "Run Tatolab" checked as `runTatolab`, calling `onChoice` with each menu choice. */
  static build(
    trayIconHostFactory: TrayIconHostFactory,
    trayIconImage: TrayIconImage,
    runTatolab: boolean,
    onChoice: (trayMenuChoice: TrayMenuChoice) => void,
  ): TatolabTrayMenu {
    const trayIconHost = trayIconHostFactory.createTrayIcon(trayIconImage, "Tatolab", (trayMenuItemId) => {
      const trayMenuChoice = TRAY_MENU_CHOICES_BY_ITEM_ID[trayMenuItemId];
      if (trayMenuChoice !== null) onChoice(trayMenuChoice);
    });
    const tatolabTrayMenu = new TatolabTrayMenu(trayIconHost, runTatolab);
    tatolabTrayMenu.showTheMenu();
    return tatolabTrayMenu;
  }

  /** Show `status` in the status line, the switch's check mark, the item that brings the runtime back, and the updates item. */
  showStatus(status: TatolabStatus): void {
    this.trayStatusLine = trayStatusLine(status);
    this.runTatolab = status.run_tatolab;
    this.runtimeRemedyItem = trayRuntimeRemedyMenuItem(trayRuntimeRemedy(status));
    this.appUpdateItem = appUpdateTrayMenuItemPresentation(status.app_update);
    this.showTheMenu();
  }

  private showTheMenu(): void {
    const trayMenuItems: TrayMenuItemDescription[] = [
      { kind: "item", id: "tray_status_line", label: this.trayStatusLine, enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tatolab", enabled: true },
      { kind: "check_item", id: "run_tatolab", label: "Run Tatolab", enabled: true, checked: this.runTatolab },
    ];
    if (this.runtimeRemedyItem !== null) trayMenuItems.push(this.runtimeRemedyItem);
    trayMenuItems.push({ kind: "separator" });
    if (this.appUpdateItem !== null) trayMenuItems.push({ kind: "item", id: "check_for_app_updates", ...this.appUpdateItem });
    trayMenuItems.push({ kind: "item", id: "quit_tatolab", label: "Quit Tatolab", enabled: true });
    this.trayIconHost.showMenu(trayMenuItems);
  }
}
