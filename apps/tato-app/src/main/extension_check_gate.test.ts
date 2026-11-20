import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import {
  EXTENSION_SDK_KIT_ENVIRONMENT_VARIABLE,
  extensionFolderGated,
  ExtensionFolderChecksKept,
  folderVersionOf,
  gateDecisionOf,
  LAST_PASSED_VERSION_KEPT,
  NOTHING_UNCHECKED_IS_LOADED,
  STUDIO_EXTENSION_SDK_VERSION,
  type ExtensionFolderChecksSources,
} from "./extension_check_gate.js";
import { answersOfAFolderFailingTheGate, answersOfAFolderPassingTheGate, fileReadAnswer, passingCheckAnswer, sdkAsCheckedWith, sha256OfTheText } from "./extension_check_gate_test_support.js";
import { controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { runtimeControlLayer } from "./runtime_control_layer.js";
import { controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps } from "./tatolab_commands_test_support.js";
import type { ControlContractComponents } from "./tatolab_runtime_control_operation_call.js";

afterEach(cleanUpTheFakesTheLastTestMade);

type ProjectCodeCheckResult = ControlContractComponents["ProjectCodeCheckResult"];

const NIGHT_SHOW = "/home/sam/streams/night-show";
const METER_SCRIPT = "export const level: number = 1;\n";
const METER_PAGE = '<!doctype html><script type="module" src="./meter.ts"></script>\n';
const METER_FILES_READ = new Map([
  ["views/meter/index.html", Buffer.from(METER_PAGE)],
  ["views/meter/meter.ts", Buffer.from(METER_SCRIPT)],
]);

/** A check of meter's two files, as the runtime answers one, with `overrides` in place. */
function meterCheck(overrides: Partial<ProjectCodeCheckResult> = {}): ProjectCodeCheckResult {
  return {
    verdict: "passed",
    checks: [
      { check: "extension_types", state: "passed", checked_with: ["tsc 7.0.2", sdkAsCheckedWith()] },
      { check: "extension_lint", state: "passed", checked_with: ["oxlint 1.91.0", sdkAsCheckedWith()] },
    ],
    findings: [],
    files_checked: [
      { path: "views/meter/index.html", content_sha256: sha256OfTheText(METER_PAGE) },
      { path: "views/meter/meter.ts", content_sha256: sha256OfTheText(METER_SCRIPT) },
    ],
    ...overrides,
  };
}

test("a passing check over the very bytes read, with this Studio's SDK, passes; warnings alone pass", () => {
  expect(gateDecisionOf(meterCheck(), METER_FILES_READ, "", null)).toEqual({ kind: "passed" });
  expect(
    gateDecisionOf(
      meterCheck({ findings: [{ check: "extension_lint", finding_code: "not_written_in_ts", severity: "warning", words: "write it in .ts", path: "views/meter/old.js" }] }),
      METER_FILES_READ,
      "",
      null,
    ),
  ).toEqual({ kind: "passed" });
});

test("a type error blocks the view with the Studio's line, then each finding with its file and line as the open project names it", () => {
  const failed = meterCheck({
    verdict: "failed",
    checks: [
      { check: "extension_types", state: "failed", checked_with: ["tsc 7.0.2", sdkAsCheckedWith()] },
      { check: "extension_lint", state: "passed", checked_with: ["oxlint 1.91.0", sdkAsCheckedWith()] },
    ],
    findings: [
      { check: "extension_types", finding_code: "TS2322", severity: "error", words: "Type 'string' is not assignable to type 'number'.", path: "views/meter/meter.ts", line: 1, column: 14 },
      { check: "extension_lint", finding_code: "typescript(no-explicit-any)", severity: "error", words: "Unexpected any. Specify a different type.", path: "views/meter/meter.ts", line: 2, column: null },
    ],
  });

  expect(gateDecisionOf(failed, METER_FILES_READ, "imports/lobby-wall/", null)).toEqual({
    kind: "blocked",
    checked_to_its_end: true,
    words: [
      "This view's code did not pass the runtime's check, so the Studio does not load it.",
      "imports/lobby-wall/views/meter/meter.ts:1:14: error: Type 'string' is not assignable to type 'number'. (TS2322)",
      "imports/lobby-wall/views/meter/meter.ts:2: error: Unexpected any. Specify a different type. (typescript(no-explicit-any))",
    ].join("\n"),
  });
});

test("a runtime that found no kit blocks the view with its reason as given, and an unpackaged Studio's line names the variable and this checkout's kit", () => {
  const noKit = {
    refusal_code: "extension_sdk_not_found",
    action: "check_project_code",
    runtime_words: "no extension SDK kit: looked in /opt/tatolab/lib/tatolab/extension-sdk, TATOLAB_EXTENSION_SDK_KIT (not set), and node_modules/@tatolab/tato-app-view-sdk",
  } as const;
  const notChecked = meterCheck({
    verdict: "not_fully_checked",
    checks: [
      { check: "extension_types", state: "not_checked", not_checked_because: noKit },
      { check: "extension_lint", state: "not_checked", not_checked_because: noKit },
    ],
    files_checked: [],
  });

  expect(gateDecisionOf(notChecked, METER_FILES_READ, "", null)).toEqual({
    kind: "blocked",
    checked_to_its_end: false,
    words: ["The runtime found no extension SDK to check this view's code against, so the Studio does not load it.", noKit.runtime_words, NOTHING_UNCHECKED_IS_LOADED].join("\n"),
  });
  const withTheCheckoutsKit = gateDecisionOf(notChecked, METER_FILES_READ, "", "/home/sam/tatolab-app/packages/tato-app-view-sdk/dist/kit");
  expect(withTheCheckoutsKit.kind === "blocked" && withTheCheckoutsKit.words.split("\n")[0]).toBe(
    `The runtime found no extension SDK to check this view's code against, so the Studio does not load it. Start tatolabd with ${EXTENSION_SDK_KIT_ENVIRONMENT_VARIABLE}=/home/sam/tatolab-app/packages/tato-app-view-sdk/dist/kit, the kit this checkout's SDK build wrote.`,
  );
});

test("a check that ran out of time blocks the view with the runtime's words, and nothing unchecked is loaded", () => {
  const ranOutOfTime = { refusal_code: "check_ran_out_of_time", action: "check_project_code", runtime_words: "tsc ran past 120 s over views/meter" } as const;
  const decision = gateDecisionOf(
    meterCheck({ verdict: "not_fully_checked", checks: [{ check: "extension_types", state: "not_checked", not_checked_because: ranOutOfTime }], files_checked: [] }),
    METER_FILES_READ,
    "",
    null,
  );

  expect(decision).toEqual({
    kind: "blocked",
    checked_to_its_end: false,
    words: ["The runtime could not finish checking this view's code, so the Studio does not load it.", ranOutOfTime.runtime_words, NOTHING_UNCHECKED_IS_LOADED].join("\n"),
  });
});

test("a file whose checked bytes differ from those read, or a file checked that was not read, reads the folder again", () => {
  expect(gateDecisionOf(meterCheck({ files_checked: [{ path: "views/meter/meter.ts", content_sha256: sha256OfTheText("export const level = 2;\n") }] }), METER_FILES_READ, "", null)).toEqual({
    kind: "read_again",
  });
  expect(
    gateDecisionOf(meterCheck({ files_checked: [...meterCheck().files_checked, { path: "views/meter/added.ts", content_sha256: sha256OfTheText("") }] }), METER_FILES_READ, "", null),
  ).toEqual({ kind: "read_again" });
});

test("a check run with another SDK, or code checked with no SDK, blocks the view; a folder with no .ts needs none", () => {
  const otherSdk = gateDecisionOf(
    meterCheck({ checks: [{ check: "extension_types", state: "passed", checked_with: ["tsc 7.0.2", sdkAsCheckedWith("9.9.9")] }] }),
    METER_FILES_READ,
    "",
    null,
  );
  expect(otherSdk).toEqual({
    kind: "blocked",
    checked_to_its_end: true,
    words: `The runtime checked this view's code against @tatolab/tato-app-view-sdk 9.9.9, and this Studio is built with @tatolab/tato-app-view-sdk ${STUDIO_EXTENSION_SDK_VERSION}, so the Studio does not load it.\n${NOTHING_UNCHECKED_IS_LOADED}`,
  });
  const noSdk = meterCheck({ checks: [{ check: "extension_types", state: "passed", checked_with: [] }] });
  expect(gateDecisionOf(noSdk, METER_FILES_READ, "", null).kind).toBe("blocked");
  expect(gateDecisionOf({ ...noSdk, files_checked: noSdk.files_checked.slice(0, 1) }, new Map([["views/meter/index.html", Buffer.from(METER_PAGE)]]), "", null)).toEqual({ kind: "passed" });
});

/** The gate run over a fake local API answering `scriptedAnswers` in order, keeping its outcomes in `checksKept`; with each call the runtime received. */
async function gateOver(scriptedAnswers: readonly Buffer[], checksKept = new ExtensionFolderChecksKept()) {
  const server = await FakeLocalApiServer.answering(scriptedAnswers);
  cleanUps.push(() => server.close());
  const sources: ExtensionFolderChecksSources = { kitFolderOfThisCheckout: null, checksKept };
  return {
    gated: (folderInTheProject: string) => Effect.runPromise(extensionFolderGated(NIGHT_SHOW, { folder_in_the_project: folderInTheProject }, sources).pipe(Effect.provide(runtimeControlLayer(server.localApiSocketPath, 2_000)))),
    methodsCalled: () => controlOperationCallsReceivedBy(server).map(([method]) => method),
    callsReceived: () => controlOperationCallsReceivedBy(server),
    checksKept,
  };
}

test("a passing folder is read, checked and served at its version, kept until a file of it changes, then checked again", async () => {
  const gate = await gateOver([
    ...answersOfAFolderPassingTheGate("views/meter", { "index.html": METER_PAGE, "meter.ts": METER_SCRIPT }),
    ...answersOfAFolderPassingTheGate("views/meter", { "index.html": METER_PAGE, "meter.ts": METER_SCRIPT }),
  ]);

  const firstGated = await gate.gated("views/meter");
  expect(firstGated).toEqual({ kind: "passed", folder_version: folderVersionOf(METER_FILES_READ), files: METER_FILES_READ });
  expect(await gate.gated("views/meter")).toBe(firstGated);
  expect(gate.methodsCalled()).toEqual(["list_project_files", "read_project_file", "read_project_file", "check_project_code"]);
  expect(gate.callsReceived()[3]?.[1]).toEqual({ project_directory: NIGHT_SHOW, paths: ["views/meter/index.html", "views/meter/meter.ts"] });

  gate.checksKept.forgetTheFoldersHolding(NIGHT_SHOW, ["views/deck/deck.ts"]);
  expect(await gate.gated("views/meter")).toBe(firstGated);
  gate.checksKept.forgetTheFoldersHolding(NIGHT_SHOW, ["views/meter/meter.ts"]);
  expect(await gate.gated("views/meter")).toEqual(firstGated);
  expect(gate.methodsCalled()).toHaveLength(8);
});

test("a folder blocked after a version of it passed is held at that version with why the newer one is blocked, and passes again when fixed", async () => {
  const brokenScript = 'export const level: number = "loud";\n';
  const fixedScript = "export const level: number = 3;\n";
  const gate = await gateOver([
    ...answersOfAFolderPassingTheGate("views/meter", { "meter.ts": METER_SCRIPT }),
    ...answersOfAFolderFailingTheGate("views/meter", { "meter.ts": brokenScript }, { path: "views/meter/meter.ts", line: 1, column: 14, words: "Type 'string' is not assignable to type 'number'." }),
    ...answersOfAFolderPassingTheGate("views/meter", { "meter.ts": fixedScript }),
  ]);

  const passed = await gate.gated("views/meter");
  gate.checksKept.forgetTheFoldersHolding(NIGHT_SHOW, ["views/meter/meter.ts"]);
  const held = await gate.gated("views/meter");

  expect(held).toEqual({
    kind: "held",
    last_passed: passed,
    newer_version_blocked_because: [
      LAST_PASSED_VERSION_KEPT,
      "The newer version of this view's code is blocked.",
      "views/meter/meter.ts:1:14: error: Type 'string' is not assignable to type 'number'. (TS2322)",
    ].join("\n"),
  });
  expect(await gate.gated("views/meter")).toEqual(held);
  gate.checksKept.forgetTheFoldersHolding(NIGHT_SHOW, ["views/meter/meter.ts"]);
  expect(await gate.gated("views/meter")).toMatchObject({ kind: "passed", files: new Map([["views/meter/meter.ts", Buffer.from(fixedScript)]]) });
});

test("a folder whose only version this session is blocked, as after a restart, is blocked and not held", async () => {
  const gate = await gateOver(
    answersOfAFolderFailingTheGate("views/meter", { "meter.ts": METER_SCRIPT }, { path: "views/meter/meter.ts", line: 1, column: 14, words: "Type 'string' is not assignable to type 'number'." }),
  );

  expect(await gate.gated("views/meter")).toMatchObject({ kind: "blocked", checked_to_its_end: true });
});

test("a file that changed between the read and the check reads the folder again and serves the bytes the check passed", async () => {
  const editedScript = "export const level: number = 2;\n";
  const gate = await gateOver([
    controlOperationResultResponse({ files: [{ path: "views/meter/meter.ts", byte_len: METER_SCRIPT.length }] }),
    fileReadAnswer("views/meter/meter.ts", METER_SCRIPT),
    passingCheckAnswer({ "views/meter/meter.ts": editedScript }),
    ...answersOfAFolderPassingTheGate("views/meter", { "meter.ts": editedScript }),
  ]);

  expect(await gate.gated("views/meter")).toMatchObject({ kind: "passed", files: new Map([["views/meter/meter.ts", Buffer.from(editedScript)]]) });
});

test("a runtime that does not answer blocks the folder in its words, and the folder is checked again at the next listing", async () => {
  const checksKept = new ExtensionFolderChecksKept();
  const sources: ExtensionFolderChecksSources = { kitFolderOfThisCheckout: null, checksKept };
  const gated = await Effect.runPromise(
    extensionFolderGated(NIGHT_SHOW, { folder_in_the_project: "views/meter" }, sources).pipe(Effect.provide(runtimeControlLayer("/tmp/tl-app-nothing-listens-here/local-api.sock", 2_000))),
  );

  expect(gated.kind === "blocked" && gated.words.split("\n")).toEqual([
    "The runtime did not answer the check of this view's code, so the Studio does not load it.",
    expect.any(String),
    NOTHING_UNCHECKED_IS_LOADED,
  ]);
  expect(checksKept.kept(NIGHT_SHOW, "views/meter")).toBeNull();
});

test("an outcome whose check started before a change was noticed is not kept", async () => {
  const gate = await gateOver(answersOfAFolderPassingTheGate("views/meter", { "meter.ts": METER_SCRIPT }));
  const gating = gate.gated("views/meter");
  gate.checksKept.forgetTheFoldersHolding(NIGHT_SHOW, ["views/meter/meter.ts"]);

  expect((await gating).kind).toBe("passed");
  expect(gate.checksKept.kept(NIGHT_SHOW, "views/meter")).toBeNull();
});

test("an import's view is checked in the import's own folder, and served by its path in the open project", async () => {
  const gate = await gateOver(answersOfAFolderPassingTheGate("imports/lobby-wall/views/meter", { "meter.ts": METER_SCRIPT }, "imports/lobby-wall/"));

  expect(await gate.gated("imports/lobby-wall/views/meter")).toMatchObject({ kind: "passed", files: new Map([["imports/lobby-wall/views/meter/meter.ts", Buffer.from(METER_SCRIPT)]]) });
  expect(gate.callsReceived().at(-1)?.[1]).toEqual({ project_directory: `${NIGHT_SHOW}/imports/lobby-wall`, paths: ["views/meter/meter.ts"] });
});
