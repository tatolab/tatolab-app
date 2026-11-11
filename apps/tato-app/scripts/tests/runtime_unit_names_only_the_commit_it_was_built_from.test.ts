// scripts/build-tatolab-runtime-unit.sh writes the unit's streamlib-commit only after a build that
// succeeded from a clean checkout: a build that fails leaves no streamlib-commit vouching for a
// unit it half rebuilt, nothing a previous build laid out outlives the next one, and a checkout with
// uncommitted changes is refused before anything builds.
// The Developer ID the build names reaches xtask, which signs the code inside the carried archives.
// A stand-in `cargo` first on PATH plays streamlib's `cargo xtask build-runtime`.

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const TATO_APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_RUNTIME_UNIT_SCRIPT = path.join(TATO_APP_ROOT, "scripts", "build-tatolab-runtime-unit.sh");
const GIT_IDENTITY_ENVIRONMENT = {
  GIT_AUTHOR_NAME: "streamlib stand-in",
  GIT_AUTHOR_EMAIL: "stand-in@example.invalid",
  GIT_COMMITTER_NAME: "streamlib stand-in",
  GIT_COMMITTER_EMAIL: "stand-in@example.invalid",
};
// Plays `cargo xtask build-runtime`: lays a whole unit into $CARGO_TARGET_DIR/tatolab-runtime, or
// with STAND_IN_CARGO_FAILS=1 replaces only part of it and fails, as a build cut off part-way does.
// Like xtask, it stages the browser host only when CEF_PATH names a CEF distribution.
const STAND_IN_CARGO_SCRIPT = `#!/bin/sh
touch "$STAND_IN_CARGO_RAN_SENTINEL"
printf '%s\n' "$@" > "$STAND_IN_CARGO_RAN_SENTINEL"
unit="$CARGO_TARGET_DIR/tatolab-runtime"
mkdir -p "$unit/bin" "$unit/lib/tatolab/lend/tatolab/runtime"
echo replaced > "$unit/lib/tatolab/lend/tatolab/runtime/__init__.py"
[ "$STAND_IN_CARGO_FAILS" = 1 ] && exit 1
for binary in tatolabd tatolab uv; do echo built > "$unit/bin/$binary"; done
mkdir -p "$unit/lib/tatolab/imports" "$unit/lib/tatolab/carried-wheels" "$unit/lib/tatolab/python-downloads"
echo '{}' > "$unit/lib/tatolab/python-downloads/uv-python-downloads.json"
[ -n "$CEF_PATH" ] && mkdir -p "$unit/lib/tatolab/browser-host"
exit 0
`;

interface ProgramOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let scratchDirectory = "";
let plantedStreamlibCheckout = "";
let standInCargoDirectory = "";
let standInCargoRanSentinel = "";

