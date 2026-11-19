import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import TriggerButton from "../node_ui/trigger_button.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-trigger_button-test", TriggerButton);

function mountedTriggerButton(state: "editable" | "read_only" | "driven_by_wire" = "editable"): TriggerButton {
  const control = new TriggerButton();
  const pin: ControlledPin<"trigger"> = { declaration: { input_name: "flash", label: "flash", pin_type: { type: "trigger" }, annotations: {}, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = null;
  document.body.append(control);
  return control;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Trigger button", () => {
  it("is the class the Studio defines for a Trigger input", () => {
    expectTypeOf(TriggerButton).toExtend<InputControlElementClass<"trigger">>();
  });

  it("fires one change carrying no value for each press, and no input", () => {
    const control = mountedTriggerButton();
    const fired = eventsFiredBy(control);
    const button = partOf<HTMLButtonElement>(control, ".trigger");
    expect(button.getAttribute("aria-label")).toBe("Fire flash");
    button.click();
    button.click();
    expect(fired).toEqual([
      { name: "change", value: null },
      { name: "change", value: null },
    ]);
  });

  it("takes no press while the input is not editable", () => {
    for (const state of ["read_only", "driven_by_wire"] as const) {
      const control = mountedTriggerButton(state);
      const fired = eventsFiredBy(control);
      const button = partOf<HTMLButtonElement>(control, ".trigger");
      expect(button.disabled, state).toBe(true);
      button.click();
      expect(fired, state).toEqual([]);
    }
  });
});
