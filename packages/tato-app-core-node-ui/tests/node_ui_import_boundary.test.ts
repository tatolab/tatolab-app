import { ESLint } from "eslint";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CORE_NODE_UI_PACKAGE_FOLDER = `${path.resolve(import.meta.dirname, "..")}/`;

/** What lint reports against the imports of `sourceText`, linted as a control in this package's `node_ui/`. */
async function boundaryMessagesOf(sourceText: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: CORE_NODE_UI_PACKAGE_FOLDER });
  const [lintResult] = await eslint.lintText(sourceText, { filePath: `${CORE_NODE_UI_PACKAGE_FOLDER}node_ui/a_control.ts` });
  return (lintResult?.messages ?? []).filter((message) => message.ruleId === "tatolab_package/imports_only_what_an_extension_may" || message.fatal === true).map((message) => message.message);
}

describe("a first-party control's imports", () => {
  it("may take the SDK's public entries by name, the control stylesheet among them, and its own folder's files", async () => {
    expect(
      await boundaryMessagesOf(
        [
          'import { fireInputControlEvent } from "@tatolab/tato-app-view-sdk/node_ui";',
          'import type { PinValues } from "@tatolab/tato-app-view-sdk/pin_types";',
          'import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };',
          'import "./float_number.ts";',
          "export type Gain = PinValues['float'];",
          "export const firing = [fireInputControlEvent, controlStyles];",
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("never takes what a page does not supply: a library, the Studio's own entries, the app, or a file outside its folder", async () => {
    for (const importedFrom of ["zod", "effect", "@tatolab/tato-app-view-sdk/node_ui_host", "@tatolab/runtime-client/pin_types", "tato-app/src/renderer/view_host/core_view_types", "../tests/float_number.test.ts", "../../tato-app-view-sdk/src/node_ui.ts"]) {
      expect(await boundaryMessagesOf(`import "${importedFrom}";\n`), importedFrom).not.toEqual([]);
    }
  });

  it("never imports by a name lint cannot read", async () => {
    expect(await boundaryMessagesOf("const entry = 'zod';\nexport const loading = import(entry);\n")).not.toEqual([]);
  });
});
