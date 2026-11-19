// The default control of a String input: one line of text. It follows the field as a native input
// does: each keystroke is `input`, so the running stream reads the words as they are typed, and the
// words left by Enter or by leaving the field are one `change`, one undo step. Escape puts back the
// words the field held when it was focused and fires nothing. A value the host sets while words are
// being typed waits until the field is left.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** One line of text for a String input. */
export default class TextLine extends HTMLElement implements InputControlElement<"string"> {
  readonly #words = document.createElement("input");
  #value = "";
  /** The words the field held when it was focused, which Escape puts back; `null` while it is not focused. */
  #wordsAtTheFocus: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const field = document.createElement("div");
    field.className = "field";
    field.setAttribute("data-text-line", "");
    this.#words.type = "text";
    this.#words.spellcheck = false;
    field.append(this.#words);
    shadow.append(field);
    this.#words.addEventListener("focus", () => {
      this.#wordsAtTheFocus = this.#words.value;
    });
    this.#words.addEventListener("input", () => fireInputControlEvent(this, "input", this.#words.value));
    this.#words.addEventListener("change", () => this.#committed());
    this.#words.addEventListener("blur", () => this.#left());
    this.#words.addEventListener("keydown", (keyEvent) => this.#keyPressed(keyEvent));
  }

  set pin({ declaration }: ControlledPin<"string">) {
    this.#words.setAttribute("aria-label", declaration.label);
  }

  set value(value: string) {
    this.#value = value;
    if (this.#wordsAtTheFocus === null) this.#words.value = value;
  }

  /** Leaving `editable` ends the words being typed: they are put back to those the field was focused on, firing nothing. */
  set state(state: InputControlState) {
    const isEditable = state === "editable";
    if (!isEditable) this.#putTheWordsBack();
    this.#words.readOnly = !isEditable;
  }

  #committed(): void {
    if (this.#wordsAtTheFocus === null || this.#words.readOnly) return;
    this.#wordsAtTheFocus = this.#words.value;
    this.#value = this.#words.value;
    fireInputControlEvent(this, "change", this.#value);
  }

  #left(): void {
    this.#wordsAtTheFocus = null;
    this.#words.value = this.#value;
  }

  #keyPressed(keyEvent: KeyboardEvent): void {
    if (keyEvent.key === "Enter") {
      keyEvent.preventDefault();
      this.#words.blur();
    } else if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      this.#putTheWordsBack();
      this.#words.blur();
    }
  }

  /** Puts back the words the field was focused on, so leaving it commits nothing. */
  #putTheWordsBack(): void {
    if (this.#wordsAtTheFocus === null) return;
    this.#words.value = this.#wordsAtTheFocus;
  }
}
