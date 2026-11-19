// The dial the `dial` controls of a Float and an Integer input draw: a knob turned across the
// input's range, with the number and its unit beside it. The knob turns by a drag up or down, a
// whole turn's height for the whole range. A drag reports `input` at each move and `change` once
// on release, so one drag is one undo step. An arrow key turns it one step, reported as `input`
// then `change`, and Home and End turn it to the ends. A drag the host interrupts, by making the
// control read only or taking it off the page, puts the number back: it reports `input` with the
// value the drag began at and no `change`.
// It is not an element: a control builds one into its shadow root and fires what it reports.

import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { numberWithItsUnit, settledNumberSpanOf, type NumberSliderShape, type SettledNumberSpan } from "./number_slider.ts";

/** How many pixels of drag turn the knob across its whole range. */
const DRAG_PIXELS_FOR_THE_WHOLE_RANGE = 160;

/** How far the knob's mark turns either side of upright, in degrees, at the range's ends. */
const MARK_TURN_AT_THE_ENDS = 135;

/** How many steps of an arrow key cross the range when the input states no step. */
const ARROW_STEPS_WITH_NO_STEP = 100;

/** A drag in progress: where the pointer and the number were as it began. */
interface DialDrag {
  readonly pointer_id: number;
  readonly start_y: number;
  readonly value_at_the_start: number;
  /** Whether the drag has moved the number, so its release is a `change`. */
  moved: boolean;
}

/** A dial over an input's range. */
export class NumberDial {
  readonly #knob = document.createElement("div");
  readonly #words = document.createElement("output");
  readonly #shape: NumberSliderShape;
  #span: SettledNumberSpan;
  #value = 0;
  #editable = false;
  #drag: DialDrag | null = null;

  /** Draws the dial into `shadow`, the shadow root of the control that holds it. */
  constructor(shadow: ShadowRoot, shape: NumberSliderShape) {
    this.#shape = shape;
    this.#span = settledNumberSpanOf({}, shape.whole_numbers);
    const dial = document.createElement("div");
    dial.className = "dial";
    this.#knob.className = "dial-knob";
    this.#knob.setAttribute("role", "slider");
    const mark = document.createElement("span");
    mark.className = "dial-mark";
    this.#knob.append(mark);
    this.#words.className = "slider-words";
    dial.append(this.#knob, this.#words);
    shadow.append(dial);
    this.#knob.addEventListener("pointerdown", (pointerEvent) => this.#pressed(pointerEvent));
    this.#knob.addEventListener("pointermove", (pointerEvent) => this.#dragged(pointerEvent));
    this.#knob.addEventListener("pointerup", (pointerEvent) => this.#released(pointerEvent));
    this.#knob.addEventListener("pointercancel", () => this.interrupt());
    this.#knob.addEventListener("keydown", (keyEvent) => this.#keyPressed(keyEvent));
    this.setEditable(false);
  }

  /** Takes the range, step and unit `annotations` state, and the input's `label`. */
  takeTheDeclaration(annotations: PinAnnotations, label: string): void {
    this.#span = settledNumberSpanOf(annotations, this.#shape.whole_numbers);
    this.#knob.setAttribute("aria-label", label);
    this.#knob.setAttribute("aria-valuemin", String(this.#span.minimum));
    this.#knob.setAttribute("aria-valuemax", String(this.#span.maximum));
    this.#show();
  }

  /** Shows `value`, the number the host sets: the knob held to its range on screen, the number as stored. */
  showTheNumber(value: number): void {
    this.#value = value;
    this.#show();
  }

  /** Lets a person turn the dial, or not; taking that away ends any drag, as `interrupt` does. */
  setEditable(editable: boolean): void {
    this.#editable = editable;
    this.#knob.tabIndex = editable ? 0 : -1;
    this.#knob.setAttribute("aria-disabled", String(!editable));
    if (!editable) this.interrupt();
  }

  /** Ends any drag as the host interrupting it: the number goes back to where the drag began, reported as `input` and no `change`. */
  interrupt(): void {
    const drag = this.#drag;
    if (drag === null) return;
    this.#drag = null;
    if (!drag.moved) return;
    this.showTheNumber(drag.value_at_the_start);
    this.#shape.report("input", drag.value_at_the_start);
  }

  #pressed(pointerEvent: PointerEvent): void {
    if (!this.#editable || this.#drag !== null) return;
    pointerEvent.preventDefault();
    this.#knob.focus();
    this.#knob.setPointerCapture?.(pointerEvent.pointerId);
    this.#drag = { pointer_id: pointerEvent.pointerId, start_y: pointerEvent.clientY, value_at_the_start: this.#value, moved: false };
  }

  #dragged(pointerEvent: PointerEvent): void {
    const drag = this.#drag;
    if (drag === null || drag.pointer_id !== pointerEvent.pointerId) return;
    const { minimum, maximum } = this.#span;
    const turned = ((drag.start_y - pointerEvent.clientY) / DRAG_PIXELS_FOR_THE_WHOLE_RANGE) * (maximum - minimum);
    const value = this.#onTheSpan(drag.value_at_the_start + turned);
    if (value === this.#value && !drag.moved) return;
    drag.moved = true;
    this.showTheNumber(value);
    this.#shape.report("input", value);
  }

  #released(pointerEvent: PointerEvent): void {
    const drag = this.#drag;
    if (drag === null || drag.pointer_id !== pointerEvent.pointerId) return;
    this.#drag = null;
    if (drag.moved) this.#shape.report("change", this.#value);
  }

  #keyPressed(keyEvent: KeyboardEvent): void {
    if (!this.#editable || this.#drag !== null) return;
    const { minimum, maximum, step } = this.#span;
    const arrowStep = step ?? (maximum - minimum) / ARROW_STEPS_WITH_NO_STEP;
    const turnedTo: Readonly<Record<string, number>> = {
      ArrowUp: this.#value + arrowStep,
      ArrowRight: this.#value + arrowStep,
      ArrowDown: this.#value - arrowStep,
      ArrowLeft: this.#value - arrowStep,
      Home: minimum,
      End: maximum,
    };
    const target = turnedTo[keyEvent.key];
    if (target === undefined) return;
    keyEvent.preventDefault();
    const value = this.#onTheSpan(target);
    if (value === this.#value) return;
    this.showTheNumber(value);
    this.#shape.report("input", value);
    this.#shape.report("change", value);
  }

  /** `number` held to the range and put on its step, counted from the range's lowest end. */
  #onTheSpan(number: number): number {
    const { minimum, maximum, step, decimals } = this.#span;
    const held = Math.min(maximum, Math.max(minimum, number));
    if (step === null) return held;
    const stepped = minimum + Math.round((held - minimum) / step) * step;
    return Number(Math.min(maximum, stepped).toFixed(decimals));
  }

  #show(): void {
    const { minimum, maximum, decimals, unit } = this.#span;
    const heldValue = Math.min(maximum, Math.max(minimum, this.#value));
    const share = maximum > minimum ? (heldValue - minimum) / (maximum - minimum) : 0;
    this.#knob.style.setProperty("--dial-turn", `${(share * 2 - 1) * MARK_TURN_AT_THE_ENDS}deg`);
    const words = numberWithItsUnit(this.#value, decimals, unit);
    this.#knob.setAttribute("aria-valuenow", String(this.#value));
    this.#knob.setAttribute("aria-valuetext", words);
    this.#words.value = words;
  }
}
