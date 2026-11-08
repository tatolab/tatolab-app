// scripts/assemble-tatolab-app-bundle.sh places everything the runtime unit ships: it refuses a
// unit without uv, which tatolabd runs from beside itself, a unit whose bin/ or lib/tatolab/ holds
// something it does not place, and a unit built from any streamlib commit but the one the build resolved. Every
// refusal comes before it touches the bundle.

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSEMBLE_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "assemble-tatolab-app-bundle.sh");
const PLACED_RUNTIME_UNIT_BINARIES = ["tatolab", "tatolabd", "uv"];
const PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES = ["lend"];
const RESOLVED_STREAMLIB_COMMIT = "ef5c8b22995a90b1f7ae671e214c96480615c911";
const AN_OLDER_STREAMLIB_COMMIT = "f2ec4338a0d1c2b3e4f5a6b7c8d9e0f1a2b3c4d5";

interface AssembleScriptOutcome {
  exitCode: number;
  stderr: string;
}

function runTheAssembleScript(
  appBundle: string,
  runtimeUnitDirectory: string,
  assembleFlags: string[] = ["--streamlib-commit", RESOLVED_STREAMLIB_COMMIT],
): Promise<AssembleScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile("bash", [ASSEMBLE_SCRIPT, appBundle, runtimeUnitDirectory, ...assembleFlags], { cwd: REPOSITORY_ROOT }, (scriptFailure, _stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, stderr });
    });
  });
}

let scratchDirectory = "";
let plantedAppBundle = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-assemble-"));
  plantedAppBundle = path.join(scratchDirectory, "Tato Studio.app");
  await mkdir(path.join(plantedAppBundle, "Contents", "MacOS"), { recursive: true });
  await writeFile(path.join(plantedAppBundle, "Contents", "MacOS", "Tato Studio"), "");
  await chmod(path.join(plantedAppBundle, "Contents", "MacOS", "Tato Studio"), 0o755);
});

afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function runtimeUnitPlantedWith(
  binaryNames: string[],
  libraryDirectoryNames: string[],
  builtFromStreamlibCommit: string | null = RESOLVED_STREAMLIB_COMMIT,
): Promise<string> {
  const runtimeUnitDirectory = path.join(scratchDirectory, "tatolab-runtime");
  await mkdir(path.join(runtimeUnitDirectory, "bin"), { recursive: true });
  if (builtFromStreamlibCommit !== null) await writeFile(path.join(runtimeUnitDirectory, "streamlib-commit"), `${builtFromStreamlibCommit}\n`);
  for (const libraryDirectoryName of libraryDirectoryNames) {
    await mkdir(path.join(runtimeUnitDirectory, "lib", "tatolab", libraryDirectoryName), { recursive: true });
  }
  if (libraryDirectoryNames.includes("lend")) {
    await mkdir(path.join(runtimeUnitDirectory, "lib", "tatolab", "lend", "tatolab", "runtime"), { recursive: true });
  }
  for (const binaryName of binaryNames) {
    await writeFile(path.join(runtimeUnitDirectory, "bin", binaryName), "");
    await chmod(path.join(runtimeUnitDirectory, "bin", binaryName), 0o755);
  }
  return runtimeUnitDirectory;
}

test("a unit without uv is refused and the bundle is untouched", async () => {
  for (const missingBinaryName of ["uv"]) {
    await rm(path.join(scratchDirectory, "tatolab-runtime"), { recursive: true, force: true });
    const runtimeUnitDirectory = await runtimeUnitPlantedWith(
      PLACED_RUNTIME_UNIT_BINARIES.filter((binaryName) => binaryName !== missingBinaryName),
      PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES,
    );
    const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
    expect(assembleOutcome.exitCode).toBe(1);
    expect(assembleOutcome.stderr).toContain(`is missing bin/${missingBinaryName}`);
    expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
  }
});

test("a unit whose bin/ holds a binary the bundle does not place is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith([...PLACED_RUNTIME_UNIT_BINARIES, "tatolab-something-new"], PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("bin/tatolab-something-new");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit whose lib/tatolab/ holds something the bundle does not place is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, [...PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES, "something-new"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("lib/tatolab/something-new");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit built from another streamlib commit is refused, naming both commits, and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES, AN_OLDER_STREAMLIB_COMMIT);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain(AN_OLDER_STREAMLIB_COMMIT);
  expect(assembleOutcome.stderr).toContain(RESOLVED_STREAMLIB_COMMIT);
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit that names no streamlib commit is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES, null);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("names no streamlib commit");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("assembling without the streamlib commit the build resolved is a usage error", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory, []);
  expect(assembleOutcome.exitCode).toBe(2);
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit built from the resolved commit passes the commit check", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  // The test-root marker makes assemble stop at its next refusal, so the bundle is never built from planted files.
  await writeFile(path.join(runtimeUnitDirectory, "machine-directories-under-a-test-root"), "");
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("refusing to ship a test-root runtime unit");
  expect(assembleOutcome.stderr).not.toContain("streamlib");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

