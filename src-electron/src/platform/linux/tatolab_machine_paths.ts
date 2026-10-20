// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Where this build expects the runtime's pieces on Linux: the local API socket, as StreamLib's
// `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
// `machine_directories_test_root.rs`), and the CLI the installer links into `~/.local/bin`. A
// local-proof build keeps the socket under its test root and reads no link. The machine runtime
// lock is an abstract socket the runtime binds itself, so no path here names it.

import path from "node:path";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../mod.js";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";

/** The folder the runtime keeps inside `$XDG_RUNTIME_DIR`. */
const STREAMLIB_FOLDER_INSIDE_XDG_RUNTIME_DIR = "streamlib";

/** Where the installer links the `tatolab` CLI, relative to `$HOME`. */
const COMMAND_LINE_TOOL_LINK_INSIDE_HOME = ".local/bin/tatolab";

/** Every path this build of the app reads on Linux. */
export interface TatolabMachinePathsOnLinux {
  localApiSocket: string;
  /** Where the installer links the CLI onto the PATH; `null` in a local-proof build, or with no home directory to look in. */
  commandLineToolLink: string | null;
  /** The test root a local-proof build reads under; `null` for a real build. */
  localProofTestMachineRoot: string | null;
}

/** The paths this build uses for the user with `uid`. */
export function tatolabMachinePathsOnLinuxForThisBuild(uid: number): TatolabMachinePathsOnLinux {
  return TATOLAB_APP_BUILD_FEATURES.machineDirectoriesUnderATestRoot
    ? tatolabMachinePathsOnLinuxUnderALocalProofTestRoot(LOCAL_PROOF_TEST_MACHINE_ROOT)
    : tatolabMachinePathsOnLinuxForTheRealMachine(process.env["XDG_RUNTIME_DIR"], process.env["HOME"], uid);
}

/**
 * The real machine's paths for the user with `uid`, given `$XDG_RUNTIME_DIR` and `$HOME`: the socket in
 * `$XDG_RUNTIME_DIR/streamlib/` when that is set and not empty, else in `/tmp/streamlib-<uid>/`.
 */
export function tatolabMachinePathsOnLinuxForTheRealMachine(
  xdgRuntimeDir: string | undefined,
  homeDirectory: string | undefined,
  uid: number,
): TatolabMachinePathsOnLinux {
  const runtimeDirectory =
    xdgRuntimeDir === undefined || xdgRuntimeDir === ""
      ? perUserStreamlibRuntimeDirectoryUnderTmp(uid)
      : path.join(xdgRuntimeDir, STREAMLIB_FOLDER_INSIDE_XDG_RUNTIME_DIR);
  return {
    localApiSocket: path.join(runtimeDirectory, LOCAL_API_SOCKET_FILE_NAME),
    commandLineToolLink:
      homeDirectory !== undefined && path.isAbsolute(homeDirectory) ? path.join(homeDirectory, COMMAND_LINE_TOOL_LINK_INSIDE_HOME) : null,
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them. */
export function tatolabMachinePathsOnLinuxUnderALocalProofTestRoot(testMachineRoot: string): TatolabMachinePathsOnLinux {
  return {
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolLink: null,
    localProofTestMachineRoot: testMachineRoot,
  };
}
