// Where this build expects the runtime's pieces on macOS: the local API socket, as StreamLib's
// `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
// `machine_directories_test_root.rs`); the folder, launch agent and links streamlib's `install.sh`
// installs the runtime with; and the runtime helper the app's bundle carries for it to install.
// A local-proof build keeps all of it under its test root and never touches `/usr/local/bin`, the
// person's home folder or their launch agents.

import { realpath } from "node:fs/promises";
import path from "node:path";
import { LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT } from "../../runtime_loopback_watch_page.js";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";
import type { RuntimeLaunchAgentOnThisMac } from "./launchctl_runtime_launch_agent.js";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../tatolab_machine_paths.js";

/** Where the installer links the `tatolab` CLI, relative to the home folder. */
const COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER = ".local/bin/tatolab";

/** Where the installer installs each runtime build, relative to the home folder, as `install.sh` names it on macOS. */
const RUNTIME_INSTALL_DIRECTORY_INSIDE_THE_HOME_FOLDER = "Library/Application Support/com.tatolab.runtime";

/** Where a local-proof installer installs each runtime build, under its test root. */
const RUNTIME_INSTALL_DIRECTORY_UNDER_A_TEST_ROOT = "runtime-install";

/** The runtime's launch agent label, as `install.sh` writes it. */
const RUNTIME_LAUNCH_AGENT_LABEL = "com.tatolab.tatolabd";

/** A local-proof runtime's launch agent label, which never collides with the machine's. */
const LOCAL_PROOF_RUNTIME_LAUNCH_AGENT_LABEL = "com.tatolab.tatolabd.local-proof";

/** The test ports a local-proof runtime's local relays bind, without which a test-root runtime runs none. */
const LOCAL_PROOF_LOCAL_RELAY_LOOPBACK_PORT = 14443;
const LOCAL_PROOF_LOCAL_RELAY_EVERY_INTERFACE_PORT = 14445;

/** The link `install.sh` points at the build it runs, inside its install directory. */
const CURRENT_RUNTIME_BUILD_LINK_NAME = "current";

/** The runtime helper bundle, as the app carries it in `Contents/Helpers/` and the installer installs it in each build. */
export const RUNTIME_HELPER_BUNDLE_NAME = "Tatolab Runtime.app";

/** The streamlib commit file inside the runtime helper's `Contents/Resources/`. */
const STREAMLIB_COMMIT_FILE_NAME = "streamlib-commit";

/** Where the app links the `tatolab` CLI behind the administrator prompt, when the person asks: a folder every terminal's PATH holds. */
const COMMAND_LINE_TOOL_USR_LOCAL_BIN_LINK_PATH = "/usr/local/bin/tatolab";

/** The CLI's file name in a bundle's `Contents/MacOS/`. Not `tatolab`: a default APFS volume folds case, so that name would overwrite a `Tatolab` beside it. */
const BUNDLED_COMMAND_LINE_TOOL_FILE_NAME = "tatolab-cli";

/** Where a bundle keeps its CLI, from the bundle's own folder. */
const BUNDLED_COMMAND_LINE_TOOL_INSIDE_THE_BUNDLE = path.join("Contents", "MacOS", BUNDLED_COMMAND_LINE_TOOL_FILE_NAME);

/** Every path this build of the app reads or links on macOS. */
export interface TatolabMachinePathsOnMacos {
  localApiSocket: string;
  /** `~/.local/bin/tatolab`, which the installer links; `null` with no absolute home folder. */
  commandLineToolHomeFolderLink: string | null;
  /** The folder the installer keeps each runtime build in, with `current` naming the one running. */
  runtimeInstallDirectory: string;
  /** The launch agent the installer writes. */
  runtimeLaunchAgent: RuntimeLaunchAgentOnThisMac;
  /** What the installer is run with beyond the app's own environment, which its launch agent hands the runtime. */
  runtimeInstallerEnvironment: Readonly<Record<string, string>>;
  /** `/usr/local/bin/tatolab`; `null` in a local-proof build, which never links there. */
  commandLineToolUsrLocalBinLink: string | null;
  /** The test root a local-proof build keeps everything under; `null` for a real build. */
  localProofTestMachineRoot: string | null;
}

/** The paths this build uses for the user with `uid`, whose home folder is `homeDirectory`. */
export function tatolabMachinePathsOnMacosForThisBuild(uid: number, homeDirectory: string): TatolabMachinePathsOnMacos {
  return TATOLAB_APP_BUILD_FEATURES.machineDirectoriesUnderATestRoot
    ? tatolabMachinePathsOnMacosUnderALocalProofTestRoot(LOCAL_PROOF_TEST_MACHINE_ROOT)
    : tatolabMachinePathsOnMacosForTheRealMachine(uid, homeDirectory);
}

