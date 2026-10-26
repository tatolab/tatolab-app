// scripts/build-tatolab-app.sh, sign-tatolab-app-bundle.sh and make-tatolab-dmg.sh sign with the
// Developer ID from Infisical and nothing else: without it they stop before doing any work, naming
// what is missing.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "build-tatolab-app.sh");
const SIGN_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "sign-tatolab-app-bundle.sh");
const DMG_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "make-tatolab-dmg.sh");
const CODESIGN_IS_AVAILABLE = existsSync("/usr/bin/codesign");

interface SigningScriptOutcome {
  exitCode: number;
  output: string;
}

function runSigningScriptWithOnlyTheseAppleVariables(scriptArguments: string[], onlyTheseAppleVariables: Record<string, string>): Promise<SigningScriptOutcome> {
  const environmentWithOnlyTheseAppleVariables = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: tmpdir(), ...onlyTheseAppleVariables };
  return new Promise((resolveOutcome) => {
    execFile("bash", scriptArguments, { cwd: REPOSITORY_ROOT, env: environmentWithOnlyTheseAppleVariables, timeout: 30_000 }, (scriptFailure, stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, output: `${stdout}${stderr}` });
    });
  });
}

let scratchDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-signing-"));
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

test("a build with no Developer ID stops before anything, naming every missing secret", async () => {
  const buildOutcome = await runSigningScriptWithOnlyTheseAppleVariables([BUILD_SCRIPT, "--local-proof-test-root"], {});
  expect(buildOutcome.exitCode).toBe(1);
  expect(buildOutcome.output).toContain("no Developer ID to sign with: APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY not set");
  expect(buildOutcome.output).toContain("infisical run -- scripts/build-tatolab-app.sh");
  expect(buildOutcome.output).not.toContain("==>");
});

test("a build missing only the certificate's password names just that", async () => {
  const buildOutcome = await runSigningScriptWithOnlyTheseAppleVariables([BUILD_SCRIPT], {
    APPLE_CERTIFICATE: "cGxhbnRlZA==",
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Planted (PLANTED001)",
  });
  expect(buildOutcome.exitCode).toBe(1);
  expect(buildOutcome.output).toContain("no Developer ID to sign with: APPLE_CERTIFICATE_PASSWORD not set");
  expect(buildOutcome.output).not.toContain("==>");
});

test("a build whose signing identity is not a Developer ID Application stops before anything", async () => {
  const buildOutcome = await runSigningScriptWithOnlyTheseAppleVariables([BUILD_SCRIPT], {
    APPLE_CERTIFICATE: "cGxhbnRlZA==",
    APPLE_CERTIFICATE_PASSWORD: "planted",
    APPLE_SIGNING_IDENTITY: "Apple Development: Planted (PLANTED001)",
  });
  expect(buildOutcome.exitCode).toBe(1);
  expect(buildOutcome.output).toContain("APPLE_SIGNING_IDENTITY is not a 'Developer ID Application: …' identity");
  expect(buildOutcome.output).not.toContain("==>");
});

test("the build has no flag that signs another way", async () => {
  const buildOutcome = await runSigningScriptWithOnlyTheseAppleVariables([BUILD_SCRIPT, "--sign-identity", "-"], {});
  expect(buildOutcome.exitCode).toBe(2);
  expect(buildOutcome.output).not.toContain("--sign-identity");
});

test.each(["-", "Apple Development: Planted (PLANTED001)"])("signing refuses the identity %j before touching the bundle", async (refusedIdentity) => {
  const signOutcome = await runSigningScriptWithOnlyTheseAppleVariables([SIGN_SCRIPT, path.join(scratchDirectory, "Tatolab.app"), refusedIdentity], {});
  expect(signOutcome.exitCode).toBe(1);
  expect(signOutcome.output).toContain(`'${refusedIdentity}' is not a 'Developer ID Application: …' identity`);
});

test.runIf(CODESIGN_IS_AVAILABLE)("the installer refuses an app not signed with a Developer ID", async () => {
  const unsignedApp = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(unsignedApp, "Contents"), { recursive: true });
  const dmgOutcome = await runSigningScriptWithOnlyTheseAppleVariables([DMG_SCRIPT, unsignedApp, path.join(scratchDirectory, "Tatolab.dmg")], {});
  expect(dmgOutcome.exitCode).toBe(1);
  expect(dmgOutcome.output).toContain("is not signed with a Developer ID Application identity");
  expect(existsSync(path.join(scratchDirectory, "Tatolab.dmg"))).toBe(false);
});
