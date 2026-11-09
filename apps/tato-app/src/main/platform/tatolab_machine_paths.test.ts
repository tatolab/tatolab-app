import { expect, test } from "vitest";
import {
  LOCAL_API_SOCKET_FILE_NAME,
  localApiSocketUnderALocalProofTestRoot,
  localProofRuntimeEnvironment,
  localProofTestMachineFromTheAppEnvironment,
  perUserStreamlibRuntimeDirectoryUnderTmp,
} from "./tatolab_machine_paths.js";
import path from "node:path";

test("the_local_api_socket_sits_where_the_runtime_serves_it", () => {
  expect(path.join(perUserStreamlibRuntimeDirectoryUnderTmp(501), LOCAL_API_SOCKET_FILE_NAME)).toBe("/tmp/streamlib-501/local-api.sock");
  expect(localApiSocketUnderALocalProofTestRoot("/tmp/tatolab-proof")).toBe("/tmp/tatolab-proof/run/local-api.sock");
});

test("a_local_proof_build_uses_the_root_and_port_its_own_environment_names", () => {
  const localProofTestMachine = localProofTestMachineFromTheAppEnvironment({
    TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof-178",
    TATOLAB_TEST_LOOPBACK_HTTP_PORT: "14478",
  });
  expect(localProofTestMachine).toEqual({ testMachineRoot: "/tmp/tatolab-proof-178", runtimeLoopbackHttpPort: 14478 });
  expect(localProofRuntimeEnvironment(localProofTestMachine)).toEqual({
    TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof-178",
    TATOLAB_TEST_LOOPBACK_HTTP_PORT: "14478",
  });
});

test("a_local_proof_build_whose_environment_names_no_root_or_port_uses_the_defaults", () => {
  expect(localProofTestMachineFromTheAppEnvironment({})).toEqual({ testMachineRoot: "/tmp/tatolab-proof", runtimeLoopbackHttpPort: 14446 });
});

test("a_relative_or_empty_root_and_a_port_that_is_not_one_fall_back_to_the_defaults", () => {
  for (const [testMachineRoot, loopbackHttpPort] of [
    ["", ""],
    ["relative/root", "0"],
    ["./tatolab-proof", "65536"],
    ["tatolab-proof", "14446.5"],
    ["~/tatolab-proof", "-1"],
    ["tatolab-proof", " 14478"],
  ]) {
    expect(
      localProofTestMachineFromTheAppEnvironment({ TATOLAB_TEST_MACHINE_ROOT: testMachineRoot, TATOLAB_TEST_LOOPBACK_HTTP_PORT: loopbackHttpPort }),
    ).toEqual({ testMachineRoot: "/tmp/tatolab-proof", runtimeLoopbackHttpPort: 14446 });
  }
});
