// The number field the Float and Integer controls draw, centred as Blender draws one. Dragged
// sideways, the number follows the pointer, reported as `input` at each move and `change` once on
// release, so one drag is one undo step. A drag the host interrupts, by making the control read
// only or taking it off the page, puts the number back: it reports `input` with the value the drag
// began at and no `change`. Pressed without a drag, the field takes typed words, which Enter or
// leaving the field commits as one `change` and Escape puts back; ArrowUp and ArrowDown move the
// number one step, Shift a finer one, each as one `change`, and so do the field's − and + buttons
// where it draws them. A dragged, typed or stepped number is put on the input's step, a whole
// number for an Integer, then inside its range.
// It is not an element: a control builds one into its shadow root and fires what it reports.

import type { InputControlEventName } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";

/** How far a press moves, in CSS pixels, before it is a drag rather than a press into the field. */
const PIXELS_BEFORE_A_DRAG = 3;

/** How much one pixel of drag moves a number whose input states neither a step nor a whole range. */
const MOVE_PER_PIXEL_WITH_NO_STEP = 0.01;

/** How many pixels of drag cross the whole range of an input that states one and no step. */
const PIXELS_ACROSS_A_RANGE = 200;

/** How many pixels of drag one arrow key moves a number whose input states no step. */
const PIXELS_IN_AN_ARROW_KEY = 10;

/** How much finer a drag or an arrow key moves while Shift is held; a stated step stays the finest move. */
const FINE_MOVE_SCALE = 0.1;

/** The most decimals a number is shown or rounded to. */
const MOST_DECIMALS = 6;

/** How many decimals `number` is written with, at most `MOST_DECIMALS`. */
function decimalsOf(number: number): number {
  const [, fraction = ""] = number.toFixed(MOST_DECIMALS).replace(/0+$/, "").split(".");
  return fraction.length;
}

/** A press of the field that has not ended: where it began, and whether it has moved the number. */
interface PressOfTheField {
  readonly pointer_id: number;
  readonly started_at_x: number;
  readonly value_at_the_start: number;
  dragging: boolean;
  moved_the_number: boolean;
}

/** How a press ends: released by the person, or interrupted by the host. */
type PressEnding = "released" | "interrupted";

/** What kind of number a field holds and what it draws besides the number. */
export interface NumberFieldShape {
  /** Whether it holds whole numbers only, as an Integer input does: its step is then a whole number, one when none is stated. */
  readonly whole_numbers: boolean;
  /** Whether it draws a − and a + button either side of the number, each moving it one step. */
  readonly step_buttons: boolean;
  /** Called with each number the field reports, as `input` while a gesture moves and `change` as it ends. */
  readonly report: (eventName: InputControlEventName, value: number) => void;
}

/** A number field, which a drag, typed words, the arrow keys or its step buttons change. */
export class NumberField {
  readonly #field = document.createElement("div");
  readonly #words = document.createElement("input");
  readonly #unit = document.createElement("span");
  readonly #stepButtons: readonly HTMLButtonElement[];
  readonly #shape: NumberFieldShape;
  readonly #shadow: ShadowRoot;
  #value = 0;
  #minimum: number | null = null;
  #maximum: number | null = null;
  #step: number | null = null;
  #editable = false;
  #press: PressOfTheField | null = null;
  #puttingTheWordsBack = false;

