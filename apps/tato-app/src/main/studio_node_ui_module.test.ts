import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BUILT_IN_PIN_TYPES, readControlContractValue, type NodeUiManifest } from "@tatolab/runtime-client";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { createTatolabAppLog, type TatolabAppLog } from "./tatolab_app_log.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { answerAStudioNodeUiFileRequest, studioNodeUiElementsListed, studioNodeUiFileOfTheRequest, studioNodeUiFileUrl, theStudiosOwnNodeUiElements } from "./studio_node_ui_module.js";

const STUDIO_NODE_UI_FOLDER = path.resolve(import.meta.dirname, "../../../../packages/tato-app-core-node-ui/node_ui");

/** Reads a file of the Studio's own node UI module from its package, as the built window holds it; `null` when it is not there. */
function readTheModulesFile(pathInTheModule: string): Promise<Uint8Array | null> {
  return readFile(path.join(STUDIO_NODE_UI_FOLDER, ...pathInTheModule.split("/"))).catch((readFailure: unknown) => (isAMissingFileFailure(readFailure) ? null : Promise.reject(readFailure)));
}

/** A file of the module the tests know is there. */
async function theModulesFile(pathInTheModule: string): Promise<Uint8Array> {
  const fileBytes = await readTheModulesFile(pathInTheModule);
  if (fileBytes === null) throw new Error(`the module holds no ${pathInTheModule}`);
  return fileBytes;
}

/** A log that keeps every line it is written. */
function keptLog(): { log: TatolabAppLog; lines: string[] } {
  const lines: string[] = [];
  return { log: createTatolabAppLog("debug", (logLine) => lines.push(logLine)), lines };
}

test("the Studio's own manifest reads as the contract's node UI manifest, each control naming a built-in pin type and a script the module holds", async () => {
  const manifestJson: unknown = JSON.parse(await theModulesFile("tatolab_node_ui.json").then((bytes) => Buffer.from(bytes).toString("utf8")));
  const manifestReading = readControlContractValue("NodeUiManifest", manifestJson);
  if (!manifestReading.read) return expect.unreachable(JSON.stringify(manifestReading.issues));
  const manifest = manifestReading.value;
  const moduleFiles = await readdir(STUDIO_NODE_UI_FOLDER);
  expect(manifest.controls).not.toHaveLength(0);
  for (const control of manifest.controls ?? []) {
    expect(BUILT_IN_PIN_TYPES.map((builtInPinType) => builtInPinType.name)).toContain(control.type);
    expect(moduleFiles, control.script).toContain(control.script);
    expect(control.script).toMatch(/\.ts$/);
  }
});

test("the Studio lists its own controls, a default for each type that stores a value, a slider for each ranged number, and the controls an annotation names, brought by the Studio and served beside the window", async () => {
  expect(await Effect.runPromise(theStudiosOwnNodeUiElements("0.45.0"))).toEqual([
    {
      module: "studio",
      brought_by: "studio",
      script: "boolean_switch.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "boolean", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/boolean_switch.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "integer_stepper.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "integer", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/integer_stepper.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "float_number.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "float", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "color_swatch.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "color", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/color_swatch.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "vector_fields.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "vector", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/vector_fields.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "rectangle_fields.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "rectangle", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/rectangle_fields.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "transform_fields.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "transform", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/transform_fields.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "text_line.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "string", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/text_line.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "menu_choice.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "menu", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/menu_choice.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "asset_field.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "asset", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/asset_field.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "trigger_button.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "trigger", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/trigger_button.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "list_rows.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "list_of", control: null },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/list_rows.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "integer_slider.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "integer", control: "slider" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/integer_slider.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "float_slider.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "float", control: "slider" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_slider.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "boolean_checkbox.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "boolean", control: "checkbox" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/boolean_checkbox.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "integer_dial.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "integer", control: "dial" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/integer_dial.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "float_dial.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "float", control: "dial" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_dial.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "string_multiline.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "string", control: "multiline" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/string_multiline.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "string_code.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "string", control: "code" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/string_code.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "menu_segmented.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "menu", control: "segmented" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/menu_segmented.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "vector_xy_pad.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "vector", control: "xy_pad" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/vector_xy_pad.ts" },
    },
    {
      module: "studio",
      brought_by: "studio",
      script: "asset_file_picker.ts",
      folder_version: "0.45.0",
      registration: { kind: "control", type: "asset", control: "file_picker" },
      script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/asset_file_picker.ts" },
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
  const answer = await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_number.ts"), readTheModulesFile, keptLog().log);
  if (answer.kind !== "served") throw new Error(`float_number.ts was not served: ${answer.because}`);
  const servedText = answer.file_bytes.toString("utf8");
  const writtenText = Buffer.from(await theModulesFile("float_number.ts")).toString("utf8");
  expect(answer.content_type).toBe("text/javascript; charset=utf-8");
  expect(servedText).not.toContain("implements InputControlElement");
  expect(servedText).toContain('from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" }');
  const lineOfTheClass = (text: string) => text.split("\n").findIndex((line) => line.startsWith("export default class FloatNumber"));
  expect(lineOfTheClass(servedText)).toBe(lineOfTheClass(writtenText));
});

test("a request that leaves the module, or names a file it does not hold, is not served", async () => {
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_node_ui/../index.html")).toBeNull();
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_node_ui/%2E%2E/index.html")).toBeNull();
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_node_ui/a%5C..%5Cb.ts")).toBeNull();
  expect(studioNodeUiFileOfTheRequest("tatolab-app://app/core_views/float_number.ts")).toBeNull();
  expect(await answerAStudioNodeUiFileRequest("tatolab-app://app/core_node_ui/%2E%2E/index.html", readTheModulesFile, keptLog().log)).toMatchObject({ kind: "not_served", status: 404 });
  expect(await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_knob.ts"), readTheModulesFile, keptLog().log)).toMatchObject({ kind: "not_served", status: 404 });
});

test("a file that is there but cannot be read answers 500, and one whose types cannot be removed answers 422 and is logged as a warning", async () => {
  const unreadable = await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_number.ts"), () => Promise.reject(new Error("EACCES: permission denied")), keptLog().log);
  expect(unreadable).toMatchObject({ kind: "not_served", status: 500 });
  const { log, lines } = keptLog();
  const notStrippable = await answerAStudioNodeUiFileRequest(studioNodeUiFileUrl("float_dial.ts"), () => Promise.resolve(Buffer.from("export enum Dial { Low }\n")), log);
  expect(notStrippable).toMatchObject({ kind: "not_served", status: 422 });
  expect(lines.filter((line) => line.includes("WARN") || line.includes("warn"))).toHaveLength(1);
  expect(lines.join("\n")).toContain("float_dial.ts");
});
