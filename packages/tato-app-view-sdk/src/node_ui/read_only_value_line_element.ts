// The line the host draws for an input no control draws: its stored value in words, and why no
// control draws it. It is the end of the control table, and what an element that is blocked or
// does not load becomes. A panel styles it through its `value` and `because` parts.

import type { BuiltInPinTypeName } from "../pin_types.js";
import type { ControlledPin, InputControlElement, InputControlState, StoredPinValue } from "./input_control_element.js";
import { jsonTextOf } from "../json_text.js";

/** A stored value in words: text as it is, a number or a truth value as written, any other form as JSON. */
function wordsForTheStoredValue(value: StoredPinValue<BuiltInPinTypeName>): string {
  if (value === null) return "No value";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return jsonTextOf(value);
}

/** Shows an input's stored value, which a person cannot change here, and the reason no control draws it. */
export class ReadOnlyValueLineElement extends HTMLElement implements InputControlElement<BuiltInPinTypeName> {
  readonly #valueWords = document.createElement("span");
  readonly #becauseWords = document.createElement("span");
  #storedValue: StoredPinValue<BuiltInPinTypeName> = null;
  #drivenByWire = false;

  constructor() {
    super();
    this.#valueWords.setAttribute("part", "value");
    this.#becauseWords.setAttribute("part", "because");
    this.attachShadow({ mode: "open" }).append(this.#valueWords, this.#becauseWords);
  }

  /** Names the line after its input; a `group` role is what makes a screen reader read that name. */
  set pin(pin: ControlledPin<BuiltInPinTypeName>) {
    this.setAttribute("role", "group");
    this.setAttribute("aria-label", pin.declaration.label);
  }

  set value(value: StoredPinValue<BuiltInPinTypeName>) {
    this.#storedValue = value;
    this.#showTheValue();
  }

  set state(state: InputControlState) {
    this.#drivenByWire = state === "driven_by_wire";
    this.#showTheValue();
  }

  /** Why no control draws the input; `null` shows no reason. */
  set because(because: string | null) {
    this.#becauseWords.textContent = because ?? "";
    this.#becauseWords.hidden = because === null;
  }

  #showTheValue(): void {
    this.#valueWords.textContent = this.#drivenByWire ? "Set by its wire" : wordsForTheStoredValue(this.#storedValue);
  }
}
