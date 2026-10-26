// scripts/tatolab_app_build_features.mjs writes the build features from a build's flags, and reads
// them back out of a packaged app.asar: `read --shipping` refuses an asar planted with the test
// root or with any update feed but the shipping one.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage } from "@electron/asar";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_FEATURES_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "tatolab_app_build_features.mjs");
const SHIPPING_BUILD_FEATURES = { machineDirectoriesUnderATestRoot: false, appUpdateFeedUrl: "https://get.tatolab.com/app/" };
const LOCAL_APP_UPDATE_FEED_URL = "http://127.0.0.1:8765/app/";

interface BuildFeaturesScriptOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runTheBuildFeaturesScript(scriptArguments: string[]): Promise<BuildFeaturesScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(process.execPath, [BUILD_FEATURES_SCRIPT, ...scriptArguments], { cwd: REPOSITORY_ROOT }, (scriptFailure, stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

let scratchDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-build-features-"));
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function writtenBuildFeaturesFor(writerFlags: string[]): Promise<unknown> {
  const writtenFeaturesFile = path.join(scratchDirectory, "tatolab_app_build_features.json");
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

test("the committed build features are the shipping ones", async () => {
  const committedFeatures = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "src", "main", "tatolab_app_build_features.json"), "utf8"));
  expect(committedFeatures).toEqual(SHIPPING_BUILD_FEATURES);
});

test("a build without flags writes the shipping features", async () => {
  expect(await writtenBuildFeaturesFor([])).toEqual(SHIPPING_BUILD_FEATURES);
});

test("a local-proof build writes the test root and keeps the shipping feed", async () => {
  expect(await writtenBuildFeaturesFor(["--local-proof-test-root"])).toEqual({ ...SHIPPING_BUILD_FEATURES, machineDirectoriesUnderATestRoot: true });
});

test("a local-proof build with a local feed writes both", async () => {
  expect(await writtenBuildFeaturesFor(["--local-proof-test-root", "--app-update-feed-url", LOCAL_APP_UPDATE_FEED_URL])).toEqual({
    machineDirectoriesUnderATestRoot: true,
    appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL,
  });
});

test.each([
  ["a feed URL without the test root", ["--app-update-feed-url", LOCAL_APP_UPDATE_FEED_URL], "--app-update-feed-url needs --local-proof-test-root"],
  ["a feed that is not a URL", ["--local-proof-test-root", "--app-update-feed-url", "not a url"], "usage:"],
  ["an unknown flag", ["--shipping"], "usage:"],
])("the writer refuses %s and writes nothing", async (_refusedCase, writerFlags, expectedRefusal) => {
  const writtenFeaturesFile = path.join(scratchDirectory, "tatolab_app_build_features.json");
  const writerOutcome = await runTheBuildFeaturesScript(["write", writtenFeaturesFile, ...writerFlags]);
  expect(writerOutcome.exitCode).toBe(2);
  expect(writerOutcome.stderr).toContain(expectedRefusal);
  await expect(readFile(writtenFeaturesFile, "utf8")).rejects.toThrow();
});

test("read prints a shipping asar's features and --shipping passes it", async () => {
  const appAsar = await appAsarPlantedWith(JSON.stringify(SHIPPING_BUILD_FEATURES));
  expect(await runTheBuildFeaturesScript(["read", appAsar])).toEqual({
    exitCode: 0,
    stdout: "machineDirectoriesUnderATestRoot=false\nappUpdateFeedUrl=https://get.tatolab.com/app/\n",
    stderr: "",
  });
  expect(await runTheBuildFeaturesScript(["read", appAsar, "--shipping"])).toMatchObject({ exitCode: 0 });
});

test.each([
  ["the test root", { ...SHIPPING_BUILD_FEATURES, machineDirectoriesUnderATestRoot: true }, ["machineDirectoriesUnderATestRoot"]],
  ["a local update feed", { ...SHIPPING_BUILD_FEATURES, appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL }, [LOCAL_APP_UPDATE_FEED_URL]],
  ["the test root and a local update feed", { machineDirectoriesUnderATestRoot: true, appUpdateFeedUrl: LOCAL_APP_UPDATE_FEED_URL }, ["machineDirectoriesUnderATestRoot", LOCAL_APP_UPDATE_FEED_URL]],
])("read --shipping refuses an asar planted with %s", async (_plantedCase, plantedFeatures, expectedRefusals) => {
  const appAsar = await appAsarPlantedWith(JSON.stringify(plantedFeatures));
  const shippingOutcome = await runTheBuildFeaturesScript(["read", appAsar, "--shipping"]);
  expect(shippingOutcome.exitCode).toBe(1);
  for (const expectedRefusal of expectedRefusals) expect(shippingOutcome.stderr).toContain(expectedRefusal);
  expect(await runTheBuildFeaturesScript(["read", appAsar])).toMatchObject({ exitCode: 0 });
});

test.each([
  ["no build features", null],
  ["build features that are not JSON", "machineDirectoriesUnderATestRoot: false"],
  ["a build feature missing", JSON.stringify({ machineDirectoriesUnderATestRoot: false })],
  ["a build feature of the wrong type", JSON.stringify({ ...SHIPPING_BUILD_FEATURES, machineDirectoriesUnderATestRoot: "false" })],
  ["an extra build feature", JSON.stringify({ ...SHIPPING_BUILD_FEATURES, plantedFeature: true })],
])("read refuses an asar with %s, with or without --shipping", async (_plantedCase, plantedFeaturesSource) => {
  const appAsar = await appAsarPlantedWith(plantedFeaturesSource);
  for (const readFlags of [[], ["--shipping"]]) {
    const readOutcome = await runTheBuildFeaturesScript(["read", appAsar, ...readFlags]);
    expect(readOutcome.exitCode).toBe(1);
    expect(readOutcome.stdout).toBe("");
    expect(readOutcome.stderr).toContain("tatolab_app_build_features.json");
  }
});
