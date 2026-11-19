// The default control of a Rectangle input: a number field for its left edge `x`, its top edge `y`,
// its width and its height, which never go below 0, as `number_parts.ts` draws them.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { RectanglePinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { annotationsOfASize, NumberParts } from "./number_parts.ts";

/** A number field for each of a Rectangle input's edges and sizes. */
export default class RectangleFields extends HTMLElement implements InputControlElement<"rectangle"> {
  readonly #parts: NumberParts;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#parts = new NumberParts(
      shadow,
      "line",
      [
        { shown_name: "x", spoken_name: "x" },
        { shown_name: "y", spoken_name: "y" },
        { shown_name: "w", spoken_name: "width", annotations_of_the_part: annotationsOfASize },
        { shown_name: "h", spoken_name: "height", annotations_of_the_part: annotationsOfASize },
      ],
      (eventName, [x = 0, y = 0, width = 0, height = 0]) => fireInputControlEvent(this, eventName, { x, y, width, height }),
    );
  }

  set pin({ declaration }: ControlledPin<"rectangle">) {
    this.#parts.takeTheDeclaration(declaration.annotations, declaration.label);
  }

  set value({ x, y, width, height }: RectanglePinValue) {
    this.#parts.showTheNumbers([x, y, width, height]);
  }

  set state(state: InputControlState) {
    this.#parts.setEditable(state === "editable");
  }

  disconnectedCallback(): void {
    this.#parts.interrupt();
  }
}
