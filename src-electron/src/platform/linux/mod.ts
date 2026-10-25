// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux: the window and tray over the systemd user service the installer registers. The runtime,
// its service and the CLI come only from the installer, so this app installs nothing and sets
// nothing up; "Run Tatolab" enables and disables the service, and `x-terminal-emulator` opens a
// stream's project. The window keeps the desktop's own title bar with no menu bar, there is no
// Dock, and the tray's mark keeps its colours.

import os from "node:os";
import { failedWith } from "../../result.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL, type TatolabAppOpenedAtLogin } from "../tatolab_app_opened_at_login.js";
import { XdgAutostartDesktopEntry, xdgAutostartDirectory } from "./xdg_autostart_desktop_entry.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import {
  currentProcessUid,
  tatolabCommandLineToolAt,
  UNPACKAGED_APP_UPDATE_REFUSAL,
  type DockIconHost,
  type MainWindowChrome,
  type TatolabAppUpdatePackaging,
  type TatolabPlatformForThisBuild,
  type TatolabPlatformHostServices,
  type TatolabUninstall,
  type TrayIconImage,
} from "../mod.js";
import { CommandLineToolLinkedByTheInstaller } from "./command_line_tool_linked_by_the_installer.js";
import { RUNTIME_SYSTEMD_USER_UNIT_NAME, SystemctlOnThePath, SystemdUserRuntimeService } from "./systemd_user_runtime_service.js";
import { tatolabMachinePathsOnLinuxForThisBuild } from "./tatolab_machine_paths.js";
import { XTerminalEmulatorOnThePath } from "./x_terminal_emulator_on_the_path.js";

/** Why Linux refuses "Uninstall Tatolab…": its installer uninstalls, and the window's sheet shows how. */
export const LINUX_UNINSTALL_TATOLAB_REFUSAL = "On Linux the installer uninstalls Tatolab: Settings › Uninstall Tatolab… shows how.";

/** "Uninstall Tatolab…", refused with `LINUX_UNINSTALL_TATOLAB_REFUSAL`: the installer uninstalls what it installed. */
export const LINUX_TATOLAB_UNINSTALL: TatolabUninstall = {
  uninstallTatolab: async () => failedWith(LINUX_UNINSTALL_TATOLAB_REFUSAL),
};

/** The Tatolab mark at 64×64 in its own colours, which a panel shows as they are. */
export const LINUX_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-coloured.png", isATemplate: false };

/** The desktop's own title bar and borders, which the window keeps. */
export const LINUX_MAIN_WINDOW_CHROME: MainWindowChrome = { titleBarStyle: "default" };

/** Nothing to show or hide: Linux has no Dock, and the window's own taskbar entry comes and goes with the window. */
export function setLinuxDockIconVisible(_dockIconHost: DockIconHost, _dockIconVisible: boolean): void {}

/**
 * How a Linux build updates itself: an AppImage, which its runtime names in `APPIMAGE` (`appImagePath`),
 * replaces its own file; a packaged app that is not one came from the `.deb`, which only apt replaces, so
 * it opens the newer version's download.
 */
export function tatolabAppUpdatePackagingOnLinux(appIsPackaged: boolean, appImagePath: string | undefined): TatolabAppUpdatePackaging {
  if (!appIsPackaged) return { kind: "not_offered", reason: UNPACKAGED_APP_UPDATE_REFUSAL };
  if (appImagePath !== undefined && appImagePath !== "") return { kind: "appimage", appImagePath };
  return { kind: "deb" };
}

/** An autostart entry opening the AppImage this build updates as, or the installed app binary; not offered by an unpackaged app. */
export function tatolabAppOpenedAtLoginOnLinux(
  appUpdatePackaging: TatolabAppUpdatePackaging,
  appExecutable: string,
  xdgConfigHome: string | undefined,
  homeDirectory: string,
  tatolabAppLog: TatolabAppLog,
): TatolabAppOpenedAtLogin {
  if (appUpdatePackaging.kind === "not_offered") return tatolabAppNotOpenedAtLogin(UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL);
  const appProgramPath = appUpdatePackaging.kind === "appimage" ? appUpdatePackaging.appImagePath : appExecutable;
  return new XdgAutostartDesktopEntry(xdgAutostartDirectory(xdgConfigHome, homeDirectory), appProgramPath, tatolabAppLog);
}

/** The installer's systemd user unit, the command as the installer linked it, and how this package updates; the installer installs the runtime, so the app restarts none. */
export async function linuxTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { appIsPackaged, appExecutable }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const machinePaths = tatolabMachinePathsOnLinuxForThisBuild(currentProcessUid());
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    command_line_tool_link: machinePaths.commandLineToolLink,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
    runtime_systemd_user_unit: RUNTIME_SYSTEMD_USER_UNIT_NAME,
  });
  const appUpdatePackaging = tatolabAppUpdatePackagingOnLinux(appIsPackaged, process.env["APPIMAGE"]);
  return {
    runtimeAgent: new SystemdUserRuntimeService(new SystemctlOnThePath(), tatolabAppLog),
    commandLineToolLinks: new CommandLineToolLinkedByTheInstaller(machinePaths.commandLineToolLink),
    localApiSocket: machinePaths.localApiSocket,
    tatolabUninstall: LINUX_TATOLAB_UNINSTALL,
    appUpdatePackaging,
    bundledRuntimeRestart: null,
    terminalOpenedInAFolder: new XTerminalEmulatorOnThePath(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(machinePaths.commandLineToolLink),
    tatolabAppOpenedAtLogin: tatolabAppOpenedAtLoginOnLinux(appUpdatePackaging, appExecutable, process.env["XDG_CONFIG_HOME"], os.homedir(), tatolabAppLog),
  };
}
