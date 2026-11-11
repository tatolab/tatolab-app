// macOS's one menu bar shows the menus of the window in focus: a studio window sends its menus
// whenever they change, and the bar shows them while that window is focused, sending each choice
// back to it. A window that sent none, such as a popped-out view, gets the app's default bar.
// Linux has no system menu bar; each window draws its own menus, so this keeps nothing there.

import type { SystemMenuBarEntry, SystemMenuBarItems, SystemMenuBarMenu, SystemMenuOfTheDesktop } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import type { ApplicationMenu } from "./platform/application_menu.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** What the system menu bar is shown through, and how a choice reaches the window that sent its menus. */
export interface SystemMenuBarOfTheFocusedWindowSources {
  applicationMenu: ApplicationMenu;
  /** Show `menusOfTheFocusedWindow` in the system menu bar, or the app's default bar for `null`; `whenAnEntryIsChosen` hears each entry the person chooses. */
  setTheApplicationMenu(applicationMenu: ApplicationMenu, menusOfTheFocusedWindow: readonly SystemMenuBarMenu[] | null, whenAnEntryIsChosen: (entryId: string) => void): void;
  sendTheWindowTheChosenEntry(windowContentsId: number, entryId: string): void;
}

/** The system menu bar, showing the menus of the window in focus. */
export class SystemMenuBarOfTheFocusedWindow {
  private readonly menusByWindowContentsId = new Map<number, readonly SystemMenuBarMenu[]>();
  private focusedWindowContentsId: number | null = null;
  private menusLastShownAsJson: string | null = null;

  constructor(private readonly sources: SystemMenuBarOfTheFocusedWindowSources) {}

  /** Show the app's default bar, as the app starts. */
  showTheDefaultMenuBar(): void {
    this.menusLastShownAsJson = null;
    this.sources.setTheApplicationMenu(this.sources.applicationMenu, null, () => {});
  }

  /** Keep `menus` as the window's, showing them now when that window is in focus. */
  keepTheMenusOfTheWindow(windowContentsId: number, menus: readonly SystemMenuBarMenu[]): void {
    if (this.sources.applicationMenu === "none") return;
    this.menusByWindowContentsId.set(windowContentsId, menus);
    if (windowContentsId === this.focusedWindowContentsId) this.showTheFocusedWindowsMenus();
  }

  /** The window came into focus: show its menus, or the default bar when it sent none. */
  noticeTheWindowFocused(windowContentsId: number): void {
    if (this.sources.applicationMenu === "none") return;
    this.focusedWindowContentsId = windowContentsId;
    this.showTheFocusedWindowsMenus();
  }

  /** The window closed: forget its menus, and show the default bar when it was in focus. */
  forgetTheWindow(windowContentsId: number): void {
    if (this.sources.applicationMenu === "none") return;
    this.menusByWindowContentsId.delete(windowContentsId);
    if (windowContentsId !== this.focusedWindowContentsId) return;
    this.focusedWindowContentsId = null;
    this.showTheFocusedWindowsMenus();
  }

  private showTheFocusedWindowsMenus(): void {
    const windowContentsId = this.focusedWindowContentsId;
    const menus = windowContentsId === null ? null : (this.menusByWindowContentsId.get(windowContentsId) ?? null);
    // Setting the bar again closes a menu the person has open, so menus that did not change are left as they are.
    const menusAsJson = JSON.stringify({ windowContentsId, menus });
    if (menusAsJson === this.menusLastShownAsJson) return;
    this.menusLastShownAsJson = menusAsJson;
    this.sources.setTheApplicationMenu(this.sources.applicationMenu, menus, (entryId) => {
      if (windowContentsId !== null && menus !== null) this.sources.sendTheWindowTheChosenEntry(windowContentsId, entryId);
    });
  }
}

const SYSTEM_MENU_BAR_ITEMS: readonly SystemMenuBarItems[] = ["app_services_hide_and_quit", "text_editing", "close_window", "close_window_beside_close_tab", "window_arrangement", "bring_all_to_front", "full_screen"];
const SYSTEM_MENUS_OF_THE_DESKTOP: readonly SystemMenuOfTheDesktop[] = ["app", "window", "help"];

function textOrNullFrom(onTheWire: unknown): Result<string | null, null> {
  if (onTheWire === null) return succeeded(null);
  return typeof onTheWire === "string" ? succeeded(onTheWire) : failedWith(null);
}

