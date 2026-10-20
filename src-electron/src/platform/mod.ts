// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Everything that differs by platform: the service manager that runs the runtime, the machine's
// paths and setup, uninstalling, and the window's and the tray's platform looks. Each platform
// module exposes the same items, picked here, so the rest of the app never asks which platform it
// runs on; where a platform has nothing to do for one — Linux has no Dock icon — that item says so.

import os from "node:os";
import path from "node:path";
import type { TatolabPlatform } from "../../../src/backend/tatolab_backend_contract.js";
import { MACOS_MAIN_WINDOW_CHROME, MACOS_TRAY_ICON_IMAGE, setMacosDockIconVisible } from "./macos/mod.js";
import { LINUX_MAIN_WINDOW_CHROME, LINUX_TRAY_ICON_IMAGE, setLinuxDockIconVisible } from "./linux/mod.js";
import type { RuntimeAgentRegistration } from "./runtime_agent_registration.js";
import type { TatolabMachineSetup } from "./tatolab_machine_setup.js";
import type { ServiceManagementAgentServices } from "./macos/service_management_agent_services.js";
import type { Result } from "../result.js";
import type { RunTatolabReconciliation } from "../run_tatolab_switch.js";

/** The root a local-proof build keeps every machine directory under, which its runtime reads as `TATOLAB_TEST_MACHINE_ROOT`. */
export const LOCAL_PROOF_TEST_MACHINE_ROOT = "/tmp/tatolab-proof";

/** The local API socket's file name inside the runtime directory, as StreamLib's `streamlib_runtime_directory.rs` names it. */
export const LOCAL_API_SOCKET_FILE_NAME = "local-api.sock";

/** The shared temporary directory the per-user runtime directory sits in. */
const SHARED_TEMPORARY_DIRECTORY = "/tmp";

/** `/tmp/streamlib-<uid>`: the runtime directory on macOS, and on Linux when `$XDG_RUNTIME_DIR` is unset or empty, as StreamLib resolves it. */
export function perUserStreamlibRuntimeDirectoryUnderTmp(uid: number): string {
  return path.join(SHARED_TEMPORARY_DIRECTORY, `streamlib-${uid}`);
}

/** The real uid of this process. */
export function currentProcessUid(): number {
  // Node defines `getuid` on every POSIX platform, the only ones the app runs on.
  return process.getuid?.() ?? os.userInfo().uid;
}

/** `<test_machine_root>/run/local-api.sock`: where a local-proof build's runtime serves its local API, as StreamLib's `machine_directories_test_root.rs` lays it out. */
export function localApiSocketUnderALocalProofTestRoot(testMachineRoot: string): string {
  return path.join(testMachineRoot, "run", LOCAL_API_SOCKET_FILE_NAME);
}

/** What this build's platform hands the app's controller. */
export interface TatolabPlatformForThisBuild {
  runtimeAgent: RuntimeAgentRegistration;
  machineSetup: TatolabMachineSetup;
  localApiSocket: string;
}

/** What a platform takes from Electron to build its items: Service Management's agent services, which only macOS uses, and the app binary's path, by which macOS finds its bundle. */
export interface TatolabPlatformHostServices {
  serviceManagementAgentServices: ServiceManagementAgentServices;
  appExecutable: string;
}

/** The tray's icon as a platform shows it, by its file name in the app's icons directory. */
export interface TrayIconImage {
  pngFileName: string;
  /** Whether the system tints it to the menu bar's appearance, as macOS does a template image. */
  isATemplate: boolean;
}

/** The main window's title bar: macOS's hidden one the window draws under, or the desktop's own. */
export type MainWindowChrome =
  | { titleBarStyle: "hidden"; trafficLightPosition: { x: number; y: number } }
  | { titleBarStyle: "default" };

/** Whether macOS shows the app in the Dock and the app switcher (`regular`) or only in the menu bar (`accessory`). */
export type MacosActivationPolicy = "regular" | "accessory";

/** The app's menu: macOS's menu bar holds the app, File, Edit, View and Window menus as Tauri's does (View with only full screen, and no reload or developer tools); a Linux window shows none. */
export type ApplicationMenu = "macos_menu_bar" | "none";

/** Where the app's Dock presence is set. */
export interface DockIconHost {
  setActivationPolicy(activationPolicy: MacosActivationPolicy): void;
}

/** The platform items the app's lifecycle, window and tray use. */
export interface TatolabPlatformItems {
  platform: TatolabPlatform;
  trayIconImage: TrayIconImage;
  mainWindowChrome: MainWindowChrome;
  applicationMenu: ApplicationMenu;
  setDockIconVisible(dockIconHost: DockIconHost, dockIconVisible: boolean): void;
}

/** This build's platform items, or `null` on an OS Tatolab does not run on: it registers the runtime through Service Management on macOS and drives the installer's systemd user service on Linux. */
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
      };
    case "linux":
      return {
        platform: "linux",
        trayIconImage: LINUX_TRAY_ICON_IMAGE,
        mainWindowChrome: LINUX_MAIN_WINDOW_CHROME,
        applicationMenu: "none",
        setDockIconVisible: setLinuxDockIconVisible,
      };
    default:
      return null;
  }
}

/** The switch uninstalling turns off, which unregisters the runtime's agent and answers how that went. */
export interface RunTatolabSwitchToTurnOff {
  setRunTatolab(runTatolab: boolean): Promise<RunTatolabReconciliation>;
}

/** "Uninstall Tatolab…": on macOS the service and the files go and the app quits; on Linux it is refused, since the installer uninstalls. */
export interface TatolabUninstall {
  /** Uninstall Tatolab, ending with the app quitting; refused with the reason in its own words, leaving the app usable. */
  uninstallTatolab(runTatolabSwitch: RunTatolabSwitchToTurnOff): Promise<Result<void, string>>;
}
