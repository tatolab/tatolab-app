// scripts/assemble-tatolab-app-bundle.sh places everything the runtime unit ships: it refuses a
// unit without moq-relay or uv, which tatolabd runs from beside itself, or without the preview page
// tatolabd serves from Resources/watch, a unit whose bin/ or lib/tatolab/ holds something it does
// not place, a unit built from any streamlib commit but the one the build resolved, and a Python
// toolchain without uv or without exactly one built-in Python. Every refusal comes before it
// touches the bundle.

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSEMBLE_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "assemble-tatolab-app-bundle.sh");
const PLACED_RUNTIME_UNIT_BINARIES = ["moq-relay", "tatolab", "tatolabd", "uv"];
const PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES = ["lend", "watch"];
const RESOLVED_STREAMLIB_COMMIT = "ef5c8b22995a90b1f7ae671e214c96480615c911";
const AN_OLDER_STREAMLIB_COMMIT = "f2ec4338a0d1c2b3e4f5a6b7c8d9e0f1a2b3c4d5";

interface AssembleScriptOutcome {
  exitCode: number;
  stderr: string;
}

function runTheAssembleScript(
  appBundle: string,
  runtimeUnitDirectory: string,
  assembleFlags: string[] = [
    "--streamlib-commit",
    RESOLVED_STREAMLIB_COMMIT,
    "--python-toolchain",
    path.join(scratchDirectory, "python-toolchain"),
    "--installer",
    path.join(scratchDirectory, "install.sh"),
  ],
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
  plantedAppBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(plantedAppBundle, "Contents", "MacOS"), { recursive: true });
  await writeFile(path.join(plantedAppBundle, "Contents", "MacOS", "Tatolab"), "");
  await chmod(path.join(plantedAppBundle, "Contents", "MacOS", "Tatolab"), 0o755);
  await pythonToolchainPlantedWith({ hasUv: true, builtInPythonFolderNames: ["cpython-3.12.15+20261013"] });
  await writeFile(path.join(scratchDirectory, "install.sh"), "#!/bin/sh\n");
});

/** A Python toolchain as the fetch script lays it out, with or without its uv, holding these built-in Python folders. */
async function pythonToolchainPlantedWith({ hasUv, builtInPythonFolderNames }: { hasUv: boolean; builtInPythonFolderNames: string[] }): Promise<void> {
  const pythonToolchainDirectory = path.join(scratchDirectory, "python-toolchain");
  await rm(pythonToolchainDirectory, { recursive: true, force: true });
  await mkdir(path.join(pythonToolchainDirectory, "python"), { recursive: true });
  if (hasUv) {
    await writeFile(path.join(pythonToolchainDirectory, "uv"), "");
    await chmod(path.join(pythonToolchainDirectory, "uv"), 0o755);
  }
  for (const builtInPythonFolderName of builtInPythonFolderNames) {
    const interpreter = path.join(pythonToolchainDirectory, "python", builtInPythonFolderName, "bin", "python3");
    await mkdir(path.dirname(interpreter), { recursive: true });
    await writeFile(interpreter, "");
    await chmod(interpreter, 0o755);
  }
}
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
  if (libraryDirectoryNames.includes("watch")) {
    await writeFile(path.join(runtimeUnitDirectory, "lib", "tatolab", "watch", "index.html"), "");
  }
  for (const binaryName of binaryNames) {
    await writeFile(path.join(runtimeUnitDirectory, "bin", binaryName), "");
    await chmod(path.join(runtimeUnitDirectory, "bin", binaryName), 0o755);
  }
  return runtimeUnitDirectory;
}

test("a unit without moq-relay is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(["tatolab", "tatolabd"], PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("is missing bin/moq-relay");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit whose bin/ holds a binary the bundle does not place is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith([...PLACED_RUNTIME_UNIT_BINARIES, "tatolab-something-new"], PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("bin/tatolab-something-new");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit without the preview page is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, ["lend"]);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("is missing lib/tatolab/watch/index.html");
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

test("a Python toolchain with no uv is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  await pythonToolchainPlantedWith({ hasUv: false, builtInPythonFolderNames: ["cpython-3.12.15+20261013"] });
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("has no uv");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a Python toolchain with two built-in Pythons, or none, is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  for (const builtInPythonFolderNames of [["cpython-3.12.15+20261013", "cpython-3.13.9+20261013"], []]) {
    await pythonToolchainPlantedWith({ hasUv: true, builtInPythonFolderNames });
    const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
    expect(assembleOutcome.exitCode).toBe(1);
    expect(assembleOutcome.stderr).toContain(`holds ${builtInPythonFolderNames.length} built-in Pythons under python/, not one`);
    expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
  }
});

test("assembling without a Python toolchain is a usage error", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory, ["--streamlib-commit", RESOLVED_STREAMLIB_COMMIT]);
  expect(assembleOutcome.exitCode).toBe(2);
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("a unit without the uv tatolabd runs beside itself is refused and the bundle is untouched", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(["moq-relay", "tatolab", "tatolabd"], PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const assembleOutcome = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(assembleOutcome.exitCode).toBe(1);
  expect(assembleOutcome.stderr).toContain("is missing bin/uv");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});

test("assembling without streamlib's installer is a usage error, and a missing one is refused", async () => {
  const runtimeUnitDirectory = await runtimeUnitPlantedWith(PLACED_RUNTIME_UNIT_BINARIES, PLACED_RUNTIME_UNIT_LIBRARY_DIRECTORIES);
  const withoutTheInstallerFlag = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory, [
    "--streamlib-commit",
    RESOLVED_STREAMLIB_COMMIT,
    "--python-toolchain",
    path.join(scratchDirectory, "python-toolchain"),
  ]);
  expect(withoutTheInstallerFlag.exitCode).toBe(2);
  await rm(path.join(scratchDirectory, "install.sh"));
  const withAMissingInstaller = await runTheAssembleScript(plantedAppBundle, runtimeUnitDirectory);
  expect(withAMissingInstaller.exitCode).toBe(1);
  expect(withAMissingInstaller.stderr).toContain("no streamlib installer at");
  expect(await readdir(path.join(plantedAppBundle, "Contents"))).toEqual(["MacOS"]);
});
