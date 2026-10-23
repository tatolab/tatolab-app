// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { failedWith, succeeded, type Result } from "../../result.js";
import type { TerminalOpenedInAFolder } from "../mod.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "./run_program_to_completion.js";

/** `open` at its system path, which Launch Services answers. */
export const OPEN_AT_ITS_SYSTEM_PATH = "/usr/bin/open";

/** Runs a program to its end; `runProgramToCompletion` in the app, a test's fake in its tests. */
export type ProgramRunToCompletion = (programPath: string, programArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** Terminal.app opened on a folder by `open -a Terminal <folder>`, which opens a new window whose shell starts there. */
export class TerminalAppOpenedByOpen implements TerminalOpenedInAFolder {
  constructor(
    private readonly openProgramPath: string = OPEN_AT_ITS_SYSTEM_PATH,
    private readonly runProgram: ProgramRunToCompletion = runProgramToCompletion,
  ) {}

  async openTerminalIn(folder: string): Promise<Result<void, string>> {
    const opened = await this.runProgram(this.openProgramPath, ["-a", "Terminal", folder]);
    if (!opened.ok) return opened;
    if (programSucceeded(opened.value)) return succeeded(undefined);
    const openSaid = opened.value.standardError.trim();
    return failedWith(`Terminal did not open on ${folder} (${describeHowTheProgramEnded(opened.value)})${openSaid === "" ? "" : `: ${openSaid}`}`);
  }
}
