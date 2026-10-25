// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Where this build expects the runtime's pieces on macOS: the local API socket, as StreamLib's
// `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
// `machine_directories_test_root.rs`), and the links that put the bundled CLI on the PATH. The
// machine runtime lock is the loopback port the runtime binds itself, so no path here names it.
// A local-proof build keeps the socket and its one link under its test root and never touches
// `/usr/local/bin` or the person's home folder.

import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../mod.js";

/** Where the app links the `tatolab` CLI with no prompt, relative to the home folder: the folder the Linux installer links it in too. */
export const COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER = ".local/bin/tatolab";

/** Where the app links the `tatolab` CLI behind the administrator prompt, when the person asks: a folder every terminal's PATH holds. */
export const COMMAND_LINE_TOOL_USR_LOCAL_BIN_LINK_PATH = "/usr/local/bin/tatolab";

/** The root-owned directory earlier versions created for the machine runtime lock, which uninstalling removes when it is still there. */
export const EARLIER_MACHINE_RUNTIME_LOCK_DIRECTORY = "/Library/Application Support/Tatolab";

/** The CLI's file name beside the app binary in `Contents/MacOS/`. Not `tatolab`: a default APFS volume folds case, so that name would overwrite the app's own `Tatolab`. */
export const BUNDLED_COMMAND_LINE_TOOL_FILE_NAME = "tatolab-cli";

/** Every path this build of the app reads or links on macOS. */
export interface TatolabMachinePathsOnMacos {
  localApiSocket: string;
  /** `~/.local/bin/tatolab`; `null` with no absolute home folder to link in. */
  commandLineToolHomeFolderLink: string | null;
  /** `/usr/local/bin/tatolab`; `null` in a local-proof build, which never links there. */
  commandLineToolUsrLocalBinLink: string | null;
  /** The directory an earlier version's machine runtime lock sat in; `null` in a local-proof build. */
  earlierMachineRuntimeLockDirectory: string | null;
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
    commandLineToolUsrLocalBinLink: COMMAND_LINE_TOOL_USR_LOCAL_BIN_LINK_PATH,
    earlierMachineRuntimeLockDirectory: EARLIER_MACHINE_RUNTIME_LOCK_DIRECTORY,
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them, with the home-folder link under its `home/`. */
export function tatolabMachinePathsOnMacosUnderALocalProofTestRoot(testMachineRoot: string): TatolabMachinePathsOnMacos {
  return {
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolHomeFolderLink: path.join(testMachineRoot, "home", COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER),
    commandLineToolUsrLocalBinLink: null,
    earlierMachineRuntimeLockDirectory: null,
    localProofTestMachineRoot: testMachineRoot,
  };
}

/** The bundle the app binary at `appExecutable` runs from, when it runs from a bundle's `Contents/MacOS/`, its symlinks resolved. */
export async function appBundleOfTheExecutable(appExecutable: string): Promise<string | null> {
  const resolvedAppExecutable = await realpath(appExecutable).catch(() => null);
  return resolvedAppExecutable === null ? null : appBundleContaining(resolvedAppExecutable);
}

/** The CLI inside the bundle the app binary at `appExecutable` runs from, when that bundle carries one. */
export async function bundledCommandLineToolPath(appExecutable: string): Promise<string | null> {
  const appBundle = await appBundleOfTheExecutable(appExecutable);
  if (appBundle === null) return null;
  const bundledCommandLineTool = bundledCommandLineToolIn(appBundle);
  const bundledCommandLineToolIsAFile = await stat(bundledCommandLineTool).then(
    (bundledCommandLineToolMetadata) => bundledCommandLineToolMetadata.isFile(),
    () => false,
  );
  return bundledCommandLineToolIsAFile ? bundledCommandLineTool : null;
}

/** `<bundle>` for an executable in `<bundle>/Contents/MacOS/`. */
export function appBundleContaining(appExecutable: string): string | null {
  const macosDirectory = path.dirname(appExecutable);
  const contentsDirectory = path.dirname(macosDirectory);
  if (path.basename(macosDirectory) !== "MacOS" || path.basename(contentsDirectory) !== "Contents") return null;
  return path.dirname(contentsDirectory);
}

/** `<bundle>/Contents/MacOS/tatolab-cli`. */
export function bundledCommandLineToolIn(appBundle: string): string {
  return path.join(appBundle, "Contents", "MacOS", BUNDLED_COMMAND_LINE_TOOL_FILE_NAME);
}
