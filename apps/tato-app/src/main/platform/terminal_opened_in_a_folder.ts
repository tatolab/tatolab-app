import type { Result } from "../result.js";

/** The desktop's terminal: Terminal.app on macOS, `x-terminal-emulator` on Linux. */
export interface TerminalOpenedInAFolder {
  /** Open a terminal window whose shell starts in `folder`, an existing folder; refused in words when none opened. */
  openTerminalIn(folder: string): Promise<Result<void, string>>;
}
