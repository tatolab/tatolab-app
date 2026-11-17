// The default control of a Float input: its number in a field, centred as Blender draws one. Dragged
// sideways, the number follows the pointer, firing `input` at each move and `change` once on
// release, so one drag is one undo step. Pressed without a drag, the field takes typed words, which
// Enter or leaving the field commits as one `change` and Escape puts back.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };

/** How far a press moves, in CSS pixels, before it is a drag rather than a press into the field. */
const PIXELS_BEFORE_A_DRAG = 3;

/** How much one pixel of drag moves a number whose input states neither a step nor a whole range. */
const MOVE_PER_PIXEL_WITH_NO_STEP = 0.01;

/** How many pixels of drag cross the whole range of an input that states one and no step. */
const PIXELS_ACROSS_A_RANGE = 200;

/** How much finer a drag moves while Shift is held. */
const FINE_DRAG_SCALE = 0.1;

/** The most decimals a number is shown or rounded to. */
const MOST_DECIMALS = 6;

/** How many decimals `number` is written with, at most `MOST_DECIMALS`. */
function decimalsOf(number: number): number {
  const [, fraction = ""] = number.toFixed(MOST_DECIMALS).replace(/0+$/, "").split(".");
  return fraction.length;
}

/** A press of the field that has not been released: where it began, and whether it has moved the number. */
interface PressOfTheField {
  readonly pointer_id: number;
  readonly started_at_x: number;
  readonly value_at_the_start: number;
  dragging: boolean;
  moved_the_number: boolean;
}

/** A number field for a Float input, which a drag or typed words change. */
export default class FloatNumber extends HTMLElement implements InputControlElement<"float"> {
  readonly #field = document.createElement("div");
  readonly #words = document.createElement("input");
  readonly #unit = document.createElement("span");
  #value = 0;
  #minimum: number | null = null;
  #maximum: number | null = null;
  #step: number | null = null;
  #editable = false;
  #press: PressOfTheField | null = null;
  #puttingTheWordsBack = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#field.className = "field";
    this.#words.inputMode = "decimal";
    this.#words.spellcheck = false;
    this.#unit.className = "unit";
    this.#unit.hidden = true;
    this.#field.append(this.#words, this.#unit);
    shadow.append(this.#field);
    this.#field.addEventListener("pointerdown", (pointerEvent) => this.#pressed(pointerEvent));
    this.#field.addEventListener("pointermove", (pointerEvent) => this.#pointerMoved(pointerEvent));
    this.#field.addEventListener("pointerup", (pointerEvent) => this.#released(pointerEvent, true));
    this.#field.addEventListener("pointercancel", (pointerEvent) => this.#released(pointerEvent, false));
    this.#words.addEventListener("keydown", (keyEvent) => this.#keyPressedWhileTyping(keyEvent));
    this.#words.addEventListener("blur", () => this.#typingEnded());
  }

  set pin({ declaration }: ControlledPin<"float">) {
    const { range, step, unit } = declaration.annotations;
    this.#minimum = range?.minimum ?? null;
    this.#maximum = range?.maximum ?? null;
    this.#step = step !== undefined && step !== null && step > 0 ? step : null;
    this.#words.setAttribute("aria-label", declaration.label);
    this.#unit.textContent = unit ?? "";
    this.#unit.hidden = (unit ?? "") === "";
    this.#showTheValue();
  }

