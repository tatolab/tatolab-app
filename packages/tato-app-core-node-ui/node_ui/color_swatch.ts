// The default control of a Color input: a swatch, which opens the Studio's colour picker, and the
// colour's hex value to type. One open picker is one gesture: each colour picked in it is `input`,
// Use is one `change`, and closing it any other way after a pick is `cancel`, which puts the input
// back; with nothing picked, Use and Cancel fire nothing. The hex value is a lone `change`:
// `#rrggbb` keeps the stored alpha and `#rrggbbaa` sets it.
// A colour is held as sRGB numbers, each hex pair divided by 255 with no colour conversion; a number
// outside 0 to 1 is shown held to that span and stays as stored until the colour is changed.
// The picker is the design system's React part, which the Studio supplies by name. It is drawn from
// a root in the control's own children, made as the control is connected and unmounted as it is
// taken off, and opens over the page, where the design system's stylesheet applies.

import { ColourPickerDialog, isAHexColourWithAlpha } from "@tatolab/tato-app-view-sdk/design_system/colour_picker_dialog";
import { fireInputControlCancel, fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { ColorPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The most a hex pair holds. */
const HEX_PAIR_MAXIMUM = 255;

/** `number` held to 0 to 1, as a part of a colour is shown. */
function heldToTheUnitSpan(number: number): number {
  return Math.min(1, Math.max(0, number));
}

/** One part of a colour as its hex pair. */
function hexPairOf(part: number): string {
  return Math.round(heldToTheUnitSpan(part) * HEX_PAIR_MAXIMUM)
    .toString(16)
    .padStart(2, "0");
}

/** `colour` as `#rrggbb`, with its alpha pair after where `withAlpha` and its alpha is not full. */
function hexOf(colour: ColorPinValue, withAlpha: boolean): string {
  const rgb = `#${hexPairOf(colour.red)}${hexPairOf(colour.green)}${hexPairOf(colour.blue)}`;
  return withAlpha && hexPairOf(colour.alpha) !== "ff" ? `${rgb}${hexPairOf(colour.alpha)}` : rgb;
}

/** The colour `hex` writes, `#rrggbb` or `#rrggbbaa`; a hex with no alpha pair takes `alphaWithNone`. */
function colourOfTheHex(hex: string, alphaWithNone: number): ColorPinValue {
  const part = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16) / HEX_PAIR_MAXIMUM;
  return { red: part(1), green: part(3), blue: part(5), alpha: hex.length === 9 ? part(7) : alphaWithNone };
}

function isTheSameColour(before: ColorPinValue, after: ColorPinValue): boolean {
  return before.red === after.red && before.green === after.green && before.blue === after.blue && before.alpha === after.alpha;
}

/** The picker while it is open: the colour it opened on, and whether a colour has been picked in it since. */
interface OpenPicker {
  readonly colour_at_the_open: ColorPinValue;
  picked_a_colour: boolean;
}

/** A swatch and a hex value for a Color input. */
export default class ColorSwatch extends HTMLElement implements InputControlElement<"color"> {
  readonly #swatch = document.createElement("button");
  readonly #words = document.createElement("input");
  readonly #pickerRootElement = document.createElement("div");
  #pickerRoot: Root | null = null;
  #label = "";
  #colour: ColorPinValue = { red: 0, green: 0, blue: 0, alpha: 1 };
  #editable = false;
  #openPicker: OpenPicker | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const row = document.createElement("div");
    row.className = "colour-row";
    this.#swatch.type = "button";
    this.#swatch.className = "swatch";
    const field = document.createElement("div");
    field.className = "field";
    this.#words.spellcheck = false;
    field.append(this.#words);
    row.append(this.#swatch, field);
    shadow.append(row);
    this.#swatch.addEventListener("click", () => this.#openThePicker());
    this.#words.addEventListener("keydown", (keyEvent) => this.#keyPressedInTheWords(keyEvent));
    this.#words.addEventListener("blur", () => this.#commitTheWords());
    this.#show(this.#colour);
  }

  set pin({ declaration }: ControlledPin<"color">) {
    this.#label = declaration.label;
    this.#swatch.setAttribute("aria-label", `Pick ${declaration.label}`);
    this.#words.setAttribute("aria-label", `${declaration.label} hex`);
  }

  set value(colour: ColorPinValue) {
    this.#colour = colour;
    if (this.#openPicker === null) this.#show(colour, { over_typed_words: false });
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#swatch.disabled = !this.#editable;
    this.#words.readOnly = !this.#editable;
    if (!this.#editable) this.#closeThePickerPuttingTheColourBack();
  }

  connectedCallback(): void {
    if (this.#pickerRootElement.parentNode !== this) this.append(this.#pickerRootElement);
    this.#pickerRoot ??= createRoot(this.#pickerRootElement);
    this.#drawThePicker();
  }

  disconnectedCallback(): void {
    this.#closeThePickerPuttingTheColourBack();
    const pickerRoot = this.#pickerRoot;
    this.#pickerRoot = null;
    pickerRoot?.unmount();
  }

  #openThePicker(): void {
    if (!this.#editable || this.#openPicker !== null) return;
    this.#openPicker = { colour_at_the_open: this.#colour, picked_a_colour: false };
    this.#drawThePicker();
  }

  /** A colour picked in the open picker: shown and fired as `input`. */
  #colourMoved(hex: string): void {
    const openPicker = this.#openPicker;
    if (openPicker === null) return;
    openPicker.picked_a_colour = true;
    this.#colour = colourOfTheHex(hex, 1);
    this.#show(this.#colour);
    fireInputControlEvent(this, "input", this.#colour);
  }

  /** Use: the colour picked is one `change`, and nothing at all when none was picked. */
  #colourUsed(hex: string): void {
    const openPicker = this.#openPicker;
    if (openPicker === null) return;
    this.#openPicker = null;
    if (openPicker.picked_a_colour) {
      this.#colour = colourOfTheHex(hex, 1);
      fireInputControlEvent(this, "change", this.#colour);
    }
    this.#show(this.#colour);
    this.#drawThePicker();
  }

  /** The picker closed other than by Use: after a pick, the colour it opened on is put back and the gesture is `cancel`. */
  #pickerClosed(): void {
    const openPicker = this.#openPicker;
    if (openPicker === null) return;
    this.#closeThePickerPuttingTheColourBack();
    if (openPicker.picked_a_colour) fireInputControlCancel(this);
  }

  /** Closes an open picker and shows the colour it opened on, firing nothing; the host ends the gesture itself. */
  #closeThePickerPuttingTheColourBack(): void {
    const openPicker = this.#openPicker;
    if (openPicker === null) return;
    this.#openPicker = null;
    this.#colour = openPicker.colour_at_the_open;
    this.#show(this.#colour);
    this.#drawThePicker();
  }

  #drawThePicker(): void {
    const openPicker = this.#openPicker;
    this.#pickerRoot?.render(
      createElement(ColourPickerDialog, {
        isOpen: openPicker !== null,
        onOpenChange: (isOpen: boolean) => {
          if (!isOpen) this.#pickerClosed();
        },
        title: this.#label,
        startingColour: hexOf(openPicker?.colour_at_the_open ?? this.#colour, true),
        recentColours: [],
        onColourPicked: (hex: string) => this.#colourUsed(hex),
        onColourMoved: (hex: string) => this.#colourMoved(hex),
        withAlpha: true,
        "data-colour-swatch-picker": "",
      }),
    );
  }

  #keyPressedInTheWords(keyEvent: KeyboardEvent): void {
    if (keyEvent.key === "Enter") {
      keyEvent.preventDefault();
      this.#commitTheWords();
    } else if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      this.#show(this.#colour);
      this.#words.blur();
    }
  }

  /** The typed hex as one `change`: `#rrggbb` keeps the stored alpha and `#rrggbbaa` sets it; words that are no colour are put back. */
  #commitTheWords(): void {
    const typed = this.#words.value.trim();
    if (this.#editable && isAHexColourWithAlpha(typed)) {
      const committed = colourOfTheHex(typed.toLowerCase(), this.#colour.alpha);
      if (!isTheSameColour(committed, this.#colour)) {
        this.#colour = committed;
        fireInputControlEvent(this, "change", committed);
      }
    }
    this.#show(this.#colour);
  }

  /** Shows `colour` on the swatch and in the hex value; a colour the host sets leaves words being typed as they are. */
  #show(colour: ColorPinValue, { over_typed_words }: { over_typed_words: boolean } = { over_typed_words: true }): void {
    const hex = hexOf(colour, true);
    this.#swatch.style.setProperty("--swatch-colour", hex);
    if (over_typed_words || this.shadowRoot?.activeElement !== this.#words) this.#words.value = hex;
  }
}
