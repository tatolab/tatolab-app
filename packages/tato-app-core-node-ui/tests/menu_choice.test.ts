import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import MenuChoice from "../node_ui/menu_choice.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-menu_choice-test", MenuChoice);

function mountedMenuChoice(value: string, state: InputControlState = "editable"): MenuChoice {
  const control = new MenuChoice();
  const pin: ControlledPin<"menu"> = {
    declaration: { input_name: "weight", label: "weight", pin_type: { type: "menu", option_names: ["light", "regular", "bold"] }, annotations: {}, may_be_unset: false },
    surface: "properties",
    studio: NO_STUDIO_CALLS,
  };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** The menu's option named `words`, once the menu is open. */
async function optionNamed(words: string): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const option = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((item) => item.textContent === words);
    if (option === undefined) throw new Error(`the menu offers no ${words}`);
    return option;
  });
}

/** Opens the menu the control draws, as a click on it does. */
async function openedMenuOf(control: MenuChoice): Promise<void> {
  const trigger = await vi.waitFor(() => {
    const button = control.querySelector<HTMLButtonElement>("button[aria-label=weight]");
    if (button === null) throw new Error("the control draws no menu yet");
    return button;
  });
  trigger.click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Menu choice", () => {
  it("is the class the Studio defines for a Menu input", () => {
    expectTypeOf(MenuChoice).toExtend<InputControlElementClass<"menu">>();
  });

  it("shows the option held, named by the input's label, and offers no choice while read only", async () => {
    const control = mountedMenuChoice("regular", "read_only");
    const field = await vi.waitFor(() => {
      const input = control.querySelector<HTMLInputElement>("input[aria-label=weight]");
      if (input === null) throw new Error("the control draws no field yet");
      return input;
    });
    expect(field.value).toBe("regular");
    expect(field.readOnly).toBe(true);
    expect(control.querySelector("button")).toBeNull();
  });

  it("fires one change carrying the option chosen, spelled as declared, and none for the option held", async () => {
    const control = mountedMenuChoice("regular");
    const fired = eventsFiredBy(control);
    await openedMenuOf(control);
    (await optionNamed("regular")).click();
    expect(fired).toEqual([]);
    await openedMenuOf(control);
    (await optionNamed("bold")).click();
    expect(fired).toEqual([{ name: "change", value: "bold" }]);
  });
});
