// scripts/verify-tatolab-app-bundle.sh fails a bundle carrying any Mach-O that is signed ad-hoc or
// by anything but Tatolab's Developer ID team. The planted ad-hoc Mach-O is the one Apple's linker
// signs on arm64; the planted foreign one is a copy of an Apple-signed system binary. Both need
// macOS's codesign, plutil and a C compiler, so these run only where they are.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VERIFY_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "verify-tatolab-app-bundle.sh");
const MACOS_SIGNING_TOOLS_ARE_AVAILABLE = ["/usr/bin/codesign", "/usr/bin/plutil", "/usr/bin/cc", "/usr/bin/true"].every((tool) => existsSync(tool));

interface ProcessOutcome {
  exitCode: number;
  output: string;
}

function runProcess(executable: string, processArguments: string[]): Promise<ProcessOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(executable, processArguments, { cwd: REPOSITORY_ROOT, timeout: 60_000 }, (processFailure, stdout, stderr) => {
      const exitCode = processFailure === null ? 0 : typeof processFailure.code === "number" ? processFailure.code : -1;
      resolveOutcome({ exitCode, output: `${stdout}${stderr}` });
    });
  });
}

let scratchDirectory = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-verify-signature-"));
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function appBundleWithMoqRelayFrom(placeMoqRelay: (moqRelayPath: string) => Promise<void>): Promise<string> {
  const appBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(appBundle, "Contents", "MacOS"), { recursive: true });
  await writeFile(
    path.join(appBundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.tatolab.tatolab</string></dict></plist>\n`,
  );
  await placeMoqRelay(path.join(appBundle, "Contents", "MacOS", "moq-relay"));
  return appBundle;
}

test.runIf(MACOS_SIGNING_TOOLS_ARE_AVAILABLE)("a bundle carrying an ad-hoc-signed Mach-O fails", async () => {
  const appBundle = await appBundleWithMoqRelayFrom(async (moqRelayPath) => {
    const plantedSource = path.join(scratchDirectory, "planted_moq_relay.c");
    await writeFile(plantedSource, "int main(void) { return 0; }\n");
    const compileOutcome = await runProcess("/usr/bin/cc", ["-o", moqRelayPath, plantedSource]);
    expect(compileOutcome.exitCode).toBe(0);
  });
  expect((await runProcess("/usr/bin/codesign", ["-dv", path.join(appBundle, "Contents", "MacOS", "moq-relay")])).output).toMatch(/flags=.*adhoc/);
  const verifyOutcome = await runProcess("bash", [VERIFY_SCRIPT, appBundle]);
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toContain("FAIL  Contents/MacOS/moq-relay is not signed by Tatolab's Developer ID: it is signed ad-hoc");
  expect(verifyOutcome.output).toContain("FAIL  no hardened runtime signature on Contents/MacOS/moq-relay");
  expect(verifyOutcome.output).not.toContain("ok    every Mach-O is signed by Tatolab's Developer ID");
});

test.runIf(MACOS_SIGNING_TOOLS_ARE_AVAILABLE)("a bundle carrying a Mach-O signed by another identity fails", async () => {
  const appBundle = await appBundleWithMoqRelayFrom((moqRelayPath) => copyFile("/usr/bin/true", moqRelayPath));
  const verifyOutcome = await runProcess("bash", [VERIFY_SCRIPT, appBundle]);
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toMatch(
    /FAIL {2}Contents\/MacOS\/moq-relay is not signed by Tatolab's Developer ID: it is signed by '[^']*Software Signing', not a Developer ID Application identity/,
  );
  expect(verifyOutcome.output).not.toContain("ok    every Mach-O is signed by Tatolab's Developer ID");
});
