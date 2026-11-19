import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import BooleanSwitch from "../node_ui/boolean_switch.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-boolean_switch-test", BooleanSwitch);

/** A Boolean input's control as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedSwitch(value: boolean, state: "editable" | "read_only" | "driven_by_wire" = "editable"): BooleanSwitch {
  const control = new BooleanSwitch();
  const pin: ControlledPin<"boolean"> = { declaration: { input_name: "accented", label: "Accented", pin_type: { type: "boolean" }, annotations: {}, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Boolean switch", () => {
  it("is the class the Studio defines for a Boolean input", () => {
    expectTypeOf(BooleanSwitch).toExtend<InputControlElementClass<"boolean">>();
  });

  it("draws a switch named by the input's label, on or off as the value the host sets", () => {
    const control = mountedSwitch(true);
    const switchButton = partOf<HTMLButtonElement>(control, ".switch");
    expect(control.shadowRoot?.adoptedStyleSheets).toHaveLength(1);
    expect(switchButton.getAttribute("role")).toBe("switch");
    expect(switchButton.getAttribute("aria-label")).toBe("Accented");
    expect(switchButton.getAttribute("aria-checked")).toBe("true");
    control.value = false;
    expect(switchButton.getAttribute("aria-checked")).toBe("false");
  });

  it("flips at each click, each flip one change and no input", () => {
    const control = mountedSwitch(false);
    const fired = eventsFiredBy(control);
    const switchButton = partOf<HTMLButtonElement>(control, ".switch");
    switchButton.click();
    switchButton.click();
    expect(fired).toEqual([
      { name: "change", value: true },
      { name: "change", value: false },
    ]);
    expect(switchButton.getAttribute("aria-checked")).toBe("false");
  });

  it("takes no click while the input is not editable", () => {
    for (const state of ["read_only", "driven_by_wire"] as const) {
      const control = mountedSwitch(true, state);
      const fired = eventsFiredBy(control);
      const switchButton = partOf<HTMLButtonElement>(control, ".switch");
      expect(switchButton.disabled, state).toBe(true);
      switchButton.click();
      expect(fired, state).toEqual([]);
    }
  });
});
