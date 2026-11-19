import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { isAnEntryOfTheSdk, isASuppliedStylesheet, SUPPLIED_MODULES, VIEW_SDK_PACKAGE_NAME } from "../src/supplied_modules.ts";
import { NATIVE_TYPESCRIPT_COMPILER, writeTheViewSdkKit } from "./view_sdk_kit.ts";

const VIEW_SDK_FOLDER = path.resolve(import.meta.dirname, "..");

let scratchFolder = "";
let kitFolder = "";

beforeAll(() => {
  scratchFolder = mkdtempSync(path.join(tmpdir(), "tatolab_view_sdk_kit_test-"));
  kitFolder = path.join(scratchFolder, "kit");
  writeTheViewSdkKit(kitFolder);
}, 120_000);

afterAll(() => {
  rmSync(scratchFolder, { recursive: true, force: true });
});

/** The answer of the compiler over a check folder: whether it passed, and what it printed. */
interface CompilerAnswer {
  readonly passed: boolean;
  readonly printed: string;
}

/** Makes a check folder as the runtime does: the extension's `files`, the kit's two files, and the kit where the preset is found by name. */
function checkFolderHolding(files: Readonly<Record<string, string>>): string {
  const checkFolder = mkdtempSync(path.join(scratchFolder, "check-"));
  cpSync(path.join(kitFolder, "check_folder"), checkFolder, { recursive: true });
  mkdirSync(path.join(checkFolder, "node_modules", "@tatolab"), { recursive: true });
  symlinkSync(kitFolder, path.join(checkFolder, "node_modules", "@tatolab", "tato-app-view-sdk"), "dir");
  for (const [fileName, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(checkFolder, fileName)), { recursive: true });
    writeFileSync(path.join(checkFolder, fileName), text);
  }
  return checkFolder;
}

/** What the compiler answers over `checkFolder`, run as the runtime runs it. */
function compiledWithThePreset(checkFolder: string): CompilerAnswer {
  try {
    return { passed: true, printed: execFileSync(process.execPath, [NATIVE_TYPESCRIPT_COMPILER, "-p", checkFolder], { encoding: "utf8", stdio: "pipe" }) };
  } catch (failure) {
    const printed = typeof failure === "object" && failure !== null && "stdout" in failure ? String(failure.stdout) : String(failure);
    return { passed: false, printed };
  }
}

/** A view that draws with React, the design system and Effect, and reads a pin type: an import of each kind of supplied module. */
const A_VIEW_OF_EVERY_KIND_OF_SUPPLIED_MODULE = `import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { Effect } from "effect";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { connectToTatoApp } from "@tatolab/tato-app-view-sdk";
import type { PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import designSystemStyles from "@tatolab/tato-app-view-sdk/design_system/styles/design_system.css" with { type: "css" };

function Counter() {
  const [count, setCount] = useState(0);
  return createElement(ActionButton, { label: "Add one", onPressed: () => setCount(count + 1), children: \`Count \${count}\` });
}

export const counted = Effect.succeed(1);
export const floatType: PinType = { type: "float" };
export const connect = connectToTatoApp;
document.adoptedStyleSheets = [designSystemStyles];
createRoot(document.body).render(createElement(Counter));
`;

