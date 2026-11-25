// The one table that picks the control for an input, the same on every surface. First match wins:
// the control the input's annotation names, then the Studio's slider for its type when the input
// states both ends of its range, then its type's default: the declaring module's for a named type,
// the Studio's for a built-in type; then the read-only line with its reason. Each key has one
// candidate, because the table reads a type's default only from the module that declares the type,
// which for a built-in type is the Studio's, and a node body only from the module that brings the
// node type. Neither a named type's import path nor a node type's name says which module declares
// it, so the runtime judges that: another module's default for a named type, or body of a node type,
// is an error of its folder's check, which leaves the element unserved. The table therefore keys a
// named type's default by its import path and a body by its node type, and lets one the Studio serves
// take the key from one it does not. A control registered for the bare built-in name `named` would
// draw every named type; the table uses none. Each default the table passes over is kept under the
// type it registers for, so the slot of an input that type's default draws can say why.

import type { BuiltInPinTypeName, NamedPinTypeImportPath, PinAnnotations, PinType } from "../pin_types.js";
import type { InputPinDeclaration } from "./input_control_element.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "./node_ui_elements_listing.js";

/**
 * Why the table chose an element: the input's annotation named it, the input states both ends of its range so its type's slider
 * draws it, it is the default the module declaring the input's named type registers, or it is the Studio's default of the
 * input's built-in type.
 */
export type NodeUiControlChosenBy = "annotation" | "stated_range" | "named_type" | "type_default";

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

/** The type a control serves, as its key in the table: a built-in type's name, or the import path of the class that declares a named type. */
type ControlledTypeKey = BuiltInPinTypeName | NamedPinTypeImportPath;

/** The key `pinType` is served under: its built-in name, or for a named type the import path of the class that declares it. */
function controlledTypeKeyOf(pinType: PinType): ControlledTypeKey {
  return pinType.type === "named" ? pinType.named_pin_type : pinType.type;
}

/** Whether `type`, as a manifest writes it, is a named type's import path, `module:QualifiedClassName`, rather than a built-in type's name. */
function isANamedTypesImportPath(type: ControlledTypeKey): boolean {
  return type.includes(":");
}

/** The key of a named control: the type it serves and the name an annotation picks it by. */
function namedControlKey(type: ControlledTypeKey, controlName: string): string {
  return JSON.stringify([type, controlName]);
}

/** The key of the Studio's control named `slider` for `type`, which draws an input of it whose range has both ends; a project's control is keyed by its qualified name, so it is never this one. */
function studioSliderKey(type: BuiltInPinTypeName): string {
  return namedControlKey(type, "slider");
}

/** Whether `annotations` state both the lowest and the highest number an input holds. */
function statesBothEndsOfItsRange(annotations: PinAnnotations): boolean {
  const range = annotations.range ?? null;
  return range !== null && typeof range.minimum === "number" && typeof range.maximum === "number";
}

/** How a person reads a type a control serves: a built-in type's name in words, such as `encoded video`, or the class that declares a named type. */
function wordsForTheType(type: ControlledTypeKey): string {
  return isANamedTypesImportPath(type) ? type : type.replaceAll("_", " ");
}

/** Picks the control for each input, and the body for each node type, from one listing of node UI elements. */
export class NodeUiControlTable {
  readonly #namedControls = new Map<string, ListedNodeUiElement>();
  readonly #typeDefaults = new Map<ControlledTypeKey, ListedNodeUiElement>();
  readonly #nodeBodies = new Map<string, ListedNodeUiElement>();
  readonly #registrationsPassedOver: NodeUiRegistrationPassedOver[] = [];
  readonly #typeDefaultsPassedOver = new Map<ControlledTypeKey, NodeUiRegistrationPassedOver[]>();

  constructor(listing: NodeUiElementsReading) {
    for (const listed of listing.elements) {
      const because = this.#whyTheTableDoesNotUse(listed);
      if (because !== null) this.#passOver(listed, because);
    }
  }

  /** Each listed element the table never uses, with why: a registration only another module may make, or a key already taken. */
  get registrationsPassedOver(): readonly NodeUiRegistrationPassedOver[] {
    return this.#registrationsPassedOver;
  }

