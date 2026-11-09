import { expect, test } from "vitest";
import {
  carriedCommandLineToolInTheAppResources,
  carriedRuntimeExecutableInTheAppResources,
  streamlibCommitFileTheAppCarriesInTheResources,
  viewerAddonThePackagedAppCarriesBesideItsAsar,
  tatolabMachinePathsOnLinuxForTheRealMachine,
  tatolabMachinePathsOnLinuxUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_socket_is_in_the_users_runtime_directory_as_the_runtime_resolves_it", () => {
  expect(tatolabMachinePathsOnLinuxForTheRealMachine("/run/user/1000", "/home/jonathan", 1000)).toEqual({
    localApiSocket: "/run/user/1000/streamlib/local-api.sock",
    commandLineToolLink: "/home/jonathan/.local/bin/tatolab",
    localProofTestMachine: null,
  });
});

test("without_a_runtime_directory_the_socket_falls_back_to_the_per_user_tmp_folder", () => {
  for (const xdgRuntimeDir of [undefined, ""]) {
    expect(tatolabMachinePathsOnLinuxForTheRealMachine(xdgRuntimeDir, "/home/jonathan", 1000).localApiSocket).toBe(
      "/tmp/streamlib-1000/local-api.sock",
    );
  }
});

test("no_home_or_a_relative_one_names_no_cli_link", () => {
  for (const homeDirectory of [undefined, "relative/home"]) {
    expect(tatolabMachinePathsOnLinuxForTheRealMachine("/run/user/1000", homeDirectory, 1000).commandLineToolLink).toBeNull();
  }
});

test("a_local_proof_build_reads_the_socket_under_its_test_root_and_no_cli_link", () => {
  expect(tatolabMachinePathsOnLinuxUnderALocalProofTestRoot({ testMachineRoot: "/tmp/tatolab-proof-two", runtimeLoopbackHttpPort: 14447 })).toEqual({
    localApiSocket: "/tmp/tatolab-proof-two/run/local-api.sock",
    commandLineToolLink: null,
    localProofTestMachine: { testMachineRoot: "/tmp/tatolab-proof-two", runtimeLoopbackHttpPort: 14447 },
  });
});

test("the_carried_runtime_cli_and_commit_sit_in_the_packages_resources_where_the_linux_build_puts_them", () => {
  expect(carriedRuntimeExecutableInTheAppResources("/usr/lib/tatolab/resources")).toBe("/usr/lib/tatolab/resources/tatolab-runtime/bin/tatolabd");
  expect(carriedCommandLineToolInTheAppResources("/usr/lib/tatolab/resources")).toBe("/usr/lib/tatolab/resources/tatolab-runtime/bin/tatolab");
  expect(streamlibCommitFileTheAppCarriesInTheResources("/tmp/.mount_TatolaAbCdEf/usr/lib/tatolab/resources")).toBe(
    "/tmp/.mount_TatolaAbCdEf/usr/lib/tatolab/resources/tatolab-runtime/streamlib-commit",
  );
});

test("the package's viewer addon is beside its asar", () => {
  expect(viewerAddonThePackagedAppCarriesBesideItsAsar("/usr/lib/tatolab/resources")).toBe("/usr/lib/tatolab/resources/app.asar.unpacked/out/native/tatolab_runtime_viewer_frame_import.node");
});
