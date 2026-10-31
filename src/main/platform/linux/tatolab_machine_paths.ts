// Where this build expects the runtime's pieces on Linux: the local API socket, as StreamLib's
// `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
// `machine_directories_test_root.rs`); the folder and the CLI link streamlib's `install.sh`
// installs the runtime with; and the runtime unit the package carries in its resources for it to
// install. A local-proof build keeps the socket under its test root, reads no link and installs
// nothing. The machine runtime lock is an abstract socket the runtime binds itself, so no path here
// names it.

import path from "node:path";
import type { CarriedRuntimeUnitLayout } from "../carried_runtime_unit_installed_by_streamlibs_installer.js";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  LOCAL_PROOF_TEST_MACHINE_ROOT,
  localApiSocketUnderALocalProofTestRoot,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "../tatolab_machine_paths.js";
import { TATOLAB_APP_BUILD_FEATURES } from "../../tatolab_app_build_features.js";

/** The folder the runtime keeps inside `$XDG_RUNTIME_DIR`. */
const STREAMLIB_FOLDER_INSIDE_XDG_RUNTIME_DIR = "streamlib";

/** Where the installer links the `tatolab` CLI, relative to `$HOME`. */
const COMMAND_LINE_TOOL_LINK_INSIDE_HOME = ".local/bin/tatolab";

/** Where the installer installs each runtime build, relative to `$HOME`, as `install.sh` names it on Linux. */
const RUNTIME_INSTALL_DIRECTORY_INSIDE_HOME = ".local/share/tatolab";

/** The runtime unit the package carries in its resources: the release tarball's `bin/`, `lib/` and `streamlib-commit`. */
const CARRIED_RUNTIME_UNIT_FOLDER_NAME = "tatolab-runtime";

/** Streamlib's installer, as the package carries it in its resources. */
const CARRIED_INSTALLER_FILE_NAME = "install.sh";

/** Every path this build of the app reads on Linux. */
export interface TatolabMachinePathsOnLinux {
  localApiSocket: string;
  /** Where the installer links the CLI onto the PATH; `null` in a local-proof build, or with no home directory to look in. */
  commandLineToolLink: string | null;
  /** Where the installer keeps each runtime build; `null` in a local-proof build, which installs none, or with no home directory. */
  runtimeInstallDirectory: string | null;
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
  const absoluteHomeDirectory = homeDirectory !== undefined && path.isAbsolute(homeDirectory) ? homeDirectory : null;
  return {
    localApiSocket: path.join(runtimeDirectory, LOCAL_API_SOCKET_FILE_NAME),
    commandLineToolLink: absoluteHomeDirectory === null ? null : path.join(absoluteHomeDirectory, COMMAND_LINE_TOOL_LINK_INSIDE_HOME),
    runtimeInstallDirectory: absoluteHomeDirectory === null ? null : path.join(absoluteHomeDirectory, RUNTIME_INSTALL_DIRECTORY_INSIDE_HOME),
    localProofTestMachineRoot: null,
  };
}

/** The paths under `testMachineRoot`, laid out as StreamLib's test-root build lays them. */
export function tatolabMachinePathsOnLinuxUnderALocalProofTestRoot(testMachineRoot: string): TatolabMachinePathsOnLinux {
  return {
    localApiSocket: localApiSocketUnderALocalProofTestRoot(testMachineRoot),
    commandLineToolLink: null,
    runtimeInstallDirectory: null,
    localProofTestMachineRoot: testMachineRoot,
  };
}

/** The runtime unit the package carries in `appResourcesDirectory` and the installer beside it, installed into `runtimeInstallDirectory`. */
export function carriedRuntimeUnitLayoutInTheAppResources(appResourcesDirectory: string, runtimeInstallDirectory: string): CarriedRuntimeUnitLayout {
  const carriedRuntimeUnit = path.join(appResourcesDirectory, CARRIED_RUNTIME_UNIT_FOLDER_NAME);
  return {
    carriedInstaller: path.join(appResourcesDirectory, CARRIED_INSTALLER_FILE_NAME),
    carriedRuntimeUnit,
    carriedRuntimeExecutable: path.join(carriedRuntimeUnit, "bin", "tatolabd"),
    carriedStreamlibCommitFile: streamlibCommitFileTheAppCarriesInTheResources(appResourcesDirectory),
    runtimeInstallDirectory,
  };
}

/** The streamlib commit file of the runtime unit the package carries in `appResourcesDirectory`. */
export function streamlibCommitFileTheAppCarriesInTheResources(appResourcesDirectory: string): string {
  return path.join(appResourcesDirectory, CARRIED_RUNTIME_UNIT_FOLDER_NAME, "streamlib-commit");
}
