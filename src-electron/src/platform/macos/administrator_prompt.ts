// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The macOS administrator prompt: one root shell script, run by `osascript`'s
// `do shell script … with administrator privileges` behind the system's password dialog, and the
// quoting that keeps every path one shell word inside one AppleScript string.

import { failedWith, succeeded, type Result } from "../../result.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "./run_program_to_completion.js";

/** The interpreter that shows macOS's administrator prompt. */
export const OSASCRIPT_PATH = "/usr/bin/osascript";

/** Why a script behind the administrator prompt did not run to its end: the user cancelled the prompt, so the script never ran; or the prompt could not be shown, or the script failed. */
export type AdministratorPromptFailure = { kind: "cancelled" } | { kind: "failed"; failureDescription: string };

/** Runs a root shell script behind one administrator prompt, settling once the user answers it; a test's fake stands in for it. */
export interface AdministratorPrompt {
  runBehindOneAdministratorPrompt(shellScript: string, promptText: string): Promise<Result<void, AdministratorPromptFailure>>;
}

/** Runs `osascript` with its arguments to completion; a test's fake stands in for it. */
export type OsascriptRunner = (osascriptArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** `osascript` at its system path. */
export const OSASCRIPT_AT_ITS_SYSTEM_PATH: OsascriptRunner = (osascriptArguments) =>
  runProgramToCompletion(OSASCRIPT_PATH, osascriptArguments);

/** `value` as one single-quoted POSIX shell word. */
export function singleQuotedShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** `filePath` as one single-quoted POSIX shell word. */
export function shellWordForPath(filePath: string): string {
  return singleQuotedShellWord(filePath);
}

/** `value` as an AppleScript string literal. */
export function applescriptStringLiteral(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** The AppleScript that runs `shellScript` as root behind the administrator prompt, which shows `promptText` under "Tatolab wants to make changes." */
export function administratorPromptApplescript(shellScript: string, promptText: string): string {
  return `do shell script ${applescriptStringLiteral(shellScript)} with prompt ${applescriptStringLiteral(promptText)} with administrator privileges`;
}

/** The administrator prompt `osascript` shows. */
export class OsascriptAdministratorPrompt implements AdministratorPrompt {
  constructor(private readonly osascriptRunner: OsascriptRunner) {}

  async runBehindOneAdministratorPrompt(shellScript: string, promptText: string): Promise<Result<void, AdministratorPromptFailure>> {
    const osascriptRun = await this.osascriptRunner(["-e", administratorPromptApplescript(shellScript, promptText)]);
    if (!osascriptRun.ok) return failedWith({ kind: "failed", failureDescription: osascriptRun.failure });
    const osascriptCompletion = osascriptRun.value;
    if (programSucceeded(osascriptCompletion)) return succeeded(undefined);
    // -128 is AppleScript's userCanceledErr.
    if (osascriptCompletion.standardError.includes("(-128)")) return failedWith({ kind: "cancelled" });
    return failedWith({
      kind: "failed",
      failureDescription: `${osascriptCompletion.standardError.trim()} (${describeHowTheProgramEnded(osascriptCompletion)})`,
    });
  }
}
