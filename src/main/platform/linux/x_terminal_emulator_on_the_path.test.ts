// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith, succeeded } from "../../result.js";
import type { ProgramStartFailure } from "./start_a_detached_program.js";
import { NO_X_TERMINAL_EMULATOR_REFUSAL, XTerminalEmulatorOnThePath } from "./x_terminal_emulator_on_the_path.js";

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
