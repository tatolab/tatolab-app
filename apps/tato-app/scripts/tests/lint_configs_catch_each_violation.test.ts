// Each rule in eslint.config.js, .oxlintrc.json, stylelint.config.js and the monorepo's commitlint.config.js reports a
// planted violation where it governs and stays quiet where it does not apply: a rule never seen firing locks
// nothing.

import { execFile, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { afterAll, describe, expect, test } from "vitest";

const TATO_APP_ROOT = new URL("../..", import.meta.url).pathname;
const MONOREPO_ROOT = new URL("../../../..", import.meta.url).pathname;
const VIEW_SDK_ROOT = `${MONOREPO_ROOT}packages/tato-app-view-sdk/`;
const eslint = new ESLint({ cwd: TATO_APP_ROOT });
const viewSdkEslint = new ESLint({ cwd: VIEW_SDK_ROOT });

// Oxlint reads only files on disk, so a planted file goes into a copy of the oxlint configs beside the monorepo's
// node_modules, where the typecheck and lint running alongside the tests never see it.
const OXLINT = `${MONOREPO_ROOT}node_modules/.bin/oxlint`;
const OXLINT_CONFIGS = ["apps/tato-app/.oxlintrc.json", "packages/package_oxlint_config.json", "packages/tato-app-view-sdk/.oxlintrc.json"];
const oxlintMirrorRoot = mkdtempSync(path.join(tmpdir(), "tato-app-oxlint-"));
symlinkSync(`${MONOREPO_ROOT}node_modules`, path.join(oxlintMirrorRoot, "node_modules"));
for (const configPath of OXLINT_CONFIGS) {
  mkdirSync(path.dirname(path.join(oxlintMirrorRoot, configPath)), { recursive: true });
  copyFileSync(`${MONOREPO_ROOT}${configPath}`, path.join(oxlintMirrorRoot, configPath));
}
afterAll(() => rmSync(oxlintMirrorRoot, { recursive: true, force: true }));

/** The package a planted `filePath` is in, from the monorepo's root, and the path inside it: a path under `view-sdk:` is in the view SDK's package, and any other is in the app. */
function plantedLocation(filePath: string): { packageFolder: string; pathInPackage: string } {
  return filePath.startsWith("view-sdk:")
    ? { packageFolder: "packages/tato-app-view-sdk/", pathInPackage: filePath.slice("view-sdk:".length) }
    : { packageFolder: "apps/tato-app/", pathInPackage: filePath };
}

/** The rules ESLint reports for `plantedSource` at `filePath`, under the config of the package it is in. */
async function eslintRuleIdsReportedFor(filePath: string, plantedSource: string): Promise<string[]> {
  const { packageFolder, pathInPackage } = plantedLocation(filePath);
  const [lintResult] =
    packageFolder === "apps/tato-app/" ? await eslint.lintText(plantedSource, { filePath: pathInPackage }) : await viewSdkEslint.lintText(plantedSource, { filePath: `${VIEW_SDK_ROOT}${pathInPackage}` });
  return (lintResult?.messages ?? []).map((lintMessage) => lintMessage.ruleId ?? lintMessage.message);
}

/** The rule codes in oxlint's JSON report, such as `typescript(no-explicit-any)`. */
function oxlintRuleCodes(report: unknown): string[] {
  if (typeof report !== "object" || report === null || !("diagnostics" in report) || !Array.isArray(report.diagnostics)) return ["oxlint printed no report"];
  return report.diagnostics.map((diagnostic: unknown) =>
    typeof diagnostic === "object" && diagnostic !== null && "code" in diagnostic && typeof diagnostic.code === "string" ? diagnostic.code : "oxlint reported a diagnostic with no code",
  );
}

/** The rules oxlint reports for `plantedSource` at `filePath`, under the config of the package it is in. */
function oxlintRuleCodesReportedFor(filePath: string, plantedSource: string): string[] {
  const { packageFolder, pathInPackage } = plantedLocation(filePath);
  const packageMirror = path.join(oxlintMirrorRoot, packageFolder);
  const plantedPath = path.join(packageMirror, pathInPackage);
  mkdirSync(path.dirname(plantedPath), { recursive: true });
  writeFileSync(plantedPath, plantedSource);
  try {
    const oxlintRun = spawnSync(OXLINT, ["--format", "json", pathInPackage], { cwd: packageMirror, encoding: "utf8" });
    return oxlintRuleCodes(JSON.parse(oxlintRun.stdout || "null"));
  } finally {
    rmSync(plantedPath);
  }
}

/** The rules ESLint and oxlint together report for `plantedSource` at `filePath`. */
async function ruleIdsReportedFor(filePath: string, plantedSource: string): Promise<string[]> {
  return [...(await eslintRuleIdsReportedFor(filePath, plantedSource)), ...oxlintRuleCodesReportedFor(filePath, plantedSource)];
}

const reportedCases: [string, string, string, string][] = [
  ["a console.log in the window", "src/renderer/zz_planted.ts", 'console.log("planted");\n', "eslint(no-console)"],
  ["a console.table in the window", "src/renderer/zz_planted.ts", "console.table([1]);\n", "eslint(no-console)"],
  ["a debugger statement in the window", "src/renderer/zz_planted.ts", "export function planted(): void {\n  debugger;\n}\n", "eslint(no-debugger)"],
  ["a console call in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedLog = () => console.log("planted");\n', "eslint(no-console)"],
  ["a console.error in the main process", "src/main/zz_planted.ts", 'console.error("planted");\n', "eslint(no-console)"],
  ["process.stderr written outside tatolab_app_log.ts", "src/main/zz_planted.ts", 'process.stderr.write("planted");\n', "no-restricted-syntax"],
  ["a small rounded-full element", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedDot = () => <span className="size-2 rounded-full bg-danger" />;\n', "no-restricted-syntax"],
  ["a rounded-full element sized by width and height", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedDot = () => <span className="h-1.5 w-1.5 rounded-full" />;\n', "no-restricted-syntax"],
  ["a dot class in a template literal", "view-sdk:src/design_system/zz_planted.tsx", "export const plantedDot = (tone: string) => <span className={`rounded-full size-1.5 ${tone}`} />;\n", "no-restricted-syntax"],
  ["a dot whose classes are split across cn()'s arguments", "view-sdk:src/design_system/zz_planted.tsx", 'import { cn } from "cn";\nexport const plantedDot = () => <span className={cn("rounded-full", "size-2")} />;\n', "no-restricted-syntax"],
  ["a bullet glyph as JSX text", "src/renderer/studio_shell/zz_planted.tsx", "export const plantedBullet = () => <span>• planted</span>;\n", "no-restricted-syntax"],
  ["a console.log in a shadcn component", "view-sdk:src/design_system/ui/zz-planted.tsx", 'export const plantedLog = () => console.log("planted");\n', "eslint(no-console)"],
  ["a pulsing indicator", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedPulse = () => <span className="animate-pulse" />;\n', "no-restricted-syntax"],
  ["an SVG circle in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedCircle = () => <svg><circle r="3" /></svg>;\n', "no-restricted-syntax"],
  ["an SVG circle in a DOM page's markup", "src/renderer/studio_shell/zz_planted.ts", 'export const PLANTED_SVG = \'<svg><circle r="3" /></svg>\';\n', "no-restricted-syntax"],
  ["a bullet glyph in a string", "src/renderer/presentation/zz_planted.ts", 'export const plantedBullet = "• planted";\n', "no-restricted-syntax"],
  ["a round status icon", "src/renderer/studio_shell/zz_planted.tsx", 'import { CircleAlert } from "lucide-react";\nexport const plantedIcon = CircleAlert;\n', "no-restricted-imports"],
  ["a screen importing a shadcn component", "src/renderer/studio_shell/zz_planted.tsx", 'import { Button } from "@tatolab/tato-app-view-sdk/design_system/ui/button";\nexport const PlantedScreen = () => <Button>Planted</Button>;\n', "no-restricted-imports"],
  ["a view importing another package's files by a path", "view-sdk:src/design_system/zz_planted.tsx", 'import { PlantedThing } from "../../../tato-app-core-views/src/index";\nexport const PlantedScreen = PlantedThing;\n', "tatolab_package/imports_stay_inside_the_package"],
  ["a screen importing base-ui directly", "src/renderer/studio_shell/zz_planted.tsx", 'import { Menu } from "@base-ui/react/menu";\nexport const PlantedScreen = Menu.Root;\n', "no-restricted-imports"],
  ["a raw button in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => <button type="button">Planted</button>;\n', "no-restricted-syntax"],
  ["a raw input in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => (\n  <input\n    value="planted"\n  />\n);\n', "no-restricted-syntax"],
  ["a raw select in a screen", "src/renderer/studio_shell/zz_planted.tsx", "export const PlantedScreen = () => <select><option>Planted</option></select>;\n", "no-restricted-syntax"],
  ["a raw textarea in a screen", "src/renderer/studio_shell/zz_planted.tsx", "export const PlantedScreen = () => <textarea />;\n", "no-restricted-syntax"],
  ["a hand-built radio role in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => <div role="radiogroup"><span role={"radio"} aria-checked /></div>;\n', "no-restricted-syntax"],
  ["a process.platform read outside platform/", "src/main/zz_planted.ts", "export const plantedPlatform = process.platform;\n", "no-restricted-properties"],
  ["an os.platform() call outside platform/", "src/main/zz_planted.ts", 'import os from "node:os";\nexport const plantedPlatform = os.platform();\n', "no-restricted-properties"],
  ["os's platform imported by name outside platform/", "src/main/zz_planted.ts", 'import { platform } from "node:os";\nexport const plantedPlatform = platform();\n', "no-restricted-imports"],
  ["a process.platform read in a main-process test", "src/main/zz_planted.test.ts", "export const plantedPlatform = process.platform;\n", "no-restricted-properties"],
  ["electron imported outside the adapters", "src/main/zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n', "no-restricted-imports"],
  ["electron imported in a main-process test", "src/main/zz_planted.test.ts", "import { app } from 'electron';\nexport const plantedApp = app;\n", "no-restricted-imports"],
  ["effect imported in preload", "src/preload/zz_planted.ts", 'import { Effect } from "effect";\nexport const plantedEffect = Effect.void;\n', "@typescript-eslint/no-restricted-imports"],
  ["effect imported by the port viewers", "src/main/runtime_port_viewers.ts", 'import { Schema } from "effect";\nexport const plantedSchema = Schema.String;\n', "@typescript-eslint/no-restricted-imports"],
  ["an Effect package imported by a viewer's frame reading", "src/main/platform/linux/viewer_image_frame_reading_on_linux.ts", 'import { it } from "@effect/vitest";\nexport const plantedTest = it;\n', "@typescript-eslint/no-restricted-imports"],
  ["effect imported by the window's port viewer connections", "src/renderer/view_host/port_viewer_connections.ts", 'import { Effect } from "effect";\nexport const plantedEffect = Effect.void;\n', "@typescript-eslint/no-restricted-imports"],
  ["electron required outside the adapters", "src/main/platform/zz_planted.ts", 'export const plantedElectron = require("electron");\n', "no-restricted-syntax"],
  ["an as cast in shipped main-process code", "src/main/zz_planted.ts", 'export const planted = JSON.parse("1") as number;\n', "typescript(consistent-type-assertions)"],
  ["an any type in shipped main-process code", "src/main/zz_planted.ts", "export const planted: any = 1;\n", "typescript(no-explicit-any)"],
  ["a non-null assertion in shipped main-process code", "src/main/zz_planted.ts", "export const planted = [1].find(Boolean)!.toFixed();\n", "typescript(no-non-null-assertion)"],
  ["a throw in shipped main-process code", "src/main/zz_planted.ts", 'export function planted(): void {\n  throw new Error("planted");\n}\n', "no-restricted-syntax"],
  ["a *Sync( call in shipped main-process code", "src/main/zz_planted.ts", 'import { readFileSync } from "node:fs";\nexport const planted = readFileSync("/dev/null");\n', "no-restricted-syntax"],
  ["a namespaced *Sync( call in shipped main-process code", "src/main/electron_adapters/zz_planted.ts", 'import fs from "node:fs";\nexport const planted = fs.existsSync("/dev/null");\n', "no-restricted-syntax"],
  ["Date.now() in shipped main-process code", "src/main/zz_planted.ts", "export const planted = Date.now();\n", "no-restricted-properties"],
  ["new Date() in shipped main-process code", "src/main/platform/zz_planted.ts", "export const planted = new Date();\n", "no-restricted-syntax"],
  ["a throw in the window preload", "src/preload/zz_planted.ts", 'export function planted(): void {\n  throw new Error("planted");\n}\n', "no-restricted-syntax"],
  ["a focused main-process test", "src/main/zz_planted.test.ts", 'import { test } from "vitest";\ntest.only("planted", () => {});\n', "tatolab/no-focused-or-skipped-test"],
  ["a skipped main-process test", "src/main/platform/zz_planted.test.ts", 'import { test } from "vitest";\ntest.skip("planted", () => {});\n', "tatolab/no-focused-or-skipped-test"],
  ["a focused window test", "src/renderer/zz_planted.test.ts", 'import { it } from "vitest";\nit.only("planted", () => {});\n', "tatolab/no-focused-or-skipped-test"],
  ["an as cast in the window", "src/renderer/zz_planted.ts", 'export const planted = JSON.parse("1") as number;\n', "typescript(consistent-type-assertions)"],
  ["an as cast in the mock window", "mock/zz_planted.ts", 'export const planted = JSON.parse("1") as number;\n', "typescript(consistent-type-assertions)"],
  ["an as cast in a main-process test", "src/main/zz_planted.test.ts", 'export const planted = JSON.parse("1") as number;\n', "typescript(consistent-type-assertions)"],
  ["an as cast in a fake", "src/main/fake_zz_planted.ts", 'export const planted = JSON.parse("1") as number;\n', "typescript(consistent-type-assertions)"],
  ["a ts-ignore comment in the window", "src/renderer/zz_planted.ts", "// @ts-ignore\nexport const planted = 1;\n", "typescript(ban-ts-comment)"],
  ["an any type in the design system outside its shadcn components", "view-sdk:src/design_system/zz_planted.tsx", "export const planted: any = 1;\n", "typescript(no-explicit-any)"],
  ["React imported by the pin model", "view-sdk:src/pin_model/zz_planted.ts", 'import { useState } from "react";\nexport const planted = useState;\n', "@typescript-eslint/no-restricted-imports"],
  ["the design system's DOM imported by the pin model", "view-sdk:src/pin_model/zz_planted.ts", 'import { RefusalLine } from "../design_system/refusal_line";\nexport const planted = RefusalLine;\n', "@typescript-eslint/no-restricted-imports"],
  ["the view connection imported by the pin model", "view-sdk:src/pin_model/zz_planted.ts", 'import type { TatoAppViewConnection } from "../tato_app_view_connection.js";\nexport type Planted = TatoAppViewConnection;\n', "@typescript-eslint/no-restricted-imports"],
  ["effect imported by the pin model", "view-sdk:src/pin_model/zz_planted.ts", 'import { Schema } from "effect";\nexport const planted = Schema.String;\n', "@typescript-eslint/no-restricted-imports"],
  ["React imported by the pin services", "view-sdk:src/pin_services/zz_planted.ts", 'import { useSyncExternalStore } from "react";\nexport const planted = useSyncExternalStore;\n', "@typescript-eslint/no-restricted-imports"],
  ["effect imported by the pin services", "view-sdk:src/pin_services/zz_planted.ts", 'import { Effect } from "effect";\nexport const planted = Effect.void;\n', "@typescript-eslint/no-restricted-imports"],
];

test.each(reportedCases)("reports %s", async (_caseDescription, filePath, plantedSource, expectedRuleId) => {
  expect(await ruleIdsReportedFor(filePath, plantedSource)).toContain(expectedRuleId);
});

const quietCases: [string, string, string][] = [
  ["effect imported in the main process outside the frame lane", "src/main/zz_planted.ts", 'import { Effect } from "effect";\nexport const plantedEffect = Effect.void;\n'],
  ["a console.log in a window test", "src/renderer/zz_planted.test.ts", 'console.log("planted");\n'],
  ["a spinner, which is not a dot", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedSpinner = () => <span className="size-3.5 animate-spin" />;\n'],
  ["a screen composed from the design system", "src/renderer/studio_shell/zz_planted.tsx", 'import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";\nexport const PlantedScreen = () => <ActionButton onPressed={() => {}}>Planted</ActionButton>;\n'],
  ["a raw button in a window test", "src/renderer/studio_shell/zz_planted.test.tsx", 'export const plantedTestMarkup = () => <button type="button">Planted</button>;\n'],
  ["the design system built on a shadcn component", "view-sdk:src/design_system/zz_planted.tsx", 'import { Button } from "./ui/button";\nexport const PlantedControl = () => <Button>Planted</Button>;\n'],
  ["a cast, a non-null assertion and an any type inside a shadcn component", "view-sdk:src/design_system/ui/zz-planted.tsx", 'export const planted: any = (JSON.parse("[1]") as number[]).find(Boolean)!;\n'],
  ["a round shape inside a shadcn component", "view-sdk:src/design_system/ui/zz-planted.tsx", 'export const PlantedDot = () => <span className="size-2 rounded-full bg-border" />;\n'],
  ["an icon's circle in icons.ts", "src/renderer/icons.ts", 'export const PLANTED_ICON = \'<svg><circle r="3" /></svg>\';\n'],
  ["a process.platform read inside platform/", "src/main/platform/zz_planted.ts", "export const plantedPlatform = process.platform;\n"],
  ["process.platform named in a comment", "src/main/zz_planted.ts", "// process.platform differs here, so the platform layer decides\nexport const plantedValue = 1;\n"],
  ["electron imported by an adapter", "src/main/electron_adapters/zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n'],
  ["electron imported by the preload", "src/preload/zz_planted.ts", 'import { ipcRenderer } from "electron";\nexport const plantedBridge = ipcRenderer;\n'],
  ["process.stdout written by tatolab_app_log.ts", "src/main/tatolab_app_log.ts", 'process.stdout.write("planted");\n'],
  ["a throw and a Sync call in a main-process test", "src/main/zz_planted.test.ts", 'import { readFileSync } from "node:fs";\nexport const planted = readFileSync("/dev/null");\nexport function failing(): void {\n  throw new Error("planted");\n}\n'],
  ["a process.platform read in a fake under platform/", "src/main/platform/fake_zz_planted.ts", "export const plantedPlatform = process.platform;\n"],
  ["electron imported by a fake under electron_adapters/", "src/main/electron_adapters/fake_zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n'],
  ["a throw in a fake", "src/main/fake_zz_planted.ts", 'export function failing(): void {\n  throw new Error("planted");\n}\n'],
  ["as const in shipped main-process code", "src/main/zz_planted.ts", 'export const planted = ["as a string", "throw it"] as const;\n'],
  ["the pin services building on the pin model and the view connection's types", "view-sdk:src/pin_services/zz_planted.ts", 'import type { InputAddress } from "../pin_model/node_inputs.js";\nimport type { TatoAppViewConnection } from "../tato_app_view_connection.js";\nexport type Planted = [InputAddress, TatoAppViewConnection];\n'],
  ["the pin model building on the readings", "view-sdk:src/pin_model/zz_planted.ts", 'import type { JsonValue } from "../studio_readings.js";\nexport type Planted = JsonValue;\n'],
  ["the forms named only in a comment and a string", "src/main/zz_planted.ts", '// planted: as Error, throw, Date.now() and electron in a comment\nexport const planted = "throw it and Date.now()";\n'],
];

const SIX_OXLINT_RULES = ["no-console", "no-debugger", "@typescript-eslint/no-explicit-any", "@typescript-eslint/consistent-type-assertions", "@typescript-eslint/no-non-null-assertion", "@typescript-eslint/ban-ts-comment"];

test("ESLint leaves no explicit any, type assertions, non-null assertions, ts-comments, console and debugger to oxlint", async () => {
  const plantedSource = '// @ts-ignore\nexport function planted(value: any): number {\n  debugger;\n  console.log(value);\n  return (value as number[]).find(Boolean)!;\n}\n';
  for (const filePath of ["src/renderer/zz_planted.ts", "src/main/zz_planted.ts", "view-sdk:src/design_system/zz_planted.tsx"]) {
    expect((await eslintRuleIdsReportedFor(filePath, plantedSource)).filter((ruleId) => SIX_OXLINT_RULES.includes(ruleId))).toEqual([]);
  }
});

test.each(quietCases)("stays quiet on %s", async (_caseDescription, filePath, plantedSource) => {
  expect(await ruleIdsReportedFor(filePath, plantedSource)).toEqual([]);
});

const stylesheetCases: [string, string, boolean][] = [
  ["a bullet glyph in a stylesheet", '.planted::before { content: "●"; }\n', true],
  ["a pulsing animation in a stylesheet", ".planted { animation: pulse 2s infinite; }\n", true],
  ["a pulsing class in a stylesheet", ".animate-ping { opacity: 1; }\n", true],
  ["a pulse applied by Tailwind", ".planted { @apply animate-pulse; }\n", true],
  ["a dot applied by Tailwind", ".planted { @apply size-2 rounded-full; }\n", true],
  ["a spinner in a stylesheet", ".planted { animation: spin 1s linear infinite; }\n", false],
  ["a large round applied by Tailwind", ".planted { @apply size-8 rounded-full; }\n", false],
];

const stylesheetFolders: [string, string, string][] = [
  ["the window's styles", TATO_APP_ROOT, "src/renderer/styles/"],
  ["the design system's styles", VIEW_SDK_ROOT, "src/design_system/styles/"],
];

describe.each(stylesheetFolders)("in %s", (_folderDescription, packageRoot, stylesFolder) => {
  test.each(stylesheetCases)("stylelint on %s", async (_caseDescription, plantedStylesheet, isReported) => {
    const { results } = await stylelint.lint({ code: plantedStylesheet, codeFilename: `${packageRoot}${stylesFolder}zz_planted.css`, cwd: packageRoot });
    expect((results[0]?.warnings ?? []).length > 0).toBe(isReported);
  });
});

const pullRequestTitleCases: [string, boolean][] = [
  ["feat(window): planted", true],
  ["refactor: the window builds to out/renderer, its public files sit under it, Tauri's icons are sorted", true],
  ["Planted a thing", false],
  ["style: planted", false],
  ["Merge branch 'x' into main", false],
  ["fixup! anything", false],
  ['Revert "x"', false],
  ["feat(Scope): x", false],
];

test.each(pullRequestTitleCases)("commitlint on the title %j", async (pullRequestTitle, isAccepted) => {
  // A child's stdin is a socket; Linux's /dev/stdin reopens it through /proc, which fails with ENXIO, so `--edit /dev/stdin` reads nothing there.
  const commitlint = promisify(execFile)(`${MONOREPO_ROOT}node_modules/.bin/commitlint`, [], { cwd: MONOREPO_ROOT });
  commitlint.child.stdin?.end(pullRequestTitle);
  const accepted = await commitlint.then(
    () => true,
    () => false,
  );
  expect(accepted).toBe(isAccepted);
});
