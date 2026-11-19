// The default control of a Pin type choice input: the design system's menu of the types its
// declaration allows, which is its `among` list, or every built-in type written by its name alone
// when that list is empty. Each type is named as the generated list of built-in types names it and
// marked with its socket's colour, so the control holds no list of types of its own.
// Beside the menu, a type that can be narrowed keeps its narrowing in a second field: an encoded
// type's codecs as one line of text, a Texture's pixel format as a menu of the format names.
// Choosing another type writes that type with no narrowing. Every edit is one `change` carrying the
// whole type; a choice has no move to show live, so it fires no `input`.
// The fields are the design system's React parts, drawn from a root in the control's own children
// as the Menu control draws its menu.

import { BUILT_IN_PIN_TYPES } from "@tatolab/tato-app-view-sdk/built_in_pin_types";
import { PropertyChoiceField, PropertyFieldsSideBySide, PropertyTextField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { BuiltInPinTypeName, PinType, TexturePixelFormat } from "@tatolab/tato-app-view-sdk/pin_types";
import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The type `typeName` names when written with nothing else, `null` for one that states more, as a Menu its options; a type choice chooses the type of pins that carry messages, so it never offers itself. */
function pinTypeOfItsNameAlone(typeName: BuiltInPinTypeName): PinType | null {
  switch (typeName) {
    case "boolean":
    case "integer":
    case "float":
    case "string":
    case "color":
    case "rectangle":
    case "transform":
    case "texture":
    case "audio":
    case "encoded_video":
    case "encoded_audio":
    case "tensor":
    case "asset":
    case "trigger":
    case "node_reference":
      return { type: typeName };
    case "menu":
    case "vector":
    case "list_of":
    case "bundle":
    case "named":
    case "pin_type_choice":
      return null;
  }
}

/** Every type a choice with an empty `among` list offers: each built-in type written by its name alone, in the contract's order. */
const EVERY_TYPE_BY_ITS_NAME_ALONE: readonly PinType[] = BUILT_IN_PIN_TYPES.flatMap((builtInPinType) => pinTypeOfItsNameAlone(builtInPinType.name) ?? []);

/** The words a person reads the type `pinType` as, from the generated list of built-in types. */
function wordsOfTheType(pinType: PinType): string {
  return BUILT_IN_PIN_TYPES.find((builtInPinType) => builtInPinType.name === pinType.type)?.label ?? pinType.type;
}

/** Each pixel format a Texture may be narrowed to, as the contract spells it. */
const EACH_PIXEL_FORMAT: Readonly<Record<TexturePixelFormat, TexturePixelFormat>> = {
  rgba8_unorm: "rgba8_unorm",
  rgba8_unorm_srgb: "rgba8_unorm_srgb",
  bgra8_unorm: "bgra8_unorm",
  bgra8_unorm_srgb: "bgra8_unorm_srgb",
  rgba16_float: "rgba16_float",
  rgba32_float: "rgba32_float",
  nv12: "nv12",
};

/** The pixel format menu's words for a Texture that takes any format. */
const ANY_PIXEL_FORMAT_WORDS = "any format";

/** `codecs` as one line of text, separated by commas. */
const codecLine = (codecs: readonly string[] | undefined): string => (codecs ?? []).join(", ");

/** The codecs a line of text names: each between its commas, trimmed, leaving out empty ones. */
const codecsOfTheLine = (line: string): string[] =>
  line
    .split(",")
    .map((codec) => codec.trim())
    .filter((codec) => codec !== "");

/** The menu of the types a Pin type choice input allows, with the narrowing of the chosen type beside it. */
export default class TypeChoice extends HTMLElement implements InputControlElement<"pin_type_choice"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  #fieldId = "";
  #label = "";
  #offered: readonly PinType[] = [];
  #chosen: PinType | null = null;
  #editable = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
  }

  set pin({ declaration }: ControlledPin<"pin_type_choice">) {
    this.#fieldId = `type-choice-${declaration.input_name}-${crypto.randomUUID()}`;
    this.#label = declaration.label;
    const among = declaration.pin_type.among ?? [];
    const offered = among.length === 0 ? EVERY_TYPE_BY_ITS_NAME_ALONE : among;
    this.#offered = offered.filter((pinType, index) => offered.findIndex((earlier) => earlier.type === pinType.type) === index);
    this.#drawThePart();
  }

  set value(pinType: PinType) {
    this.#chosen = pinType;
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#drawThePart();
  }

  connectedCallback(): void {
    if (this.#partElement.parentNode !== this) this.append(this.#partElement);
    this.#partRoot ??= createRoot(this.#partElement);
    this.#drawThePart();
  }

  disconnectedCallback(): void {
    const partRoot = this.#partRoot;
    this.#partRoot = null;
    partRoot?.unmount();
  }

  /** Writes `pinType` as the input's value, when it can be edited and `pinType` is not the type it holds. */
  #write(pinType: PinType): void {
    if (!this.#editable || (this.#chosen !== null && JSON.stringify(pinType) === JSON.stringify(this.#chosen))) return;
    this.#chosen = pinType;
    this.#drawThePart();
    fireInputControlEvent(this, "change", pinType);
  }

  /** Writes `pinType` as offered, unless it is the type held, whose narrowing it keeps. */
  #typeChosen(pinType: PinType): void {
    if (pinType.type === this.#chosen?.type) return;
    this.#write(pinType);
  }

  /** The field beside the menu that narrows `pinType`; `null` for a type that cannot be narrowed. */
  #narrowingField(pinType: PinType): ReactElement | null {
    switch (pinType.type) {
      case "encoded_video":
      case "encoded_audio": {
        const { type } = pinType;
        return createElement(PropertyTextField, {
          fieldId: `${this.#fieldId}-codecs`,
          label: `Codecs of ${this.#label}`,
          words: codecLine(pinType.codecs),
          onCommitted: this.#editable
            ? (line: string) => {
                const codecs = codecsOfTheLine(line);
                this.#write(codecs.length === 0 ? { type } : { type, codecs });
              }
            : undefined,
        });
      }
      case "texture": {
        const pixelFormats = pinType.pixel_formats ?? [];
        return createElement(PropertyChoiceField, {
          fieldId: `${this.#fieldId}-pixel-format`,
          label: `Pixel format of ${this.#label}`,
          words: pixelFormats.length === 0 ? ANY_PIXEL_FORMAT_WORDS : pixelFormats.join(", "),
          choices: this.#editable
            ? [
                { words: ANY_PIXEL_FORMAT_WORDS, onChosen: () => this.#write({ type: "texture" }) },
                ...Object.values(EACH_PIXEL_FORMAT).map((pixelFormat) => ({ words: pixelFormat, onChosen: () => this.#write({ type: "texture", pixel_formats: [pixelFormat] }) })),
              ]
            : undefined,
        });
      }
      default:
        return null;
    }
  }

  #drawThePart(): void {
    const chosen = this.#chosen;
    const typeMenu = createElement(PropertyChoiceField, {
      fieldId: this.#fieldId,
      label: this.#label,
      words: chosen === null ? "" : wordsOfTheType(chosen),
      pinType: chosen ?? undefined,
      choices: this.#editable ? this.#offered.map((pinType) => ({ words: wordsOfTheType(pinType), pinType, onChosen: () => this.#typeChosen(pinType) })) : undefined,
    });
    const narrowingField = chosen === null ? null : this.#narrowingField(chosen);
    this.#partRoot?.render(narrowingField === null ? typeMenu : createElement(PropertyFieldsSideBySide, null, typeMenu, narrowingField));
  }
}
