// The node UI elements the Studio can load, as each panel's control table reads them: what each
// registers, from which module and folder version, and whether the Studio serves its script.

import type { BuiltInPinTypeName, NamedPinTypeImportPath } from "../pin_types.js";

/** Who brings an element: the Studio's own module, whose control names are bare, or a project's module, whose names it qualifies. */
export type NodeUiElementBroughtBy = "studio" | "project";

/**
 * What an element is registered as: a control for one pin type, a built-in type by its name or a named type by the import path of
 * its class, `module:QualifiedClassName`, and its default when it names no control; or the body of one node type.
 */
export type NodeUiElementRegistration =
  | { readonly kind: "control"; readonly type: BuiltInPinTypeName | NamedPinTypeImportPath; readonly control: string | null }
  | { readonly kind: "node_body"; readonly node_type: string };

/**
 * Whether the Studio serves an element's script: at `script_url`, or not, with each line of why, in the words it was given, among
 * them `runtime_findings`, each finding of the runtime's check of its folder, naming its file and code.
 */
export type NodeUiElementScriptServing =
  | { readonly kind: "served"; readonly script_url: string }
  | { readonly kind: "blocked"; readonly findings: readonly string[]; readonly runtime_findings: readonly string[] };

/** One element as its module's `node_ui/tatolab_node_ui.json` registers it. */
export interface ListedNodeUiElement {
  readonly module: string;
  readonly brought_by: NodeUiElementBroughtBy;
  /** The script, inside the module's node UI folder, that default-exports the element's class. */
  readonly script: string;
  /** Names the folder's contents, so an edited element is defined under a new tag. */
  readonly folder_version: string;
  readonly registration: NodeUiElementRegistration;
  readonly script_serving: NodeUiElementScriptServing;
}

/** Every node UI element the Studio lists for the open project, its imports and the Studio itself. */
export interface NodeUiElementsReading {
  readonly elements: readonly ListedNodeUiElement[];
}
