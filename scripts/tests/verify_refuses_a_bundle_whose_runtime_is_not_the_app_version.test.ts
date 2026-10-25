// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// scripts/verify-tatolab-app-bundle.sh fails a bundle whose tatolabd reports another version than
// the app's CFBundleShortVersionString, or that names no streamlib commit. It reads the plist with
// macOS's plutil, so these run only where plutil is.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VERIFY_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "verify-tatolab-app-bundle.sh");
const PLUTIL_IS_AVAILABLE = existsSync("/usr/bin/plutil");
const BUNDLED_STREAMLIB_COMMIT = "ef5c8b22995a90b1f7ae671e214c96480615c911";

interface VerifyScriptOutcome {
  exitCode: number;
  output: string;
}

function runTheVerifyScript(appBundle: string): Promise<VerifyScriptOutcome> {
  return new Promise((resolveOutcome) => {
    execFile("bash", [VERIFY_SCRIPT, appBundle], { cwd: REPOSITORY_ROOT, timeout: 60_000 }, (scriptFailure, stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, output: `${stdout}${stderr}` });
    });
  });
}

let scratchDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-verify-"));
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function appBundlePlantedWith(appShortVersion: string, tatolabdVersion: string, streamlibCommit: string | null): Promise<string> {
  const appBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(appBundle, "Contents", "MacOS"), { recursive: true });
  await mkdir(path.join(appBundle, "Contents", "Resources"), { recursive: true });
  await writeFile(
    path.join(appBundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${appShortVersion}</string></dict></plist>\n`,
  );
  await writeFile(path.join(appBundle, "Contents", "MacOS", "tatolabd"), `#!/bin/sh\necho "tatolabd ${tatolabdVersion}"\n`);
  await chmod(path.join(appBundle, "Contents", "MacOS", "tatolabd"), 0o755);
  if (streamlibCommit !== null) await writeFile(path.join(appBundle, "Contents", "Resources", "streamlib-commit"), `${streamlibCommit}\n`);
  return appBundle;
}

test.runIf(PLUTIL_IS_AVAILABLE)("a bundle whose tatolabd is not the app's version fails", async () => {
  const verifyOutcome = await runTheVerifyScript(await appBundlePlantedWith("0.55.4", "0.54.12", BUNDLED_STREAMLIB_COMMIT));
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toContain("FAIL  the bundled tatolabd is '0.54.12', not the app's version '0.55.4'");
  expect(verifyOutcome.output).toContain(`ok    the runtime was built from streamlib ${BUNDLED_STREAMLIB_COMMIT}`);
});

test.runIf(PLUTIL_IS_AVAILABLE)("a bundle whose tatolabd is the app's version passes that check", async () => {
  const verifyOutcome = await runTheVerifyScript(await appBundlePlantedWith("0.55.4", "0.55.4", BUNDLED_STREAMLIB_COMMIT));
  expect(verifyOutcome.output).toContain("ok    the bundled tatolabd is 0.55.4, the app's version");
});

test.runIf(PLUTIL_IS_AVAILABLE)("a bundle that names no streamlib commit fails", async () => {
  const verifyOutcome = await runTheVerifyScript(await appBundlePlantedWith("0.55.4", "0.55.4", null));
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toContain("FAIL  Resources/streamlib-commit names no streamlib commit");
});
