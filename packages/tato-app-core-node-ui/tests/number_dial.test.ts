import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import FloatDial from "../node_ui/float_dial.ts";
import IntegerDial from "../node_ui/integer_dial.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-float_dial-test", FloatDial);
customElements.define("tato-studio-integer_dial-test", IntegerDial);

/** A Float input's dial as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedFloatDial(value: number, annotations: PinAnnotations, state: InputControlState = "editable"): FloatDial {
  const control = new FloatDial();
  const pin: ControlledPin<"float"> = { declaration: { input_name: "gain", label: "Gain", pin_type: { type: "float" }, annotations: { ...annotations, control: "dial" }, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** An Integer input's dial as the host mounts one. */
function mountedIntegerDial(value: number, annotations: PinAnnotations): IntegerDial {
  const control = new IntegerDial();
  const pin: ControlledPin<"integer"> = { declaration: { input_name: "voices", label: "Voices", pin_type: { type: "integer" }, annotations: { ...annotations, control: "dial" }, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

/** A pointer event of `type` at the height `clientY`, from the one pointer these tests drag with. */
function pointerAt(type: string, clientY: number): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientY, bubbles: true });
}

function keyPressed(knob: HTMLElement, key: string): void {
  knob.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the number dials", () => {
  it("are the classes the Studio registers as the dial of a Float and an Integer input", () => {
    expectTypeOf(FloatDial).toExtend<InputControlElementClass<"float">>();
    expectTypeOf(IntegerDial).toExtend<InputControlElementClass<"integer">>();
  });

  it("draw a knob named by the input's label over its range, with the number and its unit beside it", () => {
    const control = mountedFloatDial(0.5, { range: { minimum: 0, maximum: 2 }, step: 0.1, unit: "dB" });
    const knob = partOf(control, ".dial-knob");
    expect(knob.getAttribute("role")).toBe("slider");
    expect(knob.getAttribute("aria-label")).toBe("Gain");
    expect([knob.getAttribute("aria-valuemin"), knob.getAttribute("aria-valuemax"), knob.getAttribute("aria-valuenow")]).toEqual(["0", "2", "0.5"]);
    expect(partOf<HTMLOutputElement>(control, ".slider-words").value).toBe("0.5 dB");
    expect(knob.style.getPropertyValue("--dial-turn")).toBe("-67.5deg");
  });

  it("turn up as a drag rises, firing input at each move and change once on release", () => {
    const control = mountedFloatDial(0, { range: { minimum: 0, maximum: 1.6 }, step: 0.1 });
    const fired = eventsFiredBy(control);
    const knob = partOf(control, ".dial-knob");
    knob.dispatchEvent(pointerAt("pointerdown", 100));
    knob.dispatchEvent(pointerAt("pointermove", 90));
    knob.dispatchEvent(pointerAt("pointermove", 60));
    knob.dispatchEvent(pointerAt("pointerup", 60));
    expect(fired).toEqual([
      { name: "input", value: 0.1 },
      { name: "input", value: 0.4 },
      { name: "change", value: 0.4 },
    ]);
  });

  it("hold a drag to the range's ends", () => {
    const control = mountedFloatDial(0.5, { range: { minimum: 0, maximum: 1 } });
    const fired = eventsFiredBy(control);
    const knob = partOf(control, ".dial-knob");
    knob.dispatchEvent(pointerAt("pointerdown", 100));
    knob.dispatchEvent(pointerAt("pointermove", -500));
    knob.dispatchEvent(pointerAt("pointerup", -500));
    expect(fired).toEqual([
      { name: "input", value: 1 },
      { name: "change", value: 1 },
    ]);
  });

  it("put the number back as input and no change when the host takes a drag away", () => {
    const control = mountedFloatDial(0.2, { range: { minimum: 0, maximum: 1.6 }, step: 0.1 });
    const fired = eventsFiredBy(control);
    const knob = partOf(control, ".dial-knob");
    knob.dispatchEvent(pointerAt("pointerdown", 100));
    knob.dispatchEvent(pointerAt("pointermove", 50));
    control.state = "read_only";
    expect(fired).toEqual([
      { name: "input", value: 0.7 },
      { name: "input", value: 0.2 },
    ]);
  });

  it("turn one whole step at an arrow key, and to an end at Home and End, each as input then change", () => {
    const control = mountedIntegerDial(3, { range: { minimum: 1, maximum: 8 } });
    const fired = eventsFiredBy(control);
    const knob = partOf(control, ".dial-knob");
    keyPressed(knob, "ArrowUp");
    keyPressed(knob, "End");
    keyPressed(knob, "ArrowRight");
    keyPressed(knob, "Home");
    expect(fired).toEqual([
      { name: "input", value: 4 },
      { name: "change", value: 4 },
      { name: "input", value: 8 },
      { name: "change", value: 8 },
      { name: "input", value: 1 },
      { name: "change", value: 1 },
    ]);
  });

  it("take no drag and no key while the input is not editable", () => {
    const control = mountedFloatDial(0.5, { range: { minimum: 0, maximum: 1 } }, "driven_by_wire");
    const fired = eventsFiredBy(control);
    const knob = partOf(control, ".dial-knob");
    expect(knob.getAttribute("aria-disabled")).toBe("true");
    knob.dispatchEvent(pointerAt("pointerdown", 100));
    knob.dispatchEvent(pointerAt("pointermove", 0));
    keyPressed(knob, "ArrowUp");
    expect(fired).toEqual([]);
  });
});