function runProgram(program: string, programArguments: string[], workingDirectory: string, extraEnvironment: Record<string, string> = {}): Promise<ProgramOutcome> {
  return new Promise((resolveOutcome) => {
    const environment = {
      ...process.env,
      ...GIT_IDENTITY_ENVIRONMENT,
      PATH: `${standInCargoDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      STAND_IN_CARGO_RAN_SENTINEL: standInCargoRanSentinel,
      ...extraEnvironment,
    };
    execFile(program, programArguments, { cwd: workingDirectory, env: environment }, (programFailure, stdout, stderr) => {
      const exitCode = programFailure === null ? 0 : typeof programFailure.code === "number" ? programFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

async function runGitInTheCheckout(gitArguments: string[]): Promise<string> {
  const gitOutcome = await runProgram("git", gitArguments, plantedStreamlibCheckout);
  expect(gitOutcome, `git ${gitArguments.join(" ")}`).toMatchObject({ exitCode: 0 });
  return gitOutcome.stdout.trim();
}

function buildTheRuntimeUnit(extraEnvironment: Record<string, string> = {}, buildFlags: string[] = []): Promise<ProgramOutcome> {
  return runProgram("bash", [BUILD_RUNTIME_UNIT_SCRIPT, plantedStreamlibCheckout, ...buildFlags], TATO_APP_ROOT, extraEnvironment);
}

const A_DEVELOPER_ID_APPLICATION_IDENTITY = "Developer ID Application: Tatolab stand-in (TEAMID1234)";

function unitStreamlibCommitFile(): string {
  return path.join(plantedStreamlibCheckout, "target", "tatolab-runtime", "streamlib-commit");
}

async function standInCargoRan(): Promise<boolean> {
  return stat(standInCargoRanSentinel).then(
    () => true,
    () => false,
  );
}

beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-runtime-unit-"));
  plantedStreamlibCheckout = path.join(scratchDirectory, "streamlib");
  standInCargoDirectory = path.join(scratchDirectory, "stand-in-cargo");
  standInCargoRanSentinel = path.join(scratchDirectory, "stand-in-cargo-ran");
  await mkdir(standInCargoDirectory, { recursive: true });
  await writeFile(path.join(standInCargoDirectory, "cargo"), STAND_IN_CARGO_SCRIPT);
  await chmod(path.join(standInCargoDirectory, "cargo"), 0o755);
  await mkdir(path.join(plantedStreamlibCheckout, "xtask"), { recursive: true });
  await writeFile(path.join(plantedStreamlibCheckout, "xtask", "Cargo.toml"), "[package]\nname = \"xtask\"\n");
  await writeFile(path.join(plantedStreamlibCheckout, ".gitignore"), "/target\n");
  await runGitInTheCheckout(["init", "-q"]);
  await runGitInTheCheckout(["add", "."]);
  await runGitInTheCheckout(["commit", "-q", "-m", "streamlib stand-in"]);
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

test("a build that succeeds names the checkout's commit in the unit", async () => {
  const checkoutCommit = await runGitInTheCheckout(["rev-parse", "HEAD"]);
  const buildOutcome = await buildTheRuntimeUnit();
  expect(buildOutcome.exitCode).toBe(0);
  expect(buildOutcome.stdout.trim()).toBe(path.join(plantedStreamlibCheckout, "target", "tatolab-runtime"));
  expect(await readFile(unitStreamlibCommitFile(), "utf8")).toBe(`${checkoutCommit}\n`);
});

test("a build that fails part-way leaves no streamlib-commit from the unit's previous build", async () => {
  expect(await buildTheRuntimeUnit()).toMatchObject({ exitCode: 0 });
  await writeFile(path.join(plantedStreamlibCheckout, "xtask", "Cargo.toml"), "[package]\nname = \"xtask\"\nversion = \"next\"\n");
  await runGitInTheCheckout(["commit", "-q", "-am", "the next streamlib commit"]);
  const buildOutcome = await buildTheRuntimeUnit({ STAND_IN_CARGO_FAILS: "1" });
  expect(buildOutcome.exitCode).not.toBe(0);
  await expect(readFile(unitStreamlibCommitFile(), "utf8")).rejects.toThrow();
});

test("a file an earlier build laid into the unit and this one does not is gone from the unit", async () => {
  expect(await buildTheRuntimeUnit()).toMatchObject({ exitCode: 0 });
  const leftByAnEarlierBuild = path.join(plantedStreamlibCheckout, "target", "tatolab-runtime", "bin", "moq-relay");
  await writeFile(leftByAnEarlierBuild, "built by an earlier streamlib");
  expect(await buildTheRuntimeUnit()).toMatchObject({ exitCode: 0 });
  await expect(stat(leftByAnEarlierBuild)).rejects.toThrow();
});

test("a checkout with uncommitted changes is refused before anything builds", async () => {
  await writeFile(path.join(plantedStreamlibCheckout, "xtask", "Cargo.toml"), "[package]\nname = \"edited by hand\"\n");
  const buildOutcome = await buildTheRuntimeUnit();
  expect(buildOutcome.exitCode).toBe(1);
  expect(buildOutcome.stderr).toContain("uncommitted changes");
  expect(await standInCargoRan()).toBe(false);
});

test("the unit is built without the browser host even when CEF_PATH is set", async () => {
  const buildOutcome = await buildTheRuntimeUnit({ CEF_PATH: path.join(scratchDirectory, "a-cef-distribution") });
  expect(buildOutcome).toMatchObject({ exitCode: 0 });
  await expect(stat(path.join(plantedStreamlibCheckout, "target", "tatolab-runtime", "lib", "tatolab", "imports"))).resolves.toBeTruthy();
  await expect(stat(path.join(plantedStreamlibCheckout, "target", "tatolab-runtime", "lib", "tatolab", "browser-host"))).rejects.toThrow();
});

test("the Developer ID the build names reaches xtask, which signs the code inside the carried archives", async () => {
  const buildOutcome = await buildTheRuntimeUnit({}, ["--developer-id-application-identity", A_DEVELOPER_ID_APPLICATION_IDENTITY]);
  expect(buildOutcome.exitCode).toBe(0);
  expect((await readFile(standInCargoRanSentinel, "utf8")).split("\n")).toEqual([
    "xtask",
    "build-runtime",
    "--release",
    "--macos-developer-id-application-identity",
    A_DEVELOPER_ID_APPLICATION_IDENTITY,
    "",
  ]);
});

test("an identity that is not a Developer ID Application one is refused before anything builds", async () => {
  const buildOutcome = await buildTheRuntimeUnit({}, ["--developer-id-application-identity", "Apple Development: someone (TEAMID1234)"]);
  expect(buildOutcome.exitCode).toBe(1);
  expect(buildOutcome.stderr).toContain("is not a 'Developer ID Application: …' identity");
  expect(await standInCargoRan()).toBe(false);
});
