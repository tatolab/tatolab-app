// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith, succeeded } from "../../result.js";
import type { ProgramCompletion } from "../run_program_to_completion.js";
import { TerminalAppOpenedByOpen } from "./terminal_app_opened_by_open.js";

function programRunsAnswering(completion: ProgramCompletion) {
  const runs: (readonly string[])[] = [];
  const runOpen = async (openArguments: readonly string[]) => {
    runs.push(openArguments);
    return succeeded(completion);
  };
  return { runs, runOpen };
}

test("terminal_app_opens_on_the_folder_through_open", async () => {
  const { runs, runOpen } = programRunsAnswering({ exitStatus: 0, endingSignal: null, standardOutput: "", standardError: "" });

  const opened = await new TerminalAppOpenedByOpen(runOpen).openTerminalIn("/Users/jonathanf/streams/front door");

  expect(opened).toEqual({ ok: true, value: undefined });
  expect(runs).toEqual([["-a", "Terminal", "/Users/jonathanf/streams/front door"]]);
});

test("an_open_that_fails_is_refused_with_how_it_ended_and_what_it_said", async () => {
  const { runOpen } = programRunsAnswering({
    exitStatus: 1,
    endingSignal: null,
    standardOutput: "",
    standardError: "The file /Users/jonathanf/gone does not exist.\n",
  });

  expect(await new TerminalAppOpenedByOpen(runOpen).openTerminalIn("/Users/jonathanf/gone")).toEqual(
    failedWith("Terminal did not open on /Users/jonathanf/gone (exit status: 1): The file /Users/jonathanf/gone does not exist."),
  );
});

test("an_open_that_could_not_run_is_refused_in_its_own_words", async () => {
  const runOpen = async () => failedWith("/usr/bin/open could not be run: spawn /usr/bin/open ENOENT");

  expect(await new TerminalAppOpenedByOpen(runOpen).openTerminalIn("/tmp")).toEqual(
    failedWith("/usr/bin/open could not be run: spawn /usr/bin/open ENOENT"),
  );
});
