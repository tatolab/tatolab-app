// Checks an extension folder against the kit the way the runtime checks an author's: the folder is
// copied into an empty check folder beside the kit's two files, with one tie file written from its
// node UI manifest, then the compiler and the linter the Studio's own code is checked with run over
// it. The check folder resolves only the folder's own files and the modules the kit declares, which
// holds an extension to the SDK's public entries. The runtime's check follows the same recipe, so a
// new kind of file in it changes both.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { NATIVE_TYPESCRIPT_COMPILER, VIEW_SDK_KIT_FOLDER } from "./view_sdk_kit.ts";

/** The linter the Studio's own code is checked with. */
const STANDALONE_LINTER = path.join(path.dirname(findPackageJSON("oxlint", import.meta.url) ?? "oxlint"), "bin", "oxlint");

/** The manifest that registers a node UI folder's elements. */
const NODE_UI_MANIFEST = "tatolab_node_ui.json";

/** The manifest that names a view folder. */
const VIEW_MANIFEST = "tatolab_view.json";

/** The file the check writes from a node UI manifest, tying each control's default export to the class type its entry declares. */
const TIE_FILE = "tatolab_node_ui_tie.ts";

/** The lines of the tie file before the first control's. */
const TIE_HEADER_LINE_COUNT = 1;

/** A folder of vendored code an extension carries as it was published, which the check reads as it is. */
const VENDORED_FOLDER = "vendor";

/** One control a node UI manifest registers, as the tie file reads it. */
interface ManifestControl {
  readonly type: string;
  readonly script: string;
  readonly control?: string;
}

/** What the check found in one extension folder. */
export interface ExtensionCheckAnswer {
  readonly extension_folder: string;
  /** Whether no file was refused and the compiler and the linter both passed. */
  readonly passed: boolean;
  /** What the compiler printed, with each error at a tie line reported against the manifest entry it was written from. */
  readonly compiler_printed: string;
  readonly linter_printed: string;
  /** Why each of the extension's own `.js`, `.mjs` or `.map` files is refused, in the runtime's words. */
  readonly refused_files: readonly string[];
}

/** The kit's tie lines: the tie file's header, and the lines written for each control. */
interface TieLines {
  readonly header: string;
  readonly controls: string;
}

/** The controls `manifestFile` registers, in its order. */
function controlsTheManifestRegisters(manifestFile: string): readonly ManifestControl[] {
  const manifest: { controls?: ManifestControl[] } = JSON.parse(readFileSync(manifestFile, "utf8"));
  return manifest.controls ?? [];
}

/** The tie file for `controls`: the kit's header, then the kit's tie lines for each control. */
function tieFileFor(controls: readonly ManifestControl[], tieLines: TieLines): string {
  const controlLines = controls.map((control, index) => tieLines.controls.replaceAll("{index}", String(index)).replaceAll("{script}", control.script).replaceAll("{type}", control.type));
  return [tieLines.header, ...controlLines, ""].join("\n");
}

/** `printed` with each error at a line of the tie file reported against the manifest entry that line was written from. */
function tieErrorsAgainstTheManifest(printed: string, controls: readonly ManifestControl[], tieLines: TieLines): string {
  const linesPerControl = tieLines.controls.split("\n").length;
  const tieErrorAt = new RegExp(`^${TIE_FILE.replaceAll(".", "\\.")}\\((\\d+),\\d+\\):`, "gm");
  return printed.replace(tieErrorAt, (whole, line: string) => {
    const index = Math.floor((Number(line) - 1 - TIE_HEADER_LINE_COUNT) / linesPerControl);
    const control = controls[index];
    return control === undefined ? whole : `${NODE_UI_MANIFEST} controls[${index}] ${JSON.stringify(control)}:`;
  });
}

