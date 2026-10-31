// Linux: the window and tray over the systemd user service the installer registers. A package
// carries the runtime unit and streamlib's installer in its resources and runs the installer on it
// whenever the installed build differs; the installer puts the runtime, its service and the CLI in
// place. "Run Tatolab" enables and disables the service, and `x-terminal-emulator` opens a stream's
// project.

import os from "node:os";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { CarriedRuntimeUnitInstalledByStreamlibsInstaller } from "../carried_runtime_unit_installed_by_streamlibs_installer.js";
import { currentProcessUid } from "../current_process_uid.js";
import { runProgramStreamingItsLines } from "../run_program_streaming_its_lines.js";
import { runProgramToCompletion } from "../run_program_to_completion.js";
import { tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { CommandLineToolLinkedByTheInstaller } from "./command_line_tool_linked_by_the_installer.js";
import { RUNTIME_SYSTEMD_USER_UNIT_NAME, SystemctlOnThePath, SystemdUserRuntimeService } from "./systemd_user_runtime_service.js";
import { tatolabAppOpenedAtLoginOnLinux } from "./tatolab_app_opened_at_login_on_linux.js";
import { tatolabAppUpdatePackagingOnLinux } from "./tatolab_app_update_packaging_on_linux.js";
import { carriedRuntimeUnitLayoutInTheAppResources, tatolabMachinePathsOnLinuxForThisBuild } from "./tatolab_machine_paths.js";
import { LINUX_TATOLAB_UNINSTALL } from "./tatolab_uninstall_refused_on_linux.js";
import { XTerminalEmulatorOnThePath } from "./x_terminal_emulator_on_the_path.js";

/** The installer's systemd user unit, the command as the installer linked it, how this package updates, and the runtime unit the package carries. */
export async function linuxTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { appIsPackaged, appExecutable, appResourcesDirectory }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const machinePaths = tatolabMachinePathsOnLinuxForThisBuild(currentProcessUid());
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    command_line_tool_link: machinePaths.commandLineToolLink,
    runtime_install_directory: machinePaths.runtimeInstallDirectory,
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
    // streamlib's install.sh installs only into the person's home folder and their systemd user units,
    // so a local-proof build, which must never touch either, installs nothing.
    carriedRuntimeInstall:
      !appIsPackaged || machinePaths.runtimeInstallDirectory === null
        ? null
        : new CarriedRuntimeUnitInstalledByStreamlibsInstaller(
            carriedRuntimeUnitLayoutInTheAppResources(appResourcesDirectory, machinePaths.runtimeInstallDirectory),
            {},
            runProgramToCompletion,
            runProgramStreamingItsLines,
          ),
    terminalOpenedInAFolder: new XTerminalEmulatorOnThePath(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(machinePaths.commandLineToolLink),
    tatolabAppOpenedAtLogin: tatolabAppOpenedAtLoginOnLinux(appUpdatePackaging, appExecutable, process.env["XDG_CONFIG_HOME"], os.homedir(), tatolabAppLog),
  };
}
