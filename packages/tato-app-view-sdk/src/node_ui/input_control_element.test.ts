import { expect, expectTypeOf, test } from "vitest";
import type { ColorPinValue } from "../pin_types.js";
import { fireInputControlEvent, valueTheInputControlEventCarries, type ControlledPin, type InputControlElement, type InputControlState, type StoredPinValue } from "./input_control_element.js";

class FloatControlWithSettersAlone extends HTMLElement implements InputControlElement<"float"> {
  shownValue = 0;
  set pin(_pin: ControlledPin<"float">) {}
  set value(value: number) {
    this.shownValue = value;
  }
  set state(_state: InputControlState) {}
}
customElements.define("float-control-with-setters-alone", FloatControlWithSettersAlone);

test("an input stores its type's generated value, and a type only a wire carries stores none", () => {
  expectTypeOf<StoredPinValue<"float">>().toEqualTypeOf<number>();
  expectTypeOf<StoredPinValue<"color">>().toEqualTypeOf<ColorPinValue>();
  expectTypeOf<StoredPinValue<"texture">>().toEqualTypeOf<null>();
  expectTypeOf<StoredPinValue<"acme:Spectrum">>().toEqualTypeOf<null>();
});

test("a control fires input and change carrying its value, and the host reads the value back from each", () => {
  const control = new FloatControlWithSettersAlone();
  const heard: unknown[] = [];
  for (const eventName of ["input", "change"]) control.addEventListener(eventName, (event) => heard.push([event.type, valueTheInputControlEventCarries(event)]));
  fireInputControlEvent(control, "input", 0.25);
  fireInputControlEvent(control, "change", 0.5);
  expect(heard).toEqual([
    ["input", { value: 0.25 }],
    ["change", { value: 0.5 }],
  ]);
});

test("the host acts on no native input or change from a field inside the control, nor on another event", () => {
  const control = new FloatControlWithSettersAlone();
  const innerField = document.createElement("input");
  control.attachShadow({ mode: "open" }).append(innerField);
  const heard: unknown[] = [];
  for (const eventName of ["input", "change", "cancel"]) control.addEventListener(eventName, (event) => heard.push(valueTheInputControlEventCarries(event)));
  innerField.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  innerField.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  control.dispatchEvent(new CustomEvent("change", { detail: "0.5" }));
  control.dispatchEvent(new CustomEvent("cancel", { detail: { value: 1 } }));
  expect(heard).toEqual([null, null, null, null]);
});

test("a control's events do not bubble, so one that holds another never passes the inner value off as its own", () => {
  const outer = new FloatControlWithSettersAlone();
  const inner = new FloatControlWithSettersAlone();
  outer.append(inner);
  const heardOnTheOuter: unknown[] = [];
  outer.addEventListener("change", (event) => heardOnTheOuter.push(valueTheInputControlEventCarries(event)));
  fireInputControlEvent(inner, "change", 0.75);
  expect(heardOnTheOuter).toEqual([]);
});
