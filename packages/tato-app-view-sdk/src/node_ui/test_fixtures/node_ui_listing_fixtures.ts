// Test fixtures: pin types, declarations and listed elements the node UI tests build their cases from.

import type { BuiltInPinTypeName, PinAnnotations, PinType } from "../../pin_types.js";
import type { ProjectAControlReaches } from "../../pin_services/input_control_binding.js";
import type { InputPinDeclaration } from "../input_control_element.js";
import type { NodeUiElementHost } from "../node_ui_element_host.js";
import type { ListedNodeUiElement, NodeUiElementRegistration, NodeUiElementScriptServing } from "../node_ui_elements_listing.js";

/** One pin type of each built-in name, so a test that walks the names misses none. */
export const ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME: { readonly [Name in BuiltInPinTypeName]: Extract<PinType, { type: Name }> } = {
  boolean: { type: "boolean" },
  integer: { type: "integer" },
  float: { type: "float" },
  string: { type: "string" },
  menu: { type: "menu", option_names: ["fast", "slow"] },
  color: { type: "color" },
  vector: { type: "vector", component_count: "two" },
  rectangle: { type: "rectangle" },
  transform: { type: "transform" },
  texture: { type: "texture" },
  audio: { type: "audio" },
  encoded_video: { type: "encoded_video" },
  encoded_audio: { type: "encoded_audio" },
  tensor: { type: "tensor" },
  asset: { type: "asset" },
  trigger: { type: "trigger" },
  list_of: { type: "list_of", element_type: { type: "float" } },
  bundle: { type: "bundle", members: [{ name: "gain", member_type: { type: "float" } }] },
  named: { type: "named", named_pin_type: "acme:Spectrum" },
  connection: { type: "connection", connection_type: "acme:Session" },
  node_reference: { type: "node_reference" },
  pin_type_choice: { type: "pin_type_choice" },
};

/** The declaration of an input named `level` of `pinType`, stating `annotations`. */
export function inputDeclarationOf(pinType: PinType, annotations: PinAnnotations = {}): InputPinDeclaration<BuiltInPinTypeName> {
  return { input_name: "level", label: "Level", pin_type: pinType, annotations, may_be_unset: false };
}

/** A listed element registered as `registration` by `module`, served from `script.js` unless `script_serving` says otherwise. */
export function listedElementOf(
  module: string,
  registration: NodeUiElementRegistration,
  { script = "control.ts", folder_version = "v1", script_serving = { kind: "served", script_url: `tatolab-app://app/node_ui/${module}/control.js` } }: { script?: string; folder_version?: string; script_serving?: NodeUiElementScriptServing } = {},
): ListedNodeUiElement {
  return { module, brought_by: module === "studio" ? "studio" : "project", script, folder_version, registration, script_serving };
}

/** A project a control under test reaches: it picks nothing, reads no preview and lists no asset. */
export const NO_PROJECT: ProjectAControlReaches = {
  pickAProjectAsset: () => Promise.resolve({ kind: "not_started", because: "no project in this test" }),
  readAssetPreviewInTheProject: () => Promise.resolve({ kind: "not_read", because: "no project in this test" }),
  watchProjectAssets: () => () => undefined,
  watchPortViewer: () => () => undefined,
};

/** The Studio a control under test is handed: it answers no call. */
export const NO_STUDIO_CALLS: NodeUiElementHost = {
  pickAProjectAsset: () => Promise.resolve({ kind: "not_started", because: "no Studio in this test" }),
  readAssetPreview: () => Promise.resolve({ kind: "not_read", because: "no Studio in this test" }),
  watchProjectAssets: () => () => undefined,
  watchWhatIsWiredInto: () => () => undefined,
  inputControlFor: () => Promise.reject(new Error("no Studio in this test")),
};
