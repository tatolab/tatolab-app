// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// macOS: Service Management registers the runtime's launch agent, first-launch setup creates the
// machine runtime lock and the CLI's PATH link behind one administrator prompt, the window draws
// under a hidden title bar with the Dock icon following it, and the tray's mark is a template
// image.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid, type TatolabPlatformForThisBuild, type TrayIconImage } from "../mod.js";
import { OSASCRIPT_AT_ITS_SYSTEM_PATH, OsascriptAdministratorPrompt } from "./administrator_prompt.js";
import { MachineSetupBehindAnAdministratorPrompt } from "./machine_setup.js";
import {
  LAUNCHCTL_AT_ITS_SYSTEM_PATH,
  ServiceManagementRuntimeLaunchAgent,
  type ServiceManagementAgentServices,
} from "./service_management_runtime_launch_agent.js";
import { bundledCommandLineToolPath, tatolabMachinePathsOnMacosForThisBuild } from "./tatolab_machine_paths.js";

export { MACOS_MAIN_WINDOW_CHROME, setMacosDockIconVisible } from "./main_window_chrome.js";

/** The tray's mark, shown at 18pt in the menu bar from its @2x file and tinted to it as a template image. */
export const MACOS_TRAY_ICON_IMAGE: TrayIconImage = { pngFileName: "tray-template.png", isATemplate: true };

/** The bundle's launch agent through `serviceManagementAgentServices`, and the machine setup this build's paths need for the app binary at `appExecutable`. */
export async function macosTatolabPlatformForThisBuild(
  tatolabAppLog: TatolabAppLog,
  serviceManagementAgentServices: ServiceManagementAgentServices,
  appExecutable: string,
): Promise<TatolabPlatformForThisBuild> {
  const uid = currentProcessUid();
  const machinePaths = tatolabMachinePathsOnMacosForThisBuild(uid);
  const bundledCommandLineTool = await bundledCommandLineToolPath(appExecutable);
  tatolabAppLog.info("Tatolab app paths", {
    local_api_socket: machinePaths.localApiSocket,
    machine_runtime_lock: machinePaths.machineRuntimeLockFile,
    bundled_command_line_tool: bundledCommandLineTool,
    local_proof_test_machine_root: machinePaths.localProofTestMachineRoot,
  });
  return {
    runtimeAgent: ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(uid, serviceManagementAgentServices, LAUNCHCTL_AT_ITS_SYSTEM_PATH),
    machineSetup: MachineSetupBehindAnAdministratorPrompt.create(
      machinePaths,
      bundledCommandLineTool,
      new OsascriptAdministratorPrompt(OSASCRIPT_AT_ITS_SYSTEM_PATH),
      tatolabAppLog,
    ),
    localApiSocket: machinePaths.localApiSocket,
  };
}
