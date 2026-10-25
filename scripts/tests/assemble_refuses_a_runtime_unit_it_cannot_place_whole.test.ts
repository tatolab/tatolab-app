// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// scripts/assemble-tatolab-app-bundle.sh places every binary the runtime unit ships: it refuses a
// unit without moq-relay, which tatolabd runs from beside itself, and a unit whose bin/ holds a
// binary it does not place. Both refusals come before it touches the bundle.

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSEMBLE_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "assemble-tatolab-app-bundle.sh");
const PLACED_RUNTIME_UNIT_BINARIES = ["moq-relay", "tatolab", "tatolabd"];

interface AssembleScriptOutcome {
  exitCode: number;
  stderr: string;
}

function runTheAssembleScript(appBundle: string, runtimeUnitDirectory: string): Promise<AssembleScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile("bash", [ASSEMBLE_SCRIPT, appBundle, runtimeUnitDirectory], { cwd: REPOSITORY_ROOT }, (scriptFailure, _stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, stderr });
    });
  });
}

let scratchDirectory = "";
let plantedAppBundle = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-assemble-"));
  plantedAppBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(plantedAppBundle, "Contents", "MacOS"), { recursive: true });
  await writeFile(path.join(plantedAppBundle, "Contents", "MacOS", "Tatolab"), "");
  await chmod(path.join(plantedAppBundle, "Contents", "MacOS", "Tatolab"), 0o755);
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function runtimeUnitPlantedWithBinaries(binaryNames: string[]): Promise<string> {
  const runtimeUnitDirectory = path.join(scratchDirectory, "tatolab-runtime");
  await mkdir(path.join(runtimeUnitDirectory, "bin"), { recursive: true });
  await mkdir(path.join(runtimeUnitDirectory, "lib", "tatolab", "lend", "tatolab", "runtime"), { recursive: true });
  for (const binaryName of binaryNames) {
    await writeFile(path.join(runtimeUnitDirectory, "bin", binaryName), "");
    await chmod(path.join(runtimeUnitDirectory, "bin", binaryName), 0o755);
  }
  return runtimeUnitDirectory;
}

test("a unit without moq-relay is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWithBinaries(["tatolab", "tatolabd"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("is missing bin/moq-relay");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit whose bin/ holds a binary the bundle does not place is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWithBinaries([...PLACED_RUNTIME_UNIT_BINARIES, "tatolab-something-new"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("bin/tatolab-something-new");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});
