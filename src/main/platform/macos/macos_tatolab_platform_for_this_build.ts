// macOS: Service Management registers the runtime's launch agent, the app links the CLI in the
// home folder with no prompt and in `/usr/local/bin` behind the administrator prompt when asked,
// "Uninstall Tatolab…" removes them, and Terminal.app opens a stream's project.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid } from "../local_api_socket_paths.js";
import { TATOLAB_APP_IDENTIFIER } from "../tatolab_app_identifier.js";
import { tatolabCommandLineToolAt } from "../tatolab_command_line_tool.js";
import type { TatolabPlatformForThisBuild, TatolabPlatformHostServices } from "../tatolab_platform_for_this_build.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL } from "../tatolab_app_opened_at_login.js";
import { OSASCRIPT_AT_ITS_SYSTEM_PATH, OsascriptAdministratorPrompt } from "./administrator_prompt.js";
import { CommandLineToolLinksOnThisMac } from "./command_line_tool_links_on_this_mac.js";
import { loadServiceManagementAddon, serviceManagementAddonBuiltUnder, serviceManagementAddonInTheAppBundle } from "./service_management_addon.js";
import { LAUNCHCTL_AT_ITS_SYSTEM_PATH, ServiceManagementRuntimeLaunchAgent } from "./service_management_runtime_launch_agent.js";
import { appBundleContaining, bundledCommandLineToolPath, tatolabMachinePathsOnMacosForThisBuild } from "./tatolab_machine_paths.js";
import { TerminalAppOpenedByOpen } from "./terminal_app_opened_by_open.js";
import { TatolabUninstallOnThisMac } from "./tatolab_uninstall_on_this_mac.js";
import { LoginItemOfTheAppBundle } from "./login_item_of_the_app_bundle.js";
import { tatolabAppUpdatePackagingOnMacos } from "./tatolab_app_update_packaging_on_macos.js";

/** The bundle's launch agent through the Service Management addon, the links of the CLI in the bundle the app binary runs from, and uninstalling them. */
export async function macosTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  { homeDirectory, appPath, appExecutable, appIsPackaged, appConfigDirectory, tatolabUninstallAppSurface, appLoginItemSettings }: TatolabPlatformHostServices,
): Promise<TatolabPlatformForThisBuild> {
  const uid = currentProcessUid();
  const machinePaths = tatolabMachinePathsOnMacosForThisBuild(uid, homeDirectory);
  const bundledCommandLineTool = await bundledCommandLineToolPath(appExecutable);
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    command_line_tool_home_folder_link: machinePaths.commandLineToolHomeFolderLink,
    bundled_command_line_tool: bundledCommandLineTool,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
  });
  const administratorPrompt = new OsascriptAdministratorPrompt(OSASCRIPT_AT_ITS_SYSTEM_PATH);
  const packagedAppBundle = appIsPackaged ? appBundleContaining(appExecutable) : null;
  const serviceManagementAddonPath = packagedAppBundle === null ? serviceManagementAddonBuiltUnder(appPath) : serviceManagementAddonInTheAppBundle(packagedAppBundle);
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
    uid,
    loadServiceManagementAddon(serviceManagementAddonPath, tatolabAppLog),
    LAUNCHCTL_AT_ITS_SYSTEM_PATH,
  );
  return {
    runtimeAgent: runtimeLaunchAgent,
    commandLineToolLinks: new CommandLineToolLinksOnThisMac(machinePaths, bundledCommandLineTool, administratorPrompt, tatolabAppLog),
    localApiSocket: machinePaths.localApiSocket,
    tatolabUninstall: new TatolabUninstallOnThisMac(
      machinePaths,
      appIsPackaged ? appExecutable : null,
      appConfigDirectory,
      TATOLAB_APP_IDENTIFIER,
      administratorPrompt,
      tatolabUninstallAppSurface,
      tatolabAppLog,
    ),
    appUpdatePackaging: tatolabAppUpdatePackagingOnMacos(appIsPackaged),
    bundledRuntimeRestart: runtimeLaunchAgent,
    terminalOpenedInAFolder: new TerminalAppOpenedByOpen(),
    tatolabCommandLineTool: tatolabCommandLineToolAt(bundledCommandLineTool),
    tatolabAppOpenedAtLogin: appIsPackaged
      ? new LoginItemOfTheAppBundle(appLoginItemSettings)
      : tatolabAppNotOpenedAtLogin(UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL),
  };
}
