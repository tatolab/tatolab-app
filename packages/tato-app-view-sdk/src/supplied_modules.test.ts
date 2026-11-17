import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { SUPPLIED_MODULES, SUPPLIED_MODULES_IMPORT_MAP_TEXT, withTheSuppliedModulesImportMap } from "./supplied_modules.js";

const IMPORT_MAP_SCRIPT = `<script type="importmap">${SUPPLIED_MODULES_IMPORT_MAP_TEXT}</script>`;

test("the import map resolves every supplied module by its name to its file under /studio_sdk/", () => {
  expect(JSON.parse(SUPPLIED_MODULES_IMPORT_MAP_TEXT)).toEqual({
    imports: {
      "@tatolab/tato-app-view-sdk": "/studio_sdk/index.js",
      "@tatolab/tato-app-view-sdk/studio_readings": "/studio_sdk/studio_readings.js",
      "@tatolab/tato-app-view-sdk/port_families": "/studio_sdk/port_families.js",
      "@tatolab/tato-app-view-sdk/pin_type_readings": "/studio_sdk/pin_type_readings.js",
    },
  });
});

test("every supplied module of the SDK is one of the package's own entries, so a view imports what a core view imports", async () => {
  const packageManifest: { name: string; exports: Record<string, string> } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const suppliedModule of SUPPLIED_MODULES) {
    const entry = `.${suppliedModule.name.slice(packageManifest.name.length)}`;
    expect(suppliedModule.name.startsWith(packageManifest.name)).toBe(true);
    expect(packageManifest.exports[entry], `${suppliedModule.name} is not an entry of the package`).toMatch(/^\.\/src\/[a-z_]+\.ts$/);
  }
});

test("a page holds the import map straight after its doctype, whatever its case, or first when it has none", () => {
  expect(withTheSuppliedModulesImportMap('<!doctype html>\n<html><script type="module" src="./main.ts"></script></html>')).toBe(
    `<!doctype html>${IMPORT_MAP_SCRIPT}\n<html><script type="module" src="./main.ts"></script></html>`,
  );
  expect(withTheSuppliedModulesImportMap("﻿  <!DOCTYPE HTML>\n<html></html>")).toBe(`﻿  <!DOCTYPE HTML>${IMPORT_MAP_SCRIPT}\n<html></html>`);
  expect(withTheSuppliedModulesImportMap("<html><head></head></html>")).toBe(`${IMPORT_MAP_SCRIPT}<html><head></head></html>`);
});
