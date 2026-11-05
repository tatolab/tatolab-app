import os from "node:os";
import { expect, test } from "vitest";
import { startAProgramSpeakingOnItsStandardStreams } from "./start_a_program_speaking_on_its_standard_streams.js";

test("a program reads what is written to its input, in its working folder with the variables added, and its exit is told", async () => {
  const workingFolder = await import("node:fs/promises").then((fs) => fs.realpath(os.tmpdir()));
  const output: Buffer[] = [];
  const errorOutput: string[] = [];
  const exited = new Promise<string>((settle) => {
    const started = startAProgramSpeakingOnItsStandardStreams(
      "/bin/sh",
      ["-c", 'read line; echo "$line $(pwd) $TATOLAB_AGENT_TEST_VARIABLE"; echo said >&2'],
      { workingFolder, environmentVariablesAdded: { TATOLAB_AGENT_TEST_VARIABLE: "added" } },
      { onOutput: (chunk) => output.push(chunk), onErrorOutput: (text) => errorOutput.push(text), onExit: settle },
    );
    expect(started.ok).toBe(true);
    if (started.ok) started.value.writeToItsInput(Buffer.from("hello\n"));
  });
  expect(await exited).toBe("exit status: 0");
  expect(Buffer.concat(output).toString("utf8")).toBe(`hello ${workingFolder} added\n`);
  expect(errorOutput.join("")).toBe("said\n");
});

test("a program that is not there is told as its exit, in the platform's words", async () => {
  const exitWords = await new Promise<string>((settle) => {
    startAProgramSpeakingOnItsStandardStreams("/nonexistent/claude-agent-acp", [], { workingFolder: os.tmpdir(), environmentVariablesAdded: {} }, {
      onOutput: () => undefined,
      onErrorOutput: () => undefined,
      onExit: settle,
    });
  });
  expect(exitWords).toContain("/nonexistent/claude-agent-acp could not be run");
});

test("stopping a program ends it, and its end is told", async () => {
  const exitWords = await new Promise<string>((settle) => {
    const started = startAProgramSpeakingOnItsStandardStreams("/bin/sh", ["-c", "sleep 30"], { workingFolder: os.tmpdir(), environmentVariablesAdded: {} }, {
      onOutput: () => undefined,
      onErrorOutput: () => undefined,
      onExit: settle,
    });
    if (started.ok) started.value.stop();
  });
  expect(exitWords).toBe("signal: SIGTERM");
});
