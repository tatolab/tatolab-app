// scripts/lend-python-versions.sh names each CPython the bundle precompiles the lend's
// tatolab.runtime for: every version from the floor the lend's own .dist-info/METADATA states in
// Requires-Python up to the newest the bundle precompiles for, so no version the lend's code cannot
// compile under is asked for, and a Requires-Python it cannot read as one floor is refused.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const TATO_APP_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LEND_PYTHON_VERSIONS_SCRIPT = path.join(TATO_APP_ROOT, "scripts", "lend-python-versions.sh");

interface ScriptOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let lendDirectory: string;

beforeEach(async () => {
  lendDirectory = await mkdtemp(path.join(tmpdir(), "lend-python-versions-"));
});

afterEach(async () => {
  await rm(lendDirectory, { recursive: true, force: true });
});

async function lendDistInfoStating(distInfoName: string, metadata: string): Promise<void> {
  await mkdir(path.join(lendDirectory, distInfoName), { recursive: true });
  await writeFile(path.join(lendDirectory, distInfoName, "METADATA"), metadata);
}

function runTheScript(): Promise<ScriptOutcome> {
  return new Promise((resolve) => {
    execFile(LEND_PYTHON_VERSIONS_SCRIPT, [lendDirectory], (error, stdout, stderr) => {
      resolve({ exitCode: error === null ? 0 : Number(error.code ?? 1), stdout, stderr });
    });
  });
}

test("a lend that requires CPython 3.12 or later is precompiled for 3.12, 3.13 and 3.14", async () => {
  await lendDistInfoStating("streamlib-0.69.178.dist-info", "Metadata-Version: 2.4\nName: streamlib\nRequires-Python: >=3.12\n");
  const outcome = await runTheScript();
  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout).toBe("3.12\n3.13\n3.14\n");
});

test("a lend that requires CPython 3.10 or later is precompiled for every version from 3.10", async () => {
  await lendDistInfoStating("streamlib-0.68.0.dist-info", "Metadata-Version: 2.4\nName: streamlib\nRequires-Python: >= 3.10\n");
  const outcome = await runTheScript();
  expect(outcome.exitCode).toBe(0);
  expect(outcome.stdout).toBe("3.10\n3.11\n3.12\n3.13\n3.14\n");
});

test("a Requires-Python other than one >=3.N floor is refused", async () => {
  await lendDistInfoStating("streamlib-0.69.178.dist-info", "Metadata-Version: 2.4\nName: streamlib\nRequires-Python: >=3.12,<3.14\n");
  const outcome = await runTheScript();
  expect(outcome.exitCode).toBe(1);
  expect(outcome.stdout).toBe("");
  expect(outcome.stderr).toContain("'>=3.12,<3.14'");
});

test("a floor newer than the newest CPython the bundle precompiles for is refused", async () => {
  await lendDistInfoStating("streamlib-0.69.178.dist-info", "Metadata-Version: 2.4\nName: streamlib\nRequires-Python: >=3.15\n");
  const outcome = await runTheScript();
  expect(outcome.exitCode).toBe(1);
  expect(outcome.stderr).toContain("CPython 3.15");
});

test("a lend with no .dist-info, or more than one, is refused", async () => {
  const noDistInfo = await runTheScript();
  expect(noDistInfo.exitCode).toBe(1);
  expect(noDistInfo.stderr).toContain("holds 0 .dist-info/METADATA");
  await lendDistInfoStating("streamlib-0.69.178.dist-info", "Requires-Python: >=3.12\n");
  await lendDistInfoStating("streamlib-0.69.177.dist-info", "Requires-Python: >=3.12\n");
  const twoDistInfos = await runTheScript();
  expect(twoDistInfos.exitCode).toBe(1);
  expect(twoDistInfos.stderr).toContain("holds 2 .dist-info/METADATA");
});
