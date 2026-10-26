// scripts/tatolab_app_build_features.mjs writes the build features from a build's flags and the
// tatolab-app commit it runs at, and reads them back out of a packaged app.asar: `read` refuses an
// asar that carries no build id, and `read --shipping` one planted with the test root or with any
// update feed but the shipping one. The writer runs as a copy inside a scratch git checkout, so
// the commit it records and whether that checkout is modified are the test's own.

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage } from "@electron/asar";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_FEATURES_SCRIPT_IN_THE_REPOSITORY = path.join("scripts", "tatolab_app_build_features.mjs");
const COMMITTED_BUILD_FEATURES_IN_THE_REPOSITORY = path.join("src", "main", "tatolab_app_build_features.json");
const SHIPPING_BUILD_FEATURES = { machineDirectoriesUnderATestRoot: false, appUpdateFeedUrl: "https://get.tatolab.com/app/" };
const LOCAL_APP_UPDATE_FEED_URL = "http://127.0.0.1:8765/app/";
const PACKAGED_TATOLAB_APP_COMMIT = "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1";
const PACKAGED_BUILD_ID = { tatolabAppCommit: PACKAGED_TATOLAB_APP_COMMIT, buildKind: "release", builtWithUncommittedChanges: false };
const PACKAGED_BUILD_FEATURES = { ...SHIPPING_BUILD_FEATURES, tatolabAppBuildId: PACKAGED_BUILD_ID };
const PACKAGED_BUILD_ID_LINES = `tatolabAppCommit=${PACKAGED_TATOLAB_APP_COMMIT}\nbuildKind=release\nbuiltWithUncommittedChanges=false\n`;

interface ProgramOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runProgram(program: string, programArguments: string[], workingDirectory: string): Promise<ProgramOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(program, programArguments, { cwd: workingDirectory }, (programFailure, stdout, stderr) => {
      const exitCode = programFailure === null ? 0 : typeof programFailure.code === "number" ? programFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

let scratchDirectory = "";
let scratchCheckout = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-build-features-"));
  scratchCheckout = path.join(scratchDirectory, "tatolab-app");
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

function runGitInTheScratchCheckout(gitArguments: string[]): Promise<ProgramOutcome> {
  return runProgram("git", ["-c", "user.name=Tatolab Test", "-c", "user.email=test@tatolab.invalid", "-c", "commit.gpgsign=false", ...gitArguments], scratchCheckout);
}

/** A git checkout holding the script and the committed build features, at one commit; its `node_modules` links this repository's. */
async function scratchCheckoutAtOneCommit(): Promise<string> {
  for (const fileInTheRepository of [BUILD_FEATURES_SCRIPT_IN_THE_REPOSITORY, COMMITTED_BUILD_FEATURES_IN_THE_REPOSITORY]) {
    await cp(path.join(REPOSITORY_ROOT, fileInTheRepository), path.join(scratchCheckout, fileInTheRepository));
  }
  await symlink(path.join(REPOSITORY_ROOT, "node_modules"), path.join(scratchCheckout, "node_modules"));
  await writeFile(path.join(scratchCheckout, ".gitignore"), "node_modules\nout/\n");
  for (const gitArguments of [["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", "scratch"]]) {
    expect(await runGitInTheScratchCheckout(gitArguments)).toMatchObject({ exitCode: 0 });
  }
  const headCommit = await runGitInTheScratchCheckout(["rev-parse", "HEAD"]);
  return headCommit.stdout.trim();
}

function runTheBuildFeaturesScript(scriptArguments: string[]): Promise<ProgramOutcome> {
  return runProgram(process.execPath, [path.join(scratchCheckout, BUILD_FEATURES_SCRIPT_IN_THE_REPOSITORY), ...scriptArguments], scratchCheckout);
}

async function writtenBuildFeaturesFor(writerFlags: string[]): Promise<unknown> {
  const writtenFeaturesFile = path.join(scratchCheckout, "out", "main", "tatolab_app_build_features.json");
  await mkdir(path.dirname(writtenFeaturesFile), { recursive: true });
  const writerOutcome = await runTheBuildFeaturesScript(["write", writtenFeaturesFile, ...writerFlags]);
  expect(writerOutcome).toMatchObject({ exitCode: 0 });
  return JSON.parse(await readFile(writtenFeaturesFile, "utf8"));
}

async function appAsarPlantedWith(plantedFeaturesSource: string | null): Promise<string> {
  const stagedAppDirectory = path.join(scratchDirectory, "staged-app");
  await mkdir(path.join(stagedAppDirectory, "out", "main"), { recursive: true });
  await writeFile(path.join(stagedAppDirectory, "package.json"), "{}\n");
  if (plantedFeaturesSource !== null) {
    await writeFile(path.join(stagedAppDirectory, "out", "main", "tatolab_app_build_features.json"), plantedFeaturesSource);
  }
  const appAsar = path.join(scratchDirectory, "app.asar");
  await createPackage(stagedAppDirectory, appAsar);
  return appAsar;
}

test("the committed build features are the shipping ones, with no build id", async () => {
  const committedFeatures = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, COMMITTED_BUILD_FEATURES_IN_THE_REPOSITORY), "utf8"));
  expect(committedFeatures).toEqual({ ...SHIPPING_BUILD_FEATURES, tatolabAppBuildId: null });
});