function systemMenuBarEntryFrom(onTheWire: unknown): SystemMenuBarEntry | null {
  if (!isAJsonObject(onTheWire)) return null;
  const { kind, entry_id, label } = onTheWire;
  switch (kind) {
    case "separator":
      return { kind: "separator" };
    case "system_items": {
      const systemItems = SYSTEM_MENU_BAR_ITEMS.find((items) => items === onTheWire["system_items"]);
      return systemItems === undefined ? null : { kind: "system_items", system_items: systemItems };
    }
    case "submenu": {
      const entries = systemMenuBarEntriesFrom(onTheWire["entries"]);
      return typeof label === "string" && entries !== null ? { kind: "submenu", label, entries } : null;
    }
    case "command": {
      const shortcutHint = textOrNullFrom(onTheWire["shortcut_hint"]);
      const unavailableBecause = textOrNullFrom(onTheWire["unavailable_because"]);
      if (typeof entry_id !== "string" || typeof label !== "string" || !shortcutHint.ok || !unavailableBecause.ok) return null;
      return { kind: "command", entry_id, label, shortcut_hint: shortcutHint.value, unavailable_because: unavailableBecause.value };
    }
    case "choice": {
      const shortcutHint = textOrNullFrom(onTheWire["shortcut_hint"]);
      const isChosen = onTheWire["is_chosen"];
      if (typeof entry_id !== "string" || typeof label !== "string" || !shortcutHint.ok || typeof isChosen !== "boolean") return null;
      return { kind: "choice", entry_id, label, shortcut_hint: shortcutHint.value, is_chosen: isChosen };
    }
    default:
      return null;
  }
}

function systemMenuBarEntriesFrom(onTheWire: unknown): SystemMenuBarEntry[] | null {
  if (!Array.isArray(onTheWire)) return null;
  const entries: SystemMenuBarEntry[] = [];
  for (const entryOnTheWire of onTheWire) {
    const entry = systemMenuBarEntryFrom(entryOnTheWire);
    if (entry === null) return null;
    entries.push(entry);
  }
  return entries;
}

function systemMenuBarMenuFrom(onTheWire: unknown): SystemMenuBarMenu | null {
  if (!isAJsonObject(onTheWire)) return null;
  const { label, system_menu } = onTheWire;
  const entries = systemMenuBarEntriesFrom(onTheWire["entries"]);
  const systemMenu = system_menu === null ? null : SYSTEM_MENUS_OF_THE_DESKTOP.find((desktopMenu) => desktopMenu === system_menu);
  if (typeof label !== "string" || entries === null || systemMenu === undefined) return null;
  return { label, system_menu: systemMenu, entries };
}

/** `show_menus_in_the_system_menu_bar`'s `{ menus }` as the window sends them, or why they are not in the contract's shape. */
export function systemMenuBarMenusFrom(commandArguments: unknown): Result<SystemMenuBarMenu[], string> {
  const menusOnTheWire = isAJsonObject(commandArguments) ? commandArguments["menus"] : undefined;
  const refusal = "show_menus_in_the_system_menu_bar needs `menus`, the window's menus in the system menu bar's shape";
  if (!Array.isArray(menusOnTheWire)) return failedWith(refusal);
  const menus: SystemMenuBarMenu[] = [];
  for (const menuOnTheWire of menusOnTheWire) {
    const menu = systemMenuBarMenuFrom(menuOnTheWire);
    if (menu === null) return failedWith(refusal);
    menus.push(menu);
  }
  return succeeded(menus);
}

/** The key cap a window shows as Electron's accelerator, which the system menu bar draws beside the entry: `⌘O` is `Command+O`, `Shift F5` is `Shift+F5`; `null` for a key cap it cannot read. */
export function electronAcceleratorOfTheShortcutHint(shortcutHint: string): string | null {
  const keyWithCommand = /^⌘(.)$/u.exec(shortcutHint);
  if (keyWithCommand !== null) return `Command+${keyWithCommand[1]?.toUpperCase() ?? ""}`;
  const keyWithShiftAndCommand = /^⇧⌘(.)$/u.exec(shortcutHint);
  if (keyWithShiftAndCommand !== null) return `Shift+Command+${keyWithShiftAndCommand[1]?.toUpperCase() ?? ""}`;
  const keyWithControl = /^⌃(⇧?)(\S+)$/u.exec(shortcutHint);
  if (keyWithControl !== null) return `Control+${keyWithControl[1] === "⇧" ? "Shift+" : ""}${keyWithControl[2] ?? ""}`;
  const keyWithShift = /^Shift (\S+)$/u.exec(shortcutHint);
  if (keyWithShift !== null) return `Shift+${keyWithShift[1]?.toUpperCase() ?? ""}`;
  if (/^F\d{1,2}$/u.test(shortcutHint)) return shortcutHint;
  return null;
}
