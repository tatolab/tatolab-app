import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import FloatNumber from "../node_ui/float_number.ts";
import { NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-float_number-test", FloatNumber);

/** A Float input's control as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedFloatNumber(value: number, annotations: PinAnnotations = {}, state: "editable" | "read_only" = "editable"): FloatNumber {
  const control = new FloatNumber();
  const pin: ControlledPin<"float"> = { declaration: { input_name: "gain", label: "Gain", pin_type: { type: "float" }, annotations, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** Each `input` and `change` `control` fires, with the value its detail carries. */
function eventsFiredBy(control: FloatNumber): { name: string; value: unknown }[] {
  const fired: { name: string; value: unknown }[] = [];
  for (const name of ["input", "change"]) {
    control.addEventListener(name, (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail === "object" && detail !== null && "value" in detail) fired.push({ name, value: detail.value });
    });
  }
  return fired;
}

function fieldOf(control: FloatNumber): HTMLElement {
  const field = control.shadowRoot?.querySelector<HTMLElement>(".field");
  if (field === null || field === undefined) throw new Error("the control draws no field");
  return field;
}

function wordsOf(control: FloatNumber): HTMLInputElement {
  const words = control.shadowRoot?.querySelector("input");
  if (words === null || words === undefined) throw new Error("the control draws no input");
  return words;
}

function pointer(field: HTMLElement, type: string, clientX: number, shiftKey = false): void {
  field.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX, shiftKey, bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Float number control", () => {
  it("is the class the Studio defines for a Float input", () => {
    expectTypeOf(FloatNumber).toExtend<InputControlElementClass<"float">>();
  });

  it("draws in a shadow root that adopts the SDK's control stylesheet", () => {
    const control = mountedFloatNumber(0.5);
    expect(control.shadowRoot?.adoptedStyleSheets).toHaveLength(1);
    expect(wordsOf(control).value).toBe("0.5");
    expect(wordsOf(control).getAttribute("aria-label")).toBe("Gain");
  });

  it("fires input at each move of a drag and change once on release", () => {
    const control = mountedFloatNumber(1, { step: 0.1 });
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 100);
    pointer(field, "pointermove", 101);
    pointer(field, "pointermove", 104);
    pointer(field, "pointermove", 110);
    pointer(field, "pointerup", 110);
    expect(fired).toEqual([
      { name: "input", value: 1.4 },
      { name: "input", value: 2 },
      { name: "change", value: 2 },
    ]);
    expect(wordsOf(control).value).toBe("2.0");
  });

  it("holds a drag inside the input's range", () => {
    const control = mountedFloatNumber(0.9, { range: { minimum: 0, maximum: 1 } });
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 0);
    pointer(field, "pointermove", 400);
    pointer(field, "pointerup", 400);
    expect(fired).toEqual([
      { name: "input", value: 1 },
      { name: "change", value: 1 },
    ]);
  });

  it("fires nothing for a press released in place, and gives the field to typed words, which Enter commits as one change", () => {
    const control = mountedFloatNumber(0.25);
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 50);
    pointer(field, "pointerup", 50);
    expect(fired).toEqual([]);
    const words = wordsOf(control);
    expect(control.shadowRoot?.activeElement).toBe(words);
    words.value = "3.5";
    words.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(fired).toEqual([{ name: "change", value: 3.5 }]);
  });

  it("puts typed words back on Escape and gives up the field, firing nothing", () => {
    const control = mountedFloatNumber(0.25);
    const fired = eventsFiredBy(control);
    const words = wordsOf(control);
    words.focus();
    words.value = "7";
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true });
    words.dispatchEvent(escape);
    expect(fired).toEqual([]);
    expect(words.value).toBe("0.25");
    expect(control.shadowRoot?.activeElement).not.toBe(words);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("fires nothing for typed words that are no number, and shows the value again", () => {
    const control = mountedFloatNumber(0.25);
    const fired = eventsFiredBy(control);
    const words = wordsOf(control);
    words.focus();
    words.value = "loud";
    words.blur();
    expect(fired).toEqual([]);
    expect(words.value).toBe("0.25");
  });

  it("puts a typed number on the input's step, then inside its range, as a drag does", () => {
    const control = mountedFloatNumber(0.5, { step: 0.25, range: { minimum: 0, maximum: 2 } });
    const fired = eventsFiredBy(control);
    const words = wordsOf(control);
    words.focus();
    words.value = "1.3";
    words.blur();
    words.focus();
    words.value = "9";
    words.blur();
    expect(fired).toEqual([
      { name: "change", value: 1.25 },
      { name: "change", value: 2 },
    ]);
    expect(words.value).toBe("2.00");
  });

  it("never overwrites words being typed with a value or a pin the host sets", () => {
    const control = mountedFloatNumber(0.25);
    const words = wordsOf(control);
    words.focus();
    words.value = "4.5";
    control.value = 0.75;
    control.pin = { declaration: { input_name: "gain", label: "Gain", pin_type: { type: "float" }, annotations: {}, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
    expect(words.value).toBe("4.5");
  });

  it("moves one step for each arrow key, a finer one with Shift, inside the range, each as one change", () => {
    const control = mountedFloatNumber(0.5, { range: { minimum: 0, maximum: 1 } });
    const fired = eventsFiredBy(control);
    const words = wordsOf(control);
    const arrow = (key: string, shiftKey = false) => {
      const keyEvent = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true, composed: true });
      words.dispatchEvent(keyEvent);
      return keyEvent;
    };
    let heardByTheHolder = 0;
    control.addEventListener("keydown", () => (heardByTheHolder += 1));
    expect(arrow("ArrowUp").defaultPrevented).toBe(true);
    arrow("ArrowDown", true);
    for (let press = 0; press < 30; press += 1) arrow("ArrowUp");
    expect(fired.slice(0, 2)).toEqual([
      { name: "change", value: 0.55 },
      { name: "change", value: 0.545 },
    ]);
    expect(fired.at(-1)).toEqual({ name: "change", value: 1 });
    expect(fired.every((event) => event.name === "change")).toBe(true);
    expect(heardByTheHolder).toBe(0);
  });

  it("puts the number back when it is made read only mid-drag, with no change, and lets the drag go", () => {
    const control = mountedFloatNumber(1, { step: 0.1 });
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 100);
    pointer(field, "pointermove", 110);
    control.state = "read_only";
    pointer(field, "pointermove", 120);
    pointer(field, "pointerup", 120);
    expect(fired).toEqual([
      { name: "input", value: 2 },
      { name: "input", value: 1 },
    ]);
    expect(field.hasAttribute("data-dragging")).toBe(false);
    expect(wordsOf(control).value).toBe("1.0");
  });

  it("puts the number back when it is taken off the page mid-drag, with no change", () => {
    const control = mountedFloatNumber(1, { step: 0.1 });
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 100);
    pointer(field, "pointermove", 105);
    control.remove();
    pointer(field, "pointerup", 105);
    expect(fired).toEqual([
      { name: "input", value: 1.5 },
      { name: "input", value: 1 },
    ]);
    expect(field.hasAttribute("data-dragging")).toBe(false);
  });

  it("changes nothing while it is read only", () => {
    const control = mountedFloatNumber(0.25, {}, "read_only");
    const fired = eventsFiredBy(control);
    const field = fieldOf(control);
    pointer(field, "pointerdown", 0);
    pointer(field, "pointermove", 50);
    pointer(field, "pointerup", 50);
    const words = wordsOf(control);
    words.focus();
    words.value = "9";
    words.blur();
    expect(fired).toEqual([]);
    expect(words.readOnly).toBe(true);
  });
});
