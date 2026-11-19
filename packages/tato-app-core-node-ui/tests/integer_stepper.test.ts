import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import IntegerStepper from "../node_ui/integer_stepper.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-integer_stepper-test", IntegerStepper);

/** An Integer input's control as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedStepper(value: number, annotations: PinAnnotations = {}, state: "editable" | "read_only" = "editable"): IntegerStepper {
  const control = new IntegerStepper();
  const pin: ControlledPin<"integer"> = { declaration: { input_name: "beats_per_bar", label: "Beats per bar", pin_type: { type: "integer" }, annotations, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

function stepButtonsOf(control: IntegerStepper): { less: HTMLButtonElement; more: HTMLButtonElement } {
  return { less: partOf<HTMLButtonElement>(control, ".step[aria-label='One step less']"), more: partOf<HTMLButtonElement>(control, ".step[aria-label='One step more']") };
}

function pointer(field: HTMLElement, type: string, clientX: number): void {
  field.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX, bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Integer stepper", () => {
  it("is the class the Studio defines for an Integer input", () => {
    expectTypeOf(IntegerStepper).toExtend<InputControlElementClass<"integer">>();
  });

  it("draws its whole number between a − and a + button", () => {
    const control = mountedStepper(4);
    const stepper = partOf(control, ".stepper");
    expect([...stepper.children].map((child) => child.textContent === "" ? child.className : child.textContent)).toEqual(["−", "field", "+"]);
    expect(partOf<HTMLInputElement>(control, "input").value).toBe("4");
  });

  it("moves one step at each press of a button, each press one change", () => {
    const control = mountedStepper(4);
    const fired = eventsFiredBy(control);
    const { less, more } = stepButtonsOf(control);
    more.click();
    more.click();
    less.click();
    expect(fired).toEqual([
      { name: "change", value: 5 },
      { name: "change", value: 6 },
      { name: "change", value: 5 },
    ]);
  });

  it("moves by the input's step, rounded to a whole number, and holds inside its range, a press at its end changing nothing", () => {
    const control = mountedStepper(14, { step: 2.4, range: { minimum: 1, maximum: 16 } });
    const fired = eventsFiredBy(control);
    const { more } = stepButtonsOf(control);
    more.click();
    more.click();
    expect(fired).toEqual([{ name: "change", value: 16 }]);
  });

  it("settles a drag on whole numbers", () => {
    const control = mountedStepper(4);
    const fired = eventsFiredBy(control);
    const field = partOf(control, ".field");
    pointer(field, "pointerdown", 100);
    pointer(field, "pointermove", 103);
    pointer(field, "pointerup", 103);
    expect(fired.every(({ value }) => Number.isInteger(value))).toBe(true);
    expect(fired.at(-1)?.name).toBe("change");
  });

  it("takes no press while the input is read only", () => {
    const control = mountedStepper(4, {}, "read_only");
    const fired = eventsFiredBy(control);
    const { less, more } = stepButtonsOf(control);
    expect(less.disabled && more.disabled).toBe(true);
    more.click();
    expect(fired).toEqual([]);
  });
});
