import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import BooleanCheckbox from "../node_ui/boolean_checkbox.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-boolean_checkbox-test", BooleanCheckbox);

/** A Boolean input's checkbox as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedCheckbox(value: boolean, state: InputControlState = "editable"): BooleanCheckbox {
  const control = new BooleanCheckbox();
  const pin: ControlledPin<"boolean"> = { declaration: { input_name: "mirrored", label: "Mirrored", pin_type: { type: "boolean" }, annotations: { control: "checkbox" }, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Boolean checkbox", () => {
  it("is the class the Studio registers as the checkbox of a Boolean input", () => {
    expectTypeOf(BooleanCheckbox).toExtend<InputControlElementClass<"boolean">>();
  });

  it("draws a checkbox named by the input's label, ticked as the value the host sets", () => {
    const control = mountedCheckbox(true);
    const box = partOf<HTMLInputElement>(control, "input[type=checkbox]");
    expect(box.getAttribute("aria-label")).toBe("Mirrored");
    expect(box.checked).toBe(true);
    control.value = false;
    expect(box.checked).toBe(false);
  });

  it("fires one change at each click and no input", () => {
    const control = mountedCheckbox(false);
    const fired = eventsFiredBy(control);
    const box = partOf<HTMLInputElement>(control, "input[type=checkbox]");
    box.click();
    box.click();
    expect(fired).toEqual([
      { name: "change", value: true },
      { name: "change", value: false },
    ]);
  });

  it("takes no click while the input is not editable", () => {
    for (const state of ["read_only", "driven_by_wire"] as const) {
      const control = mountedCheckbox(true, state);
      const box = partOf<HTMLInputElement>(control, "input[type=checkbox]");
      expect(box.disabled, state).toBe(true);
    }
  });
});