test("a build without flags writes the shipping features and a dev build id at the checkout's commit", async () => {
  const headCommit = await scratchCheckoutAtOneCommit();
  expect(await writtenBuildFeaturesFor([])).toEqual({
    ...SHIPPING_BUILD_FEATURES,
    tatolabAppBuildId: { tatolabAppCommit: headCommit, buildKind: "dev", builtWithUncommittedChanges: false },
  });
});

test("a release build writes a release build id", async () => {
  const headCommit = await scratchCheckoutAtOneCommit();
  expect(await writtenBuildFeaturesFor(["--release"])).toEqual({
    ...SHIPPING_BUILD_FEATURES,
    tatolabAppBuildId: { tatolabAppCommit: headCommit, buildKind: "release", builtWithUncommittedChanges: false },
  });
});

test.each([
  ["a tracked file changed", "scripts/tatolab_app_build_features.mjs"],
  ["an untracked file added", "src/main/a_file_not_yet_committed.ts"],
])("a build from a checkout with %s records that it was built with uncommitted changes", async (_change, changedFile) => {
  const headCommit = await scratchCheckoutAtOneCommit();
  const changedFileInTheCheckout = path.join(scratchCheckout, changedFile);
  await writeFile(changedFileInTheCheckout, `${await readFile(changedFileInTheCheckout, "utf8").catch(() => "")}\n// changed\n`);
  expect(await writtenBuildFeaturesFor([])).toEqual({
    ...SHIPPING_BUILD_FEATURES,
    tatolabAppBuildId: { tatolabAppCommit: headCommit, buildKind: "dev", builtWithUncommittedChanges: true },
  });
});

test("a local-proof build writes the test root, keeps the shipping feed and is dev", async () => {
  const headCommit = await scratchCheckoutAtOneCommit();
  expect(await writtenBuildFeaturesFor(["--local-proof-test-root"])).toEqual({
    machineDirectoriesUnderATestRoot: true,
    appUpdateFeedUrl: SHIPPING_BUILD_FEATURES.appUpdateFeedUrl,
    tatolabAppBuildId: { tatolabAppCommit: headCommit, buildKind: "dev", builtWithUncommittedChanges: false },
  });
});

test("a local-proof build with a local feed writes both", async () => {
  await scratchCheckoutAtOneCommit();
  expect(await writtenBuildFeaturesFor(["--local-proof-test-root", "--app-update-feed-url", LOCAL_APP_UPDATE_FEED_URL])).toMatchObject({
    machineDirectoriesUnderATestRoot: true,
    appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL,
  });
});

test.each([
  ["a feed URL without the test root", ["--app-update-feed-url", LOCAL_APP_UPDATE_FEED_URL], "--app-update-feed-url needs --local-proof-test-root"],
  ["a release with the test root", ["--release", "--local-proof-test-root"], "--release and --local-proof-test-root together"],
  ["a feed that is not a URL", ["--local-proof-test-root", "--app-update-feed-url", "not a url"], "usage:"],
  ["an unknown flag", ["--shipping"], "usage:"],
])("the writer refuses %s and writes nothing", async (_refusedCase, writerFlags, expectedRefusal) => {
  await scratchCheckoutAtOneCommit();
  const writtenFeaturesFile = path.join(scratchDirectory, "tatolab_app_build_features.json");
  const writerOutcome = await runTheBuildFeaturesScript(["write", writtenFeaturesFile, ...writerFlags]);
  expect(writerOutcome.exitCode).toBe(2);
  expect(writerOutcome.stderr).toContain(expectedRefusal);
  await expect(readFile(writtenFeaturesFile, "utf8")).rejects.toThrow();
});

test("the writer refuses a build outside a git checkout, which has no commit to record, and writes nothing", async () => {
  await scratchCheckoutAtOneCommit();
  await rm(path.join(scratchCheckout, ".git"), { recursive: true, force: true });
  const writtenFeaturesFile = path.join(scratchDirectory, "tatolab_app_build_features.json");
  const writerOutcome = await runTheBuildFeaturesScript(["write", writtenFeaturesFile]);
  expect(writerOutcome.exitCode).toBe(1);
  expect(writerOutcome.stderr).toContain("every build records the tatolab-app commit it was built from");
  expect(writerOutcome.stderr.toLowerCase()).toContain("not a git repository");
  await expect(readFile(writtenFeaturesFile, "utf8")).rejects.toThrow();
});

test("what the writer writes, read back out of an asar, is the commit it was built at", async () => {
  const headCommit = await scratchCheckoutAtOneCommit();
  const writtenFeatures = await writtenBuildFeaturesFor(["--release"]);
  const appAsar = await appAsarPlantedWith(JSON.stringify(writtenFeatures));
  expect(await runTheBuildFeaturesScript(["read", appAsar, "--shipping"])).toEqual({
    exitCode: 0,
    stdout:
      "machineDirectoriesUnderATestRoot=false\nappUpdateFeedUrl=https://get.tatolab.com/app/\n" +
      `tatolabAppCommit=${headCommit}\nbuildKind=release\nbuiltWithUncommittedChanges=false\n`,
    stderr: "",
  });
});