  /** The control that draws the input `declaration` declares, on any surface; never fails, ending at the read-only line. */
  controlChoiceForTheInput(declaration: InputPinDeclaration<BuiltInPinTypeName>): NodeUiControlChoice {
    const pinType = declaration.pin_type;
    const typeKey = controlledTypeKeyOf(pinType);
    const typeWords = wordsForTheType(typeKey);
    const annotatedControl = declaration.annotations.control ?? null;
    const annotatedListed = annotatedControl === null ? undefined : this.#namedControls.get(namedControlKey(typeKey, annotatedControl));
    if (annotatedListed !== undefined) return { kind: "element", listed: annotatedListed, chosen_by: "annotation", because: null };
    const missingControl = annotatedControl === null ? null : `No control named ${annotatedControl} is registered for an input of type ${typeWords}`;
    const slider = pinType.type !== "named" && statesBothEndsOfItsRange(declaration.annotations) ? this.#namedControls.get(studioSliderKey(pinType.type)) : undefined;
    if (slider !== undefined) {
      return { kind: "element", listed: slider, chosen_by: "stated_range", because: missingControl === null ? null : `${missingControl}; its range's slider draws it.` };
    }
    const typeDefault = this.#typeDefaults.get(typeKey);
    if (typeDefault !== undefined) {
      return {
        kind: "element",
        listed: typeDefault,
        chosen_by: pinType.type === "named" ? "named_type" : "type_default",
        because: missingControl === null ? null : `${missingControl}; its type's default draws it.`,
      };
    }
    return { kind: "read_only_line", because: missingControl === null ? `No control is registered for an input of type ${typeWords}.` : `${missingControl}.` };
  }

  /** Each default registered for the type of `pinType` that the table passed over, with why; none draws an input of it. */
  typeDefaultsPassedOverFor(pinType: PinType): readonly NodeUiRegistrationPassedOver[] {
    return this.#typeDefaultsPassedOver.get(controlledTypeKeyOf(pinType)) ?? [];
  }

  /** The body that draws every node of `nodeType`, or `null` when its module registers none. */
  nodeBodyForTheNodeType(nodeType: string): ListedNodeUiElement | null {
    return this.#nodeBodies.get(nodeType) ?? null;
  }

  /** Takes `listed` into the table, or answers why the table never uses it. */
  #whyTheTableDoesNotUse(listed: ListedNodeUiElement): string | null {
    const registration = listed.registration;
    if (registration.kind === "node_body") return this.#takeTheKeyFromABlockedHolder(this.#nodeBodies, registration.node_type, listed, `the body of ${registration.node_type}`);
    const type = registration.type;
    if (type === "named") return `A control is registered for one named type by the import path of its class, so ${listed.module}'s ${listed.script}, registered for named, draws none.`;
    const typeWords = wordsForTheType(type);
    if (registration.control !== null) {
      const controlName = controlNameAnAnnotationPicks(listed, registration.control);
      return this.#takeTheKey(this.#namedControls, namedControlKey(type, controlName), listed, `the control ${controlName} for ${typeWords}`);
    }
    if (isANamedTypesImportPath(type)) {
      if (listed.brought_by === "studio") return `Only the module that declares a named type sets its default control, and Tato Studio declares none; it registers one for ${typeWords}.`;
      return this.#takeTheKeyFromABlockedHolder(this.#typeDefaults, type, listed, `the default control for ${typeWords}`);
    }
    if (listed.brought_by !== "studio") return `Only Tato Studio sets the default control of a built-in type; ${listed.module} registers one for ${typeWords}.`;
    return this.#takeTheKey(this.#typeDefaults, type, listed, `the default control for ${typeWords}`);
  }

  /**
   * Puts `listed` under `key`, where the runtime judges which module may register it: in place of a holder whose folder is
   * blocked when `listed` is served, since the runtime blocks the one that breaks the rule; otherwise as `#takeTheKey` does.
   */
  #takeTheKeyFromABlockedHolder<Key>(table: Map<Key, ListedNodeUiElement>, key: Key, listed: ListedNodeUiElement, keyWords: string): string | null {
    const holder = table.get(key);
    if (holder === undefined || holder.script_serving.kind !== "blocked" || listed.script_serving.kind !== "served") return this.#takeTheKey(table, key, listed, keyWords);
    table.set(key, listed);
    this.#passOver(holder, `${listed.module}'s ${listed.script}, which passed its checks, registers ${keyWords}.`);
    return null;
  }

  /** Keeps `listed` as a registration the table never uses, with why, and under its type when it registers a type's default. */
  #passOver(listed: ListedNodeUiElement, because: string): void {
    const passedOver = { listed, because };
    this.#registrationsPassedOver.push(passedOver);
    const registration = listed.registration;
    if (registration.kind !== "control" || registration.control !== null || registration.type === "named") return;
    const ofTheType = this.#typeDefaultsPassedOver.get(registration.type);
    if (ofTheType === undefined) this.#typeDefaultsPassedOver.set(registration.type, [passedOver]);
    else ofTheType.push(passedOver);
  }

  /** Puts `listed` under `key`, or answers why not when another element already holds it. */
  #takeTheKey<Key>(table: Map<Key, ListedNodeUiElement>, key: Key, listed: ListedNodeUiElement, keyWords: string): string | null {
    const holder = table.get(key);
    if (holder !== undefined) return `${holder.module}'s ${holder.script} already registers ${keyWords}.`;
    table.set(key, listed);
    return null;
  }
}
