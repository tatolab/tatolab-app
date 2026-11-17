import { expect, test } from "vitest";
import { loadNodeUiElement } from "./load_node_ui_element.js";
import { nodeUiElementTag } from "./node_ui_element_tag.js";
import { listedElementOf } from "./test_fixtures/node_ui_listing_fixtures.js";

const FLOAT_DEFAULT = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts", folder_version: "7" });

/** An import whose scripts are `scripts` by URL, recording each URL it imports. */
function importOfTheScripts(scripts: Readonly<Record<string, unknown>>): { readonly importScript: (scriptUrl: string) => Promise<unknown>; readonly importedUrls: string[] } {
  const importedUrls: string[] = [];
  return {
    importedUrls,
    importScript: async (scriptUrl) => {
      importedUrls.push(scriptUrl);
      if (!(scriptUrl in scripts)) throw new Error(`Failed to fetch ${scriptUrl}`);
      return scripts[scriptUrl];
    },
  };
}

test("the Studio mints each tag from the module, the script and the folder version, spelled as a custom element name", () => {
  expect(nodeUiElementTag(FLOAT_DEFAULT)).toBe("tato-studio-float_number.2e.ts-7");
  expect(nodeUiElementTag(listedElementOf("Acme-Labs", { kind: "control", type: "float", control: "knob" }, { script: "knob.ts", folder_version: "a1" }))).toBe("tato-.41.cme.2d..4c.abs-knob.2e.ts-a1");
  expect(nodeUiElementTag(listedElementOf("a", { kind: "control", type: "float", control: null }, { script: "b-c.ts" }))).not.toBe(
    nodeUiElementTag(listedElementOf("a-b", { kind: "control", type: "float", control: null }, { script: "c.ts" })),
  );
});

test("a served script that default-exports a custom element class is defined under its minted tag, once", async () => {
  class FloatNumber extends HTMLElement {}
  const scripts = importOfTheScripts({ "tatolab-app://app/node_ui/studio/control.js": { default: FloatNumber } });
  expect(await loadNodeUiElement(FLOAT_DEFAULT, scripts.importScript)).toEqual({ kind: "defined", tag: "tato-studio-float_number.2e.ts-7" });
  expect(customElements.get("tato-studio-float_number.2e.ts-7")).toBe(FloatNumber);
  expect(await loadNodeUiElement(FLOAT_DEFAULT, scripts.importScript)).toEqual({ kind: "defined", tag: "tato-studio-float_number.2e.ts-7" });
  expect(scripts.importedUrls).toHaveLength(1);
});

test("a blocked element is never imported, and answers the findings that block it", async () => {
  const scripts = importOfTheScripts({});
  const blocked = listedElementOf("acme", { kind: "control", type: "float", control: "knob" }, { script_serving: { kind: "blocked", findings: ["knob.ts:12:5 TS2322 Type 'string' is not assignable to type 'number'."] } });
  expect(await loadNodeUiElement(blocked, scripts.importScript)).toEqual({ kind: "blocked", findings: ["knob.ts:12:5 TS2322 Type 'string' is not assignable to type 'number'."] });
  expect(scripts.importedUrls).toEqual([]);
});

test("a script that fails to import, or whose default export is not a custom element class, is not loaded, with why", async () => {
  const neverDefined = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts", folder_version: "8" });
  expect(await loadNodeUiElement(neverDefined, importOfTheScripts({}).importScript)).toEqual({
    kind: "not_loaded",
    because: "studio · node_ui/float_number.ts does not load: Failed to fetch tatolab-app://app/node_ui/studio/control.js",
  });
  for (const scriptModule of [{}, { default: class NotAnElement {} }, { default: "float" }, null]) {
    expect(await loadNodeUiElement(neverDefined, importOfTheScripts({ "tatolab-app://app/node_ui/studio/control.js": scriptModule }).importScript)).toEqual({
      kind: "not_loaded",
      because: "studio · node_ui/float_number.ts does not load: its default export is not a class that extends HTMLElement.",
    });
  }
});
