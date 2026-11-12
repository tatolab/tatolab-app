// Everything that differs by platform: where the app carries the runtime and the CLI, the machine's
// paths, the desktop's terminal, and the window's and the tray's platform looks. Each platform
// module exposes the same items, picked here, so the rest of the app never asks which platform it
// runs on; where a platform has nothing to do for one — Linux has no Dock icon — that item says so.

import type { TatolabPlatform } from "../../shared/tatolab_backend_contract.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import type { ApplicationMenu } from "./application_menu.js";
import type { DockIconHost, MainWindowChrome } from "./main_window_chrome.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "./tatolab_platform_for_this_build.js";
import type { TrayIconImage } from "./tray_icon_image.js";
import { MACOS_MAIN_WINDOW_CHROME, setMacosDockIconVisible } from "./macos/main_window_chrome.js";
import { macosTatolabPlatformForThisBuild } from "./macos/macos_tatolab_platform_for_this_build.js";
import { MACOS_TRAY_ICON_IMAGE } from "./macos/tray_icon_image.js";
import { streamlibCommitFileTheAppCarriesBeside, viewerAddonThePackagedAppCarriesInItsFrameworks } from "./macos/tatolab_machine_paths.js";
import { LINUX_MAIN_WINDOW_CHROME, setLinuxDockIconVisible } from "./linux/main_window_chrome.js";
import { linuxTatolabPlatformForThisBuild } from "./linux/linux_tatolab_platform_for_this_build.js";
import { streamlibCommitFileTheAppCarriesInTheResources, viewerAddonThePackagedAppCarriesBesideItsAsar } from "./linux/tatolab_machine_paths.js";
import { LINUX_TRAY_ICON_IMAGE } from "./linux/tray_icon_image.js";

/** The platform items the app's lifecycle, window and tray use. */
export interface TatolabPlatformItems {
  platform: TatolabPlatform;
  trayIconImage: TrayIconImage;
  mainWindowChrome: MainWindowChrome;
  applicationMenu: ApplicationMenu;
  setDockIconVisible(dockIconHost: DockIconHost, dockIconVisible: boolean): void;
  /** The file naming the streamlib commit of the runtime the app carries, found from the app's resources folder; `null` where the app carries none. */
  streamlibCommitFileTheAppCarries(appResourcesDirectory: string): string | null;
  /** The viewer addon a packaged app carries, found from the app's resources folder. */
  viewerAddonThePackagedAppCarries(appResourcesDirectory: string): string;
  /** This platform's carried runtime, the command's link and the local API socket, built from the host's services. */
  tatolabPlatformForThisBuild(tatolabAppLog: TatolabAppLog, tatolabPlatformHostServices: TatolabPlatformHostServices): Promise<TatolabPlatformForThisBuild>;
}

/** This build's platform items, or `null` on an OS Tato Studio does not run on: macOS and Linux only. */
export function tatolabPlatformItemsForThisBuild(): TatolabPlatformItems | null {
  return tatolabPlatformItemsFor(process.platform);
}

/** The platform items for Node's name of an OS, or `null` for one Tatolab does not run on. */
export function tatolabPlatformItemsFor(nodePlatformName: string): TatolabPlatformItems | null {
  switch (nodePlatformName) {
    case "darwin":
      return {
        platform: "macos",
        trayIconImage: MACOS_TRAY_ICON_IMAGE,
        mainWindowChrome: MACOS_MAIN_WINDOW_CHROME,
        applicationMenu: "macos_menu_bar",
        setDockIconVisible: setMacosDockIconVisible,
        streamlibCommitFileTheAppCarries: streamlibCommitFileTheAppCarriesBeside,
        viewerAddonThePackagedAppCarries: viewerAddonThePackagedAppCarriesInItsFrameworks,
        tatolabPlatformForThisBuild: macosTatolabPlatformForThisBuild,
      };
    case "linux":
      return {
        platform: "linux",
        trayIconImage: LINUX_TRAY_ICON_IMAGE,
        mainWindowChrome: LINUX_MAIN_WINDOW_CHROME,
        applicationMenu: "none",
        setDockIconVisible: setLinuxDockIconVisible,
        streamlibCommitFileTheAppCarries: streamlibCommitFileTheAppCarriesInTheResources,
        viewerAddonThePackagedAppCarries: viewerAddonThePackagedAppCarriesBesideItsAsar,
        tatolabPlatformForThisBuild: linuxTatolabPlatformForThisBuild,
      };
    default:
      return null;
  }
}
