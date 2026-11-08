// Linux: the app runs the runtime unit its package carries in its resources as its own child,
// links the CLI beside it at `~/.local/bin/tatolab` (an AppImage's through a copy outside its
// mount), and `x-terminal-emulator` opens a stream's project.

import os from "node:os";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { CommandLineToolLinkInTheHomeFolder, type TatolabCommandLineToolLink } from "../command_line_tool_link_in_the_home_folder.js";
import { commandLineToolCopyOutsideTheAppImage, copyTheCommandLineToolOutOfTheAppImage } from "./command_line_tool_copied_out_of_the_appimage.js";
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
  { appIsPackaged, appExecutable, appResourcesDirectory, homeDirectory }: TatolabPlatformHostServices,
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
  const commandLineToolLink = await commandLineToolLinkForThisPackage(
    carriedCommandLineTool,
    machinePaths.commandLineToolLink,
    appUpdatePackaging.kind === "appimage" ? commandLineToolCopyOutsideTheAppImage(process.env["XDG_DATA_HOME"], homeDirectory) : null,
    tatolabAppLog,
  );
  return {
    carriedRuntime: appIsPackaged
      ? {
          runtimeExecutable: carriedRuntimeExecutableInTheAppResources(appResourcesDirectory),
          runtimeEnvironment:
            machinePaths.localProofTestMachineRoot === null
              ? {}
              : localProofRuntimeEnvironment(machinePaths.localProofTestMachineRoot),
        }
      : null,
    commandLineToolLink,
    localApiSocket: machinePaths.localApiSocket,
    appUpdatePackaging,
    terminalOpenedInAFolder: new XTerminalEmulatorOnThePath(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(carriedCommandLineTool),
    tatolabAppOpenedAtLogin: tatolabAppOpenedAtLoginOnLinux(appUpdatePackaging, appExecutable, process.env["XDG_CONFIG_HOME"], os.homedir(), tatolabAppLog),
  };
}

/** The `tatolab` link for this package: to the carried CLI, or for an AppImage to its copy at `appImageCommandLineToolCopy`, made first. */
async function commandLineToolLinkForThisPackage(
  carriedCommandLineTool: string | null,
  commandLineToolLinkPath: string | null,
  appImageCommandLineToolCopy: string | null,
  tatolabAppLog: TatolabAppLog,
): Promise<TatolabCommandLineToolLink> {
  if (carriedCommandLineTool === null) return CommandLineToolLinkInTheHomeFolder.notOffered(NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL);
  if (commandLineToolLinkPath === null) return CommandLineToolLinkInTheHomeFolder.notOffered(NO_COMMAND_LINE_TOOL_LINK_REFUSAL);
  if (appImageCommandLineToolCopy === null) return CommandLineToolLinkInTheHomeFolder.at(commandLineToolLinkPath, carriedCommandLineTool);
  const copied = await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, appImageCommandLineToolCopy);
  if (!copied.ok) {
    tatolabAppLog.warn("the tatolab command was not copied out of the AppImage", { failure: copied.failure });
    return CommandLineToolLinkInTheHomeFolder.notOffered(copied.failure);
  }
  return CommandLineToolLinkInTheHomeFolder.at(commandLineToolLinkPath, appImageCommandLineToolCopy);
}
