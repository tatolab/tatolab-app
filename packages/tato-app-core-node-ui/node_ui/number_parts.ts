// The number fields a control draws for a value made of several numbers, as a Vector, a Rectangle
// or a Transform is: one field for each part, named beside it, laid out in one line or in rows of
// four. A part's field moves the whole value: dragged, it reports `input` with the value as it
// moves and `change` once on release, and typed or stepped, one `change`, as `number_field.ts`
// draws each field.
// It is not an element: a control builds one into its shadow root once its pin is known, and fires
// what it reports.

import type { InputControlEventName } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { NumberField } from "./number_field.ts";

/** One part of the value: the name shown beside its field, or `null` for one shown by its place alone, and how a screen reader names it. */
export interface NumberPart {
  readonly shown_name: string | null;
  readonly spoken_name: string;
  /** The annotations its field reads in place of the input's own, as a size that is never below 0. */
  readonly annotations_of_the_part?: (annotations: PinAnnotations) => PinAnnotations;
}

/** How the fields are laid out: in one line, which wraps where the control is narrow, or in rows of four. */
export type NumberPartsLayout = "line" | "rows_of_four";

/** The fields of a value made of numbers, reported as the numbers of every part in order. */
export class NumberParts {
  readonly #parts: readonly NumberPart[];
  readonly #fields: readonly NumberField[];
  readonly #report: (eventName: InputControlEventName, numbers: readonly number[]) => void;
  #numbers: number[];

  /** Draws a field for each of `parts` into `shadow`, laid out as `layout`. */
  constructor(shadow: ShadowRoot, layout: NumberPartsLayout, parts: readonly NumberPart[], report: (eventName: InputControlEventName, numbers: readonly number[]) => void) {
    this.#parts = parts;
    this.#report = report;
    this.#numbers = parts.map(() => 0);
    const partsElement = document.createElement("div");
    partsElement.className = "number-parts";
    partsElement.setAttribute("data-layout", layout);
    shadow.append(partsElement);
    this.#fields = parts.map((part, index) => {
      const partElement = document.createElement("div");
      partElement.className = "number-part";
      if (part.shown_name !== null) {
        const name = document.createElement("span");
        name.className = "number-part-name";
        name.textContent = part.shown_name;
        name.setAttribute("aria-hidden", "true");
        partElement.append(name);
      }
      partsElement.append(partElement);
      return new NumberField(partElement, { whole_numbers: false, step_buttons: false, report: (eventName, value) => this.#partMoved(index, eventName, value) });
    });
  }

  /** Takes the step, range and unit `annotations` state for every part, and names each part's field after the input's `label`. */
  takeTheDeclaration(annotations: PinAnnotations, label: string): void {
    this.#parts.forEach((part, index) => this.#fields[index]?.takeTheDeclaration(part.annotations_of_the_part?.(annotations) ?? annotations, `${label} ${part.spoken_name}`));
  }

  /** Shows `numbers`, one for each part in order. */
  showTheNumbers(numbers: readonly number[]): void {
    this.#numbers = this.#parts.map((_part, index) => numbers[index] ?? 0);
    this.#fields.forEach((field, index) => field.showTheNumber(this.#numbers[index] ?? 0));
  }

  /** Lets a person change the numbers, or not; taking that away ends any drag, as `interrupt` does. */
  setEditable(editable: boolean): void {
    for (const field of this.#fields) field.setEditable(editable);
  }

  /** Ends any drag as the host interrupting it: the part goes back to where the drag began, reported as `input` and no `change`. */
  interrupt(): void {
    for (const field of this.#fields) field.interrupt();
  }

  #partMoved(index: number, eventName: InputControlEventName, value: number): void {
    this.#numbers = this.#numbers.map((number, each) => (each === index ? value : number));
    this.#report(eventName, this.#numbers);
  }
}

/** The annotations of a size, as a Rectangle's width and height are: the input's own, with a range that never goes below 0. */
export function annotationsOfASize(annotations: PinAnnotations): PinAnnotations {
  const minimum = Math.max(0, annotations.range?.minimum ?? 0);
  return { ...annotations, range: { minimum, maximum: annotations.range?.maximum ?? null } };
}
