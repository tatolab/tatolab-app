// macOS: the app runs the runtime helper its bundle carries as its own child, links the CLI beside
// it at `~/.local/bin/tatolab`, and opens a stream's project in Terminal.app.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT } from "../../runtime_loopback_watch_page.js";
import { CommandLineToolLinkInTheHomeFolder } from "../command_line_tool_link_in_the_home_folder.js";
import { currentProcessUid } from "../current_process_uid.js";
import { NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL, tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import { localProofRuntimeEnvironment } from "../tatolab_machine_paths.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL } from "../tatolab_app_opened_at_login.js";
import { appBundleOfTheExecutable, carriedCommandLineToolIn, carriedRuntimeExecutableIn, tatolabMachinePathsOnMacosForThisBuild } from "./tatolab_machine_paths.js";
import { TerminalAppOpenedByOpen } from "./terminal_app_opened_by_open.js";
import { LoginItemOfTheAppBundle } from "./login_item_of_the_app_bundle.js";
import { tatolabAppUpdatePackagingOnMacos } from "./tatolab_app_update_packaging_on_macos.js";

/** Why there is no `tatolab` link with no absolute home folder to make it in. */
const NO_HOME_FOLDER_LINK_REFUSAL = "Tato Studio found no home folder to link tatolab in.";

/** The runtime helper a packaged app's bundle carries, run as the app's child, and the CLI beside it linked in the home folder. */
export async function macosTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { homeDirectory, appExecutable, appIsPackaged, appLoginItemSettings }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const machinePaths = tatolabMachinePathsOnMacosForThisBuild(currentProcessUid(), homeDirectory);
  const packagedAppBundle = appIsPackaged ? await appBundleOfTheExecutable(appExecutable) : null;
  const carriedCommandLineTool = packagedAppBundle === null ? null : carriedCommandLineToolIn(packagedAppBundle);
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    carried_runtime_in: packagedAppBundle,
    command_line_tool_link: machinePaths.commandLineToolHomeFolderLink,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
  });
  return {
    carriedRuntime:
      packagedAppBundle === null
        ? null
        : {
            runtimeExecutable: carriedRuntimeExecutableIn(packagedAppBundle),
            runtimeEnvironment:
              machinePaths.localProofTestMachineRoot === null
                ? {}
                : localProofRuntimeEnvironment(machinePaths.localProofTestMachineRoot, LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT),
          },
    commandLineToolLink:
      carriedCommandLineTool === null
        ? CommandLineToolLinkInTheHomeFolder.notOffered(NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL)
        : machinePaths.commandLineToolHomeFolderLink === null
          ? CommandLineToolLinkInTheHomeFolder.notOffered(NO_HOME_FOLDER_LINK_REFUSAL)
          : CommandLineToolLinkInTheHomeFolder.at(machinePaths.commandLineToolHomeFolderLink, carriedCommandLineTool),
    localApiSocket: machinePaths.localApiSocket,
    appUpdatePackaging: tatolabAppUpdatePackagingOnMacos(appIsPackaged),
    terminalOpenedInAFolder: new TerminalAppOpenedByOpen(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(carriedCommandLineTool),
    tatolabAppOpenedAtLogin: appIsPackaged
      ? new LoginItemOfTheAppBundle(appLoginItemSettings)
      : tatolabAppNotOpenedAtLogin(UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL),
  };
}
