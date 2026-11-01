// Whether the user allows a launch agent plist under ~/Library/LaunchAgents to run, as Login Items & Extensions holds it,
// read through Service Management's `+[SMAppService statusForLegacyURL:]` from JavaScript for Automation.

import { failedWith, succeeded, type Result } from "../../result.js";
import { describeHowTheProgramEnded, programSucceeded } from "../run_program_to_completion.js";
import type { OsascriptRunner } from "./administrator_prompt.js";

/** `SMAppServiceStatus` for a legacy plist, spelled as the app reads it. */
export type LegacyLaunchAgentLoginItemsStatus = "not_registered" | "enabled" | "requires_approval" | "not_found";

/** Reads Login Items' status of the legacy launch agent plist at `plistPath`; a test's fake stands in for it. */
export type LegacyLaunchAgentLoginItemsStatusReader = (plistPath: string) => Promise<Result<LegacyLaunchAgentLoginItemsStatus, string>>;

/** `SMAppServiceStatus` raw values (macOS 13 and later), as `statusForLegacyURL:` answers them. */
const SM_APP_SERVICE_STATUS_BY_RAW_VALUE: ReadonlyMap<string, LegacyLaunchAgentLoginItemsStatus> = new Map([
  ["0", "not_registered"],
  ["1", "enabled"],
  ["2", "requires_approval"],
  ["3", "not_found"],
]);

/** The JavaScript for Automation that prints `statusForLegacyURL:` for the plist path given as its one argument. */
const STATUS_FOR_LEGACY_URL_SCRIPT =
  'ObjC.import("ServiceManagement"); function run(scriptArguments) { return $.SMAppService.statusForLegacyURL($.NSURL.fileURLWithPath(scriptArguments[0])); }';

/** Reads Login Items' status of a legacy launch agent plist through `osascript -l JavaScript`. */
export function legacyLaunchAgentLoginItemsStatusReaderThrough(osascriptRunner: OsascriptRunner): LegacyLaunchAgentLoginItemsStatusReader {
  return async (plistPath) => {
    const osascriptRun = await osascriptRunner(["-l", "JavaScript", "-e", STATUS_FOR_LEGACY_URL_SCRIPT, plistPath]);
    if (!osascriptRun.ok) return failedWith(`osascript could not be run: ${osascriptRun.failure}`);
    if (!programSucceeded(osascriptRun.value)) {
      const osascriptSaid = osascriptRun.value.standardError.trim();
      return failedWith(`osascript failed (${describeHowTheProgramEnded(osascriptRun.value)})${osascriptSaid === "" ? "" : `: ${osascriptSaid}`}`);
    }
    const printedStatus = osascriptRun.value.standardOutput.trim();
    const loginItemsStatus = SM_APP_SERVICE_STATUS_BY_RAW_VALUE.get(printedStatus);
    return loginItemsStatus === undefined ? failedWith(`Service Management answered a status the app does not know: ${printedStatus}`) : succeeded(loginItemsStatus);
  };
}
