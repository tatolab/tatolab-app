// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { execFile } from "node:child_process";
import os from "node:os";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";

/** How a program that ran ended, and what it wrote. */
export interface ProgramCompletion {
  /** Its exit status; `null` when a signal ended it. */
  exitStatus: number | null;
  /** The signal that ended it; `null` when it exited. */
  endingSignal: string | null;
  standardOutput: string;
  standardError: string;
}

/** Whether the program exited with status 0. */
export function programSucceeded(programCompletion: ProgramCompletion): boolean {
  return programCompletion.exitStatus === 0;
}

/** How the program ended, as Rust's `ExitStatus` prints it: `exit status: 1` or `signal: 15 (SIGTERM)`. */
export function describeHowTheProgramEnded(programCompletion: ProgramCompletion): string {
  if (programCompletion.exitStatus !== null) return `exit status: ${programCompletion.exitStatus}`;
  const endingSignal = programCompletion.endingSignal ?? "unknown";
  const endingSignalNumber = Object.entries(os.constants.signals).find(([signalName]) => signalName === endingSignal)?.[1];
  return endingSignalNumber === undefined ? `signal: ${endingSignal}` : `signal: ${endingSignalNumber} (${endingSignal})`;
}

/** Run `programPath` with `programArguments`, never through a shell, until it ends; refused only when it could not be started or run to its end. */
export function runProgramToCompletion(
  programPath: string,
  programArguments: readonly string[],
): Promise<Result<ProgramCompletion, string>> {
  return new Promise((settle) => {
    // execFile throws at once for arguments it refuses, such as one holding a NUL byte, and for a
    // spawn failure outside the few it reports through the callback.
    try {
      execFile(programPath, programArguments, { encoding: "utf8" }, (executionFailure, standardOutput, standardError) => {
        if (executionFailure === null) {
          settle(succeeded({ exitStatus: 0, endingSignal: null, standardOutput, standardError }));
          return;
        }
        // execFile reports a nonzero exit as a failure whose `code` is the exit status, and a program
        // it could not start, or whose output outran the buffer, as one whose `code` is a name such
        // as `ENOENT`.
        if (typeof executionFailure.code === "number" || executionFailure.signal) {
          settle(
            succeeded({
              exitStatus: typeof executionFailure.code === "number" ? executionFailure.code : null,
              endingSignal: executionFailure.signal ?? null,
              standardOutput,
              standardError,
            }),
          );
          return;
        }
        settle(failedWith(`${programPath} could not be run: ${executionFailure.message}`));
      });
    } catch (startFailure) {
      settle(failedWith(`${programPath} could not be run: ${describeCaughtFailure(startFailure)}`));
    }
  });
}
