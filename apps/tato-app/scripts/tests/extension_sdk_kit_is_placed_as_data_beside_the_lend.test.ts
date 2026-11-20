// scripts/place-the-extension-sdk-kit.sh places the kit the SDK's build wrote where the carried
// runtime finds it, replacing what was there, and refuses a kit missing a part the runtime looks
// for, one naming another package, and one holding a link, an executable or native code, before it
// writes anything.

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { anExtensionSdkKitPlantedIn } from "./extension_sdk_kit_planted.ts";

const PLACE_KIT_SCRIPT = fileURLToPath(new URL("../place-the-extension-sdk-kit.sh", import.meta.url));
const ELF_MAGIC_BYTES = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

interface PlaceOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runThePlaceScript(...scriptArguments: string[]): Promise<PlaceOutcome> {
  return new Promise((resolveOutcome) => {
    execFile("bash", [PLACE_KIT_SCRIPT, ...scriptArguments], (scriptFailure, stdout, stderr) => {
      const exitCode = scriptFailure === null ? 0 : typeof scriptFailure.code === "number" ? scriptFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

let scratchDirectory = "";
let plantedKit = "";
let destination = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-extension-sdk-kit-"));
  plantedKit = await anExtensionSdkKitPlantedIn(scratchDirectory);
  destination = path.join(scratchDirectory, "tatolab-runtime", "lib", "tatolab", "extension-sdk");
});

afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

test("the kit is placed whole at the destination, replacing an earlier one, and named with its version", async () => {
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "stale.d.ts"), "export {};\n");

  const outcome = await runThePlaceScript(plantedKit, destination);

  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout).toContain("@tatolab/tato-app-view-sdk 1.2.3");
  expect((await readdir(destination)).sort()).toEqual(["check_folder", "declarations", "oxlint.json", "package.json", "tie_lines.json", "tsconfig.preset.json"]);
  expect(await readFile(path.join(destination, "declarations", "index.d.ts"), "utf8")).toBe("export {};\n");
  expect(await readdir(path.dirname(destination))).toEqual(["extension-sdk"]);
});

test("without a destination the kit is only checked", async () => {
  const outcome = await runThePlaceScript(plantedKit);

  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout).toContain("is @tatolab/tato-app-view-sdk 1.2.3");
});

test("a kit missing a part the runtime looks for is refused, naming the part, and nothing is written", async () => {
  for (const kitPart of ["tie_lines.json", "oxlint.json", path.join("check_folder", "tsconfig.json")]) {
    await rm(plantedKit, { recursive: true, force: true });
    plantedKit = await anExtensionSdkKitPlantedIn(scratchDirectory);
    await rm(path.join(plantedKit, kitPart));

    const outcome = await runThePlaceScript(plantedKit, destination);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain(`holds no ${kitPart}`);
    expect(await readdir(scratchDirectory)).toEqual(["extension-sdk-kit"]);
  }
});

test("a kit naming another package is refused", async () => {
  await writeFile(path.join(plantedKit, "package.json"), JSON.stringify({ name: "@tatolab/runtime-client", version: "1.2.3" }));

  const outcome = await runThePlaceScript(plantedKit, destination);

  expect(outcome.exitCode).toBe(1);
  expect(outcome.stderr).toContain("names '@tatolab/runtime-client 1.2.3'");
});

test("a kit holding a link, an executable or native code is refused, naming the file, and nothing is written", async () => {
  for (const [plantedEntry, plant] of [
    ["declarations/outside.d.ts", (kit: string) => symlink("/etc/hosts", path.join(kit, "declarations", "outside.d.ts"))],
    ["declarations/run.sh", async (kit: string) => {
      await writeFile(path.join(kit, "declarations", "run.sh"), "#!/bin/sh\n");
      await chmod(path.join(kit, "declarations", "run.sh"), 0o755);
    }],
    ["declarations/addon.node", (kit: string) => writeFile(path.join(kit, "declarations", "addon.node"), ELF_MAGIC_BYTES)],
  ] as const) {
    await rm(plantedKit, { recursive: true, force: true });
    plantedKit = await anExtensionSdkKitPlantedIn(scratchDirectory);
    await plant(plantedKit);

    const outcome = await runThePlaceScript(plantedKit, destination);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain(plantedEntry);
    expect(await readdir(scratchDirectory)).toEqual(["extension-sdk-kit"]);
  }
});
