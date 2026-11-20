// The gate every project extension folder passes before the Studio serves a byte of it: the
// folder's files are read through the runtime's `read_project_file`, the runtime's
// `check_project_code` checks them, and the bytes read are kept to serve only when the verdict is
// `passed`, every file the check finished holds the bytes the Studio read, and the check ran with
// the extension SDK this Studio is built with. A file that changed between the read and the check
// reads the folder again. A folder that does not pass is blocked with the Studio's one line and
// the runtime's own words; nothing unchecked is served. An outcome is kept until the runtime names
// a file of its folder among the project's changed files, so a folder is checked when its project
// is listed and after each change to it, never as one of its views opens. A folder that passed once
// in this session and is blocked after a change is held: the Studio keeps serving the version that
// last passed, at its own version, and says the newer one is blocked. Passed versions are kept in
// memory only, so after a restart a folder with only a blocked version is blocked.

import { createHash } from "node:crypto";
import path from "node:path";
import viewSdkPackageJson from "@tatolab/tato-app-view-sdk/package.json" with { type: "json" };
import { Effect } from "effect";
import type { RuntimeControlFailure } from "./runtime_control_failures.js";
import { listProjectFiles, readProjectFile } from "./runtime_operations.js";
import { RuntimeControl, type ControlContractComponents } from "./tatolab_runtime_control_operation_call.js";

/** The extension SDK a project's extension is checked against, as the runtime's `checked_with` names it. */
export const EXTENSION_SDK_PACKAGE_NAME = viewSdkPackageJson.name;

/** The version of the extension SDK this Studio is built with, the only one a check it serves from may have run with. */
export const STUDIO_EXTENSION_SDK_VERSION = viewSdkPackageJson.version;

/** The variable naming the kit a runtime checks extensions against when it carries none. */
export const EXTENSION_SDK_KIT_ENVIRONMENT_VARIABLE = "TATOLAB_EXTENSION_SDK_KIT";

/** The Studio's line over the words of a folder held at the version that last passed. */
export const LAST_PASSED_VERSION_KEPT = "Tato Studio keeps showing the version that last passed.";

/** The line that closes the words of a folder the runtime did not finish checking. */
export const NOTHING_UNCHECKED_IS_LOADED = "Nothing unchecked is loaded.";

type ProjectCodeCheckResult = ControlContractComponents["ProjectCodeCheckResult"];
type ProjectCodeCheckFinding = ControlContractComponents["ProjectCodeCheckFinding"];

/** How many times a folder is read and checked before a folder still changing under the check is blocked. */
const READS_OF_A_CHANGING_FOLDER = 3;

/** An extension folder of an open project: its path in the open project, a view's as `views/deck` or `imports/levels/views/meter`, a module's node UI folder's as `node_ui` or `imports/levels/node_ui`. */
export interface ExtensionFolderToGate {
  readonly folder_in_the_project: string;
}

/** A folder that passed: its files as the Studio read and the runtime checked them, by path in the open project, and the version naming those bytes. */
export interface ExtensionFolderPassed {
  readonly kind: "passed";
  readonly folder_version: string;
  readonly files: ReadonlyMap<string, Buffer>;
}

/** A folder that did not pass: the Studio's line, then the runtime's words; `checked_to_its_end` when the runtime answered a whole check, so the outcome stands until the folder changes. */
export interface ExtensionFolderBlocked {
  readonly kind: "blocked";
  readonly words: string;
  readonly checked_to_its_end: boolean;
}

/** A folder whose newest version is blocked while a version that passed earlier in this session is kept: the version still served, and why the newer one is not, the Studio's line then the gate's words. */
export interface ExtensionFolderHeld {
  readonly kind: "held";
  readonly last_passed: ExtensionFolderPassed;
  readonly newer_version_blocked_because: string;
}

/** How the gate left one folder. */
export type ExtensionFolderGated = ExtensionFolderPassed | ExtensionFolderHeld | ExtensionFolderBlocked;

/** How the gate left one folder from one check, before a version that passed earlier is held. */
export type ExtensionFolderChecked = ExtensionFolderPassed | ExtensionFolderBlocked;

