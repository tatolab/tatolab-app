import { randomUUID } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { RuntimeChildProcessExit } from "./carried_runtime.js";
import { startTheCarriedRuntimeAsAChildProcess } from "./carried_runtime_child_process.js";

const scratchDirectory = path.join(os.tmpdir(), `tl-carried-runtime-${randomUUID()}`);

afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

/** A stand-in `tatolabd` at a path with a space in it, as the app bundle's, running `script`. */
async function standInRuntimeRunning(script: string): Promise<string> {
  const runtimeExecutable = path.join(scratchDirectory, "Tatolab Runtime.app", "tatolabd");
  await mkdir(path.dirname(runtimeExecutable), { recursive: true });
  await writeFile(runtimeExecutable, `#!/bin/sh\n${script}\n`);
  await chmod(runtimeExecutable, 0o755);
  return runtimeExecutable;
}

function whenItExits(): { exited: Promise<RuntimeChildProcessExit>; whenItExits: (runtimeChildProcessExit: RuntimeChildProcessExit) => void } {
  let reportExit: (runtimeChildProcessExit: RuntimeChildProcessExit) => void = () => {};
  const exited = new Promise<RuntimeChildProcessExit>((settle) => {
    reportExit = settle;
  });
  return { exited, whenItExits: (runtimeChildProcessExit) => reportExit(runtimeChildProcessExit) };
}

test("the_runtime_runs_with_its_environment_and_ends_in_its_own_words", async () => {
  const runtimeExecutable = await standInRuntimeRunning('echo "starting" >&2; echo "error: the machine runtime lock under $TATOLAB_TEST_MACHINE_ROOT is held" >&2; exit 3');
  const exit = whenItExits();
  const started = startTheCarriedRuntimeAsAChildProcess({ runtimeExecutable, runtimeEnvironment: { TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof" } }, exit.whenItExits);
  expect(started.ok).toBe(true);
  expect(await exit.exited).toEqual({ exitStatus: 3, endingSignal: null, lastStandardErrorLine: "error: the machine runtime lock under /tmp/tatolab-proof is held" });
});

test("the_open_file_limit_is_raised_above_a_gui_apps_default", async () => {
  const runtimeExecutable = await standInRuntimeRunning('echo "$(ulimit -n)" >&2; exit 0');
  const exit = whenItExits();
  startTheCarriedRuntimeAsAChildProcess({ runtimeExecutable, runtimeEnvironment: {} }, exit.whenItExits);
  const openFileLimit = (await exit.exited).lastStandardErrorLine;
  expect(openFileLimit === "unlimited" || Number(openFileLimit) > 256).toBe(true);
});

test("asking_it_to_stop_sends_sigterm_to_the_runtime_itself", async () => {
  const runtimeExecutable = await standInRuntimeRunning('trap "echo stopped on SIGTERM >&2; exit 0" TERM; echo ready >&2; while true; do sleep 0.05; done');
  const exit = whenItExits();
  const started = startTheCarriedRuntimeAsAChildProcess({ runtimeExecutable, runtimeEnvironment: {} }, exit.whenItExits);
  if (!started.ok) throw new Error(started.failure);
  await new Promise((settle) => setTimeout(settle, 200));
  started.value.askItToStop();
  expect(await exit.exited).toEqual({ exitStatus: 0, endingSignal: null, lastStandardErrorLine: "stopped on SIGTERM" });
});

test("a_missing_runtime_ends_with_the_shells_words", async () => {
  const exit = whenItExits();
  startTheCarriedRuntimeAsAChildProcess({ runtimeExecutable: path.join(scratchDirectory, "no-such-tatolabd"), runtimeEnvironment: {} }, exit.whenItExits);
  const ended = await exit.exited;
  expect(ended.exitStatus).toBe(127);
  expect(ended.lastStandardErrorLine).toContain("no-such-tatolabd");
});
