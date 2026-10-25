// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import {
  appBundleContaining,
  bundledCommandLineToolIn,
  tatolabMachinePathsOnMacosForTheRealMachine,
  tatolabMachinePathsOnMacosForThisBuild,
  tatolabMachinePathsOnMacosUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_real_machine_paths_match_the_runtimes_and_link_in_the_home_folder", () => {
  const machinePaths = tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone");
  expect(machinePaths).toEqual({
    localApiSocket: "/tmp/streamlib-501/local-api.sock",
    commandLineToolHomeFolderLink: "/Users/someone/.local/bin/tatolab",
    commandLineToolUsrLocalBinLink: "/usr/local/bin/tatolab",
    localProofTestMachineRoot: null,
  });
});

test("a_home_folder_that_is_not_absolute_gets_no_home_folder_link", () => {
  expect(tatolabMachinePathsOnMacosForTheRealMachine(501, "").commandLineToolHomeFolderLink).toBeNull();
});

test("a_local_proof_build_keeps_every_path_under_its_test_root_and_never_links_in_usr_local_bin", () => {
  expect(tatolabMachinePathsOnMacosUnderALocalProofTestRoot("/tmp/tatolab-proof")).toEqual({
    localApiSocket: "/tmp/tatolab-proof/run/local-api.sock",
    commandLineToolHomeFolderLink: "/tmp/tatolab-proof/home/.local/bin/tatolab",
    commandLineToolUsrLocalBinLink: null,
    localProofTestMachineRoot: "/tmp/tatolab-proof",
  });
});

test("the_bundle_and_its_cli_are_found_only_around_an_app_binary_in_contents_macos", () => {
  expect(appBundleContaining("/Applications/Tatolab.app/Contents/MacOS/Tatolab")).toBe("/Applications/Tatolab.app");
  expect(bundledCommandLineToolIn("/Applications/Tatolab.app")).toBe("/Applications/Tatolab.app/Contents/MacOS/tatolab-cli");
  expect(appBundleContaining("/repo/node_modules/electron/dist/electron")).toBeNull();
});

test("a build without the local-proof feature uses the real machine's paths", () => {
  expect(tatolabMachinePathsOnMacosForThisBuild(501, "/Users/someone")).toEqual(tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone"));
});
