import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CORE_VIEWS_PACKAGE_FOLDER = `${path.resolve(import.meta.dirname, "..")}/`;

/** The import-boundary messages lint reports for `sourceText`, linted as a file of this package's `src/`. */
async function boundaryMessagesOf(sourceText: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: CORE_VIEWS_PACKAGE_FOLDER });
  const [lintResult] = await eslint.lintText(sourceText, { filePath: `${CORE_VIEWS_PACKAGE_FOLDER}src/a_core_view.ts` });
  return (lintResult?.messages ?? []).filter((message) => message.ruleId === "no-restricted-imports" || message.ruleId === "tatolab_package/imports_stay_inside_the_package").map((message) => message.message);
}

describe("a core view's imports", () => {
  it("may take the view SDK by its name, as any view does", async () => {
    expect(await boundaryMessagesOf('import { connectToTatoApp } from "@tatolab/tato-app-view-sdk";\nexport const connecting = connectToTatoApp;\n')).toEqual([]);
  });

  it("never reaches into the app, by its name, its alias or a path, nor into another package's files", async () => {
    for (const importedFrom of ["tato-app/src/renderer/view_host/in_window_view_host", "@/components/ui/button", "../../../apps/tato-app/src/shared/tatolab_backend_contract", "../../tato-app-view-sdk/src/index"]) {
      expect(await boundaryMessagesOf(`import "${importedFrom}";\n`)).not.toEqual([]);
    }
  });
});
