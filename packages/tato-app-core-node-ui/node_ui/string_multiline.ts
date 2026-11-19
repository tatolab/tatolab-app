// The `multiline` control of a String input: text over several lines, the row as tall as its lines
// need up to a limit. It follows the field as `text_line.ts` does: each keystroke is `input`, so the
// running stream reads the words as they are typed, and the words left by leaving the field, or by
// ⌘Enter or Ctrl+Enter, are one `change`, one undo step. Enter starts a new line. Escape puts back
// the words the field held when it was focused and fires nothing. A value the host sets while words
// are being typed waits until the field is left.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** The fewest and most lines the field shows before it scrolls. */
const LINES_SHOWN = { fewest: 2, most: 8 } as const;

/** Text over several lines for a String input. */
export default class StringMultiline extends HTMLElement implements InputControlElement<"string"> {
  readonly #words = document.createElement("textarea");
  #value = "";
  /** The words the field held when it was focused, which Escape puts back; `null` while it is not focused. */
  #wordsAtTheFocus: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#words.className = "multiline";
    this.#words.spellcheck = false;
    this.#words.rows = LINES_SHOWN.fewest;
    shadow.append(this.#words);
    this.#words.addEventListener("focus", () => {
      this.#wordsAtTheFocus = this.#words.value;
    });
    this.#words.addEventListener("input", () => {
      this.#fitTheLines();
      fireInputControlEvent(this, "input", this.#words.value);
    });
    this.#words.addEventListener("blur", () => this.#left());
    this.#words.addEventListener("keydown", (keyEvent) => this.#keyPressed(keyEvent));
  }

  set pin({ declaration }: ControlledPin<"string">) {
    this.#words.setAttribute("aria-label", declaration.label);
  }

  set value(value: string) {
    this.#value = value;
    if (this.#wordsAtTheFocus !== null) return;
    this.#words.value = value;
    this.#fitTheLines();
  }

  /** Leaving `editable` ends the words being typed: they are put back to those the field was focused on, firing nothing. */
  set state(state: InputControlState) {
    const isEditable = state === "editable";
    if (!isEditable) this.#putTheWordsBack();
    this.#words.readOnly = !isEditable;
  }

  /** Leaving the field commits the words typed, once, when a person changed them and they differ from the value held. */
  #left(): void {
    const typed = this.#words.value;
    const wereTheWordsChanged = this.#wordsAtTheFocus !== null && typed !== this.#wordsAtTheFocus && !this.#words.readOnly;
    this.#wordsAtTheFocus = null;
    if (wereTheWordsChanged && typed !== this.#value) {
      this.#value = typed;
      fireInputControlEvent(this, "change", typed);
    }
    this.#words.value = this.#value;
    this.#fitTheLines();
  }

  #keyPressed(keyEvent: KeyboardEvent): void {
    if (keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey)) {
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

  /** Shows as many lines as the words hold, between the fewest and the most. */
  #fitTheLines(): void {
    const lineCount = this.#words.value.split("\n").length;
    this.#words.rows = Math.min(LINES_SHOWN.most, Math.max(LINES_SHOWN.fewest, lineCount));
  }
}
