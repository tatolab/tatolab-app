// Linux: the app runs the runtime unit its package carries in its resources as its own child,
// links the CLI beside it at `~/.local/bin/tatolab`, and `x-terminal-emulator` opens a stream's
// project.

import os from "node:os";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT } from "../../runtime_loopback_watch_page.js";
import { CommandLineToolLinkInTheHomeFolder } from "../command_line_tool_link_in_the_home_folder.js";
import { currentProcessUid } from "../current_process_uid.js";
import { NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL, tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import { localProofRuntimeEnvironment } from "../tatolab_machine_paths.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { tatolabAppOpenedAtLoginOnLinux } from "./tatolab_app_opened_at_login_on_linux.js";
import { tatolabAppUpdatePackagingOnLinux } from "./tatolab_app_update_packaging_on_linux.js";
import {
  carriedCommandLineToolInTheAppResources,
  carriedRuntimeExecutableInTheAppResources,
  tatolabMachinePathsOnLinuxForThisBuild,
} from "./tatolab_machine_paths.js";
import { XTerminalEmulatorOnThePath } from "./x_terminal_emulator_on_the_path.js";

/** Why a local-proof build, or one with no home directory, links no `tatolab`. */
const NO_COMMAND_LINE_TOOL_LINK_REFUSAL = "This build of Tato Studio links tatolab nowhere.";

/** The runtime unit a package carries, run as the app's child, the CLI beside it linked in the home folder, and how this package updates. */
export async function linuxTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { appIsPackaged, appExecutable, appResourcesDirectory }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const machinePaths = tatolabMachinePathsOnLinuxForThisBuild(currentProcessUid());
  const carriedCommandLineTool = appIsPackaged ? carriedCommandLineToolInTheAppResources(appResourcesDirectory) : null;
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    carried_runtime_in: appIsPackaged ? appResourcesDirectory : null,
    command_line_tool_link: machinePaths.commandLineToolLink,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
  });
  const appUpdatePackaging = tatolabAppUpdatePackagingOnLinux(appIsPackaged, process.env["APPIMAGE"]);
  return {
    carriedRuntime: appIsPackaged
      ? {
          runtimeExecutable: carriedRuntimeExecutableInTheAppResources(appResourcesDirectory),
          runtimeEnvironment:
            machinePaths.localProofTestMachineRoot === null
              ? {}
              : localProofRuntimeEnvironment(machinePaths.localProofTestMachineRoot, LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT),
        }
      : null,
    commandLineToolLink:
      carriedCommandLineTool === null
        ? CommandLineToolLinkInTheHomeFolder.notOffered(NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL)
        : machinePaths.commandLineToolLink === null
          ? CommandLineToolLinkInTheHomeFolder.notOffered(NO_COMMAND_LINE_TOOL_LINK_REFUSAL)
          : CommandLineToolLinkInTheHomeFolder.at(machinePaths.commandLineToolLink, carriedCommandLineTool),
    localApiSocket: machinePaths.localApiSocket,
    appUpdatePackaging,
    terminalOpenedInAFolder: new XTerminalEmulatorOnThePath(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(carriedCommandLineTool),
    tatolabAppOpenedAtLogin: tatolabAppOpenedAtLoginOnLinux(appUpdatePackaging, appExecutable, process.env["XDG_CONFIG_HOME"], os.homedir(), tatolabAppLog),
  };
}
