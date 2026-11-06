// Where this build expects the runtime's pieces on macOS: the local API socket, as StreamLib's
// `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
// `machine_directories_test_root.rs`); the runtime helper and CLI the app's bundle carries; and
// the `tatolab` link in the home folder. A local-proof build keeps the socket and the link under
// its test root and never touches the person's home folder.

import { realpath } from "node:fs/promises";
import path from "node:path";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";
import { COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER } from "../command_line_tool_link_in_the_home_folder.js";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../tatolab_machine_paths.js";

/** The runtime helper bundle, as the app carries it in `Contents/Helpers/`. */
export const RUNTIME_HELPER_BUNDLE_NAME = "Tatolab Runtime.app";

/** The streamlib commit file inside the runtime helper's `Contents/Resources/`. */
const STREAMLIB_COMMIT_FILE_NAME = "streamlib-commit";

/** The CLI's file name in the helper's `Contents/MacOS/`. Not `tatolab`: a default APFS volume folds case, so that name would overwrite a `Tatolab` beside it. */
const BUNDLED_COMMAND_LINE_TOOL_FILE_NAME = "tatolab-cli";

/** Every path this build of the app reads or links on macOS. */
export interface TatolabMachinePathsOnMacos {
  localApiSocket: string;
  /** `~/.local/bin/tatolab`; `null` with no absolute home folder. */
  commandLineToolHomeFolderLink: string | null;
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
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them, with the home-folder link under its `home/`. */
export function tatolabMachinePathsOnMacosUnderALocalProofTestRoot(testMachineRoot: string): TatolabMachinePathsOnMacos {
  return {
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolHomeFolderLink: path.join(testMachineRoot, "home", COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER),
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

/** `<bundle>/Contents/Helpers/Tatolab Runtime.app`: the runtime helper the app carries. */
export function runtimeHelperBundleIn(appBundle: string): string {
  return path.join(appBundle, "Contents", "Helpers", RUNTIME_HELPER_BUNDLE_NAME);
}

/** `tatolabd` inside the runtime helper `appBundle` carries. */
export function carriedRuntimeExecutableIn(appBundle: string): string {
  return path.join(runtimeHelperBundleIn(appBundle), "Contents", "MacOS", "tatolabd");
}

/** The `tatolab` CLI inside the runtime helper `appBundle` carries. */
export function carriedCommandLineToolIn(appBundle: string): string {
  return path.join(runtimeHelperBundleIn(appBundle), "Contents", "MacOS", BUNDLED_COMMAND_LINE_TOOL_FILE_NAME);
}

/** The streamlib commit file of the runtime the app carries, found from the app's `Contents/Resources/`. */
export function streamlibCommitFileTheAppCarriesBeside(appResourcesDirectory: string): string {
  return path.join(path.dirname(appResourcesDirectory), "Helpers", RUNTIME_HELPER_BUNDLE_NAME, "Contents", "Resources", STREAMLIB_COMMIT_FILE_NAME);
}
