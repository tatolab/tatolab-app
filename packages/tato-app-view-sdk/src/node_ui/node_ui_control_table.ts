// The one table that picks the control for an input, the same on every surface. First match wins:
// the control the input's annotation names, then the Studio's slider for its type when the input
// states both ends of its range, then the Studio's default for its built-in type, then the read-only
// line with its reason. Each key has one candidate, because the table reads a type's
// default only from the module that declares the type, which for a built-in type is the Studio's,
// and a node body only from the module that brings the node type. A control registers for a pin
// type by its name alone, so one registered for `named` would draw every named type; the table
// uses none, and a named type's input ends at the read-only line.

import type { BuiltInPinTypeName, PinAnnotations, PinType } from "../pin_types.js";
import type { InputPinDeclaration } from "./input_control_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "./node_ui_elements_listing.js";

/** Why the table chose an element: the input's annotation named it, the input states both ends of its range so its type's slider draws it, or it is the default of the input's type. */
export type NodeUiControlChosenBy = "annotation" | "stated_range" | "type_default";

/**
 * The control the table picks for an input: a listed element, with why the annotation's control
 * was passed over when it was, or the read-only line with why no element draws the input.
 */
export type NodeUiControlChoice =
  | { readonly kind: "element"; readonly listed: ListedNodeUiElement; readonly chosen_by: NodeUiControlChosenBy; readonly because: string | null }
  | { readonly kind: "read_only_line"; readonly because: string };

/** A listed element the table never uses, and why. */
export interface NodeUiRegistrationPassedOver {
  readonly listed: ListedNodeUiElement;
  readonly because: string;
}

/** The name an annotation picks a listed control by: bare for the Studio's own, qualified by its module for a project's. */
function controlNameAnAnnotationPicks(listed: ListedNodeUiElement, control: string): string {
  return listed.brought_by === "studio" ? control : `${listed.module}:${control}`;
}

/** The key of a named control: the pin type it serves and the name an annotation picks it by. */
function namedControlKey(type: BuiltInPinTypeName, controlName: string): string {
  return JSON.stringify([type, controlName]);
}

/** The key of the Studio's control named `slider` for `type`, which draws an input of it whose range has both ends; a project's control is keyed by its qualified name, so it is never this one. */
function studioSliderKey(type: BuiltInPinTypeName): string {
  return namedControlKey(type, "slider");
}

/** The module part of a qualified name such as `acme:Crossfade`, or `null` when it has none. */
function moduleOfTheQualifiedName(qualifiedName: string): string | null {
  const colon = qualifiedName.indexOf(":");
  return colon > 0 ? qualifiedName.slice(0, colon) : null;
}

/** Whether `annotations` state both the lowest and the highest number an input holds. */
function statesBothEndsOfItsRange(annotations: PinAnnotations): boolean {
  const range = annotations.range ?? null;
  return range !== null && typeof range.minimum === "number" && typeof range.maximum === "number";
}

/** How a person reads a built-in pin type's name, such as `encoded video`. */
function wordsForTheBuiltInPinTypeName(name: BuiltInPinTypeName): string {
  return name.replaceAll("_", " ");
}

/** How a person reads `pinType`: a built-in type's name in words, or the class that declares a named type. */
function wordsForThePinType(pinType: PinType): string {
  return pinType.type === "named" ? pinType.named_pin_type : wordsForTheBuiltInPinTypeName(pinType.type);
}

/** Picks the control for each input, and the body for each node type, from one listing of node UI elements. */
export class NodeUiControlTable {
  readonly #namedControls = new Map<string, ListedNodeUiElement>();
  readonly #typeDefaults = new Map<BuiltInPinTypeName, ListedNodeUiElement>();
  readonly #nodeBodies = new Map<string, ListedNodeUiElement>();
  readonly #registrationsPassedOver: NodeUiRegistrationPassedOver[] = [];

  constructor(listing: NodeUiElementsReading) {
    for (const listed of listing.elements) {
      const because = this.#whyTheTableDoesNotUse(listed);
      if (because !== null) this.#registrationsPassedOver.push({ listed, because });
    }
  }