test("read prints a shipping asar's features and --shipping passes it, a dev build id included", async () => {
  await scratchCheckoutAtOneCommit();
  const appAsar = await appAsarPlantedWith(JSON.stringify(PACKAGED_BUILD_FEATURES));
  expect(await runTheBuildFeaturesScript(["read", appAsar])).toEqual({
    exitCode: 0,
    stdout: `machineDirectoriesUnderATestRoot=false\nappUpdateFeedUrl=https://get.tatolab.com/app/\n${PACKAGED_BUILD_ID_LINES}`,
    stderr: "",
  });
  const devBuildAsar = await appAsarPlantedWith(
    JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: { ...PACKAGED_BUILD_ID, buildKind: "dev", builtWithUncommittedChanges: true } }),
  );
  expect(await runTheBuildFeaturesScript(["read", devBuildAsar, "--shipping"])).toMatchObject({ exitCode: 0 });
});

test.each([
  ["the test root", { ...PACKAGED_BUILD_FEATURES, machineDirectoriesUnderATestRoot: true }, ["machineDirectoriesUnderATestRoot"]],
  ["a local update feed", { ...PACKAGED_BUILD_FEATURES, appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL }, [LOCAL_APP_UPDATE_FEED_URL]],
  [
    "the test root and a local update feed",
    { ...PACKAGED_BUILD_FEATURES, machineDirectoriesUnderATestRoot: true, appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL },
    ["machineDirectoriesUnderATestRoot", LOCAL_APP_UPDATE_FEED_URL],
  ],
])("read --shipping refuses an asar planted with %s", async (_plantedCase, plantedFeatures, expectedRefusals) => {
  await scratchCheckoutAtOneCommit();
  const appAsar = await appAsarPlantedWith(JSON.stringify(plantedFeatures));
  const shippingOutcome = await runTheBuildFeaturesScript(["read", appAsar, "--shipping"]);
  expect(shippingOutcome.exitCode).toBe(1);
  for (const expectedRefusal of expectedRefusals) expect(shippingOutcome.stderr).toContain(expectedRefusal);
  expect(await runTheBuildFeaturesScript(["read", appAsar])).toMatchObject({ exitCode: 0 });
});

test.each([
  ["a build id of null, as the committed features carry", JSON.stringify({ ...SHIPPING_BUILD_FEATURES, tatolabAppBuildId: null })],
  ["no build id", JSON.stringify(SHIPPING_BUILD_FEATURES)],
])("read refuses an asar that carries %s, naming the missing build id, with or without --shipping", async (_plantedCase, plantedFeaturesSource) => {
  await scratchCheckoutAtOneCommit();
  const appAsar = await appAsarPlantedWith(plantedFeaturesSource);
  for (const readFlags of [[], ["--shipping"]]) {
    const readOutcome = await runTheBuildFeaturesScript(["read", appAsar, ...readFlags]);
    expect(readOutcome.exitCode).toBe(1);
    expect(readOutcome.stdout).toBe("");
    expect(readOutcome.stderr).toContain("carries no build id");
  }
});

test.each([
  ["no build features", null],
  ["build features that are not JSON", "machineDirectoriesUnderATestRoot: false"],
  ["a build feature missing", JSON.stringify({ machineDirectoriesUnderATestRoot: false, tatolabAppBuildId: PACKAGED_BUILD_ID })],
  ["a build feature of the wrong type", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, machineDirectoriesUnderATestRoot: "false" })],
  ["an extra build feature", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, plantedFeature: true })],
  ["a short commit", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: { ...PACKAGED_BUILD_ID, tatolabAppCommit: "22b07a1" } })],
  ["a commit that is not hex", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: { ...PACKAGED_BUILD_ID, tatolabAppCommit: "z".repeat(40) } })],
  ["an unknown build kind", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: { ...PACKAGED_BUILD_ID, buildKind: "local-proof" } })],
  ["a build id as one string", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: "22b07a1-release" })],
  ["a build id missing whether it was modified", JSON.stringify({ ...PACKAGED_BUILD_FEATURES, tatolabAppBuildId: { tatolabAppCommit: PACKAGED_TATOLAB_APP_COMMIT, buildKind: "release" } })],
])("read refuses an asar with %s, with or without --shipping", async (_plantedCase, plantedFeaturesSource) => {
  await scratchCheckoutAtOneCommit();
  const appAsar = await appAsarPlantedWith(plantedFeaturesSource);
  for (const readFlags of [[], ["--shipping"]]) {
    const readOutcome = await runTheBuildFeaturesScript(["read", appAsar, ...readFlags]);
    expect(readOutcome.exitCode).toBe(1);
    expect(readOutcome.stdout).toBe("");
    expect(readOutcome.stderr).toContain("tatolab_app_build_features.json");
  }
});
