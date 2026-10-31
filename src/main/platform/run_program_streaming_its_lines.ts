import { spawn } from "node:child_process";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { ProgramCompletion } from "./run_program_to_completion.js";

/** Runs a program to its end, handing each line it writes to `onProgramLine` as it writes it; a test's fake answers as the program would. */
export type ProgramRunnerStreamingItsLines = (
  programPath: string,
  programArguments: readonly string[],
  onProgramLine: (programLine: string) => void,
  environmentVariablesAdded?: Readonly<Record<string, string>>,
) => Promise<Result<ProgramCompletion, string>>;

/** Hands each whole line of a stream's chunks to `onProgramLine`, keeping the unfinished tail for the next chunk. */
class ProgramLinesInOrder {
  private unfinishedLine = "";

  constructor(private readonly onProgramLine: (programLine: string) => void) {}

  takeChunk(chunk: string): void {
    const lines = (this.unfinishedLine + chunk).split("\n");
    this.unfinishedLine = lines.pop() ?? "";
    for (const line of lines) this.onProgramLine(line);
  }

  takeTheEnd(): void {
    if (this.unfinishedLine !== "") this.onProgramLine(this.unfinishedLine);
    this.unfinishedLine = "";
  }
}

/**
 * Run `programPath` with `programArguments` and the app's environment with `environmentVariablesAdded`, never through a
 * shell and in a session of its own, until it ends, handing each line of its standard output and standard error to
 * `onProgramLine` as it comes; refused only when it could not be started.
 */
export function runProgramStreamingItsLines(
  programPath: string,
  programArguments: readonly string[],
  onProgramLine: (programLine: string) => void,
  environmentVariablesAdded: Readonly<Record<string, string>> = {},
): Promise<Result<ProgramCompletion, string>> {
  return new Promise((settle) => {
    let standardOutput = "";
    let standardError = "";
    const standardOutputLines = new ProgramLinesInOrder(onProgramLine);
    const standardErrorLines = new ProgramLinesInOrder(onProgramLine);
    try {
      const program = spawn(programPath, programArguments, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...environmentVariablesAdded },
        // A session of its own has no controlling terminal, so a program that asks on /dev/tty, as the installer's
        // offer to keep the runtime running after logout does, never waits on the terminal the app was started from.
        detached: true,
      });
      program.stdout.setEncoding("utf8");
      program.stderr.setEncoding("utf8");
      program.stdout.on("data", (chunk: string) => {
        standardOutput += chunk;
        standardOutputLines.takeChunk(chunk);
      });
      program.stderr.on("data", (chunk: string) => {
        standardError += chunk;
        standardErrorLines.takeChunk(chunk);
      });
      program.on("error", (startFailure) => settle(failedWith(`${programPath} could not be run: ${startFailure.message}`)));
      program.on("close", (exitStatus, endingSignal) => {
        standardOutputLines.takeTheEnd();
        standardErrorLines.takeTheEnd();
        settle(succeeded({ exitStatus, endingSignal, standardOutput, standardError }));
      });
    } catch (startFailure) {
      settle(failedWith(`${programPath} could not be run: ${describeCaughtFailure(startFailure)}`));
    }
  });
}
