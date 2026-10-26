import path from "node:path";
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { TrayIconHost, TrayIconHostFactory, TrayMenuItemDescription } from "../tatolab_tray_menu.js";

/** Puts the tray icon in the menu bar or panel, its image read from `trayIconDirectory`. */
export function createElectronTrayIconHostFactory(trayIconDirectory: string): TrayIconHostFactory {
  return {
    createTrayIcon(trayIconImage, tooltip, onMenuItemClicked): TrayIconHost & { tray: Tray } {
      // nativeImage picks up the @2x file beside the named one on a Retina menu bar.
      const trayIconNativeImage = nativeImage.createFromPath(path.join(trayIconDirectory, trayIconImage.pngFileName));
      trayIconNativeImage.setTemplateImage(trayIconImage.isATemplate);
      const tray = new Tray(trayIconNativeImage);
      tray.setToolTip(tooltip);
      return {
        tray,
        showMenu(trayMenuItems: readonly TrayMenuItemDescription[]) {
          const trayMenuTemplate = trayMenuItems.map((trayMenuItem): MenuItemConstructorOptions => {
            switch (trayMenuItem.kind) {
              case "separator":
                return { type: "separator" };
              case "item":
                return { id: trayMenuItem.id, label: trayMenuItem.label, enabled: trayMenuItem.enabled, click: () => onMenuItemClicked(trayMenuItem.id) };
              case "check_item":
                return {
                  type: "checkbox",
                  id: trayMenuItem.id,
                  label: trayMenuItem.label,
                  enabled: trayMenuItem.enabled,
                  checked: trayMenuItem.checked,
                  click: () => onMenuItemClicked(trayMenuItem.id),
                };
            }
          });
          this.tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate));
        },
      };
    },
  };
}
