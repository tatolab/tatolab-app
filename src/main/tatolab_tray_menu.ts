// The tray item, in macOS's menu bar or a Linux panel: the Tatolab mark in this platform's tray
// image, and a native menu on either click — a disabled status line, "Open Tato Studio", "Check
// for Updates…" in a packaged app, and "Quit Tato Studio", which stops the runtime with the app.

import type { TatolabAppUpdateState, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import type { TrayIconImage } from "./platform/tray_icon_image.js";
import { trayStatusLine } from "./tatolab_status.js";

/** A tray menu item's id, which a click reports. */
export type TrayMenuItemId =
  | "tray_status_line"
  | "open_tatolab"
  | "check_for_app_updates"
  | "quit_tatolab";

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
export type TrayMenuChoice = "open_tatolab" | "check_for_app_updates" | "quit_the_app";

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
      return { label: appUpdate.delivery === "install_and_relaunch" ? `Install Tato Studio ${appUpdate.version}…` : `Download Tato Studio ${appUpdate.version}…`, enabled: true };
    case "downloading":
      return { label: `Downloading Tato Studio ${appUpdate.version}…`, enabled: false };
    case "installing":
      return { label: `Installing Tato Studio ${appUpdate.version}…`, enabled: false };
  }
}

const TRAY_MENU_CHOICES_BY_ITEM_ID: Readonly<Record<TrayMenuItemId, TrayMenuChoice | null>> = {
  tray_status_line: null,
  open_tatolab: "open_tatolab",
  check_for_app_updates: "check_for_app_updates",
  quit_tatolab: "quit_the_app",
};

/** The tray icon and its menu. */
export class TatolabTrayMenu {
  private trayStatusLine = "Starting the runtime…";
  private appUpdateItem: { label: string; enabled: boolean } | null = null;

  private constructor(private readonly trayIconHost: TrayIconHost) {}

  /** Put the tray icon in the menu bar or panel, calling `onChoice` with each menu choice. */
  static build(trayIconHostFactory: TrayIconHostFactory, trayIconImage: TrayIconImage, onChoice: (trayMenuChoice: TrayMenuChoice) => void): TatolabTrayMenu {
    const trayIconHost = trayIconHostFactory.createTrayIcon(trayIconImage, "Tato Studio", (trayMenuItemId) => {
      const trayMenuChoice = TRAY_MENU_CHOICES_BY_ITEM_ID[trayMenuItemId];
      if (trayMenuChoice !== null) onChoice(trayMenuChoice);
    });
    const tatolabTrayMenu = new TatolabTrayMenu(trayIconHost);
    tatolabTrayMenu.showTheMenu();
    return tatolabTrayMenu;
  }

  /** Show `status` in the status line and the updates item. */
  showStatus(status: TatolabStatus): void {
    this.trayStatusLine = trayStatusLine(status);
    this.appUpdateItem = appUpdateTrayMenuItemPresentation(status.app_update);
    this.showTheMenu();
  }

  private showTheMenu(): void {
    const trayMenuItems: TrayMenuItemDescription[] = [
      { kind: "item", id: "tray_status_line", label: this.trayStatusLine, enabled: false },
      { kind: "item", id: "open_tatolab", label: "Open Tato Studio", enabled: true },
      { kind: "separator" },
    ];
    if (this.appUpdateItem !== null) trayMenuItems.push({ kind: "item", id: "check_for_app_updates", ...this.appUpdateItem });
    trayMenuItems.push({ kind: "item", id: "quit_tatolab", label: "Quit Tato Studio", enabled: true });
    this.trayIconHost.showMenu(trayMenuItems);
  }
}
