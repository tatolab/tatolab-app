import { spawn } from "node:child_process";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { CarriedRuntime, RuntimeChildProcess, RuntimeChildProcessExit } from "./carried_runtime.js";

/** The shell the runtime is started through, which both platforms keep at this path. */
const POSIX_SHELL_AT_ITS_SYSTEM_PATH = "/bin/sh";

// A GUI app on macOS starts with a soft limit of 256 open files, far below what a runtime with
// many streams holds; launchd gave the runtime 65536 as a soft limit. The shell raises the soft
// limit as far as the hard one allows, then `exec`s the runtime, so the child the app holds is
// `tatolabd` itself and SIGTERM reaches it.
const RAISE_THE_OPEN_FILE_LIMIT_THEN_EXEC_THE_RUNTIME = 'ulimit -n 65536 2>/dev/null || ulimit -n "$(ulimit -Hn)" 2>/dev/null; exec "$0"';

/** The last line of `text` with anything in it, or `null`. */
function lastLineWithWordsIn(text: string): string | null {
  const linesWithWords = text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return linesWithWords.at(-1) ?? null;
}

/** Start `tatolabd` as the app's child, its standard output discarded as launchd discarded it, keeping the last line of its standard error for the words it ends with. */
export function startTheCarriedRuntimeAsAChildProcess(
  carriedRuntime: CarriedRuntime,
  whenItExits: (runtimeChildProcessExit: RuntimeChildProcessExit) => void,
): Result<RuntimeChildProcess, string> {
  let lastStandardErrorLine: string | null = null;
  let exitReported = false;
  const reportTheExitOnce = (runtimeChildProcessExit: RuntimeChildProcessExit) => {
    if (exitReported) return;
    exitReported = true;
    whenItExits(runtimeChildProcessExit);
  };
  // spawn throws at once for arguments or an environment it refuses, such as one holding a NUL byte.
  try {
    const runtimeProcess = spawn(POSIX_SHELL_AT_ITS_SYSTEM_PATH, ["-c", RAISE_THE_OPEN_FILE_LIMIT_THEN_EXEC_THE_RUNTIME, carriedRuntime.runtimeExecutable], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ...carriedRuntime.runtimeEnvironment },
    });
    runtimeProcess.stderr.setEncoding("utf8");
    runtimeProcess.stderr.on("data", (standardErrorText: string) => {
      lastStandardErrorLine = lastLineWithWordsIn(standardErrorText) ?? lastStandardErrorLine;
    });
    runtimeProcess.on("error", (startFailure) => {
      reportTheExitOnce({ exitStatus: null, endingSignal: null, lastStandardErrorLine: `the runtime could not be started: ${startFailure.message}` });
    });
    runtimeProcess.on("close", (exitStatus, endingSignal) => {
      reportTheExitOnce({ exitStatus, endingSignal, lastStandardErrorLine });
    });
    return succeeded({
      askItToStop: () => {
        runtimeProcess.kill("SIGTERM");
      },
    });
  } catch (startFailure) {
    return failedWith(`${carriedRuntime.runtimeExecutable} could not be started: ${describeCaughtFailure(startFailure)}`);
  }
}
