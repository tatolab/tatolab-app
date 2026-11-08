import { expect, test } from "vitest";
import {
  appBundleContaining,
  carriedCommandLineToolIn,
  carriedRuntimeExecutableIn,
  runtimeHelperBundleIn,
  streamlibCommitFileTheAppCarriesBeside,
  viewerAddonThePackagedAppCarriesInItsFrameworks,
  tatolabMachinePathsOnMacosForTheRealMachine,
  tatolabMachinePathsOnMacosForThisBuild,
  tatolabMachinePathsOnMacosUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_real_machine_paths_are_the_runtimes_socket_and_the_home_folder_link", () => {
  expect(tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone")).toEqual({
    localApiSocket: "/tmp/streamlib-501/local-api.sock",
    commandLineToolHomeFolderLink: "/Users/someone/.local/bin/tatolab",
    localProofTestMachineRoot: null,
  });
});

test("a_home_folder_that_is_not_absolute_gets_no_home_folder_link", () => {
  expect(tatolabMachinePathsOnMacosForTheRealMachine(501, "").commandLineToolHomeFolderLink).toBeNull();
});

test("a_local_proof_build_keeps_the_socket_and_the_link_under_its_test_root", () => {
  expect(tatolabMachinePathsOnMacosUnderALocalProofTestRoot("/tmp/tatolab-proof")).toEqual({
    localApiSocket: "/tmp/tatolab-proof/run/local-api.sock",
    commandLineToolHomeFolderLink: "/tmp/tatolab-proof/home/.local/bin/tatolab",
    localProofTestMachineRoot: "/tmp/tatolab-proof",
  });
});

test("the_bundle_is_found_only_around_an_app_binary_in_contents_macos", () => {
  expect(appBundleContaining("/Applications/Tato Studio.app/Contents/MacOS/Tato Studio")).toBe("/Applications/Tato Studio.app");
  expect(appBundleContaining("/repo/node_modules/electron/dist/electron")).toBeNull();
});

test("the_carried_runtime_cli_and_commit_sit_in_the_runtime_helper_where_the_bundle_assembly_puts_them", () => {
  const appBundle = "/Applications/Tato Studio.app";
  expect(runtimeHelperBundleIn(appBundle)).toBe("/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app");
  expect(carriedRuntimeExecutableIn(appBundle)).toBe("/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd");
  expect(carriedCommandLineToolIn(appBundle)).toBe("/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolab-cli");
  expect(streamlibCommitFileTheAppCarriesBeside("/Applications/Tato Studio.app/Contents/Resources")).toBe(
    "/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app/Contents/Resources/streamlib-commit",
  );
});

test("a build without the local-proof feature uses the real machine's paths", () => {
  expect(tatolabMachinePathsOnMacosForThisBuild(501, "/Users/someone")).toEqual(tatolabMachinePathsOnMacosForTheRealMachine(501, "/Users/someone"));
});

test("the packaged app's viewer addon is in its Frameworks, where code signing reads Mach-O", () => {
  expect(viewerAddonThePackagedAppCarriesInItsFrameworks("/Applications/Tato Studio.app/Contents/Resources")).toBe(
    "/Applications/Tato Studio.app/Contents/Frameworks/tatolab_runtime_viewer_frame_import.node",
  );
});
