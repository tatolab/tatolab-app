import { Menu } from "electron";
import type { ApplicationMenu } from "../platform/application_menu.js";

/** The Electron menu for `applicationMenu`: macOS's app, File, Edit, View (full screen only) and Window menus, or none. */
export function electronApplicationMenu(applicationMenu: ApplicationMenu): Menu | null {
  switch (applicationMenu) {
    case "macos_menu_bar":
      return Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "fileMenu" },
        { role: "editMenu" },
        { label: "View", submenu: [{ role: "togglefullscreen" }] },
        { role: "windowMenu" },
      ]);
    case "none":
      return null;
  }
}
