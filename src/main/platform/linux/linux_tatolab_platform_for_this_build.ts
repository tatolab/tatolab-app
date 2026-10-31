// Linux: the window and tray over the systemd user service the installer registers. The runtime,
// its service and the CLI come only from the installer, so this app installs none of them; "Run
// Tatolab" enables and disables the service, and `x-terminal-emulator` opens a stream's project.

import os from "node:os";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid } from "../current_process_uid.js";
import { tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { CommandLineToolLinkedByTheInstaller } from "./command_line_tool_linked_by_the_installer.js";
import { RUNTIME_SYSTEMD_USER_UNIT_NAME, SystemctlOnThePath, SystemdUserRuntimeService } from "./systemd_user_runtime_service.js";
import { tatolabAppOpenedAtLoginOnLinux } from "./tatolab_app_opened_at_login_on_linux.js";
import { tatolabAppUpdatePackagingOnLinux } from "./tatolab_app_update_packaging_on_linux.js";
import { tatolabMachinePathsOnLinuxForThisBuild } from "./tatolab_machine_paths.js";
import { LINUX_TATOLAB_UNINSTALL } from "./tatolab_uninstall_refused_on_linux.js";
import { XTerminalEmulatorOnThePath } from "./x_terminal_emulator_on_the_path.js";

/** The installer's systemd user unit, the command as the installer linked it, and how this package updates; the installer installs the runtime, and the app carries none to install. */
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
    carriedRuntimeInstall: null,
    terminalOpenedInAFolder: new XTerminalEmulatorOnThePath(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(machinePaths.commandLineToolLink),
    tatolabAppOpenedAtLogin: tatolabAppOpenedAtLoginOnLinux(appUpdatePackaging, appExecutable, process.env["XDG_CONFIG_HOME"], os.homedir(), tatolabAppLog),
  };
}