  /** Each listed element the table never uses, with why: a registration only another module may make, or a key already taken. */
  get registrationsPassedOver(): readonly NodeUiRegistrationPassedOver[] {
    return this.#registrationsPassedOver;
  }

  /** The control that draws the input `declaration` declares, on any surface; never fails, ending at the read-only line. */
  controlChoiceForTheInput(declaration: InputPinDeclaration<BuiltInPinTypeName>): NodeUiControlChoice {
    const pinType = declaration.pin_type;
    const typeWords = wordsForThePinType(pinType);
    const annotatedControl = declaration.annotations.control ?? null;
    if (pinType.type === "named") {
      return {
        kind: "read_only_line",
        because:
          annotatedControl === null
            ? `No control is registered for an input of type ${typeWords}.`
            : `A control cannot be registered for one named type, so ${annotatedControl} does not draw ${typeWords}.`,
      };
    }
    const annotatedListed = annotatedControl === null ? undefined : this.#namedControls.get(namedControlKey(pinType.type, annotatedControl));
    if (annotatedListed !== undefined) return { kind: "element", listed: annotatedListed, chosen_by: "annotation", because: null };
    const missingControl = annotatedControl === null ? null : `No control named ${annotatedControl} is registered for an input of type ${typeWords}`;
    const slider = statesBothEndsOfItsRange(declaration.annotations) ? this.#namedControls.get(studioSliderKey(pinType.type)) : undefined;
    if (slider !== undefined) {
      return { kind: "element", listed: slider, chosen_by: "stated_range", because: missingControl === null ? null : `${missingControl}; its range's slider draws it.` };
    }
    const typeDefault = this.#typeDefaults.get(pinType.type);
    if (typeDefault !== undefined) {
      return { kind: "element", listed: typeDefault, chosen_by: "type_default", because: missingControl === null ? null : `${missingControl}; its type's default draws it.` };
    }
    return { kind: "read_only_line", because: missingControl === null ? `No control is registered for an input of type ${typeWords}.` : `${missingControl}.` };
  }

  /** The body that draws every node of `nodeType`, or `null` when its module registers none. */
  nodeBodyForTheNodeType(nodeType: string): ListedNodeUiElement | null {
    return this.#nodeBodies.get(nodeType) ?? null;
  }

  /** Takes `listed` into the table, or answers why the table never uses it. */
  #whyTheTableDoesNotUse(listed: ListedNodeUiElement): string | null {
    const registration = listed.registration;
    if (registration.kind === "node_body") {
      if (moduleOfTheQualifiedName(registration.node_type) !== listed.module) return `Only the module that brings ${registration.node_type} registers its body; ${listed.module} registers one.`;
      return this.#takeTheKey(this.#nodeBodies, registration.node_type, listed, `the body of ${registration.node_type}`);
    }
    if (registration.type === "named") return `A control cannot be registered for one named type, so ${listed.module}'s ${listed.script} draws none.`;
    if (registration.control !== null) {
      const controlName = controlNameAnAnnotationPicks(listed, registration.control);
      return this.#takeTheKey(this.#namedControls, namedControlKey(registration.type, controlName), listed, `the control ${controlName} for ${wordsForTheBuiltInPinTypeName(registration.type)}`);
    }
    if (listed.brought_by !== "studio") return `Only Tato Studio sets the default control of a built-in type; ${listed.module} registers one for ${wordsForTheBuiltInPinTypeName(registration.type)}.`;
    return this.#takeTheKey(this.#typeDefaults, registration.type, listed, `the default control for ${wordsForTheBuiltInPinTypeName(registration.type)}`);
  }

  /** Puts `listed` under `key`, or answers why not when another element already holds it. */
  #takeTheKey<Key>(table: Map<Key, ListedNodeUiElement>, key: Key, listed: ListedNodeUiElement, keyWords: string): string | null {
    const holder = table.get(key);
    if (holder !== undefined) return `${holder.module}'s ${holder.script} already registers ${keyWords}.`;
    table.set(key, listed);
    return null;
  }
}
