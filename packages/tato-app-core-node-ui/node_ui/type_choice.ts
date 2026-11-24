// The default control of a Pin type choice input: the design system's menu of the types its
// declaration allows, which is its `among` list, every built-in type written by its name alone when
// that list is empty, or the bundles its stream declares, which may be none. A bundle is named by the
// class that declares it, with its members on its entry's tooltip, and any other type as the
// generated list of built-in types names it; each is marked with its socket's colour, so the control
// holds no list of types of its own.
// Beside the menu, a type that can be narrowed keeps its narrowing in a second field: an encoded
// type's codecs as one line of text, a Texture's pixel format as a menu of the format names.
// Choosing another type writes that type with no narrowing. Every edit is one `change` carrying the
// whole type; a choice has no move to show live, so it fires no `input`.
// The fields are the design system's React parts, drawn from a root in the control's own children
// as the Menu control draws its menu.

import {
  entryTheChoiceHolds,
  isTheEntryHeld,
  isTheSamePinType,
  membersOfAnOfferedPinTypeInWords,
  pinTypesTheChoiceOffers,
  wordsOfAnOfferedPinType,
  type PinTypesTheChoiceOffers,
} from "@tatolab/tato-app-view-sdk/built_in_pin_types";
import { PropertyChoiceField, PropertyFieldsSideBySide, PropertyTextField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { PinType, TexturePixelFormat } from "@tatolab/tato-app-view-sdk/pin_types";
import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

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

/** What the menu says while the stream declares no bundle for it to offer. */
const NO_BUNDLE_OF_THE_STREAM_WORDS = "No node type in this stream declares a bundle.";

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
  #offered: PinTypesTheChoiceOffers = pinTypesTheChoiceOffers({ type: "pin_type_choice" });
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
    this.#offered = pinTypesTheChoiceOffers(declaration.pin_type);
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

  /** Writes `pinType` as the input's value, when it can be edited. */
  #write(pinType: PinType): void {
    if (!this.#editable) return;
    this.#chosen = pinType;
    this.#drawThePart();
    fireInputControlEvent(this, "change", pinType);
  }

  /** Writes `entry`, one the menu offers, unless it is the entry held, whose narrowing a choice of any type keeps. */
  #entryChosen(entry: PinType): void {
    if (isTheEntryHeld(this.#offered, entry, this.#chosen)) return;
    this.#write(entry);
  }

  /** Writes `pinType`, the held type narrowed in the field beside the menu, unless it is the type held. */
  #narrowingChosen(pinType: PinType): void {
    if (this.#chosen !== null && isTheSamePinType(pinType, this.#chosen)) return;
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
                this.#narrowingChosen(codecs.length === 0 ? { type } : { type, codecs });
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
                { words: ANY_PIXEL_FORMAT_WORDS, onChosen: () => this.#narrowingChosen({ type: "texture" }) },
                ...Object.values(EACH_PIXEL_FORMAT).map((pixelFormat) => ({ words: pixelFormat, onChosen: () => this.#narrowingChosen({ type: "texture", pixel_formats: [pixelFormat] }) })),
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
    const entryHeld = chosen === null ? undefined : entryTheChoiceHolds(this.#offered, chosen);
    const typeMenu = createElement(PropertyChoiceField, {
      fieldId: this.#fieldId,
      label: this.#label,
      words: chosen === null ? "" : wordsOfAnOfferedPinType(entryHeld ?? chosen),
      pinType: chosen ?? undefined,
      choices: this.#editable
        ? this.#offered.entries.map((entry) => ({ words: wordsOfAnOfferedPinType(entry), pinType: entry, tooltip: membersOfAnOfferedPinTypeInWords(entry), onChosen: () => this.#entryChosen(entry) }))
        : undefined,
      whyItOffersNoChoice: this.#offered.offers === "the_bundles_its_stream_declares" ? NO_BUNDLE_OF_THE_STREAM_WORDS : undefined,
    });
    const narrowingField = chosen === null ? null : this.#narrowingField(chosen);
    this.#partRoot?.render(narrowingField === null ? typeMenu : createElement(PropertyFieldsSideBySide, null, typeMenu, narrowingField));
  }
}
