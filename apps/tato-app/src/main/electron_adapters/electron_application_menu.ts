import { Menu, type MenuItemConstructorOptions } from "electron";
import type { SystemMenuBarEntry, SystemMenuBarItems, SystemMenuBarMenu, SystemMenuOfTheDesktop } from "../../shared/tatolab_backend_contract.js";
import type { ApplicationMenu } from "../platform/application_menu.js";
import { electronAcceleratorOfTheShortcutHint } from "../system_menu_bar_of_the_focused_window.js";

/** The bar a window that sent no menus gets: macOS's app, File, Edit, View (full screen only) and Window menus. */
const DEFAULT_MACOS_MENU_BAR: MenuItemConstructorOptions[] = [
  { role: "appMenu" },
  { role: "fileMenu" },
  { role: "editMenu" },
  { label: "View", submenu: [{ role: "togglefullscreen" }] },
  { role: "windowMenu" },
];

function electronMenuItemsOfTheSystemItems(systemItems: SystemMenuBarItems): MenuItemConstructorOptions[] {
  switch (systemItems) {
    case "app_services_hide_and_quit":
      return [{ role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }];
    case "text_editing":
      return [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ];
    case "close_window":
      // Stream › Close tab takes ⌘W, so closing the window moves to ⇧⌘W.
      return [{ role: "close", accelerator: "Shift+Command+W" }];
    case "window_arrangement":
      return [{ role: "minimize" }, { role: "zoom" }];
    case "bring_all_to_front":
      return [{ role: "front" }];
    case "full_screen":
      return [{ role: "togglefullscreen" }];
  }
}

function acceleratorOf(shortcutHint: string | null): Pick<MenuItemConstructorOptions, "accelerator"> {
  const accelerator = shortcutHint === null ? null : electronAcceleratorOfTheShortcutHint(shortcutHint);
  return accelerator === null ? {} : { accelerator };
}

function electronMenuItemsOf(entries: readonly SystemMenuBarEntry[], whenAnEntryIsChosen: (entryId: string) => void): MenuItemConstructorOptions[] {
  return entries.flatMap((entry): MenuItemConstructorOptions[] => {
    switch (entry.kind) {
      case "separator":
        return [{ type: "separator" }];
      case "system_items":
        return electronMenuItemsOfTheSystemItems(entry.system_items);
      case "submenu":
        return [{ label: entry.label, submenu: electronMenuItemsOf(entry.entries, whenAnEntryIsChosen) }];
      case "choice":
        return [
          {
            type: "radio",
            label: entry.label,
            checked: entry.is_chosen,
            ...acceleratorOf(entry.shortcut_hint),
            click: () => whenAnEntryIsChosen(entry.entry_id),
          },
        ];
      case "command":
        // macOS menus show no tooltip, so a dim entry's reason is said only in the window's own menus.
        return [
          {
            label: entry.label,
            enabled: entry.unavailable_because === null,
            ...acceleratorOf(entry.shortcut_hint),
            click: () => whenAnEntryIsChosen(entry.entry_id),
          },
        ];
    }
  });
}

/** The role that makes a menu the desktop's own: macOS lists the open windows in the Window menu and puts its search field in the Help menu. */
function roleOfTheDesktopMenu(systemMenu: SystemMenuOfTheDesktop | null): Pick<MenuItemConstructorOptions, "role"> {
  if (systemMenu === "window") return { role: "window" };
  if (systemMenu === "help") return { role: "help" };
  return {};
}

/** The Electron menu for `applicationMenu`: on macOS the focused window's menus, or the default bar while it sent none; none on Linux. */
export function electronApplicationMenu(
  applicationMenu: ApplicationMenu,
  menusOfTheFocusedWindow: readonly SystemMenuBarMenu[] | null,
  whenAnEntryIsChosen: (entryId: string) => void,
): Menu | null {
  switch (applicationMenu) {
    case "macos_menu_bar":
      if (menusOfTheFocusedWindow === null) return Menu.buildFromTemplate(DEFAULT_MACOS_MENU_BAR);
      return Menu.buildFromTemplate(
        menusOfTheFocusedWindow.map((menu) => ({
          label: menu.label,
          ...roleOfTheDesktopMenu(menu.system_menu),
          submenu: electronMenuItemsOf(menu.entries, whenAnEntryIsChosen),
        })),
      );
    case "none":
      return null;
  }
}
