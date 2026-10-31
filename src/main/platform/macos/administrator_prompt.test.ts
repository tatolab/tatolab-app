import { expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import {
  applescriptStringLiteral,
  OsascriptAdministratorPrompt,
  singleQuotedShellWord,
  type OsascriptRunner,
} from "./administrator_prompt.js";
import { usrLocalBinLinkAdministratorShellScript } from "./command_line_tool_links_on_this_mac.js";
import { runProgramToCompletion, type ProgramCompletion } from "../run_program_to_completion.js";
import { tatolabUninstallAdministratorShellScript } from "./tatolab_uninstall_on_this_mac.js";

const OSASCRIPT_RUNS_HERE = process.platform === "darwin";

const VALUES_A_PATH_MAY_HOLD = ["o'neil", "''", '"double quoted"', 'back\\slash \\"', "$HOME `id` $(id) * ? [a] ~", "Ünïcödé ✓", ""];

/** What `programPath` printed for `programArguments`, its trailing newline dropped. */
async function programAnswer(programPath: string, programArguments: readonly string[]): Promise<string> {
  const programRun = await runProgramToCompletion(programPath, programArguments);
  expect(programRun.ok && programRun.value.exitStatus, JSON.stringify(programRun)).toBe(0);
  const answer = programRun.ok ? programRun.value.standardOutput : "";
  return answer.endsWith("\n") ? answer.slice(0, -1) : answer;
}

test.skipIf(!OSASCRIPT_RUNS_HERE)("every_administrator_script_round_trips_through_osascript_unchanged", async () => {
  const bundleWithQuotesBackslashesAndGlobs = "/Users/o'neil/Apps/\"Tatolab\" \\ $HOME * copy.app";
  const usrLocalBinLinkScript = usrLocalBinLinkAdministratorShellScript(
    "/usr/local/bin/tatolab",
    `${bundleWithQuotesBackslashesAndGlobs}/Contents/MacOS/tatolab-cli`,
  );
  const uninstallScript =
    tatolabUninstallAdministratorShellScript("/usr/local/bin/tatolab", [
      bundleWithQuotesBackslashesAndGlobs,
      "/Users/o'neil/Library/Application Support/com.tatolab.runtime",
    ]) ?? "";
  for (const shellScript of [usrLocalBinLinkScript, uninstallScript]) {
    expect(await programAnswer("/usr/bin/osascript", ["-e", `return ${applescriptStringLiteral(shellScript)}`])).toBe(shellScript);
  }

  for (const value of VALUES_A_PATH_MAY_HOLD) {
    const shellScript = `printf %s ${singleQuotedShellWord(value)}`;
    expect(await programAnswer("/usr/bin/osascript", ["-e", `do shell script ${applescriptStringLiteral(shellScript)}`]), shellScript).toBe(value);
  }
});

test("a single-quoted shell word reaches the shell as the value it holds", async () => {
  for (const value of VALUES_A_PATH_MAY_HOLD) {
    expect(await programAnswer("/bin/sh", ["-c", `printf %s ${singleQuotedShellWord(value)}`]), value).toBe(value);
  }
});

function osascriptAnswering(osascriptAnswer: Result<ProgramCompletion, string>) {
  const osascriptCalls: (readonly string[])[] = [];
  const osascriptRunner: OsascriptRunner = async (osascriptArguments) => {
    osascriptCalls.push(osascriptArguments);
    return osascriptAnswer;
  };
  return { osascriptRunner, osascriptCalls };
}

function osascriptExiting(exitStatus: number, standardError = ""): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput: "", standardError });
}

test("the prompt runs the script as root through osascript and tells a cancel from a failure", async () => {
  const answered = osascriptAnswering(osascriptExiting(0));
  expect(await new OsascriptAdministratorPrompt(answered.osascriptRunner).runBehindOneAdministratorPrompt("touch '/x'", "Tatolab needs it.")).toEqual(
    succeeded(undefined),
  );
  expect(answered.osascriptCalls).toEqual([
    ["-e", `do shell script "touch '/x'" with prompt "Tatolab needs it." with administrator privileges`],
  ]);

  const runWith = (osascriptAnswer: Result<ProgramCompletion, string>) =>
    new OsascriptAdministratorPrompt(osascriptAnswering(osascriptAnswer).osascriptRunner).runBehindOneAdministratorPrompt("true", "Tatolab");
  expect(await runWith(osascriptExiting(1, "0:85: execution error: User canceled. (-128)\n"))).toEqual(failedWith({ kind: "cancelled" }));
  expect(await runWith(osascriptExiting(1, "0:85: execution error: chown: Operation not permitted (1)\n"))).toEqual(
    failedWith({ kind: "failed", failureDescription: "0:85: execution error: chown: Operation not permitted (1) (exit status: 1)" }),
  );
  expect(await runWith(failedWith("/usr/bin/osascript could not be started: spawn /usr/bin/osascript ENOENT"))).toEqual(
    failedWith({ kind: "failed", failureDescription: "/usr/bin/osascript could not be started: spawn /usr/bin/osascript ENOENT" }),
  );
});
