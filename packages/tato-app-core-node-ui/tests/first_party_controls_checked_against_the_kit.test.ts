import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkAnExtensionFolder } from "@tatolab/tato-app-view-sdk/extension_check";
import { afterEach, describe, expect, it } from "vitest";

const NODE_UI_FOLDER = path.resolve(import.meta.dirname, "..", "node_ui");

let plantedFolder = "";

afterEach(() => {
  if (plantedFolder !== "") rmSync(plantedFolder, { recursive: true, force: true });
  plantedFolder = "";
});

/** A copy of this package's node UI folder with `edit` made to its file `fileName`. */
function nodeUiFolderWith(fileName: string, edit: (text: string) => string): string {
  plantedFolder = mkdtempSync(path.join(tmpdir(), "tatolab_core_node_ui_planted-"));
  cpSync(NODE_UI_FOLDER, plantedFolder, { recursive: true });
  const file = path.join(plantedFolder, fileName);
  const text = readFileSync(file, "utf8");
  const edited = edit(text);
  expect(edited, `the edit changes ${fileName}`).not.toBe(text);
  writeFileSync(file, edited);
  return plantedFolder;
}

describe("the Studio's own controls, checked against the kit the way an author's are", { timeout: 60_000 }, () => {
  it("pass the compiler and the linter, each tied to the class type its manifest entry declares", () => {
    const answer = checkAnExtensionFolder(NODE_UI_FOLDER);
    expect(answer.compiler_printed).toBe("");
    expect(answer.refused_files).toEqual([]);
    expect(answer.passed).toBe(true);
  });

  it("fail on a type error planted in a control", () => {
    const answer = checkAnExtensionFolder(nodeUiFolderWith("float_number.ts", (text) => `${text}\nexport const planted: number = "a word";\n`));
    expect(answer.passed).toBe(false);
    expect(answer.compiler_printed).toContain("float_number.ts(");
  });

  it("fail when a control is registered for the wrong pin type, reported against its manifest entry", () => {
    const answer = checkAnExtensionFolder(nodeUiFolderWith("tatolab_node_ui.json", (text) => text.replace('{ "type": "float", "script": "float_number.ts" }', '{ "type": "float", "script": "color_swatch.ts" }')));
    expect(answer.passed).toBe(false);
    expect(answer.compiler_printed).toContain(`tatolab_node_ui.json controls[2] {"type":"float","script":"color_swatch.ts"}: error TS2322`);
  });
});
