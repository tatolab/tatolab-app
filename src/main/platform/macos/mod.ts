// macOS: Service Management registers the runtime's launch agent, the app links the CLI in the
// home folder with no prompt and in `/usr/local/bin` behind the administrator prompt when asked,
// "Uninstall Tatolab…" removes them, Terminal.app opens a stream's project, the window draws
// under a hidden title bar with the Dock icon following it, and the tray's mark is a template
// image.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import {
  currentProcessUid,
  tatolabCommandLineToolAt,
  TATOLAB_APP_IDENTIFIER,
  UNPACKAGED_APP_UPDATE_REFUSAL,
  type TatolabAppUpdatePackaging,
  type TatolabPlatformForThisBuild,
  type TatolabPlatformHostServices,
  type TrayIconImage,
} from "../mod.js";
import { OSASCRIPT_AT_ITS_SYSTEM_PATH, OsascriptAdministratorPrompt } from "./administrator_prompt.js";
import { CommandLineToolLinksOnThisMac } from "./command_line_tool_links_on_this_mac.js";
import { loadServiceManagementAddon, serviceManagementAddonBuiltUnder, serviceManagementAddonInTheAppBundle } from "./service_management_addon.js";
import { LAUNCHCTL_AT_ITS_SYSTEM_PATH, ServiceManagementRuntimeLaunchAgent } from "./service_management_runtime_launch_agent.js";
import { appBundleContaining, bundledCommandLineToolPath, tatolabMachinePathsOnMacosForThisBuild } from "./tatolab_machine_paths.js";
import { TerminalAppOpenedByOpen } from "./terminal_app_opened_by_open.js";
import { TatolabUninstallOnThisMac } from "./tatolab_uninstall.js";
import { LoginItemOfTheAppBundle } from "./login_item_of_the_app_bundle.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL } from "../tatolab_app_opened_at_login.js";

export { MACOS_MAIN_WINDOW_CHROME, setMacosDockIconVisible } from "./main_window_chrome.js";

/** The tray's mark, shown at 18pt in the menu bar from its @2x file and tinted to it as a template image. */
export const MACOS_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-template.png", isATemplate: true };

/** Squirrel.Mac replaces a packaged app's bundle from a signed `.zip`; an unpackaged app runs from Electron's bundle, which it never replaces. */
export function tatolabAppUpdatePackagingOnMacos(appIsPackaged: boolean): TatolabAppUpdatePackaging {
  return appIsPackaged ? { kind: "squirrel_mac_zip" } : { kind: "not_offered", reason: UNPACKAGED_APP_UPDATE_REFUSAL };
}

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
