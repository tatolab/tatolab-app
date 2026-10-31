import { expect, test } from "vitest";
import {
  carriedRuntimeUnitLayoutInTheAppResources,
  streamlibCommitFileTheAppCarriesInTheResources,
  tatolabMachinePathsOnLinuxForTheRealMachine,
  tatolabMachinePathsOnLinuxUnderALocalProofTestRoot,
} from "./tatolab_machine_paths.js";

test("the_socket_is_in_the_users_runtime_directory_as_the_runtime_resolves_it", () => {
  expect(tatolabMachinePathsOnLinuxForTheRealMachine("/run/user/1000", "/home/jonathan", 1000)).toEqual({
    localApiSocket: "/run/user/1000/streamlib/local-api.sock",
    commandLineToolLink: "/home/jonathan/.local/bin/tatolab",
    runtimeInstallDirectory: "/home/jonathan/.local/share/tatolab",
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

test("no_home_or_a_relative_one_names_no_cli_link_and_no_install_folder", () => {
  for (const homeDirectory of [undefined, "relative/home"]) {
    const machinePaths = tatolabMachinePathsOnLinuxForTheRealMachine("/run/user/1000", homeDirectory, 1000);
    expect(machinePaths.commandLineToolLink).toBeNull();
    expect(machinePaths.runtimeInstallDirectory).toBeNull();
  }
});

test("a_local_proof_build_reads_the_socket_under_its_test_root_and_no_cli_link", () => {
  expect(tatolabMachinePathsOnLinuxUnderALocalProofTestRoot("/tmp/tatolab-proof")).toEqual({
    localApiSocket: "/tmp/tatolab-proof/run/local-api.sock",
    commandLineToolLink: null,
    runtimeInstallDirectory: null,
    localProofTestMachineRoot: "/tmp/tatolab-proof",
  });
});

test("the_carried_runtime_unit_and_installer_sit_in_the_packages_resources_where_the_linux_build_puts_them", () => {
  expect(carriedRuntimeUnitLayoutInTheAppResources("/usr/lib/tatolab/resources", "/home/jonathan/.local/share/tatolab")).toEqual({
    carriedInstaller: "/usr/lib/tatolab/resources/install.sh",
    carriedRuntimeUnit: "/usr/lib/tatolab/resources/tatolab-runtime",
    carriedRuntimeExecutable: "/usr/lib/tatolab/resources/tatolab-runtime/bin/tatolabd",
    carriedStreamlibCommitFile: "/usr/lib/tatolab/resources/tatolab-runtime/streamlib-commit",
    runtimeInstallDirectory: "/home/jonathan/.local/share/tatolab",
  });
  expect(streamlibCommitFileTheAppCarriesInTheResources("/tmp/.mount_TatolaAbCdEf/usr/lib/tatolab/resources")).toBe(
    "/tmp/.mount_TatolaAbCdEf/usr/lib/tatolab/resources/tatolab-runtime/streamlib-commit",
  );
});
