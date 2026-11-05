// Each rule in eslint.config.js, stylelint.config.js and commitlint.config.js reports a planted
// violation where it governs and stays quiet where it does not apply: a rule never seen firing locks
// nothing.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { expect, test } from "vitest";

const REPOSITORY_ROOT = new URL("../..", import.meta.url).pathname;
const eslint = new ESLint({ cwd: REPOSITORY_ROOT });

async function ruleIdsReportedFor(filePath: string, plantedSource: string): Promise<string[]> {
  const [lintResult] = await eslint.lintText(plantedSource, { filePath });
  return (lintResult?.messages ?? []).map((lintMessage) => lintMessage.ruleId ?? lintMessage.message);
}

const reportedCases: [string, string, string, string][] = [
  ["a console.log in the window", "src/renderer/zz_planted.ts", 'console.log("planted");\n', "no-console"],
  ["a console.table in the window", "src/renderer/zz_planted.ts", "console.table([1]);\n", "no-console"],
  ["a debugger statement in the window", "src/renderer/zz_planted.ts", "export function planted(): void {\n  debugger;\n}\n", "no-debugger"],
  ["a console call in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedLog = () => console.log("planted");\n', "no-console"],
  ["a console.error in the main process", "src/main/zz_planted.ts", 'console.error("planted");\n', "no-console"],
  ["process.stderr written outside tatolab_app_log.ts", "src/main/zz_planted.ts", 'process.stderr.write("planted");\n', "no-restricted-syntax"],
  ["a small rounded-full element", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedDot = () => <span className="size-2 rounded-full bg-danger" />;\n', "no-restricted-syntax"],
  ["a rounded-full element sized by width and height", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedDot = () => <span className="h-1.5 w-1.5 rounded-full" />;\n', "no-restricted-syntax"],
  ["a dot class in a template literal", "src/renderer/design_system/zz_planted.tsx", "export const plantedDot = (tone: string) => <span className={`rounded-full size-1.5 ${tone}`} />;\n", "no-restricted-syntax"],
  ["a dot whose classes are split across cn()'s arguments", "src/renderer/design_system/zz_planted.tsx", 'import { cn } from "cn";\nexport const plantedDot = () => <span className={cn("rounded-full", "size-2")} />;\n', "no-restricted-syntax"],
  ["a bullet glyph as JSX text", "src/renderer/studio_shell/zz_planted.tsx", "export const plantedBullet = () => <span>• planted</span>;\n", "no-restricted-syntax"],
  ["a console.log in a shadcn component", "src/renderer/components/ui/zz-planted.tsx", 'export const plantedLog = () => console.log("planted");\n', "no-console"],
  ["a pulsing indicator", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedPulse = () => <span className="animate-pulse" />;\n', "no-restricted-syntax"],
  ["an SVG circle in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedCircle = () => <svg><circle r="3" /></svg>;\n', "no-restricted-syntax"],
  ["an SVG circle in a DOM page's markup", "src/renderer/studio_shell/zz_planted.ts", 'export const PLANTED_SVG = \'<svg><circle r="3" /></svg>\';\n', "no-restricted-syntax"],
  ["a bullet glyph in a string", "src/renderer/presentation/zz_planted.ts", 'export const plantedBullet = "• planted";\n', "no-restricted-syntax"],
  ["a round status icon", "src/renderer/studio_shell/zz_planted.tsx", 'import { CircleAlert } from "lucide-react";\nexport const plantedIcon = CircleAlert;\n', "no-restricted-imports"],
  ["a screen importing a shadcn component", "src/renderer/studio_shell/zz_planted.tsx", 'import { Button } from "@/components/ui/button";\nexport const PlantedScreen = () => <Button>Planted</Button>;\n', "no-restricted-imports"],
  ["a screen importing a shadcn component by a relative path", "src/renderer/studio_shell/zz_planted.tsx", 'import { Toggle } from "../components/ui/toggle";\nexport const PlantedScreen = Toggle;\n', "no-restricted-imports"],
  ["a screen importing base-ui directly", "src/renderer/studio_shell/zz_planted.tsx", 'import { Menu } from "@base-ui/react/menu";\nexport const PlantedScreen = Menu.Root;\n', "no-restricted-imports"],
  ["a raw button in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => <button type="button">Planted</button>;\n', "no-restricted-syntax"],
  ["a raw input in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => (\n  <input\n    value="planted"\n  />\n);\n', "no-restricted-syntax"],
  ["a raw select in a screen", "src/renderer/studio_shell/zz_planted.tsx", "export const PlantedScreen = () => <select><option>Planted</option></select>;\n", "no-restricted-syntax"],
  ["a raw textarea in a screen", "src/renderer/studio_shell/zz_planted.tsx", "export const PlantedScreen = () => <textarea />;\n", "no-restricted-syntax"],
  ["a studio view importing the shell", "src/renderer/studio_views/zz_planted/zz_planted.tsx", 'import { StudioWindowModel } from "../../studio_shell/studio_window_model";\nexport const PlantedView = StudioWindowModel;\n', "no-restricted-imports"],
  ["a studio view importing the backend contract past the view host", "src/renderer/studio_views/zz_planted/zz_planted.ts", 'import type { TatolabStatus } from "../../../shared/tatolab_backend_contract";\nexport type PlantedStatus = TatolabStatus;\n', "no-restricted-imports"],
  ["a raw button in a studio view", "src/renderer/studio_views/zz_planted/zz_planted.tsx", 'export const PlantedView = () => <button type="button">Planted</button>;\n', "no-restricted-syntax"],
  ["a hand-built radio role in a screen", "src/renderer/studio_shell/zz_planted.tsx", 'export const PlantedScreen = () => <div role="radiogroup"><span role={"radio"} aria-checked /></div>;\n', "no-restricted-syntax"],
  ["a process.platform read outside platform/", "src/main/zz_planted.ts", "export const plantedPlatform = process.platform;\n", "no-restricted-properties"],
  ["an os.platform() call outside platform/", "src/main/zz_planted.ts", 'import os from "node:os";\nexport const plantedPlatform = os.platform();\n', "no-restricted-properties"],
  ["os's platform imported by name outside platform/", "src/main/zz_planted.ts", 'import { platform } from "node:os";\nexport const plantedPlatform = platform();\n', "no-restricted-imports"],
  ["a process.platform read in a main-process test", "src/main/zz_planted.test.ts", "export const plantedPlatform = process.platform;\n", "no-restricted-properties"],
  ["electron imported outside the adapters", "src/main/zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n', "no-restricted-imports"],
  ["electron imported in a main-process test", "src/main/zz_planted.test.ts", "import { app } from 'electron';\nexport const plantedApp = app;\n", "no-restricted-imports"],
  ["electron required outside the adapters", "src/main/platform/zz_planted.ts", 'export const plantedElectron = require("electron");\n', "no-restricted-syntax"],
  ["an as cast in shipped main-process code", "src/main/zz_planted.ts", 'export const planted = JSON.parse("1") as number;\n', "@typescript-eslint/consistent-type-assertions"],
  ["an any type in shipped main-process code", "src/main/zz_planted.ts", "export const planted: any = 1;\n", "@typescript-eslint/no-explicit-any"],
  ["a non-null assertion in shipped main-process code", "src/main/zz_planted.ts", "export const planted = [1].find(Boolean)!.toFixed();\n", "@typescript-eslint/no-non-null-assertion"],
  ["a throw in shipped main-process code", "src/main/zz_planted.ts", 'export function planted(): void {\n  throw new Error("planted");\n}\n', "no-restricted-syntax"],
  ["a *Sync( call in shipped main-process code", "src/main/zz_planted.ts", 'import { readFileSync } from "node:fs";\nexport const planted = readFileSync("/dev/null");\n', "no-restricted-syntax"],
  ["a namespaced *Sync( call in shipped main-process code", "src/main/electron_adapters/zz_planted.ts", 'import fs from "node:fs";\nexport const planted = fs.existsSync("/dev/null");\n', "no-restricted-syntax"],
  ["Date.now() in shipped main-process code", "src/main/zz_planted.ts", "export const planted = Date.now();\n", "no-restricted-properties"],
  ["new Date() in shipped main-process code", "src/main/platform/zz_planted.ts", "export const planted = new Date();\n", "no-restricted-syntax"],
  ["a throw in the window preload", "src/preload/zz_planted.ts", 'export function planted(): void {\n  throw new Error("planted");\n}\n', "no-restricted-syntax"],
  ["a focused main-process test", "src/main/zz_planted.test.ts", 'import { test } from "vitest";\ntest.only("planted", () => {});\n', "no-restricted-syntax"],
  ["a skipped main-process test", "src/main/platform/zz_planted.test.ts", 'import { test } from "vitest";\ntest.skip("planted", () => {});\n', "no-restricted-syntax"],
];

test.each(reportedCases)("reports %s", async (_caseDescription, filePath, plantedSource, expectedRuleId) => {
  expect(await ruleIdsReportedFor(filePath, plantedSource)).toContain(expectedRuleId);
});

const quietCases: [string, string, string][] = [
  ["a console.log in a window test", "src/renderer/zz_planted.test.ts", 'console.log("planted");\n'],
  ["a spinner, which is not a dot", "src/renderer/studio_shell/zz_planted.tsx", 'export const plantedSpinner = () => <span className="size-3.5 animate-spin" />;\n'],
  ["a screen composed from the design system", "src/renderer/studio_shell/zz_planted.tsx", 'import { ActionButton } from "../design_system/action_button";\nexport const PlantedScreen = () => <ActionButton onPressed={() => {}}>Planted</ActionButton>;\n'],
  ["a studio view on the view host's contract and the design system", "src/renderer/studio_views/zz_planted/zz_planted.tsx", 'import type { StudioSelection } from "../../view_host/studio_view_contract";\nimport { WaitingState } from "../../design_system/waiting_state";\nexport const plantedSelection: StudioSelection = { kind: "nothing" };\nexport const PlantedView = () => <WaitingState title="Planted" />;\n'],
  ["a raw button in a window test", "src/renderer/studio_shell/zz_planted.test.tsx", 'export const plantedTestMarkup = () => <button type="button">Planted</button>;\n'],
  ["the design system built on a shadcn component", "src/renderer/design_system/zz_planted.tsx", 'import { Button } from "@/components/ui/button";\nexport const PlantedControl = () => <Button>Planted</Button>;\n'],
  ["a round shape inside a shadcn component", "src/renderer/components/ui/zz-planted.tsx", 'export const PlantedDot = () => <span className="size-2 rounded-full bg-border" />;\n'],
  ["an icon's circle in icons.ts", "src/renderer/icons.ts", 'export const PLANTED_ICON = \'<svg><circle r="3" /></svg>\';\n'],
  ["a process.platform read inside platform/", "src/main/platform/zz_planted.ts", "export const plantedPlatform = process.platform;\n"],
  ["process.platform named in a comment", "src/main/zz_planted.ts", "// process.platform differs here, so the platform layer decides\nexport const plantedValue = 1;\n"],
  ["electron imported by an adapter", "src/main/electron_adapters/zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n'],
  ["electron imported by the preload", "src/preload/zz_planted.ts", 'import { ipcRenderer } from "electron";\nexport const plantedBridge = ipcRenderer;\n'],
  ["process.stdout written by tatolab_app_log.ts", "src/main/tatolab_app_log.ts", 'process.stdout.write("planted");\n'],
  ["a cast, a throw and a Sync call in a main-process test", "src/main/zz_planted.test.ts", 'import { readFileSync } from "node:fs";\nexport const planted = readFileSync("/dev/null") as Buffer;\nexport function failing(): void {\n  throw new Error("planted");\n}\n'],
  ["a process.platform read in a fake under platform/", "src/main/platform/fake_zz_planted.ts", "export const plantedPlatform = process.platform;\n"],
  ["electron imported by a fake under electron_adapters/", "src/main/electron_adapters/fake_zz_planted.ts", 'import { app } from "electron";\nexport const plantedApp = app;\n'],
  ["a cast and a throw in a fake", "src/main/fake_zz_planted.ts", 'export const planted = JSON.parse("1") as number;\nexport function failing(): void {\n  throw new Error("planted");\n}\n'],
  ["as const in shipped main-process code", "src/main/zz_planted.ts", 'export const planted = ["as a string", "throw it"] as const;\n'],
  ["the forms named only in a comment and a string", "src/main/zz_planted.ts", '// planted: as Error, throw, Date.now() and electron in a comment\nexport const planted = "throw it and Date.now()";\n'],
];

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

test.each(stylesheetCases)("stylelint on %s", async (_caseDescription, plantedStylesheet, isReported) => {
  const { results } = await stylelint.lint({ code: plantedStylesheet, codeFilename: `${REPOSITORY_ROOT}src/renderer/styles/zz_planted.css`, cwd: REPOSITORY_ROOT });
  expect((results[0]?.warnings ?? []).length > 0).toBe(isReported);
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
  const commitlint = promisify(execFile)(`${REPOSITORY_ROOT}node_modules/.bin/commitlint`, [], { cwd: REPOSITORY_ROOT });
  commitlint.child.stdin?.end(pullRequestTitle);
  const accepted = await commitlint.then(
    () => true,
    () => false,
  );
  expect(accepted).toBe(isAccepted);
});
