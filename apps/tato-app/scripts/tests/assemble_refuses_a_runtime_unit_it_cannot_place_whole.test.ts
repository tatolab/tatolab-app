// scripts/assemble-tatolab-app-bundle.sh places everything the runtime unit ships: it refuses a
// unit without uv, which tatolabd runs from beside itself, a unit whose bin/ or lib/tatolab/ holds
// something it does not place, a unit whose lib/tatolab/imports/ holds anything but pure-Python
// wheels, and a unit built from any streamlib commit but the one the build resolved. Every refusal
// comes before it touches the bundle.

import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const TATO_APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSEMBLE_SCRIPT = path.join(TATO_APP_ROOT, "scripts", "assemble-tatolab-app-bundle.sh");
const PLACED_RUNTIME_UNIT_BINARIES = ["tatolab", "tatolabd", "uv"];
const PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES = ["lend", "imports"];
const PURE_PYTHON_TESTPATTERN_WHEEL = "tatolab_testpattern-0.68.54-py3-none-any.whl";
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
    execFile("bash", [ASSEMBLE_SCRIPT, appBundle, runtimeUnitDirectory, ...assembleFlags], { cwd: TATO_APP_ROOT }, (scriptFailure, _stdout, stderr) => {
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
  if (libraryDirectoryNames.includes("imports")) {
    await plantAWheelInTheUnitsImports(runtimeUnitDirectory, PURE_PYTHON_TESTPATTERN_WHEEL, ["tatolab/testpattern/__init__.py"]);
  }
  for (const binaryName of binaryNames) {
    await writeFile(path.join(runtimeUnitDirectory, "bin", binaryName), "");
    await chmod(path.join(runtimeUnitDirectory, "bin", binaryName), 0o755);
  }
  return runtimeUnitDirectory;
}

async function plantAWheelInTheUnitsImports(runtimeUnitDirectory: string, wheelFileName: string, wheelMemberPaths: string[]): Promise<void> {
  const wheelSourceDirectory = await mkdtemp(path.join(scratchDirectory, "wheel-source-"));
  for (const wheelMemberPath of wheelMemberPaths) {
    await mkdir(path.dirname(path.join(wheelSourceDirectory, wheelMemberPath)), { recursive: true });
    await writeFile(path.join(wheelSourceDirectory, wheelMemberPath), "");
  }
  const importsDirectory = path.join(runtimeUnitDirectory, "lib", "tatolab", "imports");
  await mkdir(importsDirectory, { recursive: true });
  execFileSync("zip", ["-q", "-r", path.join(importsDirectory, wheelFileName), ...wheelMemberPaths], { cwd: wheelSourceDirectory });
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


test("a unit with no lib/tatolab/imports is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, ["lend"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("is missing lib/tatolab/imports");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit whose lib/tatolab/imports holds no wheel is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, ["lend"]);
  await mkdir(path.join(runtimeUnitDirectory, "lib", "tatolab", "imports"));
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("carries no first-party module wheel");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit whose lib/tatolab/imports holds something but wheels is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  await writeFile(path.join(runtimeUnitDirectory, "lib", "tatolab", "imports", "tatolab-ops"), "");
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("lib/tatolab/imports/tatolab-ops, which is not a wheel");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a first-party module wheel carrying native code is refused, naming the member, and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  await plantAWheelInTheUnitsImports(runtimeUnitDirectory, "tatolab_compositor-0.68.54-cp312-cp312-macosx_26_0_arm64.whl", [
    "tatolab/compositor/__init__.py",
    "tatolab/compositor/_native.cpython-312-darwin.so",
  ]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("tatolab/compositor/_native.cpython-312-darwin.so is native code");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit that carries the browser host is refused, naming it, and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, [...PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES, "browser-host"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("lib/tatolab/browser-host");
  expect(assembleOutcome.stderr).toContain("without CEF_PATH");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});
