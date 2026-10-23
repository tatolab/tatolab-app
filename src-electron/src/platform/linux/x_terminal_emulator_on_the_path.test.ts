// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { failedWith, succeeded } from "../../result.js";
import {
  NO_X_TERMINAL_EMULATOR_REFUSAL,
  startADetachedProgramOnThePath,
  XTerminalEmulatorOnThePath,
  type ProgramStartFailure,
} from "./x_terminal_emulator_on_the_path.js";

test("x_terminal_emulator_starts_in_the_folder", async () => {
  const starts: [string, string][] = [];
  const terminal = new XTerminalEmulatorOnThePath(async (programName, workingFolder) => {
    starts.push([programName, workingFolder]);
    return succeeded(undefined);
  });

  expect(await terminal.openTerminalIn("/home/jonathanf/streams/front-door")).toEqual(succeeded(undefined));
  expect(starts).toEqual([["x-terminal-emulator", "/home/jonathanf/streams/front-door"]]);
});

test("a_desktop_without_x_terminal_emulator_is_refused_naming_it", async () => {
  const missing: ProgramStartFailure = { errorCode: "ENOENT", description: "spawn x-terminal-emulator ENOENT" };
  const terminal = new XTerminalEmulatorOnThePath(async () => failedWith(missing));

  expect(await terminal.openTerminalIn("/home/jonathanf/streams/front-door")).toEqual(failedWith(NO_X_TERMINAL_EMULATOR_REFUSAL));
});

test("another_start_failure_is_refused_in_its_own_words", async () => {
  const terminal = new XTerminalEmulatorOnThePath(async () => failedWith({ errorCode: "EACCES", description: "spawn x-terminal-emulator EACCES" }));

  expect(await terminal.openTerminalIn("/srv/x")).toEqual(failedWith("No terminal opened on /srv/x: spawn x-terminal-emulator EACCES"));
});

test("a_detached_program_starts_in_its_working_folder_and_a_missing_one_answers_enoent", async () => {
  const workingFolder = await mkdtemp(path.join(os.tmpdir(), "tl-app-terminal-"));
  try {
    expect(await startADetachedProgramOnThePath("true", workingFolder)).toEqual(succeeded(undefined));
    const missing = await startADetachedProgramOnThePath("tatolab-app-no-such-program", workingFolder);
    expect(missing.ok ? null : missing.failure.errorCode).toBe("ENOENT");
  } finally {
    await rm(workingFolder, { recursive: true, force: true });
  }
});