/** What the gate needs beside the runtime: its kept outcomes, and the kit folder a person starting the runtime by hand names. */
export interface ExtensionFolderChecksSources {
  /** The kit an unpackaged Studio's runtime is started with through `TATOLAB_EXTENSION_SDK_KIT`; `null` when the Studio carries its runtime. */
  readonly kitFolderOfThisCheckout: string | null;
  readonly checksKept: ExtensionFolderChecksKept;
}

/** The project the runtime checks a folder of: an import's own folder for a folder under `imports/<import>/`, else the open project; with the prefix its paths carry in the open project. */
function theProjectThatHoldsTheFolder(openProjectFolder: string, folderInTheProject: string): { readonly project_directory: string; readonly prefix_in_the_open_project: string } {
  const importFolder = /^imports\/([^/]+)\//.exec(folderInTheProject)?.[1];
  return importFolder === undefined
    ? { project_directory: openProjectFolder, prefix_in_the_open_project: "" }
    : { project_directory: path.join(openProjectFolder, "imports", importFolder), prefix_in_the_open_project: `imports/${importFolder}/` };
}

/** Whether `folderInTheProject` is a module's node UI folder, its own `node_ui` or an import's `imports/<import>/node_ui`, rather than a view's. */
export function isANodeUiFolder(folderInTheProject: string): boolean {
  return folderInTheProject === "node_ui" || /^imports\/[^/]+\/node_ui$/.test(folderInTheProject);
}

/** What the words call the code of the folder `folderInTheProject`: a module's node UI folder's controls and node bodies, or a view's. */
export function codeWordsOfTheFolder(folderInTheProject: string): string {
  return isANodeUiFolder(folderInTheProject) ? "this module's node UI code" : "this view's code";
}

