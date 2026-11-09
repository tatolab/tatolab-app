import os from "node:os";

/** The real uid of this process, which the machine paths and macOS's launchd domain are built for. */
export function currentProcessUid(): number {
  // Node defines `getuid` on every POSIX platform, the only ones the app runs on.
  return process.getuid?.() ?? os.userInfo().uid;
}
