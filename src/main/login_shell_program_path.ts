// The person's `PATH` as their login shell sets it. An app opened from the Finder or a desktop
// launcher inherits a bare `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin` on macOS), so the programs a
// person installed with npm, Homebrew or a version manager are found only on the one their shell
// profile builds.

import path from "node:path";
import type { ProgramRunner } from "./platform/run_program_to_completion.js";

const ENVIRONMENT_START_MARKER = "__TATOLAB_LOGIN_SHELL_ENVIRONMENT_START__";
const ENVIRONMENT_END_MARKER = "__TATOLAB_LOGIN_SHELL_ENVIRONMENT_END__";

/** How long the login shell may take to print its environment before the app's own `PATH` is used. */
export const LOGIN_SHELL_PATH_READ_TIMEOUT_MS = 10_000;

/** What reading the login shell's `PATH` reaches: the shell, the program runner, the app's own `PATH`, a timer, and whether a file can be run. */
export interface LoginShellProgramPathSources {
  /** The person's login shell, `$SHELL`; `null` when unset, and the app's own `PATH` is used. */
  loginShell: string | null;
  appsOwnPath: string;
  runProgram: ProgramRunner;
  runAfter(delayMs: number, work: () => void): void;
  isAnExecutableFile(filePath: string): Promise<boolean>;
}

/** The `PATH` line of `env`'s output between the markers, or `null` when the shell printed none. */
export function pathFromTheLoginShellsEnvironment(standardOutput: string): string | null {
  const start = standardOutput.lastIndexOf(ENVIRONMENT_START_MARKER);
  const end = standardOutput.lastIndexOf(ENVIRONMENT_END_MARKER);
  if (start === -1 || end < start) return null;
  const environmentLines = standardOutput.slice(start + ENVIRONMENT_START_MARKER.length, end).split("\n");
  const pathLine = environmentLines.find((environmentLine) => environmentLine.startsWith("PATH="));
  return pathLine === undefined ? null : pathLine.slice("PATH=".length);
}

/** The login shell's `PATH`, read once, and the programs found on it. */
export class LoginShellProgramPath {
  private pathRead: Promise<string> | null = null;

  constructor(private readonly sources: LoginShellProgramPathSources) {}

  /** The login shell's `PATH`, or the app's own when the shell is unset, fails or takes longer than `LOGIN_SHELL_PATH_READ_TIMEOUT_MS`. */
  readThePath(): Promise<string> {
    this.pathRead ??= this.readTheLoginShellsPath();
    return this.pathRead;
  }

  /** The first executable file named `programName` in a folder of the login shell's `PATH`, or `null` when none is. */
  async findProgram(programName: string): Promise<string | null> {
    const folders = (await this.readThePath()).split(":").filter((folder) => path.isAbsolute(folder));
    for (const folder of folders) {
      const candidate = path.join(folder, programName);
      if (await this.sources.isAnExecutableFile(candidate)) return candidate;
    }
    return null;
  }

  private async readTheLoginShellsPath(): Promise<string> {
    const { loginShell, appsOwnPath } = this.sources;
    if (loginShell === null || loginShell === "") return appsOwnPath;
    const timedOut = new Promise<null>((settle) => this.sources.runAfter(LOGIN_SHELL_PATH_READ_TIMEOUT_MS, () => settle(null)));
    // An interactive login shell reads both the login profile and the interactive rc file, where many people set PATH.
    const printed = this.sources.runProgram(loginShell, ["-i", "-l", "-c", `echo ${ENVIRONMENT_START_MARKER}; env; echo ${ENVIRONMENT_END_MARKER}`]);
    const completion = await Promise.race([printed, timedOut]);
    if (completion === null || !completion.ok) return appsOwnPath;
    return pathFromTheLoginShellsEnvironment(completion.value.standardOutput) ?? appsOwnPath;
  }
}
