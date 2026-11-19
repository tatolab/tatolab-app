// The `xy_pad` control of a Vector input: a square pad whose point is the vector's `x` across and `y`
// up, over the input's range, with the two numbers under it. A press puts the point under the
// pointer and a drag moves it: each move is `input` and the release one `change`, so one drag is one
// undo step. An arrow key moves it one step, reported as `input` then `change`. A drag the host
// interrupts, by making the control read only or taking it off the page, puts the point back: it
// reports `input` with the vector the drag began at and no `change`.
// The pad edits `x` and `y`. A Vector of three or four keeps its `z` and `w` as held, and shows them
// after the two.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { PinAnnotations, VectorPinValue } from "@tatolab/tato-app-view-sdk/pin_types";

/** The span each axis covers when the input states no range with both ends. */
const SPAN_WHEN_NONE_IS_STATED = { minimum: -1, maximum: 1 } as const;

/** How many steps of an arrow key cross an axis when the input states no step. */
const ARROW_STEPS_WITH_NO_STEP = 100;

/** How many decimals each number is shown with. */
const DECIMALS_SHOWN = 2;

/** What both axes span, and the step a key moves the point by. */
interface PadSpan {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

/** The span `annotations` state for both axes, or −1 to 1. */
function padSpanOf(annotations: PinAnnotations): PadSpan {
  const { range, step } = annotations;
  const statedMinimum = range?.minimum ?? null;
  const statedMaximum = range?.maximum ?? null;
  const hasARange = statedMinimum !== null && statedMaximum !== null && statedMaximum > statedMinimum;
  const minimum = hasARange ? statedMinimum : SPAN_WHEN_NONE_IS_STATED.minimum;
  const maximum = hasARange ? statedMaximum : SPAN_WHEN_NONE_IS_STATED.maximum;
  return { minimum, maximum, step: typeof step === "number" && step > 0 ? step : (maximum - minimum) / ARROW_STEPS_WITH_NO_STEP };
}

/** A drag in progress: its pointer and the vector it began at. */
interface PadDrag {
  readonly pointer_id: number;
  readonly vector_at_the_start: VectorPinValue;
}

/** A two-axis pad for a Vector input. */
export default class VectorXyPad extends HTMLElement implements InputControlElement<"vector"> {
  readonly #pad = document.createElement("div");
  readonly #point = document.createElement("span");
  readonly #words = document.createElement("output");
  #span: PadSpan = padSpanOf({});
  #vector: VectorPinValue = { x: 0, y: 0 };
  #editable = false;
  #drag: PadDrag | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const holder = document.createElement("div");
    holder.className = "xy-pad";
    this.#pad.className = "xy-pad-area";
    this.#pad.setAttribute("role", "group");
    this.#point.className = "xy-pad-point";
    this.#pad.append(this.#point);
    this.#words.className = "xy-pad-words";
    holder.append(this.#pad, this.#words);
    shadow.append(holder);
    this.#pad.addEventListener("pointerdown", (pointerEvent) => this.#pressed(pointerEvent));
    this.#pad.addEventListener("pointermove", (pointerEvent) => this.#dragged(pointerEvent));
    this.#pad.addEventListener("pointerup", (pointerEvent) => this.#released(pointerEvent));
    this.#pad.addEventListener("pointercancel", () => this.#interrupt());
    this.#pad.addEventListener("keydown", (keyEvent) => this.#keyPressed(keyEvent));
    this.#takeTheState("read_only");
  }

  set pin({ declaration }: ControlledPin<"vector">) {
    this.#span = padSpanOf(declaration.annotations);
    this.#pad.setAttribute("aria-label", `${declaration.label}: x across, y up`);
    this.#show();
  }

  set value(vector: VectorPinValue) {
    this.#vector = { ...vector };
    this.#show();
  }

  set state(state: InputControlState) {
    this.#takeTheState(state);
  }

  disconnectedCallback(): void {
    this.#interrupt();
  }

