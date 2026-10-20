// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import path from "node:path";
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import type { TrayIconHost, TrayIconHostFactory, TrayMenuItemDescription } from "../tatolab_tray_menu.js";

/** Puts the tray icon in the menu bar or panel, its image read from `trayIconDirectory`. */
export function createElectronTrayIconHostFactory(trayIconDirectory: string): TrayIconHostFactory {
  return {
    createTrayIcon(trayIconImage, tooltip, onMenuItemClicked): TrayIconHost {
      // nativeImage picks up the @2x file beside the named one on a Retina menu bar.
      const trayIconNativeImage = nativeImage.createFromPath(path.join(trayIconDirectory, trayIconImage.pngFileName));
      trayIconNativeImage.setTemplateImage(trayIconImage.isATemplate);
      const tray = new Tray(trayIconNativeImage);
      tray.setToolTip(tooltip);
      return {
        showMenu(trayMenuItems: readonly TrayMenuItemDescription[]) {
          const trayMenuTemplate = trayMenuItems.map((trayMenuItem): MenuItemConstructorOptions =>
            trayMenuItem.kind === "separator"
              ? { type: "separator" }
              : {
                  id: trayMenuItem.id,
                  label: trayMenuItem.label,
                  enabled: trayMenuItem.enabled,
                  click: () => onMenuItemClicked(trayMenuItem.id),
                },
          );
          tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate));
        },
      };
    },
  };
}
