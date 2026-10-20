// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import {
  appBundleContaining,
  bundledCommandLineToolIn,
  machineRuntimeLockOwnerUid,
  tatolabMachinePathsOnMacosForTheRealMachine,
  tatolabMachinePathsOnMacosForThisBuild,
  tatolabMachinePathsOnMacosUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_real_machine_paths_match_the_runtimes", () => {
  const machinePaths = tatolabMachinePathsOnMacosForTheRealMachine(501);
  expect(machinePaths.machineRuntimeLockFile).toBe("/Library/Application Support/Tatolab/runtime.lock");
  expect(machineRuntimeLockOwnerUid(machinePaths.machineRuntimeLockOwner)).toBe(0);
  expect(machinePaths.localApiSocket).toBe("/tmp/streamlib-501/local-api.sock");
  expect(machinePaths.commandLineToolLink).toBe("/usr/local/bin/tatolab");
  expect(machinePaths.localProofTestMachineRoot).toBeNull();
});

test("a_local_proof_build_keeps_every_path_under_its_test_root_and_links_nothing", () => {
  const machinePaths = tatolabMachinePathsOnMacosUnderALocalProofTestRoot("/tmp/tatolab-proof", 501);
  expect(machinePaths.machineRuntimeLockDirectory).toBe("/tmp/tatolab-proof/lock");
  expect(machinePaths.machineRuntimeLockFile).toBe("/tmp/tatolab-proof/lock/runtime.lock");
  expect(machinePaths.machineRuntimeLockOwner).toEqual({ kind: "this_user", uid: 501 });
  expect(machinePaths.localApiSocket).toBe("/tmp/tatolab-proof/run/local-api.sock");
  expect(machinePaths.commandLineToolLink).toBeNull();
});

test("the_bundle_and_its_cli_are_found_only_around_an_app_binary_in_contents_macos", () => {
  expect(appBundleContaining("/Applications/Tatolab.app/Contents/MacOS/Tatolab")).toBe("/Applications/Tatolab.app");
  expect(bundledCommandLineToolIn("/Applications/Tatolab.app")).toBe("/Applications/Tatolab.app/Contents/MacOS/tatolab-cli");
  expect(appBundleContaining("/repo/node_modules/electron/dist/electron")).toBeNull();
});

test("a build without the local-proof feature uses the real machine's paths", () => {
  expect(tatolabMachinePathsOnMacosForThisBuild(501)).toEqual(tatolabMachinePathsOnMacosForTheRealMachine(501));
});