/** What `program` printed over `checkFolder`, and whether it passed. */
function runOver(checkFolder: string, program: string, programArguments: readonly string[]): { passed: boolean; printed: string } {
  try {
    return { passed: true, printed: execFileSync(process.execPath, [program, ...programArguments], { cwd: checkFolder, encoding: "utf8", stdio: "pipe" }) };
  } catch (failure) {
    const printed = typeof failure === "object" && failure !== null && "stdout" in failure ? String(failure.stdout) : String(failure);
    return { passed: false, printed };
  }
}

/** Each file under `folder`, relative to it with forward slashes, leaving out vendored code. */
function filesOutsideVendoredCode(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .filter((file) => file.split("/")[0] !== VENDORED_FOLDER);
}

/** Checks the extension folder `extensionFolder` against the kit in `kitFolder`. */
export function checkAnExtensionFolder(extensionFolder: string, kitFolder: string = VIEW_SDK_KIT_FOLDER): ExtensionCheckAnswer {
  const files = filesOutsideVendoredCode(extensionFolder);
  const refusedFiles = files
    .filter((file) => /\.(m?js|map)$/.test(file))
    .map((file) => `an extension's own code is written in .ts, so \`${file}\` is refused: write it as .ts, or put a library the extension carries under ${VENDORED_FOLDER}/ with its .d.ts beside it`);
  if (!files.some((file) => file.endsWith(".ts"))) return { extension_folder: extensionFolder, passed: refusedFiles.length === 0, compiler_printed: "", linter_printed: "", refused_files: refusedFiles };
  const checkFolder = mkdtempSync(path.join(tmpdir(), "tatolab_extension_check-"));
  try {
    cpSync(extensionFolder, checkFolder, { recursive: true, filter: (source) => path.basename(source) !== "node_modules" });
    cpSync(path.join(kitFolder, "check_folder"), checkFolder, { recursive: true });
    mkdirSync(path.join(checkFolder, "node_modules", "@tatolab"), { recursive: true });
    symlinkSync(kitFolder, path.join(checkFolder, "node_modules", "@tatolab", "tato-app-view-sdk"), "dir");
    const tieLines: TieLines = JSON.parse(readFileSync(path.join(kitFolder, "tie_lines.json"), "utf8"));
    const manifestFile = path.join(extensionFolder, NODE_UI_MANIFEST);
    const controls = existsSync(manifestFile) ? controlsTheManifestRegisters(manifestFile) : [];
    if (controls.length > 0) writeFileSync(path.join(checkFolder, TIE_FILE), tieFileFor(controls, tieLines));
    const compiler = runOver(checkFolder, NATIVE_TYPESCRIPT_COMPILER, ["-p", "."]);
    const linter = runOver(checkFolder, STANDALONE_LINTER, ["-c", path.join(kitFolder, "oxlint.json"), "--ignore-pattern", "node_modules/**", "--ignore-pattern", `${VENDORED_FOLDER}/**`, "."]);
    return {
      extension_folder: extensionFolder,
      passed: refusedFiles.length === 0 && compiler.passed && linter.passed,
      compiler_printed: tieErrorsAgainstTheManifest(compiler.printed, controls, tieLines),
      linter_printed: linter.printed,
      refused_files: refusedFiles,
    };
  } finally {
    rmSync(checkFolder, { recursive: true, force: true });
  }
}

/** The extension folders of the project in `projectFolder`: its node UI folder and each view folder, where it has them. */
export function extensionFoldersOfAProject(projectFolder: string): string[] {
  const folders: string[] = [];
  if (existsSync(path.join(projectFolder, "node_ui", NODE_UI_MANIFEST))) folders.push(path.join(projectFolder, "node_ui"));
  const viewsFolder = path.join(projectFolder, "views");
  if (existsSync(viewsFolder)) {
    for (const entry of readdirSync(viewsFolder, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(viewsFolder, entry.name, VIEW_MANIFEST))) folders.push(path.join(viewsFolder, entry.name));
    }
  }
  return folders.sort();
}
