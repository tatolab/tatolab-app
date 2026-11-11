import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { HeldRememberedSwitch, RememberedSwitchFile, X11_WARNING_DIALOG_SHOWN_FILE_NAME } from "./remembered_switch_file.js";
import { StudioWarningsOfThisRun } from "./studio_warnings.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

let appConfigDirectory: string;

beforeEach(async () => {
  appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "studio-warnings-"));
});

afterEach(async () => {
  await rm(appConfigDirectory, { recursive: true, force: true });
});

async function x11WarningDialogShownSwitch(): Promise<HeldRememberedSwitch> {
  return HeldRememberedSwitch.load(RememberedSwitchFile.x11WarningDialogShownInAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {})));
}

test("viewers that import their frames hold no warning", async () => {
  expect(new StudioWarningsOfThisRun("display_import", await x11WarningDialogShownSwitch()).warningsNow()).toEqual([]);
});

test("viewers that copy their frames hold the X11 warning, whose dialog is due until it is shown once on this machine", async () => {
  const warnings = new StudioWarningsOfThisRun("cpu_read", await x11WarningDialogShownSwitch());
  expect(warnings.warningsNow()).toEqual([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: true }]);

  expect(await warnings.rememberTheDialogWasShown("viewer_frames_copied_on_x11")).toEqual({ ok: true, value: undefined });
  expect(warnings.warningsNow()).toEqual([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }]);
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, X11_WARNING_DIALOG_SHOWN_FILE_NAME), "utf8"))).toEqual({ x11_warning_dialog_shown: true });

  const nextRun = new StudioWarningsOfThisRun("cpu_read", await x11WarningDialogShownSwitch());
  expect(nextRun.warningsNow()).toEqual([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }]);
});
