// scripts/place-tatolab-runtime-client.sh places @tatolab/runtime-client in the workspace's
// node_modules: the files its package.json lists, fetched from streamlib at the pinned commit and
// kept while the pin holds, or a runtime unit's own copy when that copy serves the pinned contract
// version. Each test copies the script into a scratch workspace and fetches from a planted streamlib.

import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const PLACE_RUNTIME_CLIENT_SCRIPT = fileURLToPath(new URL("../place-tatolab-runtime-client.sh", import.meta.url));
const GIT_IDENTITY_ENVIRONMENT = {
  GIT_AUTHOR_NAME: "streamlib stand-in",
  GIT_AUTHOR_EMAIL: "stand-in@example.invalid",
  GIT_COMMITTER_NAME: "streamlib stand-in",
  GIT_COMMITTER_EMAIL: "stand-in@example.invalid",
};

interface ProgramOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let scratchDirectory = "";
let scratchWorkspace = "";
let plantedStreamlib = "";

function runProgram(program: string, programArguments: string[], workingDirectory: string): Promise<ProgramOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(program, programArguments, { cwd: workingDirectory, env: { ...process.env, ...GIT_IDENTITY_ENVIRONMENT } }, (programFailure, stdout, stderr) => {
      const exitCode = programFailure === null ? 0 : typeof programFailure.code === "number" ? programFailure.code : 1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

/** Writes a runtime client package serving `contractVersion` into `packageDirectory`, with one file its package.json does not list. */
async function writeRuntimeClientPackage(packageDirectory: string, contractVersion: number, clientSourceText: string): Promise<void> {
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(path.join(packageDirectory, "package.json"), JSON.stringify({ name: "@tatolab/runtime-client", files: ["index.js", "contract.json"] }));
  await writeFile(path.join(packageDirectory, "index.js"), clientSourceText);
  await writeFile(path.join(packageDirectory, "contract.json"), JSON.stringify({ openrpc: "1.3.2", info: { "x-contract-version": contractVersion } }));
  await writeFile(path.join(packageDirectory, "unlisted_test_helper.mjs"), "not placed");
}

/** Commits a runtime client package in the planted streamlib and pins the scratch workspace to that commit. */
async function commitAndPinARuntimeClient(contractVersion: number, clientSourceText: string): Promise<string> {
  await writeRuntimeClientPackage(path.join(plantedStreamlib, "sdk", "tatolab-runtime-client"), contractVersion, clientSourceText);
  await runProgram("git", ["add", "-A"], plantedStreamlib);
  await runProgram("git", ["commit", "-q", "-m", `runtime client ${clientSourceText}`], plantedStreamlib);
  const commit = (await runProgram("git", ["rev-parse", "HEAD"], plantedStreamlib)).stdout.trim();
  await writeFile(path.join(scratchWorkspace, "apps", "tato-app", "tatolab-runtime-client-pin.json"), JSON.stringify({ streamlib_commit: commit }));
  return commit;
}

function placeTheRuntimeClient(...placeArguments: string[]): Promise<ProgramOutcome> {
  return runProgram(path.join(scratchWorkspace, "apps", "tato-app", "scripts", "place-tatolab-runtime-client.sh"), placeArguments, scratchWorkspace);
}

const placedPackage = () => path.join(scratchWorkspace, "node_modules", "@tatolab", "runtime-client");

beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "place-runtime-client-"));
  scratchWorkspace = path.join(scratchDirectory, "workspace");
  plantedStreamlib = path.join(scratchDirectory, "streamlib");
  await mkdir(path.join(scratchWorkspace, "apps", "tato-app", "scripts"), { recursive: true });
  await copyFile(PLACE_RUNTIME_CLIENT_SCRIPT, path.join(scratchWorkspace, "apps", "tato-app", "scripts", "place-tatolab-runtime-client.sh"));
  await mkdir(plantedStreamlib);
  await runProgram("git", ["init", "-q"], plantedStreamlib);
});

afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

