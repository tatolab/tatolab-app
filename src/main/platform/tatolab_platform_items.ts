// Everything that differs by platform: the service manager that runs the runtime, the machine's
// paths, the `tatolab` command's links, uninstalling, and the window's and the tray's platform looks. Each platform
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
import { streamlibCommitFileTheAppCarriesBeside } from "./macos/tatolab_machine_paths.js";
import { LINUX_MAIN_WINDOW_CHROME, setLinuxDockIconVisible } from "./linux/main_window_chrome.js";
import { linuxTatolabPlatformForThisBuild } from "./linux/linux_tatolab_platform_for_this_build.js";
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
  /** This platform's runtime agent, the command's links, local API socket and uninstall, built from the host's services. */
  tatolabPlatformForThisBuild(tatolabAppLog: TatolabAppLog, tatolabPlatformHostServices: TatolabPlatformHostServices): Promise<TatolabPlatformForThisBuild>;
}

/** This build's platform items, or `null` on an OS Tatolab does not run on: it drives the launch agent the installer writes on macOS and the systemd user service it writes on Linux. */
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
        tatolabPlatformForThisBuild: macosTatolabPlatformForThisBuild,
      };
    case "linux":
      return {
        platform: "linux",
        trayIconImage: LINUX_TRAY_ICON_IMAGE,
        mainWindowChrome: LINUX_MAIN_WINDOW_CHROME,
        applicationMenu: "none",
        setDockIconVisible: setLinuxDockIconVisible,
        streamlibCommitFileTheAppCarries: () => null,
        tatolabPlatformForThisBuild: linuxTatolabPlatformForThisBuild,
      };
    default:
      return null;
  }
}