  /** Draws the field into `shadow`, the shadow root of the control that holds it. */
  constructor(shadow: ShadowRoot, shape: NumberFieldShape) {
    this.#shadow = shadow;
    this.#shape = shape;
    this.#field.className = "field";
    this.#words.inputMode = shape.whole_numbers ? "numeric" : "decimal";
    this.#words.spellcheck = false;
    this.#unit.className = "unit";
    this.#unit.hidden = true;
    this.#field.append(this.#words, this.#unit);
    this.#stepButtons = shape.step_buttons ? [this.#stepButton(-1, "−", "One step less"), this.#stepButton(1, "+", "One step more")] : [];
    const [lessButton, moreButton] = this.#stepButtons;
    if (lessButton === undefined || moreButton === undefined) {
      shadow.append(this.#field);
    } else {
      const stepper = document.createElement("div");
      stepper.className = "stepper";
      stepper.append(lessButton, this.#field, moreButton);
      shadow.append(stepper);
    }
    this.#field.addEventListener("pointerdown", (pointerEvent) => this.#pressed(pointerEvent));
    this.#field.addEventListener("pointermove", (pointerEvent) => this.#pointerMoved(pointerEvent));
    this.#field.addEventListener("pointerup", (pointerEvent) => this.#released(pointerEvent));
    this.#field.addEventListener("pointercancel", (pointerEvent) => {
      if (pointerEvent.pointerId === this.#press?.pointer_id) this.#endThePress("interrupted");
    });
    this.#words.addEventListener("keydown", (keyEvent) => this.#keyPressedInTheField(keyEvent));
    this.#words.addEventListener("blur", () => this.#typingEnded());
  }

  /** Takes the range, step and unit `annotations` state, and the input's `label`. */
  takeTheDeclaration(annotations: PinAnnotations, label: string): void {
    const { range, step, unit } = annotations;
    this.#minimum = range?.minimum ?? null;
    this.#maximum = range?.maximum ?? null;
    const statedStep = step !== undefined && step !== null && step > 0 ? step : null;
    this.#step = this.#shape.whole_numbers ? Math.max(1, Math.round(statedStep ?? 1)) : statedStep;
    this.#words.setAttribute("aria-label", label);
    this.#unit.textContent = unit ?? "";
    this.#unit.hidden = (unit ?? "") === "";
    this.#showTheValue();
  }

  /** Shows `value`, the number the host sets. */
  showTheNumber(value: number): void {
    this.#value = value;
    this.#showTheValue();
  }

  /** Lets a person change the number, or not; taking that away ends any press, as `interrupt` does. */
  setEditable(editable: boolean): void {
    this.#editable = editable;
    this.#words.readOnly = !editable;
    for (const stepButton of this.#stepButtons) stepButton.disabled = !editable;
    if (!editable) this.#endThePress("interrupted");
  }

  /** Ends any press as the host interrupting it: a drag that moved the number puts it back. */
  interrupt(): void {
    this.#endThePress("interrupted");
  }

  /** A button that moves the number one step in `direction` as one `change`. */
  #stepButton(direction: 1 | -1, words: string, label: string): HTMLButtonElement {
    const stepButton = document.createElement("button");
    stepButton.type = "button";
    stepButton.className = "step";
    stepButton.textContent = words;
    stepButton.setAttribute("aria-label", label);
    stepButton.tabIndex = -1;
    stepButton.addEventListener("click", () => this.#stepped(direction, false));
    return stepButton;
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
    const movePerPixel = this.#movePerPixel() * (pointerEvent.shiftKey ? FINE_MOVE_SCALE : 1);
    const dragged = this.#settled(press.value_at_the_start + pixelsMoved * movePerPixel, movePerPixel);
    if (dragged === this.#value) return;
    press.moved_the_number = true;
    this.#value = dragged;
    this.#showTheValue();
    this.#shape.report("input", dragged);
  }

  /** A press released without a drag gives the field to typed words; one that dragged ends as `#endThePress` says. */
  #released(pointerEvent: PointerEvent): void {
    const press = this.#press;
    if (press === null || pointerEvent.pointerId !== press.pointer_id) return;
    this.#endThePress("released");
    if (!press.dragging) {
      this.#words.focus();
      this.#words.select();
    }
  }

  /** Ends the open press, if any: released, a drag that moved the number fires one `change`; interrupted, it puts the number back and fires `input` with it, and no `change`. */
  #endThePress(ending: PressEnding): void {
    const press = this.#press;
    if (press === null) return;
    this.#press = null;
    this.#field.toggleAttribute("data-dragging", false);
    if (this.#field.hasPointerCapture(press.pointer_id)) this.#field.releasePointerCapture(press.pointer_id);
    if (!press.moved_the_number) return;
    if (ending === "released") {
      this.#shape.report("change", this.#value);
      return;
    }
    this.#value = press.value_at_the_start;
    this.#showTheValue();
    this.#shape.report("input", press.value_at_the_start);
  }

  #keyPressedInTheField(keyEvent: KeyboardEvent): void {
    switch (keyEvent.key) {
      case "Enter":
        this.#keptByTheField(keyEvent);
        this.#words.blur();
        return;
      case "Escape":
        this.#keptByTheField(keyEvent);
        this.#puttingTheWordsBack = true;
        this.#words.blur();
        return;
      case "ArrowUp":
      case "ArrowDown":
        this.#keptByTheField(keyEvent);
        this.#stepped(keyEvent.key === "ArrowUp" ? 1 : -1, keyEvent.shiftKey);
        return;
      default:
    }
  }

  /** Keeps a key the field acts on from the page and from whatever holds the control. */
  #keptByTheField(keyEvent: KeyboardEvent): void {
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
  }

