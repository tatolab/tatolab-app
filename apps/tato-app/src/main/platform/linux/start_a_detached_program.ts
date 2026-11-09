import { spawn } from "node:child_process";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";

/** Why a program could not be started: its errno code, such as `ENOENT`, and Node's words. */
export interface ProgramStartFailure {
  errorCode: string | null;
  description: string;
}

/** Starts a program left running on its own, in `workingFolder`; a test's fake in its tests. */
export type DetachedProgramStart = (programName: string, workingFolder: string) => Promise<Result<void, ProgramStartFailure>>;

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
