// `npm run lint` runs the Effect diagnostics of @effect/tsgo over the app's two projects. Each mistake it is there
// for, an Effect built and never run first, fails the step when planted, and each rule the pinned tool knows is set to
// error or off in tsconfig.effect_diagnostics.json, so none runs at a default nobody chose. A rule TypeScript, ESLint
// or oxlint already reports stays off here, so no mistake is reported by two tools.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

const TATO_APP_ROOT = new URL("../..", import.meta.url).pathname;
const MONOREPO_ROOT = new URL("../../../..", import.meta.url).pathname;
const EFFECT_DIAGNOSTICS_STEP = "effect-tsgo diagnostics --project tsconfig.json --format text";
const EFFECT_DIAGNOSTICS_CONFIG = "tsconfig.effect_diagnostics.json";
const APP_TSCONFIGS = ["tsconfig.json", "tsconfig.node.json", "tsconfig.web.json", "tsconfig.base.json", EFFECT_DIAGNOSTICS_CONFIG];
const PLANTED_RUN_TIMEOUT_MS = 60_000;

// What each rule left off here would report twice, and the tool that already reports it.
const RULES_ANOTHER_TOOL_REPORTS: Record<string, string> = {
  missingEffectContext: "TypeScript: an Effect whose services are not provided is not assignable",
  missingEffectError: "TypeScript: an Effect whose failure is not handled is not assignable",
  missingLayerContext: "TypeScript: a Layer whose services are not provided is not assignable",
  unsafeEffectTypeAssertion: "oxlint: typescript/consistent-type-assertions refuses every type assertion",
  anyUnknownInErrorContext: "oxlint: typescript/no-explicit-any refuses an any written in a channel",
  globalConsole: "oxlint: no-console",
  globalConsoleInEffect: "oxlint: no-console",
  globalDate: "ESLint: new Date and Date.now in shipped main-process code",
  globalDateInEffect: "ESLint: new Date and Date.now in shipped main-process code",
  schemaSync: "ESLint: a *Sync( call in shipped main-process code",
  schemaSyncInEffect: "ESLint: a *Sync( call in shipped main-process code",
  preferUnsafeConstructor: "ESLint: a *Sync( call in shipped main-process code, Effect.runSync included",
};

