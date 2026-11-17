// The one table that picks the control for an input, the same on every surface. First match wins:
// the control the input's annotation names, then the Studio's default for its built-in type, then
// the read-only line with its reason. Each key has one candidate, because the table reads a type's
// default only from the module that declares the type, which for a built-in type is the Studio's,
// and a node body only from the module that brings the node type.

import { BUILT_IN_PIN_TYPES, type BuiltInPinTypeName, type PinType } from "../pin_types.js";
import type { InputPinDeclaration } from "./input_control_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "./node_ui_elements_listing.js";

/** Why the table chose an element: the input's annotation named it, or it is the default of the input's type. */
export type NodeUiControlChosenBy = "annotation" | "type_default";

/** The control the table picks for an input: a listed element, or the read-only line with why no element draws it. */
export type NodeUiControlChoice =
  | { readonly kind: "element"; readonly listed: ListedNodeUiElement; readonly chosen_by: NodeUiControlChosenBy }
  | { readonly kind: "read_only_line"; readonly because: string };

/** The name an annotation picks a listed control by: bare for the Studio's own, qualified by its module for a project's. */
function controlNameAnAnnotationPicks(listed: ListedNodeUiElement, control: string): string {
  return listed.brought_by === "studio" ? control : `${listed.module}:${control}`;
}

/** The key of a named control: the pin type it serves and the name an annotation picks it by. */
function namedControlKey(type: BuiltInPinTypeName, controlName: string): string {
  return JSON.stringify([type, controlName]);
}

/** The module part of a qualified name such as `acme:Crossfade`, or `null` when it has none. */
function moduleOfTheQualifiedName(qualifiedName: string): string | null {
  const colon = qualifiedName.indexOf(":");
  return colon > 0 ? qualifiedName.slice(0, colon) : null;
}

/** How a person reads `pinType`: a built-in type's label, or the class that declares a named type. */
function wordsForThePinType(pinType: PinType): string {
  if (pinType.type === "named") return pinType.named_pin_type;
  return BUILT_IN_PIN_TYPES.find((description) => description.name === pinType.type)?.label ?? pinType.type;
}

/** Picks the control for each input, and the body for each node type, from one listing of node UI elements. */
export class NodeUiControlTable {
  readonly #namedControls = new Map<string, ListedNodeUiElement>();
  readonly #typeDefaults = new Map<BuiltInPinTypeName, ListedNodeUiElement>();
  readonly #nodeBodies = new Map<string, ListedNodeUiElement>();

  constructor(listing: NodeUiElementsReading) {
    for (const listed of listing.elements) {
      const registration = listed.registration;
      if (registration.kind === "node_body") {
        if (moduleOfTheQualifiedName(registration.node_type) === listed.module && !this.#nodeBodies.has(registration.node_type)) this.#nodeBodies.set(registration.node_type, listed);
      } else if (registration.control !== null) {
        const key = namedControlKey(registration.type, controlNameAnAnnotationPicks(listed, registration.control));
        if (!this.#namedControls.has(key)) this.#namedControls.set(key, listed);
      } else if (listed.brought_by === "studio" && registration.type !== "named" && !this.#typeDefaults.has(registration.type)) {
        this.#typeDefaults.set(registration.type, listed);
      }
    }
  }

  /** The control that draws the input `declaration` declares, on any surface; never fails, ending at the read-only line. */
  controlChoiceForTheInput(declaration: InputPinDeclaration<BuiltInPinTypeName>): NodeUiControlChoice {
    const type = declaration.pin_type.type;
    const annotatedControl = declaration.annotations.control ?? null;
    if (annotatedControl !== null) {
      const listed = this.#namedControls.get(namedControlKey(type, annotatedControl));
      if (listed !== undefined) return { kind: "element", listed, chosen_by: "annotation" };
    }
    const typeDefault = this.#typeDefaults.get(type);
    if (typeDefault !== undefined) return { kind: "element", listed: typeDefault, chosen_by: "type_default" };
    const typeWords = wordsForThePinType(declaration.pin_type);
    return {
      kind: "read_only_line",
      because: annotatedControl === null ? `No control is registered for an input of type ${typeWords}.` : `No control named ${annotatedControl} is registered for an input of type ${typeWords}.`,
    };
  }

  /** The body that draws every node of `nodeType`, or `null` when its module registers none. */
  nodeBodyForTheNodeType(nodeType: string): ListedNodeUiElement | null {
    return this.#nodeBodies.get(nodeType) ?? null;
  }
}
