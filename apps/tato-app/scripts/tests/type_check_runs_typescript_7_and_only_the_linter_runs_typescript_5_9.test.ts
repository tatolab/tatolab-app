// The type check of the app and of both packages runs TypeScript 7's own `tsc`, the compiler an
// extension is checked with, and `npm run build` runs that same type check. TypeScript 5.9 stays
// installed only because typescript-eslint parses with it: TypeScript 7's package has no stable
// JavaScript API for a parser to load.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const MONOREPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const TYPESCRIPT_7_COMPILER = "node ../../node_modules/typescript-7/bin/tsc";
const WORKSPACES_TYPE_CHECKED = ["apps/tato-app", "packages/tato-app-core-views", "packages/tato-app-view-sdk"];

async function scriptsOf(workspace: string): Promise<Record<string, string>> {
  const manifest: unknown = JSON.parse(await readFile(path.join(MONOREPO_ROOT, workspace, "package.json"), "utf8"));
  if (typeof manifest !== "object" || manifest === null || !("scripts" in manifest)) return {};
  const { scripts } = manifest;
  if (typeof scripts !== "object" || scripts === null) return {};
  return Object.fromEntries(Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

describe.each(WORKSPACES_TYPE_CHECKED)("the type check of %s", (workspace) => {
  test("runs only TypeScript 7's tsc", async () => {
    const typecheckCommands = ((await scriptsOf(workspace)).typecheck ?? "").split("&&").map((command) => command.trim());

    expect(typecheckCommands.length).toBeGreaterThan(0);
    for (const command of typecheckCommands) {
      expect(command.startsWith(`${TYPESCRIPT_7_COMPILER} `)).toBe(true);
    }
  });

  test("finds TypeScript 7 at the path its script runs from that workspace", async () => {
    const { stdout } = await promisify(execFile)("sh", ["-c", `${TYPESCRIPT_7_COMPILER} --version`], { cwd: path.join(MONOREPO_ROOT, workspace) });

    expect(stdout).toMatch(/^Version 7\./);
  });
});

test("npm run build of the app runs the type check first", async () => {
  expect((await scriptsOf("apps/tato-app")).build?.startsWith("npm run typecheck && ")).toBe(true);
});

test("typescript-eslint parses with TypeScript 5.9", () => {
  const fromTheApp = createRequire(path.join(MONOREPO_ROOT, "apps/tato-app/package.json"));
  const fromTheParser = createRequire(fromTheApp.resolve("@typescript-eslint/parser", { paths: [path.dirname(fromTheApp.resolve("typescript-eslint"))] }));
  const fromTheTypeScriptEstree = createRequire(fromTheParser.resolve("@typescript-eslint/typescript-estree"));
  const parsersTypeScript: unknown = fromTheTypeScriptEstree("typescript/package.json");

  expect(parsersTypeScript).toMatchObject({ version: expect.stringMatching(/^5\.9\./) });
});