  #takeTheState(state: InputControlState): void {
    this.#editable = state === "editable";
    this.#pad.tabIndex = this.#editable ? 0 : -1;
    this.#pad.setAttribute("aria-disabled", String(!this.#editable));
    if (!this.#editable) this.#interrupt();
  }

  /** Ends any drag as the host interrupting it: the point goes back to where the drag began, reported as `input` and no `change`. */
  #interrupt(): void {
    const drag = this.#drag;
    if (drag === null) return;
    this.#drag = null;
    this.#vector = drag.vector_at_the_start;
    this.#show();
    fireInputControlEvent(this, "input", { ...this.#vector });
  }

  #pressed(pointerEvent: PointerEvent): void {
    if (!this.#editable || this.#drag !== null) return;
    pointerEvent.preventDefault();
    this.#pad.focus();
    this.#pad.setPointerCapture?.(pointerEvent.pointerId);
    this.#drag = { pointer_id: pointerEvent.pointerId, vector_at_the_start: { ...this.#vector } };
    this.#movedTo(pointerEvent);
  }

  #dragged(pointerEvent: PointerEvent): void {
    if (this.#drag?.pointer_id !== pointerEvent.pointerId) return;
    this.#movedTo(pointerEvent);
  }

  #released(pointerEvent: PointerEvent): void {
    if (this.#drag?.pointer_id !== pointerEvent.pointerId) return;
    this.#drag = null;
    fireInputControlEvent(this, "change", { ...this.#vector });
  }

  /** Puts the point under the pointer, held inside the pad. */
  #movedTo(pointerEvent: PointerEvent): void {
    const area = this.#pad.getBoundingClientRect();
    const across = area.width > 0 ? (pointerEvent.clientX - area.left) / area.width : 0.5;
    const up = area.height > 0 ? 1 - (pointerEvent.clientY - area.top) / area.height : 0.5;
    const { minimum, maximum } = this.#span;
    this.#vector = { ...this.#vector, x: this.#heldToTheSpan(minimum + across * (maximum - minimum)), y: this.#heldToTheSpan(minimum + up * (maximum - minimum)) };
    this.#show();
    fireInputControlEvent(this, "input", { ...this.#vector });
  }

  #keyPressed(keyEvent: KeyboardEvent): void {
    if (!this.#editable || this.#drag !== null) return;
    const { step } = this.#span;
    const moves: Readonly<Record<string, readonly [number, number]>> = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[keyEvent.key];
    if (move === undefined) return;
    keyEvent.preventDefault();
    const moved = { ...this.#vector, x: this.#heldToTheSpan(this.#vector.x + move[0]), y: this.#heldToTheSpan(this.#vector.y + move[1]) };
    if (moved.x === this.#vector.x && moved.y === this.#vector.y) return;
    this.#vector = moved;
    this.#show();
    fireInputControlEvent(this, "input", { ...moved });
    fireInputControlEvent(this, "change", { ...moved });
  }

  #heldToTheSpan(number: number): number {
    const { minimum, maximum } = this.#span;
    return Math.min(maximum, Math.max(minimum, number));
  }

  #show(): void {
    const { minimum, maximum } = this.#span;
    const shareOf = (number: number) => (this.#heldToTheSpan(number) - minimum) / (maximum - minimum);
    this.#point.style.left = `${shareOf(this.#vector.x) * 100}%`;
    this.#point.style.bottom = `${shareOf(this.#vector.y) * 100}%`;
    const { x, y, z, w } = this.#vector;
    const parts = [`x ${x.toFixed(DECIMALS_SHOWN)}`, `y ${y.toFixed(DECIMALS_SHOWN)}`];
    if (z !== undefined) parts.push(`z ${z.toFixed(DECIMALS_SHOWN)}`);
    if (w !== undefined) parts.push(`w ${w.toFixed(DECIMALS_SHOWN)}`);
    this.#words.value = parts.join("  ");
    this.#pad.setAttribute("aria-valuetext", parts.join(", "));
  }
}
