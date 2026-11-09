// scripts/verify-tatolab-app-bundle.sh fails a bundle whose app.asar carries no build id, as it
// fails one that names no streamlib commit, so About always has a build to report. It reads the
// plist with macOS's plutil, so these run only where plutil is.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackage } from "@electron/asar";
import { afterEach, beforeEach, expect, test } from "vitest";

const TATO_APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VERIFY_SCRIPT = path.join(TATO_APP_ROOT, "scripts", "verify-tatolab-app-bundle.sh");
const PLUTIL_IS_AVAILABLE = existsSync("/usr/bin/plutil");
const SHIPPING_BUILD_FEATURES = { machineDirectoriesUnderATestRoot: false, appUpdateFeedUrl: "https://get.tatolab.com/app/" };
const PACKAGED_TATOLAB_APP_COMMIT = "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1";

interface VerifyScriptOutcome {
  exitCode: number;
  output: string;
}

function runTheVerifyScript(appBundle: string): Promise<VerifyScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile("bash", [VERIFY_SCRIPT, appBundle], { cwd: TATO_APP_ROOT, timeout: 60_000 }, (scriptFailure, stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, output: `${stdout}${stderr}` });
    });
  });
}

let scratchDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-verify-build-id-"));
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function appBundleWhoseAsarCarries(plantedBuildFeatures: object): Promise<string> {
  const stagedAppDirectory = path.join(scratchDirectory, "staged-app");
  await mkdir(path.join(stagedAppDirectory, "out", "main"), { recursive: true });
  await writeFile(path.join(stagedAppDirectory, "package.json"), "{}\n");
  await writeFile(path.join(stagedAppDirectory, "out", "main", "tatolab_app_build_features.json"), JSON.stringify(plantedBuildFeatures));
  const appBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(appBundle, "Contents", "Resources"), { recursive: true });
  await writeFile(
    path.join(appBundle, "Contents", "Info.plist"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>0.55.4</string></dict></plist>\n',
  );
  await createPackage(stagedAppDirectory, path.join(appBundle, "Contents", "Resources", "app.asar"));
  return appBundle;
}

test.runIf(PLUTIL_IS_AVAILABLE)("a bundle whose app.asar carries no build id fails", async () => {
  const verifyOutcome = await runTheVerifyScript(await appBundleWhoseAsarCarries({ ...SHIPPING_BUILD_FEATURES, tatolabAppBuildId: null }));
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toMatch(/FAIL {2}app\.asar's build features are unreadable: .* carries no build id/);
});

test.runIf(PLUTIL_IS_AVAILABLE)("a bundle whose app.asar carries a build id names the commit it was built at", async () => {
  const verifyOutcome = await runTheVerifyScript(
    await appBundleWhoseAsarCarries({
      ...SHIPPING_BUILD_FEATURES,
      tatolabAppBuildId: { tatolabAppCommit: PACKAGED_TATOLAB_APP_COMMIT, buildKind: "dev", builtWithUncommittedChanges: false },
    }),
  );
  expect(verifyOutcome.output).toContain(`tatolabAppCommit=${PACKAGED_TATOLAB_APP_COMMIT} buildKind=dev builtWithUncommittedChanges=false`);
  expect(verifyOutcome.output).not.toContain("build features are unreadable");
});