test("the pinned commit's package is placed with only the files its package.json lists, and kept without a fetch while the pin holds", async () => {
  const pinnedCommit = await commitAndPinARuntimeClient(2, "pinned client");

  const placed = await placeTheRuntimeClient("--from-repository", plantedStreamlib);

  expect(placed.exitCode, placed.stderr).toBe(0);
  expect((await readdir(placedPackage())).sort()).toEqual([".placed-from", "contract.json", "index.js", "package.json"]);
  expect(await readFile(path.join(placedPackage(), "index.js"), "utf8")).toBe("pinned client");
  expect(await readFile(path.join(placedPackage(), ".placed-from"), "utf8")).toBe(`streamlib ${pinnedCommit}\n`);

  const placedAgain = await placeTheRuntimeClient("--from-repository", path.join(scratchDirectory, "no-streamlib-here"));
  expect(placedAgain.exitCode, placedAgain.stderr).toBe(0);
});

test("a new pin is fetched over the package an earlier pin placed", async () => {
  await commitAndPinARuntimeClient(2, "earlier client");
  await placeTheRuntimeClient("--from-repository", plantedStreamlib);
  await commitAndPinARuntimeClient(2, "later client");

  const placed = await placeTheRuntimeClient("--from-repository", plantedStreamlib);

  expect(placed.exitCode, placed.stderr).toBe(0);
  expect(await readFile(path.join(placedPackage(), "index.js"), "utf8")).toBe("later client");
});

test("a runtime unit's copy serving the pinned contract version takes the pinned copy's place", async () => {
  await commitAndPinARuntimeClient(2, "pinned client");
  const runtimeUnit = path.join(scratchDirectory, "tatolab-runtime");
  await writeRuntimeClientPackage(path.join(runtimeUnit, "lib", "tatolab", "runtime-client"), 2, "the unit's client");

  const placed = await placeTheRuntimeClient("--from-repository", plantedStreamlib, "--from-runtime-unit", runtimeUnit);

  expect(placed.exitCode, placed.stderr).toBe(0);
  expect(await readFile(path.join(placedPackage(), "index.js"), "utf8")).toBe("the unit's client");
  expect(await readFile(path.join(placedPackage(), ".placed-from"), "utf8")).toBe(`runtime unit ${runtimeUnit}\n`);
});

test("a runtime unit serving another contract version is refused naming both, and the pinned copy stays", async () => {
  const pinnedCommit = await commitAndPinARuntimeClient(2, "pinned client");
  const runtimeUnit = path.join(scratchDirectory, "tatolab-runtime");
  await writeRuntimeClientPackage(path.join(runtimeUnit, "lib", "tatolab", "runtime-client"), 3, "a later unit's client");

  const placed = await placeTheRuntimeClient("--from-repository", plantedStreamlib, "--from-runtime-unit", runtimeUnit);

  expect(placed.exitCode).toBe(1);
  expect(placed.stderr).toContain(`runtime unit ${runtimeUnit} serves control contract version 3; Tato Studio is pinned to version 2 (streamlib ${pinnedCommit}`);
  expect(await readFile(path.join(placedPackage(), "index.js"), "utf8")).toBe("pinned client");
});

test("a runtime unit carrying no runtime client is refused", async () => {
  await commitAndPinARuntimeClient(2, "pinned client");
  const runtimeUnit = path.join(scratchDirectory, "tatolab-runtime");
  await mkdir(path.join(runtimeUnit, "lib", "tatolab"), { recursive: true });

  const placed = await placeTheRuntimeClient("--from-repository", plantedStreamlib, "--from-runtime-unit", runtimeUnit);

  expect(placed.exitCode).toBe(1);
  expect(placed.stderr).toContain(`runtime unit ${runtimeUnit} carries no lib/tatolab/runtime-client`);
});

test("a streamlib that cannot be reached exits 3 naming the pinned commit, placing nothing", async () => {
  const pinnedCommit = await commitAndPinARuntimeClient(2, "pinned client");

  const placed = await placeTheRuntimeClient("--from-repository", path.join(scratchDirectory, "no-streamlib-here"));

  expect(placed.exitCode).toBe(3);
  expect(placed.stderr).toContain(`streamlib ${pinnedCommit} could not be fetched`);
  await expect(readdir(placedPackage())).rejects.toThrow();
});
