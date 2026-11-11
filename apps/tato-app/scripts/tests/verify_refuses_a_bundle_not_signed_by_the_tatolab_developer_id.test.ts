// scripts/verify-tatolab-app-bundle.sh fails a bundle carrying any Mach-O that is signed ad-hoc or
// by anything but Tatolab's Developer ID team, one inside a carried wheel included. The planted ad-hoc Mach-O is the one Apple's linker
// signs on arm64; the planted foreign one is a copy of an Apple-signed system binary. Both need
// macOS's codesign, plutil and a C compiler, so these run only where they are.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const TATO_APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VERIFY_SCRIPT = path.join(TATO_APP_ROOT, "scripts", "verify-tatolab-app-bundle.sh");
const MACOS_SIGNING_TOOLS_ARE_AVAILABLE = ["/usr/bin/codesign", "/usr/bin/plutil", "/usr/bin/cc", "/usr/bin/true", "/usr/bin/zip"].every((tool) =>
  existsSync(tool),
);

interface ProcessOutcome {
  exitCode: number;
  output: string;
}

function runProcess(executable: string, processArguments: string[]): Promise<ProcessOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(executable, processArguments, { cwd: TATO_APP_ROOT, timeout: 60_000 }, (processFailure, stdout, stderr) => {
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

async function appBundleWithAPlantedMachOFrom(placeThePlantedMachO: (plantedMachOPath: string) => Promise<void>): Promise<string> {
  const appBundle = path.join(scratchDirectory, "Tatolab.app");
  await mkdir(path.join(appBundle, "Contents", "MacOS"), { recursive: true });
  await writeFile(
    path.join(appBundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.tatolab.tatolab</string></dict></plist>\n`,
  );
  await placeThePlantedMachO(path.join(appBundle, "Contents", "MacOS", "planted-mach-o"));
  return appBundle;
}

test.runIf(MACOS_SIGNING_TOOLS_ARE_AVAILABLE)("a bundle carrying an ad-hoc-signed Mach-O fails", async () => {
  const appBundle = await appBundleWithAPlantedMachOFrom(async (plantedMachOPath) => {
    const plantedSource = path.join(scratchDirectory, "planted_mach_o.c");
    await writeFile(plantedSource, "int main(void) { return 0; }\n");
    const compileOutcome = await runProcess("/usr/bin/cc", ["-o", plantedMachOPath, plantedSource]);
    expect(compileOutcome.exitCode).toBe(0);
  });
  expect((await runProcess("/usr/bin/codesign", ["-dv", path.join(appBundle, "Contents", "MacOS", "planted-mach-o")])).output).toMatch(/flags=.*adhoc/);
  const verifyOutcome = await runProcess("bash", [VERIFY_SCRIPT, appBundle]);
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toContain("FAIL  Contents/MacOS/planted-mach-o is not signed by Tatolab's Developer ID: it is signed ad-hoc");
  expect(verifyOutcome.output).toContain("FAIL  no hardened runtime signature on Contents/MacOS/planted-mach-o");
  expect(verifyOutcome.output).not.toContain("ok    every Mach-O is signed by Tatolab's Developer ID");
});

test.runIf(MACOS_SIGNING_TOOLS_ARE_AVAILABLE)("a bundle carrying a Mach-O signed by another identity fails", async () => {
  const appBundle = await appBundleWithAPlantedMachOFrom((plantedMachOPath) => copyFile("/usr/bin/true", plantedMachOPath));
  const verifyOutcome = await runProcess("bash", [VERIFY_SCRIPT, appBundle]);
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toMatch(
    /FAIL {2}Contents\/MacOS\/planted-mach-o is not signed by Tatolab's Developer ID: it is signed by '[^']*Software Signing', not a Developer ID Application identity/,
  );
  expect(verifyOutcome.output).not.toContain("ok    every Mach-O is signed by Tatolab's Developer ID");
});

test.runIf(MACOS_SIGNING_TOOLS_ARE_AVAILABLE)("a bundle whose carried wheel holds an ad-hoc-signed Mach-O fails, naming the member", async () => {
  const appBundle = await appBundleWithAPlantedMachOFrom((plantedMachOPath) => copyFile("/usr/bin/true", plantedMachOPath));
  const unpackedWheel = path.join(scratchDirectory, "numpy-wheel");
  await mkdir(path.join(unpackedWheel, "numpy"), { recursive: true });
  const plantedSource = path.join(scratchDirectory, "planted_extension.c");
  await writeFile(plantedSource, "int planted_extension(void) { return 0; }\n");
  const compileOutcome = await runProcess("/usr/bin/cc", ["-shared", "-o", path.join(unpackedWheel, "numpy", "_planted.cpython-312-darwin.so"), plantedSource]);
  expect(compileOutcome.exitCode).toBe(0);
  const carriedWheelsDirectory = path.join(appBundle, "Contents", "Helpers", "Tatolab Runtime.app", "Contents", "Resources", "carried-wheels");
  await mkdir(carriedWheelsDirectory, { recursive: true });
  const zipOutcome = await runProcess("/bin/sh", [
    "-c",
    `cd "${unpackedWheel}" && /usr/bin/zip -qr "${path.join(carriedWheelsDirectory, "numpy-2.5.4-cp312-cp312-macosx_14_0_arm64.whl")}" numpy`,
  ]);
  expect(zipOutcome.exitCode).toBe(0);
  const verifyOutcome = await runProcess("bash", [VERIFY_SCRIPT, appBundle]);
  expect(verifyOutcome.exitCode).not.toBe(0);
  expect(verifyOutcome.output).toContain(
    "FAIL  numpy-2.5.4-cp312-cp312-macosx_14_0_arm64.whl/numpy/_planted.cpython-312-darwin.so, carried in the helper's Resources, is not signed by Tatolab's Developer ID: it is signed ad-hoc",
  );
  expect(verifyOutcome.output).not.toContain("Mach-O inside the carried wheels and Python are signed");
});