/** `words` with its first letter a capital. */
function capitalized(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The version naming `files`, by path and bytes: two folders with the same version hold the same files. */
export function folderVersionOf(files: ReadonlyMap<string, Buffer>): string {
  const versionHash = createHash("sha256");
  for (const [filePath, fileBytes] of [...files].sort(([leftPath], [rightPath]) => (leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0))) {
    versionHash.update(`${filePath}\0${createHash("sha256").update(fileBytes).digest("hex")}\0`);
  }
  return versionHash.digest("hex").slice(0, 16);
}

/** `finding` as the Studio lists it: its place, as the open project names the file, then the runtime's words and code. */
function findingLine(finding: ProjectCodeCheckFinding, prefixInTheOpenProject: string): string {
  const place = [`${prefixInTheOpenProject}${finding.path}`, finding.line, finding.line === null || finding.line === undefined ? null : finding.column].filter((part) => part !== null && part !== undefined).join(":");
  return `${place}: ${finding.severity}: ${finding.words} (${finding.finding_code})`;
}

/** What the gate decides of a check: pass, block with words, or read the folder again as a file changed under the check. */
export type GateDecision = { readonly kind: "passed" } | ExtensionFolderBlocked | { readonly kind: "read_again" };

/**
 * What the gate decides of `checked`, the runtime's check of the folder whose bytes it read as `filesRead` (by path in the project it
 * asked about): passed only on a `passed` verdict over those very bytes, checked with this Studio's SDK; `kitFolderOfThisCheckout`
 * named in the words when no kit was found, and the folder's code called `codeWords` in them.
 */
export function gateDecisionOf(
  checked: ProjectCodeCheckResult,
  filesRead: ReadonlyMap<string, Buffer>,
  prefixInTheOpenProject: string,
  kitFolderOfThisCheckout: string | null,
  codeWords = "this view's code",
): GateDecision {
  const hashesChecked = new Map(checked.files_checked.map((fileChecked) => [fileChecked.path, fileChecked.content_sha256]));
  for (const [filePath, fileBytes] of filesRead) {
    const hashChecked = hashesChecked.get(filePath);
    if (hashChecked !== undefined && hashChecked !== createHash("sha256").update(fileBytes).digest("hex")) return { kind: "read_again" };
  }
  if ([...hashesChecked.keys()].some((filePath) => !filesRead.has(filePath))) return { kind: "read_again" };
  const findingLines = checked.findings.map((finding) => findingLine(finding, prefixInTheOpenProject));
  if (checked.verdict === "failed") {
    return { kind: "blocked", words: [`${capitalized(codeWords)} did not pass the runtime's check, so the Studio does not load it.`, ...findingLines].join("\n"), checked_to_its_end: true };
  }
  if (checked.verdict !== "passed") {
    const notChecked = checked.checks.flatMap((run) => (run.state === "passed" || run.state === "failed" || run.not_checked_because === null || run.not_checked_because === undefined ? [] : [run.not_checked_because]));
    const noKit = notChecked.some((refusal) => refusal.refusal_code === "extension_sdk_not_found");
    const studioLine = noKit
      ? kitFolderOfThisCheckout === null
        ? `The runtime found no extension SDK to check ${codeWords} against, so the Studio does not load it.`
        : `The runtime found no extension SDK to check ${codeWords} against, so the Studio does not load it. Start tatolabd with ${EXTENSION_SDK_KIT_ENVIRONMENT_VARIABLE}=${kitFolderOfThisCheckout}, the kit this checkout's SDK build wrote.`
      : `The runtime could not finish checking ${codeWords}, so the Studio does not load it.`;
    return { kind: "blocked", words: [studioLine, ...[...new Set(notChecked.map((refusal) => refusal.runtime_words))], ...findingLines, NOTHING_UNCHECKED_IS_LOADED].join("\n"), checked_to_its_end: false };
  }
  const sdkVersionsCheckedWith = new Set(
    checked.checks.flatMap((run) => (run.checked_with ?? []).flatMap((checkedWith) => (checkedWith.startsWith(`${EXTENSION_SDK_PACKAGE_NAME} `) ? [checkedWith.slice(EXTENSION_SDK_PACKAGE_NAME.length + 1).split(" ")[0] ?? ""] : []))),
  );
  const holdsCodeToCheck = [...filesRead.keys()].some((filePath) => filePath.endsWith(".ts"));
  const otherSdkVersions = [...sdkVersionsCheckedWith].filter((sdkVersion) => sdkVersion !== STUDIO_EXTENSION_SDK_VERSION);
  if (otherSdkVersions.length > 0 || (holdsCodeToCheck && sdkVersionsCheckedWith.size === 0)) {
    const checkedAgainst = otherSdkVersions.length > 0 ? `${EXTENSION_SDK_PACKAGE_NAME} ${otherSdkVersions.join(", ")}` : `no ${EXTENSION_SDK_PACKAGE_NAME}`;
    return {
      kind: "blocked",
      words: `The runtime checked ${codeWords} against ${checkedAgainst}, and this Studio is built with ${EXTENSION_SDK_PACKAGE_NAME} ${STUDIO_EXTENSION_SDK_VERSION}, so the Studio does not load it.\n${NOTHING_UNCHECKED_IS_LOADED}`,
      checked_to_its_end: true,
    };
  }
  return { kind: "passed" };
}

/** The words of a folder whose check `failure` stopped before the runtime answered it. */
function wordsOfACheckThatDidNotAnswer(failure: RuntimeControlFailure, codeWords: string): string {
  return [`The runtime did not answer the check of ${codeWords}, so the Studio does not load it.`, failure.words, NOTHING_UNCHECKED_IS_LOADED].join("\n");
}

/** The folder `folder` of the project in `openProjectFolder`, read and checked once: each file it holds by path in the project the runtime checks, and the gate's decision. */
const folderReadAndChecked = Effect.fn("extension_folder_read_and_checked")(function* (openProjectFolder: string, folder: ExtensionFolderToGate, kitFolderOfThisCheckout: string | null) {
  const holder = theProjectThatHoldsTheFolder(openProjectFolder, folder.folder_in_the_project);
  const listed = yield* listProjectFiles(openProjectFolder, folder.folder_in_the_project);
  const filesRead = new Map<string, Buffer>();
  for (const listedFile of listed) {
    filesRead.set(listedFile.path.slice(holder.prefix_in_the_open_project.length), yield* readProjectFile(openProjectFolder, listedFile.path));
  }
  const runtimeControl = yield* RuntimeControl;
  const checked = yield* runtimeControl.call("check_project_code", { project_directory: holder.project_directory, paths: [...filesRead.keys()] });
  return { holder, filesRead, decision: gateDecisionOf(checked, filesRead, holder.prefix_in_the_open_project, kitFolderOfThisCheckout, codeWordsOfTheFolder(folder.folder_in_the_project)) };
});

/** The folder `folder` of the project in `openProjectFolder` through the gate, read again while a file changes under its check. */
function folderGated(openProjectFolder: string, folder: ExtensionFolderToGate, kitFolderOfThisCheckout: string | null): Effect.Effect<ExtensionFolderChecked, never, RuntimeControl> {
  const readAndCheck = (readsLeft: number): Effect.Effect<ExtensionFolderChecked, RuntimeControlFailure, RuntimeControl> =>
    folderReadAndChecked(openProjectFolder, folder, kitFolderOfThisCheckout).pipe(
      Effect.flatMap(({ holder, filesRead, decision }): Effect.Effect<ExtensionFolderChecked, RuntimeControlFailure, RuntimeControl> => {
        switch (decision.kind) {
          case "passed": {
            const files = new Map([...filesRead].map(([filePath, fileBytes]) => [`${holder.prefix_in_the_open_project}${filePath}`, fileBytes]));
            return Effect.succeed({ kind: "passed", folder_version: folderVersionOf(files), files });
          }
          case "blocked":
            return Effect.succeed(decision);
          case "read_again":
            return readsLeft > 1
              ? readAndCheck(readsLeft - 1)
              : Effect.succeed({ kind: "blocked", words: `${capitalized(codeWordsOfTheFolder(folder.folder_in_the_project))} kept changing while the runtime checked it, so the Studio does not load it.\n${NOTHING_UNCHECKED_IS_LOADED}`, checked_to_its_end: false });
        }
      }),
    );
  return readAndCheck(READS_OF_A_CHANGING_FOLDER).pipe(Effect.catch((failure) => Effect.succeed<ExtensionFolderChecked>({ kind: "blocked", words: wordsOfACheckThatDidNotAnswer(failure, codeWordsOfTheFolder(folder.folder_in_the_project)), checked_to_its_end: false })));
}

/**
 * The words of the folder `folderInTheProject` held at the version that last passed while `blocked` blocks its newest: the Studio's
 * lines, then what the gate gave after its own line, or that line where it gave nothing more.
 */
function wordsOfANewerVersionBlocked(folderInTheProject: string, blocked: ExtensionFolderBlocked): string {
  const [gatesLine = "", ...gatesWords] = blocked.words.split("\n").filter((line) => line !== NOTHING_UNCHECKED_IS_LOADED);
  return [LAST_PASSED_VERSION_KEPT, `The newer version of ${codeWordsOfTheFolder(folderInTheProject)} is blocked.`, ...(gatesWords.length > 0 ? gatesWords : [gatesLine])].join("\n");
}

/**
 * The outcome of each folder the gate checked, by project, kept until the runtime names a file of the folder as changed, and
 * the version of each folder that last passed in this session, kept for as long as the Studio runs.
 */
export class ExtensionFolderChecksKept {
  private readonly outcomesByOpenProjectFolder = new Map<string, Map<string, ExtensionFolderChecked>>();
  private readonly lastPassedByOpenProjectFolder = new Map<string, Map<string, ExtensionFolderPassed>>();
  private readonly changesNoticedByOpenProjectFolder = new Map<string, number>();

  /** The outcome kept for `folderInTheProject` of the project in `openProjectFolder`; `null` when it is to be checked. */
  kept(openProjectFolder: string, folderInTheProject: string): ExtensionFolderChecked | null {
    return this.outcomesByOpenProjectFolder.get(openProjectFolder)?.get(folderInTheProject) ?? null;
  }

  /** How many changes to the project in `openProjectFolder` were noticed so far, the mark a check takes as it starts. */
  changesNoticed(openProjectFolder: string): number {
    return this.changesNoticedByOpenProjectFolder.get(openProjectFolder) ?? 0;
  }

  /** Keep `gated` for `folderInTheProject`, checked from the mark `changesNoticedAtTheStart`, unless a change was noticed since or the runtime did not finish: those are checked again. */
  keep(openProjectFolder: string, folderInTheProject: string, gated: ExtensionFolderChecked, changesNoticedAtTheStart: number): void {
    if ((gated.kind === "blocked" && !gated.checked_to_its_end) || this.changesNoticed(openProjectFolder) !== changesNoticedAtTheStart) return;
    const outcomes = this.outcomesByOpenProjectFolder.get(openProjectFolder) ?? new Map<string, ExtensionFolderChecked>();
    outcomes.set(folderInTheProject, gated);
    this.outcomesByOpenProjectFolder.set(openProjectFolder, outcomes);
  }

  /** `checked` as the Studio serves it: a version that passed, kept as the one that last passed; a blocked one held at the version that last passed in this session, when one did. */
  heldAtTheLastPassedVersion(openProjectFolder: string, folderInTheProject: string, checked: ExtensionFolderChecked): ExtensionFolderGated {
    const lastPassedByFolder = this.lastPassedByOpenProjectFolder.get(openProjectFolder) ?? new Map<string, ExtensionFolderPassed>();
    this.lastPassedByOpenProjectFolder.set(openProjectFolder, lastPassedByFolder);
    if (checked.kind === "passed") {
      lastPassedByFolder.set(folderInTheProject, checked);
      return checked;
    }
    const lastPassed = lastPassedByFolder.get(folderInTheProject);
    return lastPassed === undefined ? checked : { kind: "held", last_passed: lastPassed, newer_version_blocked_because: wordsOfANewerVersionBlocked(folderInTheProject, checked) };
  }

  /** Forget the outcome of each folder holding one of `changedFiles` of the project in `openProjectFolder`, or of every folder when `changedFiles` is `null`, as when changes may have gone untold. */
  forgetTheFoldersHolding(openProjectFolder: string, changedFiles: readonly string[] | null): void {
    this.changesNoticedByOpenProjectFolder.set(openProjectFolder, this.changesNoticed(openProjectFolder) + 1);
    const outcomes = this.outcomesByOpenProjectFolder.get(openProjectFolder);
    if (outcomes === undefined) return;
    if (changedFiles === null) {
      this.outcomesByOpenProjectFolder.delete(openProjectFolder);
      return;
    }
    for (const folderInTheProject of [...outcomes.keys()]) {
      if (changedFiles.some((changedFile) => changedFile.startsWith(`${folderInTheProject}/`))) outcomes.delete(folderInTheProject);
    }
  }
}

/** The folder `folder` of the project in `openProjectFolder` through the gate: its kept outcome, or a check of it kept for next time; held at the version that last passed when it is blocked after one did. */
export function extensionFolderGated(openProjectFolder: string, folder: ExtensionFolderToGate, sources: ExtensionFolderChecksSources): Effect.Effect<ExtensionFolderGated, never, RuntimeControl> {
  return Effect.suspend(() => {
    const kept = sources.checksKept.kept(openProjectFolder, folder.folder_in_the_project);
    const changesNoticedAtTheStart = sources.checksKept.changesNoticed(openProjectFolder);
    const checked =
      kept !== null
        ? Effect.succeed(kept)
        : folderGated(openProjectFolder, folder, sources.kitFolderOfThisCheckout).pipe(
            Effect.tap((gated) => Effect.sync(() => sources.checksKept.keep(openProjectFolder, folder.folder_in_the_project, gated, changesNoticedAtTheStart))),
          );
    return checked.pipe(Effect.map((gated) => sources.checksKept.heldAtTheLastPassedVersion(openProjectFolder, folder.folder_in_the_project, gated)));
  });
}