/** The real machine's paths for the user with `uid`, whose home folder is `homeDirectory`. */
export function tatolabMachinePathsOnMacosForTheRealMachine(uid: number, homeDirectory: string): TatolabMachinePathsOnMacos {
  return {
    localApiSocket: path.join(perUserStreamlibRuntimeDirectoryUnderTmp(uid), LOCAL_API_SOCKET_FILE_NAME),
    commandLineToolHomeFolderLink: path.isAbsolute(homeDirectory) ? path.join(homeDirectory, COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER) : null,
    runtimeInstallDirectory: path.join(homeDirectory, RUNTIME_INSTALL_DIRECTORY_INSIDE_THE_HOME_FOLDER),
    runtimeLaunchAgent: {
      label: RUNTIME_LAUNCH_AGENT_LABEL,
      plistPath: path.join(homeDirectory, "Library", "LaunchAgents", `${RUNTIME_LAUNCH_AGENT_LABEL}.plist`),
    },
    runtimeInstallerEnvironment: {},
    commandLineToolUsrLocalBinLink: COMMAND_LINE_TOOL_USR_LOCAL_BIN_LINK_PATH,
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them, with the home-folder link under its `home/`. */
export function tatolabMachinePathsOnMacosUnderALocalProofTestRoot(testMachineRoot: string): TatolabMachinePathsOnMacos {
  return {
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolHomeFolderLink: path.join(testMachineRoot, "home", COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER),
    runtimeInstallDirectory: path.join(testMachineRoot, RUNTIME_INSTALL_DIRECTORY_UNDER_A_TEST_ROOT),
    runtimeLaunchAgent: {
      label: LOCAL_PROOF_RUNTIME_LAUNCH_AGENT_LABEL,
      plistPath: path.join(testMachineRoot, "launch-agent", `${LOCAL_PROOF_RUNTIME_LAUNCH_AGENT_LABEL}.plist`),
    },
    runtimeInstallerEnvironment: {
      TATOLAB_TEST_MACHINE_ROOT: testMachineRoot,
      TATOLAB_TEST_LOCAL_RELAY_LOOPBACK_PORT: String(LOCAL_PROOF_LOCAL_RELAY_LOOPBACK_PORT),
      TATOLAB_TEST_LOCAL_RELAY_EVERY_INTERFACE_PORT: String(LOCAL_PROOF_LOCAL_RELAY_EVERY_INTERFACE_PORT),
      TATOLAB_TEST_LOOPBACK_HTTP_PORT: String(LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT),
    },
    commandLineToolUsrLocalBinLink: null,
    localProofTestMachineRoot: testMachineRoot,
  };
}

/** The bundle the app binary at `appExecutable` runs from, when it runs from a bundle's `Contents/MacOS/`, its symlinks resolved. */
export async function appBundleOfTheExecutable(appExecutable: string): Promise<string | null> {
  const resolvedAppExecutable = await realpath(appExecutable).catch(() => null);
  return resolvedAppExecutable === null ? null : appBundleContaining(resolvedAppExecutable);
}

/** `<bundle>` for an executable in `<bundle>/Contents/MacOS/`. */
export function appBundleContaining(appExecutable: string): string | null {
  const macosDirectory = path.dirname(appExecutable);
  const contentsDirectory = path.dirname(macosDirectory);
  if (path.basename(macosDirectory) !== "MacOS" || path.basename(contentsDirectory) !== "Contents") return null;
  return path.dirname(contentsDirectory);
}

/** `<bundle>/Contents/Helpers`: the runtime unit the app carries, as `install.sh --from-unit` takes it. */
export function carriedRuntimeUnitIn(appBundle: string): string {
  return path.join(appBundle, "Contents", "Helpers");
}

/** `<bundle>/Contents/Resources/install.sh`: streamlib's installer, as the app carries it. */
export function carriedRuntimeInstallerIn(appBundle: string): string {
  return path.join(appBundle, "Contents", "Resources", "install.sh");
}

/** `tatolabd` inside the runtime helper in `runtimeUnitDirectory`, which names its version. */
export function runtimeExecutableInARuntimeUnit(runtimeUnitDirectory: string): string {
  return path.join(runtimeUnitDirectory, RUNTIME_HELPER_BUNDLE_NAME, "Contents", "MacOS", "tatolabd");
}

/** The streamlib commit file inside the runtime helper in `runtimeUnitDirectory`. */
export function streamlibCommitFileInARuntimeUnit(runtimeUnitDirectory: string): string {
  return path.join(runtimeUnitDirectory, RUNTIME_HELPER_BUNDLE_NAME, "Contents", "Resources", STREAMLIB_COMMIT_FILE_NAME);
}

/** The streamlib commit file of the runtime the app carries, found from the app's `Contents/Resources/`. */
export function streamlibCommitFileTheAppCarriesBeside(appResourcesDirectory: string): string {
  return streamlibCommitFileInARuntimeUnit(path.join(path.dirname(appResourcesDirectory), "Helpers"));
}

/** `<install directory>/current`, the link the installer points at the build it runs. */
export function currentRuntimeBuildLinkIn(runtimeInstallDirectory: string): string {
  return path.join(runtimeInstallDirectory, CURRENT_RUNTIME_BUILD_LINK_NAME);
}

/** The `tatolab` CLI of the build the installer runs, through its `current` link. */
export function installedCommandLineToolIn(runtimeInstallDirectory: string): string {
  return path.join(currentRuntimeBuildLinkIn(runtimeInstallDirectory), RUNTIME_HELPER_BUNDLE_NAME, BUNDLED_COMMAND_LINE_TOOL_INSIDE_THE_BUNDLE);
}

/** Whether `linkTarget` names the CLI inside some bundle, `<bundle>/Contents/MacOS/tatolab-cli`: the installed helper's, or an older app's own. */
export function isABundledCommandLineToolPath(linkTarget: string): boolean {
  return linkTarget.endsWith(`${path.sep}${BUNDLED_COMMAND_LINE_TOOL_INSIDE_THE_BUNDLE}`);
}
