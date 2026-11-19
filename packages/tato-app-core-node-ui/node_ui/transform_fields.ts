// The default control of a Transform input: its 4 by 4 matrix as four rows of four number fields,
// row by row as the value holds it, as `number_parts.ts` draws them.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { TransformPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { NumberParts, type NumberPart } from "./number_parts.ts";

/** The rows, and the columns of each row, of a Transform's matrix. */
const MATRIX_SIDE = 4;

/** Each of the matrix's 16 numbers, row by row, shown by its place and named by its row and column. */
const MATRIX_PARTS: readonly NumberPart[] = Array.from({ length: MATRIX_SIDE * MATRIX_SIDE }, (_unused, index) => ({
  shown_name: null,
  spoken_name: `row ${Math.floor(index / MATRIX_SIDE) + 1}, column ${(index % MATRIX_SIDE) + 1}`,
}));

/** Four rows of four number fields for a Transform input. */
export default class TransformFields extends HTMLElement implements InputControlElement<"transform"> {
  readonly #parts: NumberParts;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#parts = new NumberParts(shadow, "rows_of_four", MATRIX_PARTS, (eventName, numbers) => fireInputControlEvent(this, eventName, [...numbers]));
  }

  set pin({ declaration }: ControlledPin<"transform">) {
    this.#parts.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value(value: TransformPinValue) {
    this.#parts.showTheNumbers(value);
  }

  set state(state: InputControlState) {
    this.#parts.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#parts.interrupt();
  }
}