interface EffectDiagnosticsConfig {
  diagnosticSeverity: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The Effect language service plugin's options in `tsconfig.effect_diagnostics.json`. */
function effectDiagnosticsConfig(): EffectDiagnosticsConfig {
  const tsconfig: unknown = JSON.parse(readFileSync(path.join(TATO_APP_ROOT, EFFECT_DIAGNOSTICS_CONFIG), "utf8"));
  const compilerOptions = isRecord(tsconfig) ? tsconfig.compilerOptions : undefined;
  const plugins = isRecord(compilerOptions) && Array.isArray(compilerOptions.plugins) ? compilerOptions.plugins : [];
  const plugin: unknown = plugins.find((candidate: unknown) => isRecord(candidate) && candidate.name === "@effect/language-service");
  const severities = isRecord(plugin) && isRecord(plugin.diagnosticSeverity) ? plugin.diagnosticSeverity : {};
  return { diagnosticSeverity: Object.fromEntries(Object.entries(severities).filter((entry): entry is [string, string] => typeof entry[1] === "string")) };
}

/** Every rule the installed @effect/tsgo knows, from the plugin options schema it publishes. */
function rulesThePinnedToolKnows(): string[] {
  const schema: unknown = JSON.parse(readFileSync(path.join(MONOREPO_ROOT, "node_modules/@effect/tsgo/schema.json"), "utf8"));
  const definitions = isRecord(schema) ? schema.definitions : undefined;
  const severityDefinition = isRecord(definitions) ? definitions.effectLanguageServicePluginDiagnosticSeverityDefinition : undefined;
  const ruleProperties = isRecord(severityDefinition) ? severityDefinition.properties : undefined;
  return isRecord(ruleProperties) ? Object.keys(ruleProperties).sort() : [];
}

interface PlantedRun {
  exitCode: number | null;
  /** The rules reported for each planted file, keyed by its path inside the app. */
  rulesReportedFor: (pathInApp: string) => string[];
  output: string;
}

/**
 * Runs the lint's Effect diagnostics step over a copy of the app's tsconfigs that holds only `plantedFiles`, keyed by
 * their path inside the app. The copy sits beside the monorepo's node_modules, so the type check and lint running
 * alongside the tests never see a planted file. A path under `node_modules/` plants a package beside the app's.
 */
function runTheDiagnosticsStepOn(plantedFiles: Record<string, string>): PlantedRun {
  const mirrorRoot = mkdtempSync(path.join(tmpdir(), "tato-app-effect-diagnostics-"));
  try {
    symlinkSync(path.join(MONOREPO_ROOT, "node_modules"), path.join(mirrorRoot, "node_modules"));
    const appMirror = path.join(mirrorRoot, "apps/tato-app");
    mkdirSync(appMirror, { recursive: true });
    for (const tsconfig of APP_TSCONFIGS) copyFileSync(path.join(TATO_APP_ROOT, tsconfig), path.join(appMirror, tsconfig));
    for (const [pathInApp, plantedSource] of Object.entries(plantedFiles)) {
      mkdirSync(path.dirname(path.join(appMirror, pathInApp)), { recursive: true });
      writeFileSync(path.join(appMirror, pathInApp), plantedSource);
    }
    const diagnosticsRun = spawnSync("sh", ["-c", EFFECT_DIAGNOSTICS_STEP], {
      cwd: appMirror,
      encoding: "utf8",
      env: { ...process.env, PATH: `${path.join(MONOREPO_ROOT, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    const output = `${diagnosticsRun.stdout}${diagnosticsRun.stderr}`;
    const reported = [...output.matchAll(/^(.+?)\(\d+,\d+\): \w+ effect\((\w+)\)/gm)].map(([, filePath = "", ruleName = ""]) => ({ pathInApp: path.relative(appMirror, filePath), ruleName }));
    return {
      exitCode: diagnosticsRun.status,
      rulesReportedFor: (pathInApp) => reported.filter((diagnostic) => diagnostic.pathInApp === pathInApp).map((diagnostic) => diagnostic.ruleName),
      output,
    };
  } finally {
    rmSync(mirrorRoot, { recursive: true, force: true });
  }
}

test("npm run lint runs the Effect diagnostics over the app's two projects", () => {
  const manifest: unknown = JSON.parse(readFileSync(path.join(TATO_APP_ROOT, "package.json"), "utf8"));
  const scripts = isRecord(manifest) ? manifest.scripts : undefined;
  const lintScript = isRecord(scripts) && typeof scripts.lint === "string" ? scripts.lint : "";

  expect(lintScript.split("&&").map((command) => command.trim())).toContain(EFFECT_DIAGNOSTICS_STEP);
});

test("each rule the pinned tool knows is set to error or off on purpose", () => {
  const { diagnosticSeverity } = effectDiagnosticsConfig();

  expect(rulesThePinnedToolKnows().length).toBeGreaterThan(0);
  expect(Object.keys(diagnosticSeverity).sort()).toEqual(rulesThePinnedToolKnows());
  expect(Object.values(diagnosticSeverity).filter((severity) => severity !== "error" && severity !== "off")).toEqual([]);
});

test.each(Object.entries(RULES_ANOTHER_TOOL_REPORTS))("leaves %s off: %s", (ruleName) => {
  expect(effectDiagnosticsConfig().diagnosticSeverity[ruleName]).toBe("off");
});

const NEVER_RUN_EFFECT = 'import { Effect } from "effect";\n\nEffect.log("planted and never run");\n';
const LAYER_PROVIDED = [
  'import { Context, Effect, Layer } from "effect";',
  "",
  'class Planted extends Context.Service<Planted, { readonly words: string }>()("Planted") {}',
  "",
  'export const provided = Effect.void.pipe(Effect.provide(Layer.succeed(Planted, { words: "planted" })));',
  "",
].join("\n");

const reportedCases: [string, string, string, string][] = [
  ["an Effect built and never run in shipped main-process code", "src/main/zz_planted.ts", NEVER_RUN_EFFECT, "floatingEffect"],
  ["an Effect built and never run in the window", "src/renderer/zz_planted.ts", NEVER_RUN_EFFECT, "floatingEffect"],
  ["an Effect built and never run in a main-process test", "src/main/zz_planted.test.ts", NEVER_RUN_EFFECT, "floatingEffect"],
  ["an Effect built and never run in the mock window", "mock/zz_planted.ts", NEVER_RUN_EFFECT, "floatingEffect"],
  [
    "an Effect returned from a generator instead of run in it",
    "src/main/zz_planted.ts",
    'import { Effect } from "effect";\n\nexport const planted = Effect.gen(function* () {\n  return Effect.log("planted and never run");\n});\n',
    "returnEffectInGen",
  ],
  [
    "Effect.runPromise inside an Effect",
    "src/main/zz_planted.ts",
    'import { Effect } from "effect";\n\nexport const planted = Effect.gen(function* () {\n  return yield* Effect.promise(() => Effect.runPromise(Effect.succeed(1)));\n});\n',
    "runEffectInsideEffect",
  ],
  ["a layer provided away from the composition root", "src/main/zz_planted.ts", LAYER_PROVIDED, "strictEffectProvide"],
  ["an Effect API marked unstable", "src/main/zz_planted.ts", 'import { Effect } from "effect";\n\nexport const planted = Effect.withErrorReporting(Effect.void);\n', "unstableApiUsage"],
  ["@effect/vitest outside a test", "src/main/zz_planted.ts", 'import { it } from "@effect/vitest";\n\nexport const planted = it;\n', "unstableApiUsage"],
];

test.each(reportedCases)(
  "fails on %s",
  (_caseDescription, pathInApp, plantedSource, expectedRuleName) => {
    const plantedRun = runTheDiagnosticsStepOn({ [pathInApp]: plantedSource });

    expect(plantedRun.rulesReportedFor(pathInApp), plantedRun.output).toEqual([expectedRuleName]);
    expect(plantedRun.exitCode).not.toBe(0);
  },
  PLANTED_RUN_TIMEOUT_MS,
);

test(
  "fails on two copies of effect in the program",
  () => {
    const plantedRun = runTheDiagnosticsStepOn({
      "src/main/zz_planted.ts": 'import { Effect } from "effect";\nimport { secondCopy } from "zz-planted-second-effect";\n\nexport const planted = [Effect.void, secondCopy];\n',
      "node_modules/zz-planted-second-effect/package.json": '{ "name": "zz-planted-second-effect", "version": "1.0.0", "types": "index.d.ts" }\n',
      "node_modules/zz-planted-second-effect/index.d.ts": 'export { secondCopy } from "effect";\n',
      "node_modules/zz-planted-second-effect/node_modules/effect/package.json": '{ "name": "effect", "version": "4.1.3", "types": "index.d.ts" }\n',
      "node_modules/zz-planted-second-effect/node_modules/effect/index.d.ts": "export declare const secondCopy: unknown;\n",
    });

    expect(plantedRun.rulesReportedFor("src/main/zz_planted.ts"), plantedRun.output).toEqual(["duplicatePackage"]);
    expect(plantedRun.exitCode).not.toBe(0);
  },
  PLANTED_RUN_TIMEOUT_MS,
);

const quietCases: [string, string, string][] = [
  ["an Effect yielded and an Effect kept", "src/main/zz_planted.ts", 'import { Effect } from "effect";\n\nexport const planted = Effect.gen(function* () {\n  yield* Effect.log("planted");\n});\n'],
  ["a layer provided at the composition root", "src/main/main.ts", LAYER_PROVIDED],
  ["a layer provided in a test", "src/main/zz_planted.test.ts", LAYER_PROVIDED],
  [
    "@effect/vitest in a test",
    "src/main/zz_planted.test.ts",
    'import { expect, it } from "@effect/vitest";\nimport { Effect } from "effect";\n\nit.effect("planted", () => Effect.sync(() => expect(1).toBe(1)));\n',
  ],
  [
    "a console call, a wall-clock read, a Sync decode and a type assertion inside an Effect, which ESLint and oxlint report",
    "src/main/zz_planted.ts",
    [
      'import { Effect, Schema } from "effect";',
      "",
      "export const planted = Effect.gen(function* () {",
      "  console.log(new Date(), Date.now());",
      '  return Schema.decodeUnknownSync(Schema.String)("planted");',
      "}) as Effect.Effect<string, never, never>;",
      "",
    ].join("\n"),
  ],
];

test.each(quietCases)(
  "passes %s",
  (_caseDescription, pathInApp, plantedSource) => {
    const plantedRun = runTheDiagnosticsStepOn({ [pathInApp]: plantedSource });

    expect(plantedRun.rulesReportedFor(pathInApp), plantedRun.output).toEqual([]);
    expect(plantedRun.exitCode, plantedRun.output).toBe(0);
  },
  PLANTED_RUN_TIMEOUT_MS,
);
