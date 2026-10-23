// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { spawn } from "node:child_process";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TerminalOpenedInAFolder } from "../mod.js";

/** The Debian alternative naming the desktop's terminal, which Ubuntu installs with every terminal. */
export const X_TERMINAL_EMULATOR_PROGRAM = "x-terminal-emulator";

/** Why a program could not be started: its errno code, such as `ENOENT`, and Node's words. */
export interface ProgramStartFailure {
  errorCode: string | null;
  description: string;
}

/** Starts a program left running on its own, in `workingFolder`; a test's fake in its tests. */
export type DetachedProgramStart = (programName: string, workingFolder: string) => Promise<Result<void, ProgramStartFailure>>;

/** Why a Linux desktop opens no terminal: it has no `x-terminal-emulator`. */
export const NO_X_TERMINAL_EMULATOR_REFUSAL =
  "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.";

/** `programName` started from the PATH in `workingFolder`, detached and unwatched, settling once it has started or could not. */
export function startADetachedProgramOnThePath(programName: string, workingFolder: string): Promise<Result<void, ProgramStartFailure>> {
  return new Promise((settle) => {
    try {
      const startedProgram = spawn(programName, [], { cwd: workingFolder, detached: true, stdio: "ignore" });
      startedProgram.once("spawn", () => {
        startedProgram.unref();
        settle(succeeded(undefined));
      });
      startedProgram.once("error", (startFailure: NodeJS.ErrnoException) => {
        settle(failedWith({ errorCode: startFailure.code ?? null, description: describeCaughtFailure(startFailure) }));
      });
    } catch (startFailure) {
      settle(failedWith({ errorCode: null, description: describeCaughtFailure(startFailure) }));
    }
  });
}

/** The desktop's terminal, `x-terminal-emulator` started in the folder: the terminals Ubuntu ships open their shell where they were started. */
export class XTerminalEmulatorOnThePath implements TerminalOpenedInAFolder {
  constructor(private readonly startDetachedProgram: DetachedProgramStart = startADetachedProgramOnThePath) {}

  async openTerminalIn(folder: string): Promise<Result<void, string>> {
    const started = await this.startDetachedProgram(X_TERMINAL_EMULATOR_PROGRAM, folder);
    if (started.ok) return started;
    // The folder was checked before the terminal was asked for, so a missing file is the program.
    if (started.failure.errorCode === "ENOENT") return failedWith(NO_X_TERMINAL_EMULATOR_REFUSAL);
    return failedWith(`No terminal opened on ${folder}: ${started.failure.description}`);
  }
}
