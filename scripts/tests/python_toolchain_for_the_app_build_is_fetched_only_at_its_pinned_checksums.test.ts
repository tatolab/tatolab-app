// scripts/fetch-python-toolchain-for-the-app-build.sh lays out uv and the built-in Python as the
// bundle scripts and the app read them, and refuses an archive whose checksum is not the pinned
// one before it opens it. The tests plant archives and pin their checksums, which the script
// reads only with --from-directory.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FETCH_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "fetch-python-toolchain-for-the-app-build.sh");
const BUILT_IN_PYTHON_FOLDER_NAME = "cpython-3.12.15+20261013";
const UV_ARCHIVE_NAME = "uv-aarch64-apple-darwin.tar.gz";
const BUILT_IN_PYTHON_ARCHIVE_NAME = `${BUILT_IN_PYTHON_FOLDER_NAME}-aarch64-apple-darwin-install_only_stripped.tar.gz`;

interface ScriptOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runProgram(program: string, programArguments: string[], environment: NodeJS.ProcessEnv = process.env): Promise<ScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(program, programArguments, { cwd: REPOSITORY_ROOT, env: environment }, (programFailure, stdout, stderr) => {
      const exitCode = programFailure === null ? 0 : typeof programFailure.code === "number" ? programFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

async function sha256Of(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

let scratchDirectory = "";
let plantedArchivesDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-python-toolchain-"));
  plantedArchivesDirectory = path.join(scratchDirectory, "archives");
  const archiveSources = path.join(scratchDirectory, "archive-sources");
  await mkdir(path.join(archiveSources, "uv-aarch64-apple-darwin"), { recursive: true });
  await writeFile(path.join(archiveSources, "uv-aarch64-apple-darwin", "uv"), "#!/bin/sh\n");
  await chmod(path.join(archiveSources, "uv-aarch64-apple-darwin", "uv"), 0o755);
  await mkdir(path.join(archiveSources, "python", "bin"), { recursive: true });
  await writeFile(path.join(archiveSources, "python", "bin", "python3"), "#!/bin/sh\n");
  await chmod(path.join(archiveSources, "python", "bin", "python3"), 0o755);
  await mkdir(plantedArchivesDirectory, { recursive: true });
  await runProgram("tar", ["-czf", path.join(plantedArchivesDirectory, UV_ARCHIVE_NAME), "-C", archiveSources, "uv-aarch64-apple-darwin"]);
  await runProgram("tar", ["-czf", path.join(plantedArchivesDirectory, BUILT_IN_PYTHON_ARCHIVE_NAME), "-C", archiveSources, "python"]);
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function fetchFromThePlantedArchives(pinnedUvSha256: string, pinnedBuiltInPythonSha256: string): Promise<ScriptOutcome & { destination: string }> {
  const destination = path.join(scratchDirectory, "python-toolchain");
  const outcome = await runProgram("bash", [FETCH_SCRIPT, destination, "macos-arm64", "--from-directory", plantedArchivesDirectory], {
    ...process.env,
    UV_ARCHIVE_SHA256: pinnedUvSha256,
    BUILT_IN_PYTHON_ARCHIVE_SHA256: pinnedBuiltInPythonSha256,
  });
  return { ...outcome, destination };
}

test("archives at their pinned checksums are laid out as uv and python/<python-build-standalone's name>", async () => {
  const fetched = await fetchFromThePlantedArchives(
    await sha256Of(path.join(plantedArchivesDirectory, UV_ARCHIVE_NAME)),
    await sha256Of(path.join(plantedArchivesDirectory, BUILT_IN_PYTHON_ARCHIVE_NAME)),
  );

  expect(fetched.exitCode).toBe(0);
  expect(fetched.stdout.trim().split("\n").at(-1)).toBe(fetched.destination);
  expect((await readdir(fetched.destination)).sort()).toEqual(["python", "uv"]);
  expect(((await stat(path.join(fetched.destination, "uv"))).mode & 0o111) !== 0).toBe(true);
  expect(await readdir(path.join(fetched.destination, "python"))).toEqual([BUILT_IN_PYTHON_FOLDER_NAME]);
  expect(await readFile(path.join(fetched.destination, "python", BUILT_IN_PYTHON_FOLDER_NAME, "bin", "python3"), "utf8")).toBe("#!/bin/sh\n");
});

test("an archive whose checksum is not the pinned one is refused before it is opened", async () => {
  const fetched = await fetchFromThePlantedArchives("0".repeat(64), await sha256Of(path.join(plantedArchivesDirectory, BUILT_IN_PYTHON_ARCHIVE_NAME)));

  expect(fetched.exitCode).toBe(1);
  expect(fetched.stderr).toContain(`${UV_ARCHIVE_NAME} has sha256`);
  expect(fetched.stderr).toContain(`not the pinned ${"0".repeat(64)}: refusing it`);
  expect(await readdir(fetched.destination)).not.toContain("uv");
});
