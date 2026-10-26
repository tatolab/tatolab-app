import { expect, test } from "vitest";
import {
  tatolabMachinePathsOnLinuxForTheRealMachine,
  tatolabMachinePathsOnLinuxUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_socket_is_in_the_users_runtime_directory_as_the_runtime_resolves_it", () => {
  expect(tatolabMachinePathsOnLinuxForTheRealMachine("/run/user/1000", "/home/jonathan", 1000)).toEqual({
    localApiSocket: "/run/user/1000/streamlib/local-api.sock",
    commandLineToolLink: "/home/jonathan/.local/bin/tatolab",
    localProofTestMachineRoot: null,
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
  expect(tatolabMachinePathsOnLinuxUnderALocalProofTestRoot("/tmp/tatolab-proof")).toEqual({
    localApiSocket: "/tmp/tatolab-proof/run/local-api.sock",
    commandLineToolLink: null,
    localProofTestMachineRoot: "/tmp/tatolab-proof",
  });
});
