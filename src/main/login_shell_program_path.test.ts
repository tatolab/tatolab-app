import { expect, test } from "vitest";
import { LOGIN_SHELL_PATH_READ_TIMEOUT_MS, LoginShellProgramPath, pathFromTheLoginShellsEnvironment, type LoginShellProgramPathSources } from "./login_shell_program_path.js";
import type { ProgramCompletion } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";

function printed(standardOutput: string, exitStatus = 0): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput, standardError: "" });
}

const LOGIN_SHELL_ENVIRONMENT = [
  "Last login: Tue Nov  4 09:12:01 on ttys000",
  "__TATOLAB_LOGIN_SHELL_ENVIRONMENT_START__",
  "HOME=/Users/someone",
  "PATH=/Users/someone/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin",
  "__TATOLAB_LOGIN_SHELL_ENVIRONMENT_END__",
  "",
].join("\n");

function programPathOver(overrides: Partial<LoginShellProgramPathSources>) {
  const shellRuns: { programPath: string; programArguments: readonly string[] }[] = [];
  const sources: LoginShellProgramPathSources = {
    loginShell: "/bin/zsh",
    appsOwnPath: "/usr/bin:/bin:/usr/sbin:/sbin",
    runProgram: async (programPath, programArguments) => {
      shellRuns.push({ programPath, programArguments });
      return printed(LOGIN_SHELL_ENVIRONMENT);
    },
    runAfter: () => undefined,
    isAnExecutableFile: async (filePath) => filePath === "/Users/someone/.npm-global/bin/claude-agent-acp" || filePath === "/usr/bin/codex-acp",
    ...overrides,
  };
  return { programPath: new LoginShellProgramPath(sources), shellRuns };
}

test("the PATH is the one the login shell's environment prints between the markers, past anything its profile prints", () => {
  expect(pathFromTheLoginShellsEnvironment(LOGIN_SHELL_ENVIRONMENT)).toBe("/Users/someone/.npm-global/bin:/opt/homebrew/bin:/usr/bin:/bin");
  expect(pathFromTheLoginShellsEnvironment("no markers here")).toBeNull();
});

test("the login shell is asked once, as an interactive login shell, and programs are found in its PATH's order", async () => {
  const { programPath, shellRuns } = programPathOver({});
  expect(await programPath.findProgram("claude-agent-acp")).toBe("/Users/someone/.npm-global/bin/claude-agent-acp");
  expect(await programPath.findProgram("codex-acp")).toBe("/usr/bin/codex-acp");
  expect(await programPath.findProgram("gemini")).toBeNull();
  expect(shellRuns).toHaveLength(1);
  expect(shellRuns[0]?.programPath).toBe("/bin/zsh");
  expect(shellRuns[0]?.programArguments.slice(0, 3)).toEqual(["-i", "-l", "-c"]);
});

test("without a login shell, or one that fails, prints no PATH or takes too long, the app's own PATH is used", async () => {
  expect(await programPathOver({ loginShell: null }).programPath.readThePath()).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
  expect(await programPathOver({ runProgram: async () => failedWith("/bin/zsh could not be run") }).programPath.readThePath()).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
  expect(await programPathOver({ runProgram: async () => printed("nothing useful", 1) }).programPath.readThePath()).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
  const timersStarted: number[] = [];
  const hung = programPathOver({
    runProgram: () => new Promise(() => undefined),
    runAfter: (delayMs, work) => {
      timersStarted.push(delayMs);
      work();
    },
  });
  expect(await hung.programPath.readThePath()).toBe("/usr/bin:/bin:/usr/sbin:/sbin");
  expect(timersStarted).toEqual([LOGIN_SHELL_PATH_READ_TIMEOUT_MS]);
});
