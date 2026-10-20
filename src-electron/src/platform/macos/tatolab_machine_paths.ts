// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Where this build expects the runtime's machine-wide pieces: the machine runtime lock, the local
// API socket, and the PATH link to the bundled CLI. The paths mirror StreamLib's
// `streamlib-runtime-client-contract` (`machine_runtime_lock.rs`,
// `streamlib_runtime_directory.rs`, `machine_directories_test_root.rs`); a local-proof build
// keeps all of them under one test root and never touches `/Library` or `/usr/local/bin`.

import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../mod.js";

/** The root-owned directory the real machine runtime lock sits in. */
export const MACHINE_RUNTIME_LOCK_DIRECTORY_ON_MACOS = "/Library/Application Support/Tatolab";

/** The lock file's name inside its directory. */
export const MACHINE_RUNTIME_LOCK_FILE_NAME = "runtime.lock";

/** Where first launch links the `tatolab` CLI onto the PATH. */
export const COMMAND_LINE_TOOL_LINK_PATH = "/usr/local/bin/tatolab";

/** The CLI's file name beside the app binary in `Contents/MacOS/`. Not `tatolab`: a default APFS volume folds case, so that name would overwrite the app's own `Tatolab`. */
const BUNDLED_COMMAND_LINE_TOOL_FILE_NAME = "tatolab-cli";

/** Who must own the machine runtime lock and its directory: root for the real lock, created behind one administrator prompt; the user running the app for a local-proof lock, created with no prompt. */
export type MachineRuntimeLockOwner = { kind: "root" } | { kind: "this_user"; uid: number };

/** The uid the lock and its directory must be owned by. */
export function machineRuntimeLockOwnerUid(machineRuntimeLockOwner: MachineRuntimeLockOwner): number {
  return machineRuntimeLockOwner.kind === "root" ? 0 : machineRuntimeLockOwner.uid;
}

/** Every machine-wide path this build of the app reads or prepares. */
export interface TatolabMachinePathsOnMacos {
  machineRuntimeLockDirectory: string;
  machineRuntimeLockFile: string;
  machineRuntimeLockOwner: MachineRuntimeLockOwner;
  localApiSocket: string;
  /** Where the CLI is linked onto the PATH; `null` when this build links nothing. */
  commandLineToolLink: string | null;
  /** The test root a local-proof build prepares; `null` for a real build. */
  localProofTestMachineRoot: string | null;
}

/** The paths this build uses for the user with `uid`. */
export function tatolabMachinePathsOnMacosForThisBuild(uid: number): TatolabMachinePathsOnMacos {
  return TATOLAB_APP_BUILD_FEATURES.machineDirectoriesUnderATestRoot
    ? tatolabMachinePathsOnMacosUnderALocalProofTestRoot(LOCAL_PROOF_TEST_MACHINE_ROOT, uid)
    : tatolabMachinePathsOnMacosForTheRealMachine(uid);
}

/** The real machine's paths for the user with `uid`. */
export function tatolabMachinePathsOnMacosForTheRealMachine(uid: number): TatolabMachinePathsOnMacos {
  return {
    machineRuntimeLockDirectory: MACHINE_RUNTIME_LOCK_DIRECTORY_ON_MACOS,
    machineRuntimeLockFile: path.join(MACHINE_RUNTIME_LOCK_DIRECTORY_ON_MACOS, MACHINE_RUNTIME_LOCK_FILE_NAME),
    machineRuntimeLockOwner: { kind: "root" },
    localApiSocket: path.join(perUserStreamlibRuntimeDirectoryUnderTmp(uid), LOCAL_API_SOCKET_FILE_NAME),
    commandLineToolLink: COMMAND_LINE_TOOL_LINK_PATH,
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them. */
export function tatolabMachinePathsOnMacosUnderALocalProofTestRoot(testMachineRoot: string, uid: number): TatolabMachinePathsOnMacos {
  const machineRuntimeLockDirectory = path.join(testMachineRoot, "lock");
  return {
    machineRuntimeLockDirectory,
    machineRuntimeLockFile: path.join(machineRuntimeLockDirectory, MACHINE_RUNTIME_LOCK_FILE_NAME),
    machineRuntimeLockOwner: { kind: "this_user", uid },
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolLink: null,
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
  const appBundle = path.dirname(contentsDirectory);
  return appBundle === contentsDirectory ? null : appBundle;
}

/** `<bundle>/Contents/MacOS/tatolab-cli`. */
export function bundledCommandLineToolIn(appBundle: string): string {
  return path.join(appBundle, "Contents", "MacOS", BUNDLED_COMMAND_LINE_TOOL_FILE_NAME);
}
