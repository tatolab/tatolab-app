import { failedWith, type Result } from "../../result.js";
import type { TerminalOpenedInAFolder } from "../mod.js";
import { startADetachedProgramOnThePath, type DetachedProgramStart } from "./start_a_detached_program.js";

/** The Debian alternative naming the desktop's terminal, which Ubuntu installs with every terminal. */
export const X_TERMINAL_EMULATOR_PROGRAM = "x-terminal-emulator";

/** Why a Linux desktop opens no terminal: it has no `x-terminal-emulator`. */
export const NO_X_TERMINAL_EMULATOR_REFUSAL =
  "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.";

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
