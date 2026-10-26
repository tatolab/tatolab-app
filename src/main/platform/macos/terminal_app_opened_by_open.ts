import { failedWith, succeeded, type Result } from "../../result.js";
import type { TerminalOpenedInAFolder } from "../terminal_opened_in_a_folder.js";
import { describeHowTheProgramEnded, programSucceeded, runProgramToCompletion, type ProgramCompletion } from "../run_program_to_completion.js";

/** `open` at its system path, which Launch Services answers. */
export const OPEN_AT_ITS_SYSTEM_PATH = "/usr/bin/open";

/** Runs `open` with `openArguments` to its end; the system's `open` in the app, a test's fake in its tests. */
export type OpenRunner = (openArguments: readonly string[]) => Promise<Result<ProgramCompletion, string>>;

/** Terminal.app opened on a folder by `open -a Terminal <folder>`, which opens a new window whose shell starts there. */
export class TerminalAppOpenedByOpen implements TerminalOpenedInAFolder {
  constructor(private readonly runOpen: OpenRunner = (openArguments) => runProgramToCompletion(OPEN_AT_ITS_SYSTEM_PATH, openArguments)) {}

  async openTerminalIn(folder: string): Promise<Result<void, string>> {
    const opened = await this.runOpen(["-a", "Terminal", folder]);
    if (!opened.ok) return opened;
    if (programSucceeded(opened.value)) return succeeded(undefined);
    const openSaid = opened.value.standardError.trim();
    return failedWith(`Terminal did not open on ${folder} (${describeHowTheProgramEnded(opened.value)})${openSaid === "" ? "" : `: ${openSaid}`}`);
  }
}
