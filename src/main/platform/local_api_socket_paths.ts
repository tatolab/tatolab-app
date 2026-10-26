// Where the runtime serves its local API, as StreamLib lays it out on both platforms: under the
// per-user runtime directory, or under a local-proof build's test root.

import os from "node:os";
import path from "node:path";

/** The root a local-proof build keeps every machine directory under, which its runtime reads as `TATOLAB_TEST_MACHINE_ROOT`. */
export const LOCAL_PROOF_TEST_MACHINE_ROOT = "/tmp/tatolab-proof";

/** The local API socket's file name inside the runtime directory, as StreamLib's `streamlib_runtime_directory.rs` names it. */
export const LOCAL_API_SOCKET_FILE_NAME = "local-api.sock";

/** The shared temporary directory the per-user runtime directory sits in. */
const SHARED_TEMPORARY_DIRECTORY = "/tmp";

/** `/tmp/streamlib-<uid>`: the runtime directory on macOS, and on Linux when `$XDG_RUNTIME_DIR` is unset or empty, as StreamLib resolves it. */
export function perUserStreamlibRuntimeDirectoryUnderTmp(uid: number): string {
  return path.join(SHARED_TEMPORARY_DIRECTORY, `streamlib-${uid}`);
}

/** The real uid of this process. */
export function currentProcessUid(): number {
  // Node defines `getuid` on every POSIX platform, the only ones the app runs on.
  return process.getuid?.() ?? os.userInfo().uid;
}

/** `<test_machine_root>/run/local-api.sock`: where a local-proof build's runtime serves its local API, as StreamLib's `machine_directories_test_root.rs` lays it out. */
export function localApiSocketUnderALocalProofTestRoot(testMachineRoot: string): string {
  return path.join(testMachineRoot, "run", LOCAL_API_SOCKET_FILE_NAME);
}
