// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { describeHowTheProgramEnded, runProgramToCompletion } from "./run_program_to_completion.js";

test("a program's exit status, signal and standard error come back, and one that cannot start is refused", async () => {
  expect(await runProgramToCompletion("/bin/sh", ["-c", "printf out; printf err >&2; exit 113"])).toEqual({
    ok: true,
    value: { exitStatus: 113, endingSignal: null, standardOutput: "out", standardError: "err" },
  });

  const signalled = await runProgramToCompletion("/bin/sh", ["-c", "kill -TERM $$"]);
  expect(signalled.ok && describeHowTheProgramEnded(signalled.value)).toBe("signal: 15 (SIGTERM)");

  const unstartable = await runProgramToCompletion("/nonexistent/launchctl", ["kickstart"]);
  expect(unstartable.ok ? "" : unstartable.failure).toMatch(/^\/nonexistent\/launchctl could not be run: .*ENOENT/);

  const refusedArgument = await runProgramToCompletion("/bin/sh", ["-c", "true\u0000"]);
  expect(refusedArgument.ok ? "" : refusedArgument.failure).toMatch(/^\/bin\/sh could not be run: /);
});
