import { spawn } from "node:child_process";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** A program running with its standard input and output piped to the app. */
export interface ProgramSpeakingOnItsStandardStreams {
  writeToItsInput(bytes: Buffer): void;
  /** End the program; its exit still arrives on `onExit`. */
  stop(): void;
}

/** Where what a program writes, and its exit, are told. */
export interface ProgramOnItsStandardStreamsListeners {
  onOutput(chunk: Buffer): void;
  onErrorOutput(text: string): void;
  /** The program ended, or never started, with how, in words. */
  onExit(exitWords: string): void;
}

/** How the program starts beyond its arguments: its working folder, and the variables it gets on top of the app's environment. */
export interface ProgramOnItsStandardStreamsStart {
  workingFolder: string;
  environmentVariablesAdded: Readonly<Record<string, string>>;
}

/** Start `programPath` with its standard streams piped to the app; refused in the platform's words. A test's fake plays the program. */
export type StartAProgramSpeakingOnItsStandardStreams = (
  programPath: string,
  programArguments: readonly string[],
  programStart: ProgramOnItsStandardStreamsStart,
  listeners: ProgramOnItsStandardStreamsListeners,
) => Result<ProgramSpeakingOnItsStandardStreams, string>;

/** Start `programPath` never through a shell, in a session of its own so it never reads the terminal the app was started from. */
export const startAProgramSpeakingOnItsStandardStreams: StartAProgramSpeakingOnItsStandardStreams = (programPath, programArguments, programStart, listeners) => {
  try {
    const program = spawn(programPath, programArguments, {
      cwd: programStart.workingFolder,
      env: { ...process.env, ...programStart.environmentVariablesAdded },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    let hasEnded = false;
    const endWith = (exitWords: string) => {
      if (hasEnded) return;
      hasEnded = true;
      listeners.onExit(exitWords);
    };
    program.stdout.on("data", (chunk: Buffer) => listeners.onOutput(chunk));
    program.stderr.setEncoding("utf8");
    program.stderr.on("data", (text: string) => listeners.onErrorOutput(text));
    program.stdin.on("error", () => undefined);
    program.on("error", (startFailure) => endWith(`${programPath} could not be run: ${startFailure.message}`));
    program.on("exit", (exitStatus, endingSignal) => endWith(exitStatus === null ? `signal: ${endingSignal ?? "unknown"}` : `exit status: ${exitStatus}`));
    return succeeded({
      writeToItsInput: (bytes) => {
        if (!hasEnded && program.stdin.writable) program.stdin.write(bytes);
      },
      stop: () => {
        if (!hasEnded) program.kill("SIGTERM");
      },
    });
  } catch (startFailure) {
    return failedWith(`${programPath} could not be run: ${describeCaughtFailure(startFailure)}`);
  }
};
