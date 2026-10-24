// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test, vi } from "vitest";
import type { ProgramCompletion } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { commandLineToolVersionFromItsVersionOutput, TatolabCommandLineToolVersionReadOncePerLaunch } from "./tatolab_command_line_tool_version.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

function exited(exitStatus: number, standardOutput: string, standardError = ""): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput, standardError });
}

test("the_version_is_the_first_line_tatolab_version_prints_whatever_the_runtime_line_says", () => {
  expect(commandLineToolVersionFromItsVersionOutput("tatolab 0.55.2\nruntime: not running\n")).toEqual(succeeded("0.55.2"));
  expect(
    commandLineToolVersionFromItsVersionOutput("tatolab 0.55.2\nruntime 0.55.2 (0.55.2+ec6adf5.eecd), up 0d 0h 4m, log /tmp/tatolab-proof/state/logs\n"),
  ).toEqual(succeeded("0.55.2"));
  expect(commandLineToolVersionFromItsVersionOutput("tatolab-cli 1.0\n")).toEqual(failedWith('its first line, "tatolab-cli 1.0", names no version'));
});

test("the_version_is_read_once_in_the_background_and_reads_as_reading_until_then", async () => {
  const runProgram = vi.fn(async () => exited(0, "tatolab 0.55.2\nruntime: not running\n"));
  const commandLineToolVersion = new TatolabCommandLineToolVersionReadOncePerLaunch({ kind: "at", path: "/usr/local/bin/tatolab" }, runProgram, quietTatolabAppLog);

  expect(commandLineToolVersion.versionNow()).toEqual({ kind: "reading" });
  await vi.waitFor(() => expect(commandLineToolVersion.versionNow()).toEqual({ kind: "read", version: "0.55.2" }));
  expect(commandLineToolVersion.versionNow()).toEqual({ kind: "read", version: "0.55.2" });
  expect(runProgram.mock.calls).toEqual([["/usr/local/bin/tatolab", ["--version"]]]);
});

test("a_cli_that_fails_or_cannot_run_reads_unreadable_with_why_and_a_build_without_one_not_offered", async () => {
  const failing = new TatolabCommandLineToolVersionReadOncePerLaunch(
    { kind: "at", path: "/usr/local/bin/tatolab" },
    async () => exited(2, "", "error: unexpected argument\n"),
    quietTatolabAppLog,
  );
  await vi.waitFor(() =>
    expect(failing.versionNow()).toEqual({ kind: "unreadable", reason: "/usr/local/bin/tatolab --version failed (exit status: 2): error: unexpected argument" }),
  );

  const missing = new TatolabCommandLineToolVersionReadOncePerLaunch(
    { kind: "at", path: "/gone/tatolab" },
    async () => failedWith("/gone/tatolab could not be run: spawn /gone/tatolab ENOENT"),
    quietTatolabAppLog,
  );
  await vi.waitFor(() => expect(missing.versionNow()).toEqual({ kind: "unreadable", reason: "/gone/tatolab could not be run: spawn /gone/tatolab ENOENT" }));

  const runProgram = vi.fn(async () => exited(0, "tatolab 0.55.2\n"));
  const notOffered = new TatolabCommandLineToolVersionReadOncePerLaunch({ kind: "not_offered", reason: "no CLI in this build" }, runProgram, quietTatolabAppLog);
  expect(notOffered.versionNow()).toEqual({ kind: "not_offered", reason: "no CLI in this build" });
  expect(runProgram).not.toHaveBeenCalled();
});