  set value(value: number) {
    this.#value = value;
    this.#showTheValue();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#words.readOnly = !this.#editable;
    if (!this.#editable) this.#press = null;
  }

  disconnectedCallback(): void {
    this.#press = null;
  }

  /** A press begins a drag, unless the field already takes typed words, where it places the caret. */
  #pressed(pointerEvent: PointerEvent): void {
    if (!this.#editable || pointerEvent.button !== 0 || this.#isTyping()) return;
    pointerEvent.preventDefault();
    this.#field.setPointerCapture(pointerEvent.pointerId);
    this.#press = { pointer_id: pointerEvent.pointerId, started_at_x: pointerEvent.clientX, value_at_the_start: this.#value, dragging: false, moved_the_number: false };
  }

  #pointerMoved(pointerEvent: PointerEvent): void {
    const press = this.#press;
    if (press === null || pointerEvent.pointerId !== press.pointer_id) return;
    const pixelsMoved = pointerEvent.clientX - press.started_at_x;
    if (!press.dragging && Math.abs(pixelsMoved) < PIXELS_BEFORE_A_DRAG) return;
    if (!press.dragging) {
      press.dragging = true;
      this.#field.toggleAttribute("data-dragging", true);
    }
    const movePerPixel = this.#movePerPixel() * (pointerEvent.shiftKey ? FINE_DRAG_SCALE : 1);
    const dragged = this.#withinTheRange(this.#rounded(press.value_at_the_start + pixelsMoved * movePerPixel, movePerPixel));
    if (dragged === this.#value) return;
    press.moved_the_number = true;
    this.#value = dragged;
    this.#showTheValue();
    fireInputControlEvent(this, "input", dragged);
  }

  /** A drag that moved the number ends with one `change`; a press that never dragged gives the field to typed words. */
  #released(pointerEvent: PointerEvent, releasedInPlace: boolean): void {
    const press = this.#press;
    if (press === null || pointerEvent.pointerId !== press.pointer_id) return;
    this.#press = null;
    this.#field.toggleAttribute("data-dragging", false);
    if (press.moved_the_number) {
      fireInputControlEvent(this, "change", this.#value);
      return;
    }
    if (!press.dragging && releasedInPlace) {
      this.#words.focus();
      this.#words.select();
    }
  }

  #keyPressedWhileTyping(keyEvent: KeyboardEvent): void {
    if (keyEvent.key === "Enter") this.#words.blur();
    if (keyEvent.key === "Escape") {
      this.#puttingTheWordsBack = true;
      this.#words.blur();
    }
  }

  /** Commits the typed words as one `change` when they read as a number that differs from the value, and shows the value again. */
  #typingEnded(): void {
    const puttingTheWordsBack = this.#puttingTheWordsBack;
    this.#puttingTheWordsBack = false;
    const typedWords = this.#words.value.trim();
    const typed = typedWords === "" ? Number.NaN : Number(typedWords);
    if (!puttingTheWordsBack && this.#editable && Number.isFinite(typed)) {
      const committed = this.#withinTheRange(typed);
      if (committed !== this.#value) {
        this.#value = committed;
        fireInputControlEvent(this, "change", committed);
      }
    }
    this.#showTheValue();
  }

  #isTyping(): boolean {
    return this.shadowRoot?.activeElement === this.#words;
  }

  /** How much one pixel of drag moves the number: its step, a two-hundredth of its range, or a hundredth. */
  #movePerPixel(): number {
    if (this.#step !== null) return this.#step;
    if (this.#minimum !== null && this.#maximum !== null && this.#maximum > this.#minimum) return (this.#maximum - this.#minimum) / PIXELS_ACROSS_A_RANGE;
    return MOVE_PER_PIXEL_WITH_NO_STEP;
  }

  /** `number` on the input's step when it states one, otherwise to the decimals of `movePerPixel`, so a drag never shows float noise. */
  #rounded(number: number, movePerPixel: number): number {
    if (this.#step === null) return Number(number.toFixed(decimalsOf(movePerPixel)));
    const onTheStep = Math.round(number / this.#step) * this.#step;
    return Number(onTheStep.toFixed(decimalsOf(this.#step)));
  }

  #withinTheRange(number: number): number {
    const atLeastTheMinimum = this.#minimum === null ? number : Math.max(this.#minimum, number);
    return this.#maximum === null ? atLeastTheMinimum : Math.min(this.#maximum, atLeastTheMinimum);
  }

  #showTheValue(): void {
    this.#words.value = this.#step === null ? String(Number(this.#value.toFixed(MOST_DECIMALS))) : this.#value.toFixed(decimalsOf(this.#step));
  }
}