  /** Moves the number one step in `direction` as one `change`, from an arrow key or a step button; with no stated step, `fine` moves a finer one. A stated step is always the move, since a finer one would settle back onto it. */
  #stepped(direction: 1 | -1, fine: boolean): void {
    if (!this.#editable || this.#press !== null) return;
    const move = this.#step ?? this.#movePerPixel() * PIXELS_IN_AN_ARROW_KEY * (fine ? FINE_MOVE_SCALE : 1);
    const stepped = this.#settled(this.#value + direction * move, move);
    if (stepped === this.#value) return;
    this.#value = stepped;
    this.#writeTheValue();
    this.#shape.report("change", stepped);
  }

  /** Commits the typed words as one `change` when they read as a number that settles on another value, and shows the value again. */
  #typingEnded(): void {
    const puttingTheWordsBack = this.#puttingTheWordsBack;
    this.#puttingTheWordsBack = false;
    const typedWords = this.#words.value.trim();
    const typed = typedWords === "" ? Number.NaN : Number(typedWords);
    if (!puttingTheWordsBack && this.#editable && Number.isFinite(typed)) {
      const committed = this.#settled(typed, null);
      if (committed !== this.#value) {
        this.#value = committed;
        this.#shape.report("change", committed);
      }
    }
    this.#writeTheValue();
  }

  #isTyping(): boolean {
    return this.#shadow.activeElement === this.#words;
  }

  /** How much one pixel of drag moves the number: its step, a two-hundredth of its range, or a hundredth. */
  #movePerPixel(): number {
    if (this.#step !== null) return this.#step;
    if (this.#minimum !== null && this.#maximum !== null && this.#maximum > this.#minimum) return (this.#maximum - this.#minimum) / PIXELS_ACROSS_A_RANGE;
    return MOVE_PER_PIXEL_WITH_NO_STEP;
  }

  /**
   * The one rule every new number follows: on the input's step when it states one, otherwise to the
   * decimals of `finestMove` when a gesture moved it, then inside the input's range.
   */
  #settled(number: number, finestMove: number | null): number {
    const rounded =
      this.#step !== null ? Number((Math.round(number / this.#step) * this.#step).toFixed(decimalsOf(this.#step))) : finestMove === null ? number : Number(number.toFixed(decimalsOf(finestMove)));
    const atLeastTheMinimum = this.#minimum === null ? rounded : Math.max(this.#minimum, rounded);
    return this.#maximum === null ? atLeastTheMinimum : Math.min(this.#maximum, atLeastTheMinimum);
  }

  /** Shows the value, unless the field holds words being typed, which a value the host sets never overwrites. */
  #showTheValue(): void {
    if (!this.#isTyping()) this.#writeTheValue();
  }

  #writeTheValue(): void {
    this.#words.value = this.#step === null ? String(Number(this.#value.toFixed(MOST_DECIMALS))) : this.#value.toFixed(decimalsOf(this.#step));
  }
}
