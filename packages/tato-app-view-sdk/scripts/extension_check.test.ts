import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { checkAnExtensionFolder, extensionFoldersOfAProject } from "./extension_check.ts";
import { writeTheViewSdkKit } from "./view_sdk_kit.ts";

let scratchFolder = "";
let kitFolder = "";

beforeAll(() => {
  scratchFolder = mkdtempSync(path.join(tmpdir(), "tatolab_extension_check_test-"));
  kitFolder = path.join(scratchFolder, "kit");
  writeTheViewSdkKit(kitFolder);
}, 120_000);

afterAll(() => {
  rmSync(scratchFolder, { recursive: true, force: true });
});

/** A folder under the scratch folder holding `files`, by their place in it. */
function folderHolding(files: Readonly<Record<string, string>>): string {
  const folder = mkdtempSync(path.join(scratchFolder, "extension-"));
  for (const [fileName, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, fileName)), { recursive: true });
    writeFileSync(path.join(folder, fileName), text);
  }
  return folder;
}

/** The kit's control template, written for the pin type `pinTypeName`. */
function controlTemplateFor(pinTypeName: string): string {
  return readFileSync(path.join(kitFolder, "templates", "control.ts"), "utf8").replace('"PIN_TYPE_NAME"', JSON.stringify(pinTypeName));
}

/** The kit's node body template, written for the node type `nodeType`. */
function nodeBodyTemplateFor(nodeType: string): string {
  return readFileSync(path.join(kitFolder, "templates", "node_body.ts"), "utf8").replace('"NODE_TYPE_NAME"', JSON.stringify(nodeType));
}

/** A node UI manifest registering each of `controls`. */
function nodeUiManifestOf(controls: readonly { type: string; script: string }[]): string {
  return JSON.stringify({ contract: "1.1", controls });
}

describe("checking an extension folder against the kit", () => {
  test("the kit's control template passes once its pin type is written, tied to the class type its manifest entry declares", () => {
    const answer = checkAnExtensionFolder(folderHolding({ "float_words.ts": controlTemplateFor("float"), "tatolab_node_ui.json": nodeUiManifestOf([{ type: "float", script: "float_words.ts" }]) }), kitFolder);
    expect(answer.compiler_printed).toBe("");
    expect(answer.passed).toBe(true);
  });

  test("the kit's node body template passes once its node type is written, registered as its node type's body", () => {
    const template = readFileSync(path.join(kitFolder, "templates", "node_body.ts"), "utf8");
    expect(template).toContain('"NODE_TYPE_NAME"');
    expect(template).not.toContain("customElements.define");
    const answer = checkAnExtensionFolder(
      folderHolding({ "crossfade_body.ts": nodeBodyTemplateFor("acme:Crossfade"), "tatolab_node_ui.json": JSON.stringify({ contract: "1.1", node_bodies: [{ node_type: "acme:Crossfade", script: "crossfade_body.ts" }] }) }),
      kitFolder,
    );
    expect(answer.compiler_printed).toBe("");
    expect(answer.linter_printed).toBe("");
    expect(answer.passed).toBe(true);
  });

  test("a type error in a control fails the check and names the control's file", () => {
    const planted = controlTemplateFor("float").replace("this.#words.value = JSON.stringify(value);", "this.#words.value = value;");
    const answer = checkAnExtensionFolder(folderHolding({ "float_words.ts": planted, "tatolab_node_ui.json": nodeUiManifestOf([{ type: "float", script: "float_words.ts" }]) }), kitFolder);
    expect(answer.passed).toBe(false);
    expect(answer.compiler_printed).toContain("float_words.ts(");
    expect(answer.compiler_printed).toContain("is not assignable to type 'string'");
  });

  test("a Color control registered for a Float is a compiler error reported against its manifest entry", () => {
    const answer = checkAnExtensionFolder(
      folderHolding({
        "float_words.ts": controlTemplateFor("float"),
        "colour_words.ts": controlTemplateFor("color"),
        "tatolab_node_ui.json": nodeUiManifestOf([
          { type: "float", script: "float_words.ts" },
          { type: "float", script: "colour_words.ts" },
        ]),
      }),
      kitFolder,
    );
    expect(answer.passed).toBe(false);
    expect(answer.compiler_printed).toContain(`tatolab_node_ui.json controls[1] {"type":"float","script":"colour_words.ts"}: error TS2322`);
    expect(answer.compiler_printed).toContain(`Type '"color"' is not assignable to type '"float"'`);
    expect(answer.compiler_printed).not.toContain("controls[0]");
  });

  test("a broken strict rule fails the linter, though the compiler passes", () => {
    const answer = checkAnExtensionFolder(folderHolding({ "main.ts": "const read: unknown = 1;\nexport const level = read as number;\n", "tatolab_view.json": "{}" }), kitFolder);
    expect(answer.compiler_printed).toBe("");
    expect(answer.passed).toBe(false);
    expect(answer.linter_printed).toContain("consistent-type-assertions");
  });

  test("an entry of the SDK the Studio does not supply cannot be imported", () => {
    const answer = checkAnExtensionFolder(folderHolding({ "main.ts": 'import { connectToTatoApp } from "@tatolab/tato-app-view-sdk/node_ui_host";\nexport const connect = connectToTatoApp;\n', "tatolab_view.json": "{}" }), kitFolder);
    expect(answer.passed).toBe(false);
    expect(answer.compiler_printed).toContain("Cannot find module '@tatolab/tato-app-view-sdk/node_ui_host'");
  });

  test("an extension's own .js, .mjs or .map is a warning that names .ts, and vendored code is read as it is", () => {
    const answer = checkAnExtensionFolder(
      folderHolding({ "main.ts": "export const level: number = 1;\n", "old.js": "export const level = 1;\n", "old.mjs": "", "main.js.map": "{}", "vendor/library.js": "// @ts-ignore\nexport const any = 1;\n", "tatolab_view.json": "{}" }),
      kitFolder,
    );
    expect(answer.passed).toBe(true);
    expect([...answer.warnings].sort()).toEqual(["main.js.map", "old.js", "old.mjs"].map((file) => `${file}: an extension's code is written in .ts, and only .ts is checked`));
  });

  test("a folder holding no .ts is not compiled, and passes with its warnings", () => {
    const answer = checkAnExtensionFolder(folderHolding({ "view.js": "export {};\n", "tatolab_view.json": "{}" }), kitFolder);
    expect(answer.passed).toBe(true);
    expect(answer.warnings).toHaveLength(1);
  });
});

describe("a project's extension folders", () => {
  test("are its node UI folder and each view folder with a manifest", () => {
    const project = folderHolding({
      "node_ui/tatolab_node_ui.json": "{}",
      "views/program/tatolab_view.json": "{}",
      "views/stage/tatolab_view.json": "{}",
      "views/notes/readme.txt": "",
      "streams/main.graph.json": "{}",
    });
    expect(extensionFoldersOfAProject(project)).toEqual(["node_ui", "views/program", "views/stage"].map((folder) => path.join(project, folder)));
  });
});
