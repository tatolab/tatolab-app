// `./node_ui`, `./node_ui_host` and `./pin_types` hold no module-level state: a panel bundles one copy of the SDK
// and an element imports the Studio's served copy, so two copies must behave as one.

import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const SDK_SOURCE_FOLDER = path.join(import.meta.dirname, "..");
const ENTRIES_THAT_HOLD_NO_STATE = ["node_ui.ts", "node_ui_host.ts", "pin_types.ts"];

/** Whether `statement` is erased from the module as it runs, as `import type` and `export type` are, so it loads nothing. */
function isErasedAsItRuns(statement: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  return ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly === true : statement.isTypeOnly;
}

/** Each source file the entries reach through relative imports and re-exports that load it as they run, parsed. */
async function sourcesTheEntriesReach(): Promise<ts.SourceFile[]> {
  const reached = new Map<string, ts.SourceFile>();
  const toRead = ENTRIES_THAT_HOLD_NO_STATE.map((entry) => path.join(SDK_SOURCE_FOLDER, entry));
  for (let sourcePath = toRead.pop(); sourcePath !== undefined; sourcePath = toRead.pop()) {
    if (reached.has(sourcePath)) continue;
    const source = ts.createSourceFile(sourcePath, await readFile(sourcePath, "utf8"), ts.ScriptTarget.Latest, true);
    reached.set(sourcePath, source);
    for (const statement of source.statements) {
      if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && !isErasedAsItRuns(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
        const specifier = statement.moduleSpecifier.text;
        if (specifier.startsWith(".")) toRead.push(path.resolve(path.dirname(sourcePath), specifier.replace(/\.js$/, ".ts")));
      }
    }
  }
  return [...reached.values()];
}

/** Why a top-level statement of a module is state, or `null` when it is a declaration, an import or a re-export. */
function whyTheStatementIsModuleState(statement: ts.Statement): string | null {
  if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
    return null;
  }
  if (ts.isClassDeclaration(statement)) {
    const staticMember = statement.members.find(
      (member) => ts.isClassStaticBlockDeclaration(member) || (ts.isPropertyDeclaration(member) && member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) === true),
    );
    return staticMember === undefined ? null : `class ${statement.name?.text ?? ""} holds a static member`;
  }
  return ts.isVariableStatement(statement) ? `a top-level variable, ${statement.declarationList.declarations.map((declaration) => declaration.name.getText()).join(", ")}` : `a top-level statement, ${statement.getText()}`;
}

test("the entries that hold no module state declare only types, functions and classes with no static member", async () => {
  const sources = await sourcesTheEntriesReach();
  expect(sources.map((source) => path.relative(SDK_SOURCE_FOLDER, source.fileName)).sort()).toContain("node_ui/node_ui_control_table.ts");
  const moduleState = sources.flatMap((source) =>
    source.statements.flatMap((statement) => {
      const why = whyTheStatementIsModuleState(statement);
      return why === null ? [] : [`${path.relative(SDK_SOURCE_FOLDER, source.fileName)}: ${why}`];
    }),
  );
  expect(moduleState).toEqual([]);
});
