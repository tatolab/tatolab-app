import { expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { ProgramCompletion } from "../run_program_to_completion.js";
import { legacyLaunchAgentLoginItemsStatusReaderThrough } from "./login_items_status_of_the_legacy_launch_agent.js";

const PLIST_PATH = "/Users/someone/Library/LaunchAgents/com.tatolab.tatolabd.plist";

function osascriptAnswering(osascriptAnswer: Result<ProgramCompletion, string>) {
  const osascriptCalls: (readonly string[])[] = [];
  const reader = legacyLaunchAgentLoginItemsStatusReaderThrough(async (osascriptArguments) => {
    osascriptCalls.push(osascriptArguments);
    return osascriptAnswer;
  });
  return { reader, osascriptCalls };
}

function osascriptExiting(exitStatus: number, standardOutput: string, standardError = ""): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput, standardError });
}

test("each_sm_app_service_status_osascript_prints_reads_as_its_login_items_status", async () => {
  for (const [printedStatus, loginItemsStatus] of [
    ["0\n", "not_registered"],
    ["1\n", "enabled"],
    ["2\n", "requires_approval"],
    ["3\n", "not_found"],
  ] as const) {
    expect(await osascriptAnswering(osascriptExiting(0, printedStatus)).reader(PLIST_PATH)).toEqual(succeeded(loginItemsStatus));
  }
});

test("the_plist_path_reaches_status_for_legacy_url_as_the_scripts_argument_never_inside_its_source", async () => {
  const { reader, osascriptCalls } = osascriptAnswering(osascriptExiting(0, "1\n"));
  await reader(PLIST_PATH);
  const [osascriptArguments] = osascriptCalls;
  expect(osascriptArguments?.slice(0, 3)).toEqual(["-l", "JavaScript", "-e"]);
  expect(osascriptArguments?.[3]).toContain("statusForLegacyURL");
  expect(osascriptArguments?.[3]).not.toContain(PLIST_PATH);
  expect(osascriptArguments?.[4]).toBe(PLIST_PATH);
});

test("an_osascript_that_fails_or_answers_an_unknown_status_is_refused_in_words", async () => {
  expect(await osascriptAnswering(failedWith("spawn /usr/bin/osascript ENOENT")).reader(PLIST_PATH)).toEqual(
    failedWith("osascript could not be run: spawn /usr/bin/osascript ENOENT"),
  );
  expect(await osascriptAnswering(osascriptExiting(1, "", "execution error: Error: ReferenceError: Can't find variable: SMAppService (-2700)")).reader(PLIST_PATH)).toEqual(
    failedWith("osascript failed (exit status: 1): execution error: Error: ReferenceError: Can't find variable: SMAppService (-2700)"),
  );
  expect(await osascriptAnswering(osascriptExiting(0, "7\n")).reader(PLIST_PATH)).toEqual(
    failedWith("Service Management answered a status the app does not know: 7"),
  );
});