describe("the kit", () => {
  test("a project whose tsconfig.json only extends the kit's preset type-checks a view drawn with every kind of supplied module", () => {
    const answer = compiledWithThePreset(checkFolderHolding({ "views/counter/main.ts": A_VIEW_OF_EVERY_KIND_OF_SUPPLIED_MODULE }));
    expect(answer.printed).toBe("");
    expect(answer.passed).toBe(true);
  });

  test("the compiler checks a view against the design system's own props, as the Studio's code is checked", () => {
    const withoutChildren = A_VIEW_OF_EVERY_KIND_OF_SUPPLIED_MODULE.replace(", children: `Count ${count}`", "");
    const answer = compiledWithThePreset(checkFolderHolding({ "views/counter/main.ts": withoutChildren }));
    expect(answer.passed).toBe(false);
    expect(answer.printed).toContain("Property 'children' is missing");
  });

  test("a name the Studio does not supply, a cast and a type erasing nothing cannot run are each refused by the compiler", () => {
    const answer = compiledWithThePreset(
      checkFolderHolding({
        "views/unsupplied/main.ts": `import pad from "left-pad";\nexport const padded = pad;\n`,
        "views/enum/main.ts": `export enum Level { Low, High }\n`,
        "views/index/main.ts": `const levels: number[] = [];\nexport const first: number = levels[0];\n`,
      }),
    );
    expect(answer.passed).toBe(false);
    expect(answer.printed).toContain("Cannot find module 'left-pad'");
    expect(answer.printed).toContain("erasableSyntaxOnly");
    expect(answer.printed).toContain("'number | undefined' is not assignable to type 'number'");
  });

  test("holds no program and no dependency: declarations, JSON, the template and nothing that runs", () => {
    const everyFile = readdirSync(kitFolder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
    const programs = everyFile.filter((entry) => /\.(c|m)?js$|\.node$/.test(entry.name)).map((entry) => path.join(entry.parentPath, entry.name));
    expect(programs).toEqual([]);
    expect(everyFile.some((entry) => entry.parentPath.split(path.sep).includes("node_modules"))).toBe(false);
    const kitManifest: { dependencies?: unknown; peerDependencies?: unknown } = JSON.parse(readFileSync(path.join(kitFolder, "package.json"), "utf8"));
    expect(kitManifest.dependencies).toBeUndefined();
    expect(kitManifest.peerDependencies).toBeUndefined();
  });

  test("its package's entries are generated from each supplied entry of the SDK, and it states the SDK's version", () => {
    const kitManifest: { name: string; version: string; exports: Record<string, unknown> } = JSON.parse(readFileSync(path.join(kitFolder, "package.json"), "utf8"));
    const sdkManifest: { version: string } = JSON.parse(readFileSync(path.join(VIEW_SDK_FOLDER, "package.json"), "utf8"));
    const suppliedEntries = SUPPLIED_MODULES.filter((suppliedModule) => isAnEntryOfTheSdk(suppliedModule) && !isASuppliedStylesheet(suppliedModule)).map((suppliedModule) => `.${suppliedModule.name.slice(VIEW_SDK_PACKAGE_NAME.length)}`);
    expect(kitManifest.name).toBe(VIEW_SDK_PACKAGE_NAME);
    expect(kitManifest.version).toBe(sdkManifest.version);
    expect(Object.keys(kitManifest.exports).filter((entry) => entry !== "./package.json" && entry !== "./tsconfig.preset.json").sort()).toEqual(suppliedEntries.sort());
  });

  test("its preset maps every supplied module to a declaration inside the kit", () => {
    const preset: { compilerOptions: { paths: Record<string, string[]> } } = JSON.parse(readFileSync(path.join(kitFolder, "tsconfig.preset.json"), "utf8"));
    const suppliedScripts = SUPPLIED_MODULES.filter((suppliedModule) => !isASuppliedStylesheet(suppliedModule)).map((suppliedModule) => suppliedModule.name);
    for (const name of suppliedScripts) expect(preset.compilerOptions.paths[name], name).toEqual([expect.stringMatching(/^\.\/declarations\/.+\.d\.[cm]?ts$/)]);
    for (const [name, [declaration]] of Object.entries(preset.compilerOptions.paths)) expect(() => readFileSync(path.join(kitFolder, declaration ?? ""), "utf8"), name).not.toThrow();
  });

  test("its lint rules restate the four strict rules of the lint config the Studio's own code is checked with", () => {
    const kitRules: { rules: Record<string, unknown> } = JSON.parse(readFileSync(path.join(kitFolder, "oxlint.json"), "utf8"));
    const sharedConfig = findPackageJSON("@tatolab/lint-config", import.meta.url) ?? "";
    const sharedRules: { rules: Record<string, unknown> } = JSON.parse(readFileSync(path.join(path.dirname(sharedConfig), "oxlint", "oxlintrc.json"), "utf8"));
    const strictRuleNames = ["typescript/no-explicit-any", "typescript/consistent-type-assertions", "typescript/no-non-null-assertion", "typescript/ban-ts-comment"];
    expect(Object.keys(kitRules.rules).sort()).toEqual(strictRuleNames.sort());
    for (const ruleName of strictRuleNames) expect(kitRules.rules[ruleName], ruleName).toEqual(sharedRules.rules[ruleName]);
  });

  test("holds both manifests' JSON Schemas", () => {
    for (const schemaName of ["tatolab_view.schema.json", "tatolab_node_ui.schema.json"]) {
      const schema: { $schema?: unknown } = JSON.parse(readFileSync(path.join(kitFolder, "schemas", schemaName), "utf8"));
      expect(schema.$schema, schemaName).toBeTypeOf("string");
    }
  });
});

describe("the Studio's own packages", () => {
  test("each extends the kit's strict options, so the Studio's code and an author's are checked by the same four", () => {
    const packagesFolder = path.resolve(VIEW_SDK_FOLDER, "..");
    const configs = [
      ["tato-app-view-sdk/tsconfig.json", "./kit/tsconfig.strict_options.json"],
      ["tato-app-view-sdk/tsconfig.design_system.json", "./kit/tsconfig.strict_options.json"],
      ["tato-app-core-views/tsconfig.json", "@tatolab/tato-app-view-sdk/tsconfig.strict_options.json"],
      ["tato-app-core-node-ui/tsconfig.json", "@tatolab/tato-app-view-sdk/tsconfig.strict_options.json"],
    ];
    for (const [config, extended] of configs) {
      const read: { extends?: unknown } = JSON.parse(readFileSync(path.join(packagesFolder, config ?? ""), "utf8"));
      expect(read.extends, config).toBe(extended);
    }
    const preset: { extends?: unknown } = JSON.parse(readFileSync(path.join(kitFolder, "tsconfig.preset.json"), "utf8"));
    expect(preset.extends).toBe("./tsconfig.strict_options.json");
  });
});
