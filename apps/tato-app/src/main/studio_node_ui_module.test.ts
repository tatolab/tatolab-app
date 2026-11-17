import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BUILT_IN_PIN_TYPES, ControlSchemas, type NodeUiManifest } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import { answerAStudioNodeUiFileRequest, studioNodeUiElementsListed, studioNodeUiFileOfTheRequest, studioNodeUiFileUrl, theStudiosOwnNodeUiElements } from "./studio_node_ui_module.js";

const STUDIO_NODE_UI_FOLDER = path.resolve(import.meta.dirname, "../../../../packages/tato-app-core-node-ui/node_ui");

/** Reads a file of the Studio's own node UI module from its package, as the built window holds it. */
function readTheModulesFile(pathInTheModule: string): Promise<Uint8Array> {
  return readFile(path.join(STUDIO_NODE_UI_FOLDER, ...pathInTheModule.split("/")));
}

test("the schema the Studio reads its own manifest with is the contract's generated node UI manifest type", () => {
  expectTypeOf<z.output<typeof ControlSchemas.components.NodeUiManifest>>().toEqualTypeOf<NodeUiManifest>();
});

test("the Studio's own manifest reads as the contract's node UI manifest, each control naming a built-in pin type and a script the module holds", async () => {
  const manifestJson: unknown = JSON.parse(await readTheModulesFile("tatolab_node_ui.json").then((bytes) => Buffer.from(bytes).toString("utf8")));
  const manifest = ControlSchemas.components.NodeUiManifest.parse(manifestJson);
  const moduleFiles = await readdir(STUDIO_NODE_UI_FOLDER);
  expect(manifest.controls).not.toHaveLength(0);
  for (const control of manifest.controls ?? []) {
    expect(BUILT_IN_PIN_TYPES.map((builtInPinType) => builtInPinType.name)).toContain(control.type);
    expect(moduleFiles, control.script).toContain(control.script);
    expect(control.script).toMatch(/\.ts$/);
  }
});

test("the Studio lists its own number control as the default for a Float input, brought by the Studio and served beside the window", async () => {
  expect(await Effect.runPromise(theStudiosOwnNodeUiElements("0.45.0"))).toEqual([
    {
      module: "studio",
      brought_by: "studio",
      script: "float_number.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "float", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
    },
  ]);
});

test("a named control and a node body are listed by what they register", async () => {
  const manifest: NodeUiManifest = {
    contract: "1.1",
    controls: [{ type: "float", control: "slider", script: "float_slider.ts" }],
    node_bodies: [{ node_type: "tatolab:Crossfade", script: "crossfade_body.ts" }],
  };
  const listed = await Effect.runPromise(studioNodeUiElementsListed(manifest, "v1"));
  expect(listed.map((element) => element.registration)).toEqual([
    { kind: "control", type: "float", control: "slider" },
    { kind: "node_body", node_type: "tatolab:Crossfade" },
  ]);
});

test("a manifest that is not the contract's, naming a pin type the contract does not hold, is not listed and says why", async () => {
  const listing = await Effect.runPromise(Effect.result(studioNodeUiElementsListed({ contract: "1.1", controls: [{ type: "float32", script: "float_number.ts" }] }, "v1")));
  expect(listing._tag).toBe("Failure");
  expect(listing._tag === "Failure" ? listing.failure.words : "").toContain("is not a node UI manifest");
});

test("a page is served a control's script with its types removed, where the author wrote each line, importing what the Studio supplies", async () => {
  const answer = await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_number.ts"), readTheModulesFile);
  if (answer.kind !== "served") throw new Error(`float_number.ts was not served: ${answer.because}`);
  const servedText = answer.file_bytes.toString("utf8");
  const writtenText = Buffer.from(await readTheModulesFile("float_number.ts")).toString("utf8");
  expect(answer.content_type).toBe("text/javascript; charset=utf-8");
  expect(servedText).not.toContain("implements InputControlElement");
  expect(servedText).toContain('from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" }');
  const lineOfTheClass = (text: string) => text.split("\n").findIndex((line) => line.startsWith("export default class FloatNumber"));
  expect(lineOfTheClass(servedText)).toBe(lineOfTheClass(writtenText));
});

test("a request that leaves the module, or names a file it does not hold, is not served", async () => {
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_node_ui/../index.html")).toBeNull();
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_node_ui/%2E%2E/index.html")).toBeNull();
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_views/float_number.ts")).toBeNull();
  expect(await answerAStudioNodeUiFileRequest("tatolab-app://app/core_node_ui/%2E%2E/index.html", readTheModulesFile)).toMatchObject({ kind: "not_served", status: 404 });
  expect(await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_dial.ts"), readTheModulesFile)).toMatchObject({ kind: "not_served", status: 404 });
});
