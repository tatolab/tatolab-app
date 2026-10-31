// macOS: streamlib's installer installs the runtime helper the app carries and writes its launch
// agent, which the app loads and unloads through `launchctl`; the app links the installed CLI in
// `/usr/local/bin` behind the administrator prompt when asked, "Uninstall Tatolab…" removes it all,
// and Terminal.app opens a stream's project.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { CarriedRuntimeUnitInstalledByStreamlibsInstaller } from "../carried_runtime_unit_installed_by_streamlibs_installer.js";
import { currentProcessUid } from "../current_process_uid.js";
import { runProgramStreamingItsLines } from "../run_program_streaming_its_lines.js";
import { runProgramToCompletion } from "../run_program_to_completion.js";
import { TATOLAB_APP_IDENTIFIER } from "../tatolab_app_identifier.js";
import { tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL } from "../tatolab_app_opened_at_login.js";
import { OSASCRIPT_AT_ITS_SYSTEM_PATH, OsascriptAdministratorPrompt } from "./administrator_prompt.js";
import { CommandLineToolLinksOnThisMac } from "./command_line_tool_links_on_this_mac.js";
import { LAUNCHCTL_AT_ITS_SYSTEM_PATH, LaunchctlRuntimeLaunchAgent, OPEN_RUN_AT_ITS_SYSTEM_PATH } from "./launchctl_runtime_launch_agent.js";
import {
  appBundleOfTheExecutable,
  carriedRuntimeUnitLayoutOfTheAppBundle,
  installedCommandLineToolIn,
  tatolabMachinePathsOnMacosForThisBuild,
} from "./tatolab_machine_paths.js";
import { TerminalAppOpenedByOpen } from "./terminal_app_opened_by_open.js";
import { TatolabUninstallOnThisMac } from "./tatolab_uninstall_on_this_mac.js";
import { LoginItemOfTheAppBundle } from "./login_item_of_the_app_bundle.js";
import { tatolabAppUpdatePackagingOnMacos } from "./tatolab_app_update_packaging_on_macos.js";

/** The installer's launch agent through `launchctl`, the install of the runtime helper a packaged app carries, the links of the installed CLI, and uninstalling them. */
export async function macosTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { homeDirectory, appExecutable, appIsPackaged, appConfigDirectory, tatolabUninstallAppSurface, appLoginItemSettings }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const uid = currentProcessUid();
  const machinePaths = tatolabMachinePathsOnMacosForThisBuild(uid, homeDirectory);
  const installedCommandLineTool = installedCommandLineToolIn(machinePaths.runtimeInstallDirectory);
  const packagedAppBundle = appIsPackaged ? await appBundleOfTheExecutable(appExecutable) : null;
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    runtime_install_directory: machinePaths.runtimeInstallDirectory,
    runtime_launch_agent: machinePaths.runtimeLaunchAgent.plistPath,
    installed_command_line_tool: installedCommandLineTool,
    carried_runtime_in: packagedAppBundle,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
  });
  const administratorPrompt = new OsascriptAdministratorPrompt(OSASCRIPT_AT_ITS_SYSTEM_PATH);
  return {
    runtimeAgent: new LaunchctlRuntimeLaunchAgent(uid, machinePaths.runtimeLaunchAgent, LAUNCHCTL_AT_ITS_SYSTEM_PATH, OPEN_RUN_AT_ITS_SYSTEM_PATH),
    commandLineToolLinks: new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, tatolabAppLog),
    localApiSocket: machinePaths.localApiSocket,
    tatolabUninstall: new TatolabUninstallOnThisMac(
      machinePaths,
      appIsPackaged ? appExecutable : null,
      appConfigDirectory,
      TATOLAB_APP_IDENTIFIER,
      administratorPrompt,
      runProgramToCompletion,
      tatolabUninstallAppSurface,
      tatolabAppLog,
    ),
    appUpdatePackaging: tatolabAppUpdatePackagingOnMacos(appIsPackaged),
    // streamlib's install.sh installs only into the person's home folder and their launch agents, so a
    // local-proof build, which must never touch either, installs nothing.
    carriedRuntimeInstall:
      packagedAppBundle === null || machinePaths.localProofTestMachineRoot !== null
        ? null
        : new CarriedRuntimeUnitInstalledByStreamlibsInstaller(
            carriedRuntimeUnitLayoutOfTheAppBundle(packagedAppBundle, machinePaths.runtimeInstallDirectory),
            machinePaths.runtimeInstallerEnvironment,
            runProgramToCompletion,
            runProgramStreamingItsLines,
          ),
    terminalOpenedInAFolder: new TerminalAppOpenedByOpen(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(installedCommandLineTool),
    tatolabAppOpenedAtLogin: appIsPackaged
      ? new LoginItemOfTheAppBundle(appLoginItemSettings)
      : tatolabAppNotOpenedAtLogin(UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL),
  };
}
