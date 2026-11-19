// The slider the ranged Float and Integer controls draw: a track between the input's range, on its
// step, with the number and its unit beside it. Moved, it reports `input` at each move and `change`
// once on release, so one drag is one undo step; an arrow key moves it one step, reported as
// `input` then `change`. A drag the host interrupts, by making the control read only or taking it
// off the page, puts the number back: it reports `input` with the value the drag began at and no
// `change`.
// It is not an element: a control builds one into its shadow root and fires what it reports.

import type { InputControlEventName } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";

/** The range a slider spans when its input states none or only one end: a Float's whole span, or a hundred whole numbers. */
const RANGE_WHEN_NONE_IS_STATED = { float: { minimum: 0, maximum: 1 }, integer: { minimum: 0, maximum: 100 } } as const;

/** How many decimals a Float is shown with when its input states no step. */
const DECIMALS_WITH_NO_STEP = 2;

/** What kind of number a slider holds. */
export interface NumberSliderShape {
  /** Whether it holds whole numbers only, as an Integer input does: its step is then a whole number, one when none is stated. */
  readonly whole_numbers: boolean;
  /** Called with each number the slider reports, as `input` while it moves and `change` as it ends. */
  readonly report: (eventName: InputControlEventName, value: number) => void;
}

/** How many decimals `step` is written with. */
function decimalsOf(step: number): number {
  const [, fraction = ""] = String(step).split(".");
  return fraction.length;
}

/** A slider over an input's range. */
export class NumberSlider {
  readonly #track = document.createElement("input");
  readonly #words = document.createElement("output");
  readonly #shape: NumberSliderShape;
  #unit = "";
  #decimals = 0;
  #value = 0;
  /** The number a move began at, while a move has reported `input` and not yet ended. */
  #valueAtTheStart: number | null = null;

  /** Draws the slider into `shadow`, the shadow root of the control that holds it. */
  constructor(shadow: ShadowRoot, shape: NumberSliderShape) {
    this.#shape = shape;
    const slider = document.createElement("div");
    slider.className = "slider";
    this.#track.type = "range";
    this.#words.className = "slider-words";
    slider.append(this.#track, this.#words);
    shadow.append(slider);
    this.#track.addEventListener("input", () => this.#moved());
    this.#track.addEventListener("change", () => this.#released());
  }

  /** Takes the range, step and unit `annotations` state, and the input's `label`. */
  takeTheDeclaration(annotations: PinAnnotations, label: string): void {
    const { range, step, unit } = annotations;
    const rangeWhenNone = RANGE_WHEN_NONE_IS_STATED[this.#shape.whole_numbers ? "integer" : "float"];
    const hasARange = range?.minimum !== undefined && range.minimum !== null && range.maximum !== undefined && range.maximum !== null && range.maximum > range.minimum;
    this.#track.min = String(hasARange ? range.minimum : rangeWhenNone.minimum);
    this.#track.max = String(hasARange ? range.maximum : rangeWhenNone.maximum);
    const statedStep = step !== undefined && step !== null && step > 0 ? step : null;
    const settledStep = this.#shape.whole_numbers ? Math.max(1, Math.round(statedStep ?? 1)) : statedStep;
    this.#track.step = settledStep === null ? "any" : String(settledStep);
    this.#decimals = settledStep === null ? DECIMALS_WITH_NO_STEP : decimalsOf(settledStep);
    this.#track.setAttribute("aria-label", label);
    this.#unit = unit ?? "";
    this.#show(this.#value);
  }

  /** Shows `value`, the number the host sets, held to the track's range on screen and left as stored. */
  showTheNumber(value: number): void {
    this.#value = value;
    this.#track.valueAsNumber = value;
    this.#show(value);
  }

  /** Lets a person move the slider, or not; taking that away ends any move, as `interrupt` does. */
  setEditable(editable: boolean): void {
    this.#track.disabled = !editable;
    if (!editable) this.interrupt();
  }

  /** Ends any move as the host interrupting it: the number goes back to where the move began, reported as `input` and no `change`. */
  interrupt(): void {
    const valueAtTheStart = this.#valueAtTheStart;
    if (valueAtTheStart === null) return;
    this.#valueAtTheStart = null;
    this.showTheNumber(valueAtTheStart);
    this.#shape.report("input", valueAtTheStart);
  }

  #moved(): void {
    this.#valueAtTheStart ??= this.#value;
    this.#value = this.#track.valueAsNumber;
    this.#show(this.#value);
    this.#shape.report("input", this.#value);
  }

  #released(): void {
    if (this.#valueAtTheStart === null) return;
    this.#valueAtTheStart = null;
    this.#value = this.#track.valueAsNumber;
    this.#show(this.#value);
    this.#shape.report("change", this.#value);
  }

  #show(value: number): void {
    this.#words.value = `${value.toFixed(this.#decimals)}${this.#unit === "" ? "" : ` ${this.#unit}`}`;
  }
}
