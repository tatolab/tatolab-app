import type { ControlledPin, InputControlElementClass, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import FloatNumber from "../node_ui/float_number.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

const NO_STUDIO_CALLS: NodeUiElementHost = { inputControlFor: () => Promise.reject(new Error("no Studio in this test")) };
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

  it("puts typed words back on Escape, and fires nothing for words that are no number", () => {
    const control = mountedFloatNumber(0.25);
    const fired = eventsFiredBy(control);
    const words = wordsOf(control);
    words.focus();
    words.value = "7";
    words.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    words.focus();
    words.value = "loud";
    words.blur();
    expect(fired).toEqual([]);
    expect(words.value).toBe("0.25");
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
