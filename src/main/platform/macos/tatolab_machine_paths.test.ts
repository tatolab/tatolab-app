import { expect, test } from "vitest";
import {
  appBundleContaining,
  carriedRuntimeInstallerIn,
  carriedRuntimeUnitIn,
  carriedRuntimeUnitLayoutOfTheAppBundle,
  installedCommandLineToolIn,
  isABundledCommandLineToolPath,
  runtimeExecutableInARuntimeUnit,
  streamlibCommitFileTheAppCarriesBeside,
  tatolabMachinePathsOnMacosForTheRealMachine,
  tatolabMachinePathsOnMacosForThisBuild,
  tatolabMachinePathsOnMacosUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_real_machine_paths_match_the_runtimes_and_the_installers", () => {
  const machinePaths = tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone");
  expect(machinePaths).toEqual({
    localApiSocket: "/tmp/streamlib-501/local-api.sock",
    commandLineToolHomeFolderLink: "/Users/someone/.local/bin/tatolab",
    runtimeInstallDirectory: "/Users/someone/Library/Application Support/com.tatolab.runtime",
    runtimeLaunchAgent: {
      label: "com.tatolab.tatolabd",
      plistPath: "/Users/someone/Library/LaunchAgents/com.tatolab.tatolabd.plist",
    },
    runtimeInstallerEnvironment: {},
    commandLineToolUsrLocalBinLink: "/usr/local/bin/tatolab",
    localProofTestMachineRoot: null,
  });
});

test("a_home_folder_that_is_not_absolute_gets_no_home_folder_link", () => {
  expect(tatolabMachinePathsOnMacosForTheRealMachine(501, "").commandLineToolHomeFolderLink).toBeNull();
});

test("a_local_proof_build_keeps_every_path_under_its_test_root_with_its_own_label_and_never_links_in_usr_local_bin", () => {
  expect(tatolabMachinePathsOnMacosUnderALocalProofTestRoot("/tmp/tatolab-proof")).toEqual({
    localApiSocket: "/tmp/tatolab-proof/run/local-api.sock",
    commandLineToolHomeFolderLink: "/tmp/tatolab-proof/home/.local/bin/tatolab",
    runtimeInstallDirectory: "/tmp/tatolab-proof/runtime-install",
    runtimeLaunchAgent: {
      label: "com.tatolab.tatolabd.local-proof",
      plistPath: "/tmp/tatolab-proof/launch-agent/com.tatolab.tatolabd.local-proof.plist",
    },
    runtimeInstallerEnvironment: {
      TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof",
      TATOLAB_TEST_LOCAL_RELAY_LOOPBACK_PORT: "14443",
      TATOLAB_TEST_LOCAL_RELAY_EVERY_INTERFACE_PORT: "14445",
      TATOLAB_TEST_LOOPBACK_HTTP_PORT: "14446",
    },
    commandLineToolUsrLocalBinLink: null,
    localProofTestMachineRoot: "/tmp/tatolab-proof",
  });
});

test("the_bundle_is_found_only_around_an_app_binary_in_contents_macos", () => {
  expect(appBundleContaining("/Applications/Tatolab.app/Contents/MacOS/Tatolab")).toBe("/Applications/Tatolab.app");
  expect(appBundleContaining("/repo/node_modules/electron/dist/electron")).toBeNull();
});

test("the_carried_runtime_unit_installer_and_commit_sit_where_the_bundle_assembly_puts_them", () => {
  expect(carriedRuntimeUnitIn("/Applications/Tatolab.app")).toBe("/Applications/Tatolab.app/Contents/Helpers");
  expect(carriedRuntimeInstallerIn("/Applications/Tatolab.app")).toBe("/Applications/Tatolab.app/Contents/Resources/install.sh");
  expect(runtimeExecutableInARuntimeUnit("/Applications/Tatolab.app/Contents/Helpers")).toBe(
    "/Applications/Tatolab.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd",
  );
  expect(streamlibCommitFileTheAppCarriesBeside("/Applications/Tatolab.app/Contents/Resources")).toBe(
    "/Applications/Tatolab.app/Contents/Helpers/Tatolab Runtime.app/Contents/Resources/streamlib-commit",
  );
  expect(carriedRuntimeUnitLayoutOfTheAppBundle("/Applications/Tatolab.app", "/Users/someone/Library/Application Support/com.tatolab.runtime")).toEqual({
    carriedInstaller: "/Applications/Tatolab.app/Contents/Resources/install.sh",
    carriedRuntimeUnit: "/Applications/Tatolab.app/Contents/Helpers",
    carriedRuntimeExecutable: "/Applications/Tatolab.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd",
    carriedStreamlibCommitFile: "/Applications/Tatolab.app/Contents/Helpers/Tatolab Runtime.app/Contents/Resources/streamlib-commit",
    runtimeInstallDirectory: "/Users/someone/Library/Application Support/com.tatolab.runtime",
  });
});

test("the_installed_cli_is_reached_through_current_and_reads_as_a_bundled_cli", () => {
  const installedCommandLineTool = installedCommandLineToolIn("/Users/someone/Library/Application Support/com.tatolab.runtime");
  expect(installedCommandLineTool).toBe(
    "/Users/someone/Library/Application Support/com.tatolab.runtime/current/Tatolab Runtime.app/Contents/MacOS/tatolab-cli",
  );
  expect(isABundledCommandLineToolPath(installedCommandLineTool)).toBe(true);
  expect(isABundledCommandLineToolPath("/Applications/Tatolab.app/Contents/MacOS/tatolab-cli")).toBe(true);
  expect(isABundledCommandLineToolPath("/opt/homebrew/bin/tatolab")).toBe(false);
});

test("a build without the local-proof feature uses the real machine's paths", () => {
  expect(tatolabMachinePathsOnMacosForThisBuild(501, "/Users/someone")).toEqual(tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone"));
});
