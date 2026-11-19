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

/** The span, step and unit a ranged number's control moves over, settled from what its input states. */
export interface SettledNumberSpan {
  readonly minimum: number;
  readonly maximum: number;
  /** The step it moves by, or `null` for any number between the ends. */
  readonly step: number | null;
  /** How many decimals the number is shown with. */
  readonly decimals: number;
  /** The unit shown after the number, or `""`. */
  readonly unit: string;
}

/** The span a slider or a dial moves over: the input's range when it states both ends, else a Float's whole span or a hundred whole numbers; its step, a whole number for `wholeNumbers`; and its unit. */
export function settledNumberSpanOf(annotations: PinAnnotations, wholeNumbers: boolean): SettledNumberSpan {
  const { range, step, unit } = annotations;
  const rangeWhenNone = RANGE_WHEN_NONE_IS_STATED[wholeNumbers ? "integer" : "float"];
  const statedMinimum = range?.minimum ?? null;
  const statedMaximum = range?.maximum ?? null;
  const hasARange = statedMinimum !== null && statedMaximum !== null && statedMaximum > statedMinimum;
  const statedStep = step !== undefined && step !== null && step > 0 ? step : null;
  const settledStep = wholeNumbers ? Math.max(1, Math.round(statedStep ?? 1)) : statedStep;
  return {
    minimum: hasARange ? statedMinimum : rangeWhenNone.minimum,
    maximum: hasARange ? statedMaximum : rangeWhenNone.maximum,
    step: settledStep,
    decimals: settledStep === null ? DECIMALS_WITH_NO_STEP : decimalsOf(settledStep),
    unit: unit ?? "",
  };
}

/** `number` with `unit` after it, shown with `decimals` decimals. */
export function numberWithItsUnit(number: number, decimals: number, unit: string): string {
  return `${number.toFixed(decimals)}${unit === "" ? "" : ` ${unit}`}`;
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
    const span = settledNumberSpanOf(annotations, this.#shape.whole_numbers);
    this.#track.min = String(span.minimum);
    this.#track.max = String(span.maximum);
    this.#track.step = span.step === null ? "any" : String(span.step);
    this.#decimals = span.decimals;
    this.#track.setAttribute("aria-label", label);
    this.#unit = span.unit;
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
    this.#words.value = numberWithItsUnit(value, this.#decimals, this.#unit);
  }
}
