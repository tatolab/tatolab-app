// The machine paths both platforms lay out as StreamLib does: the per-user runtime directory the
// local API socket sits in, and the test root a local-proof build keeps every machine directory under.

import path from "node:path";

/** The root a local-proof build keeps every machine directory under when its own environment names none. */
export const LOCAL_PROOF_TEST_MACHINE_ROOT_WHEN_THE_APP_ENVIRONMENT_NAMES_NONE = "/tmp/tatolab-proof";

/** The root a local-proof build keeps every machine directory under: the app's own `TATOLAB_TEST_MACHINE_ROOT` when it is an absolute path, else the default. */
export function localProofTestMachineRootFromTheAppEnvironment(testMachineRootInTheAppEnvironment: string | undefined): string {
  return testMachineRootInTheAppEnvironment !== undefined && path.isAbsolute(testMachineRootInTheAppEnvironment)
    ? testMachineRootInTheAppEnvironment
    : LOCAL_PROOF_TEST_MACHINE_ROOT_WHEN_THE_APP_ENVIRONMENT_NAMES_NONE;
}

/** The local API socket's file name inside the runtime directory, as StreamLib's `streamlib_runtime_directory.rs` names it. */
export const LOCAL_API_SOCKET_FILE_NAME = "local-api.sock";

/** The shared temporary directory the per-user runtime directory sits in. */
const SHARED_TEMPORARY_DIRECTORY = "/tmp";

/** `/tmp/streamlib-<uid>`: the runtime directory on macOS, and on Linux when `$XDG_RUNTIME_DIR` is unset or empty, as StreamLib resolves it. */
export function perUserStreamlibRuntimeDirectoryUnderTmp(uid: number): string {
  return path.join(SHARED_TEMPORARY_DIRECTORY, `streamlib-${uid}`);
}

/** `<test_machine_root>/run/local-api.sock`: where a local-proof build's runtime serves its local API, as StreamLib's `machine_directories_test_root.rs` lays it out. */
export function localApiSocketUnderALocalProofTestRoot(testMachineRoot: string): string {
  return path.join(testMachineRoot, "run", LOCAL_API_SOCKET_FILE_NAME);
}

/** The port a local-proof runtime binds its loopback HTTP on when the app's environment names none, apart from a release runtime's; a test-root runtime binds none without one. */
export const LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT_WHEN_THE_APP_ENVIRONMENT_NAMES_NONE = 14446;

/** The highest TCP port. */
const HIGHEST_TCP_PORT = 65535;

/** The port a local-proof runtime binds its loopback HTTP on: the app's own `TATOLAB_TEST_LOOPBACK_HTTP_PORT` when it is a port number, else the default. */
export function localProofRuntimeLoopbackHttpPortFromTheAppEnvironment(loopbackHttpPortInTheAppEnvironment: string | undefined): number {
  if (loopbackHttpPortInTheAppEnvironment === undefined || !/^[0-9]+$/.test(loopbackHttpPortInTheAppEnvironment)) {
    return LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT_WHEN_THE_APP_ENVIRONMENT_NAMES_NONE;
  }
  const loopbackHttpPort = Number(loopbackHttpPortInTheAppEnvironment);
  return loopbackHttpPort >= 1 && loopbackHttpPort <= HIGHEST_TCP_PORT ? loopbackHttpPort : LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT_WHEN_THE_APP_ENVIRONMENT_NAMES_NONE;
}

/** Where a local-proof build keeps its runtime: the test root, and the test port of the runtime's loopback HTTP. */
export interface LocalProofTestMachine {
  testMachineRoot: string;
  runtimeLoopbackHttpPort: number;
}

/** The test machine a local-proof build uses, from the app's own `TATOLAB_TEST_MACHINE_ROOT` and `TATOLAB_TEST_LOOPBACK_HTTP_PORT`. */
export function localProofTestMachineFromTheAppEnvironment(appEnvironment: NodeJS.ProcessEnv): LocalProofTestMachine {
  return {
    testMachineRoot: localProofTestMachineRootFromTheAppEnvironment(appEnvironment["TATOLAB_TEST_MACHINE_ROOT"]),
    runtimeLoopbackHttpPort: localProofRuntimeLoopbackHttpPortFromTheAppEnvironment(appEnvironment["TATOLAB_TEST_LOOPBACK_HTTP_PORT"]),
  };
}

/** What a runtime on `localProofTestMachine` is run with: its test root, and the test port of its loopback HTTP. */
export function localProofRuntimeEnvironment(localProofTestMachine: LocalProofTestMachine): Readonly<Record<string, string>> {
  return {
    TATOLAB_TEST_MACHINE_ROOT: localProofTestMachine.testMachineRoot,
    TATOLAB_TEST_LOOPBACK_HTTP_PORT: String(localProofTestMachine.runtimeLoopbackHttpPort),
  };
}
