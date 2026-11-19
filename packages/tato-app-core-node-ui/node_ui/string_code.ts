// The `code` control of a String input: the design system's code editor, its text the String's, in
// the editor's plain text with no language help. Each edit is `input`, so the running stream reads
// the text as it is typed, and the text left by leaving the editor, or by ⌘S or Ctrl+S, is one
// `change`, one undo step, when it differs from the value held. A value the host sets while the
// editor holds the focus waits until it is left.
// The editor is the design system's React part, which the Studio supplies by name. It is drawn from a
// root in the control's own children, which its shadow root shows through a slot so the design
// system's stylesheet applies; the root is made as the control is connected, and unmounted, with the
// editor's text and undo history dropped, as it is taken off.

import { CodeTextEditor, forgetCodeEditorDocument } from "@tatolab/tato-app-view-sdk/design_system/code_text_editor";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiSurface } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** How tall the editor is drawn on each surface, in pixels; a node's row is narrow and short. */
const EDITOR_HEIGHT_ON_EACH_SURFACE: Readonly<Record<NodeUiSurface, number>> = { node: 72, properties: 140, perform: 140 };

/** How wide the editor is drawn on each surface, in pixels, where the surface does not give it the width of its row: on a node, wide enough to read a line beside its numbers. */
const EDITOR_WIDTH_ON_EACH_SURFACE: Readonly<Record<NodeUiSurface, number | null>> = { node: 220, properties: null, perform: null };

/** A code editor for a String input. */
export default class StringCode extends HTMLElement implements InputControlElement<"string"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  /** The name the editor keeps this control's text and undo history under, its own for each control. */
  #documentKey = `/tatolab-input-control/${crypto.randomUUID()}.txt`;
  #value = "";
  #text = "";
  #isFocused = false;
  /** Whether a person edited the text since it was last committed or put back. */
  #wasTheTextEdited = false;
  #editable = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
    // The part is in the control's own children, where the panel's stylesheet applies and the control's does not, so its
    // layout is set here: a column, so the editor, which fills what is left of its parent, takes the height drawn.
    this.#partElement.className = "code-control";
    Object.assign(this.#partElement.style, { display: "flex", flexDirection: "column", minWidth: "0", overflow: "hidden", borderRadius: "4px" });
    this.#partElement.setAttribute("role", "group");
    this.addEventListener("focusin", () => {
      this.#isFocused = true;
    });
    this.addEventListener("focusout", (focusEvent) => {
      if (focusEvent.relatedTarget instanceof Node && this.contains(focusEvent.relatedTarget)) return;
      this.#isFocused = false;
      this.#committed();
      this.#text = this.#value;
      this.#drawThePart();
    });
  }

  set pin({ declaration, surface }: ControlledPin<"string">) {
    this.#documentKey = `/tatolab-input-control/${declaration.input_name}-${crypto.randomUUID()}.txt`;
    this.#partElement.style.height = `${EDITOR_HEIGHT_ON_EACH_SURFACE[surface]}px`;
    const width = EDITOR_WIDTH_ON_EACH_SURFACE[surface];
    this.#partElement.style.width = width === null ? "" : `${width}px`;
    this.#partElement.setAttribute("aria-label", declaration.label);
    this.#drawThePart();
  }

  set value(value: string) {
    this.#value = value;
    if (this.#isFocused) return;
    this.#text = value;
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    if (!this.#editable) {
      this.#text = this.#value;
      this.#wasTheTextEdited = false;
    }
    this.#drawThePart();
  }

  connectedCallback(): void {
    // A code editor's lines cannot be read at the width of a node's row, so on a node it takes the width it is drawn at.
    this.toggleAttribute("data-takes-its-own-width", true);
    if (this.#partElement.parentNode !== this) this.append(this.#partElement);
    this.#partRoot ??= createRoot(this.#partElement);
    this.#drawThePart();
  }

  disconnectedCallback(): void {
    const partRoot = this.#partRoot;
    this.#partRoot = null;
    partRoot?.unmount();
    forgetCodeEditorDocument(this.#documentKey);
  }

  #edited(text: string): void {
    if (!this.#editable || text === this.#text) return;
    this.#text = text;
    this.#wasTheTextEdited = true;
    this.#drawThePart();
    fireInputControlEvent(this, "input", text);
  }

  /** Commits the text typed, once, when a person edited it and it differs from the value held. */
  #committed(): void {
    const wasTheTextEdited = this.#wasTheTextEdited;
    this.#wasTheTextEdited = false;
    if (!this.#editable || !wasTheTextEdited || this.#text === this.#value) return;
    this.#value = this.#text;
    fireInputControlEvent(this, "change", this.#value);
  }

  #drawThePart(): void {
    this.#partRoot?.render(
      createElement(CodeTextEditor, {
        documentKey: this.#documentKey,
        language: "plaintext",
        text: this.#text,
        isReadOnly: !this.#editable,
        diagnostics: [],
        languageHelp: null,
        onTextEdited: (text: string) => this.#edited(text),
        onSaveAsked: () => this.#committed(),
      }),
    );
  }
}
