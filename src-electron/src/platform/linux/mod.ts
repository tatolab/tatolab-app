// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux: the window and tray over the systemd user service the installer registers. The runtime,
// its service and the CLI come only from the installer, so this app installs nothing and sets
// nothing up; "Run Tatolab" enables and disables the service. The window keeps the desktop's own
// title bar with no menu bar, there is no Dock, and the tray's mark keeps its colours.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid, type DockIconHost, type MainWindowChrome, type TatolabPlatformForThisBuild, type TrayIconImage } from "../mod.js";
import { MachineSetUpByTheInstaller } from "./machine_set_up_by_the_installer.js";
import { RUNTIME_SYSTEMD_USER_UNIT_NAME, SystemctlOnThePath, SystemdUserRuntimeService } from "./systemd_user_runtime_service.js";
import { tatolabMachinePathsOnLinuxForThisBuild } from "./tatolab_machine_paths.js";

/** Why Linux refuses "Uninstall Tatolab…": its installer uninstalls, and the window's sheet shows how. */
export const LINUX_UNINSTALL_TATOLAB_REFUSAL = "On Linux the installer uninstalls Tatolab: Settings › Uninstall Tatolab… shows how.";

/** The Tatolab mark at 64×64 in its own colours, which a panel shows as they are. */
export const LINUX_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-coloured.png", isATemplate: false };

/** The desktop's own title bar and borders, which the window keeps. */
export const LINUX_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "default" };

/** Nothing to show or hide: Linux has no Dock, and the window's own taskbar entry comes and goes with the window. */
export function setLinuxDockIconVisible(_dockIconHost: DockIconHost, _dockIconVisible: boolean): void {}

/** The installer's systemd user unit, and the machine as the installer set it up. */
export function linuxTatolabPlatformForThisBuild(tatolabAppLog: TatolabAppLog): TatolabPlatformForThisBuild {
  const machinePaths = tatolabMachinePathsOnLinuxForThisBuild(currentProcessUid());
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    command_line_tool_link: machinePaths.commandLineToolLink,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
    runtime_systemd_user_unit: RUNTIME_SYSTEMD_USER_UNIT_NAME,
  });
  return {
    runtimeAgent: new SystemdUserRuntimeService(new SystemctlOnThePath(), tatolabAppLog),
    machineSetup: new MachineSetUpByTheInstaller(machinePaths.commandLineToolLink),
    localApiSocket: machinePaths.localApiSocket,
  };
}
