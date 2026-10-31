import { expect, test } from "vitest";
import { runProgramStreamingItsLines } from "./run_program_streaming_its_lines.js";

test("each line a program writes reaches the caller as it is written, and its ending and output come back", async () => {
  const programLines: string[] = [];
  const ran = await runProgramStreamingItsLines("/bin/sh", ["-c", "echo first; echo refused >&2; printf 'no newline'; exit 3"], (programLine) =>
    programLines.push(programLine),
  );
  expect(programLines).toEqual(expect.arrayContaining(["first", "refused", "no newline"]));
  expect(programLines.indexOf("first")).toBeLessThan(programLines.indexOf("no newline"));
  expect(ran).toEqual({ ok: true, value: { exitStatus: 3, endingSignal: null, standardOutput: "first\nno newline", standardError: "refused\n" } });
});

test("a program that cannot start is refused in words naming it", async () => {
  const ran = await runProgramStreamingItsLines("/nonexistent/install.sh", [], () => {});
  expect(ran.ok ? "" : ran.failure).toMatch(/^\/nonexistent\/install\.sh could not be run: .*ENOENT/);
});

test("the_program_runs_with_the_apps_environment_and_the_variables_added", async () => {
  const programLines: string[] = [];
  await runProgramStreamingItsLines("/bin/sh", ["-c", 'echo "$TATOLAB_TEST_MACHINE_ROOT $PATH"'], (programLine) => programLines.push(programLine), {
    TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof",
  });
  expect(programLines).toEqual([`/tmp/tatolab-proof ${process.env["PATH"] ?? ""}`]);
});
