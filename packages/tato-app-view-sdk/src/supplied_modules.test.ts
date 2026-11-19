import { access, readdir, readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import packageManifest from "../package.json" with { type: "json" };
import studioSdkBuildConfig, { buildInputNameOf, sourceOfThePackageEntry } from "../vite.studio_sdk.config.ts";
import { isAnEntryOfTheSdk, isASuppliedStylesheet, SUPPLIED_MODULES, SUPPLIED_MODULES_IMPORT_MAP_TEXT, VIEW_SDK_PACKAGE_NAME, withTheSuppliedModulesImportMap } from "./supplied_modules.js";

const PACKAGE_MANIFEST: { name: string; devDependencies: Record<string, string> } = packageManifest;

const IMPORT_MAP_SCRIPT = `<script type="importmap">${SUPPLIED_MODULES_IMPORT_MAP_TEXT}</script>`;

test("the import map resolves every supplied module by its name to its file under /studio_sdk/", () => {
  const importMap: { imports: Record<string, string> } = JSON.parse(SUPPLIED_MODULES_IMPORT_MAP_TEXT);
  expect(Object.keys(importMap)).toEqual(["imports"]);
  expect(importMap.imports).toEqual(Object.fromEntries(SUPPLIED_MODULES.map((suppliedModule) => [suppliedModule.name, `/studio_sdk/${suppliedModule.served_file}`])));
  expect(importMap.imports).toMatchObject({
    "@tatolab/tato-app-view-sdk": "/studio_sdk/index.js",
    "@tatolab/tato-app-view-sdk/node_ui": "/studio_sdk/node_ui.js",
    "@tatolab/tato-app-view-sdk/node_ui/input_control.css": "/studio_sdk/input_control.css",
    "@tatolab/tato-app-view-sdk/design_system/colour_picker_dialog": "/studio_sdk/design_system/colour_picker_dialog.js",
    "@tatolab/tato-app-view-sdk/design_system/styles/design_system.css": "/studio_sdk/design_system/styles/design_system.css",
    react: "/studio_sdk/react.js",
    "react/jsx-runtime": "/studio_sdk/react/jsx-runtime.js",
    "react-dom": "/studio_sdk/react-dom.js",
    "react-dom/client": "/studio_sdk/react-dom/client.js",
    effect: "/studio_sdk/effect.js",
  });
});

test("each supplied module of the SDK is one of the package's own entries, so a view imports what a core view imports", async () => {
  for (const suppliedModule of SUPPLIED_MODULES.filter(isAnEntryOfTheSdk)) await expect(access(sourceOfThePackageEntry(suppliedModule.name)), `${suppliedModule.name} names no source`).resolves.toBeUndefined();
  expect(() => sourceOfThePackageEntry(`${VIEW_SDK_PACKAGE_NAME}/no_such_entry`)).toThrow(/is not an entry of @tatolab\/tato-app-view-sdk/);
  expect(VIEW_SDK_PACKAGE_NAME).toBe(PACKAGE_MANIFEST.name);
});

test("every part of the design system is supplied, with the design system's stylesheet", async () => {
  const designSystemParts = (await readdir(new URL("./design_system/", import.meta.url))).filter((fileName) => fileName.endsWith(".tsx") && !fileName.endsWith(".test.tsx"));
  const suppliedNames = new Set(SUPPLIED_MODULES.map((suppliedModule) => suppliedModule.name));
  expect(designSystemParts.length).toBeGreaterThan(0);
  for (const part of designSystemParts) expect(suppliedNames, `design_system/${part} is not supplied`).toContain(`${VIEW_SDK_PACKAGE_NAME}/design_system/${part.replace(/\.tsx$/, "")}`);
  expect(suppliedNames).toContain(`${VIEW_SDK_PACKAGE_NAME}/design_system/styles/design_system.css`);
});

test("each supplied library is React, React DOM or Effect, built from a package the SDK names", () => {
  const suppliedLibraries = SUPPLIED_MODULES.filter((suppliedModule) => !isAnEntryOfTheSdk(suppliedModule));
  expect(suppliedLibraries.map((suppliedModule) => suppliedModule.name)).toEqual(["react", "react/jsx-runtime", "react-dom", "react-dom/client", "effect"]);
  for (const suppliedLibrary of suppliedLibraries) expect(Object.keys(PACKAGE_MANIFEST.devDependencies)).toContain(suppliedLibrary.name.split("/")[0]);
});

test("the supplied effect is built from the one exact version the app installs", async () => {
  const appManifest: { devDependencies: Record<string, string> } = JSON.parse(await readFile(new URL("../../../apps/tato-app/package.json", import.meta.url), "utf8"));
  const lockfile: { packages: Record<string, { version?: string }> } = JSON.parse(await readFile(new URL("../../../package-lock.json", import.meta.url), "utf8"));
  const appsEffect = appManifest.devDependencies["effect"];

  expect(appsEffect).toMatch(/^\d+\.\d+\.\d+$/);
  expect(PACKAGE_MANIFEST.devDependencies["effect"]).toBe(appsEffect);
  expect(Object.entries(lockfile.packages).filter(([installedAt]) => installedAt.endsWith("node_modules/effect")).map(([installedAt, installed]) => [installedAt, installed.version])).toEqual([["node_modules/effect", appsEffect]]);
});

test("the SDK's build starts each supplied module from an input named after the file the import map resolves its name to", () => {
  const buildInputs = studioSdkBuildConfig.build?.rolldownOptions?.input;
  if (buildInputs === undefined || typeof buildInputs !== "object" || Array.isArray(buildInputs)) throw new Error("the SDK's build has no named inputs");
  expect(Object.keys(buildInputs).sort()).toEqual(SUPPLIED_MODULES.map(buildInputNameOf).sort());
  expect(SUPPLIED_MODULES.map((suppliedModule) => `${buildInputNameOf(suppliedModule)}${isASuppliedStylesheet(suppliedModule) ? ".css" : ".js"}`)).toEqual(SUPPLIED_MODULES.map((suppliedModule) => suppliedModule.served_file));
});

test("a page holds the import map straight after its doctype, whatever its case and whatever comment comes before it, or first when it has none", () => {
  expect(withTheSuppliedModulesImportMap('<!doctype html>\n<html><script type="module" src="./main.ts"></script></html>')).toBe(
    `<!doctype html>${IMPORT_MAP_SCRIPT}\n<html><script type="module" src="./main.ts"></script></html>`,
  );
  expect(withTheSuppliedModulesImportMap("\uFEFF  <!DOCTYPE HTML>\n<html></html>")).toBe(`\uFEFF  <!DOCTYPE HTML>${IMPORT_MAP_SCRIPT}\n<html></html>`);
  expect(withTheSuppliedModulesImportMap("<!-- deck -->\n<!doctype html><html></html>")).toBe(`<!-- deck -->\n<!doctype html>${IMPORT_MAP_SCRIPT}<html></html>`);
  expect(withTheSuppliedModulesImportMap("<html><head></head></html>")).toBe(`${IMPORT_MAP_SCRIPT}<html><head></head></html>`);
});
