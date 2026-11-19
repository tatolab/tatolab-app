import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import type { ColorPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import ColorSwatch from "../node_ui/color_swatch.ts";
import { NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-color_swatch-test", ColorSwatch);

const ORANGE: ColorPinValue = { red: 1, green: 0.6, blue: 0.2, alpha: 1 };

/** A Color input's control as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedSwatch(value: ColorPinValue): ColorSwatch {
  const control = new ColorSwatch();
  const pin: ControlledPin<"color"> = { declaration: { input_name: "tint", label: "tint", pin_type: { type: "color" }, annotations: {}, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

/** Each `input`, `change` and `cancel` `control` fires, with the value `input` and `change` carry. */
function gestureEventsOf(control: HTMLElement): { name: string; value?: unknown }[] {
  const fired: { name: string; value?: unknown }[] = [];
  for (const name of ["input", "change", "cancel"]) {
    control.addEventListener(name, (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail !== "object" || detail === null) return;
      fired.push("value" in detail ? { name, value: detail.value } : { name });
    });
  }
  return fired;
}

/** Opens the picker from the swatch and waits for its hex field. */
async function pickerOpenedFrom(control: ColorSwatch): Promise<HTMLInputElement> {
  partOf<HTMLButtonElement>(control, ".swatch").click();
  return vi.waitFor(() => document.querySelector<HTMLInputElement>("[data-colour-swatch-picker] [data-colour-picker-hex]") ?? expect.unreachable("the picker is not open"));
}

/** Types `typed` into the open picker's hex field, as a person does, and lets the picker draw it before the next key. */
async function typedInThePicker(hexField: HTMLInputElement, typed: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(hexField, typed);
  hexField.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((drawn) => setTimeout(drawn, 0));
}

function pickerAction(action: "use" | "cancel"): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-colour-swatch-picker] [data-colour-picker-action="${action}"]`) ?? expect.unreachable(`no ${action}`);
}

async function pickerClosed(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector("[data-colour-swatch-picker] [data-colour-picker-hex]")).toBeNull());
}

/** Types `typed` into the row's own hex value and commits it with Enter. */
function typedInTheRow(control: ColorSwatch, typed: string): void {
  const words = partOf<HTMLInputElement>(control, ".field input");
  words.focus();
  words.value = typed;
  words.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Color swatch", () => {
  it("is the class the Studio defines for a Color input", () => {
    expectTypeOf(ColorSwatch).toExtend<InputControlElementClass<"color">>();
  });

  it("shows the colour as its hex value, its alpha pair only when alpha is not full, and a part outside 0 to 1 held to that span", () => {
    const control = mountedSwatch(ORANGE);
    const words = partOf<HTMLInputElement>(control, ".field input");
    expect(words.value).toBe("#ff9933");
    expect(partOf(control, ".swatch").style.getPropertyValue("--swatch-colour")).toBe("#ff9933");
    control.value = { red: 1.5, green: -0.2, blue: 0.2, alpha: 0.5 };
    expect(words.value).toBe("#ff003380");
  });

  it("fires input at each colour picked and change once on Use, all one gesture", async () => {
    const control = mountedSwatch(ORANGE);
    const fired = gestureEventsOf(control);
    const hexField = await pickerOpenedFrom(control);
    await typedInThePicker(hexField, "#000000");
    await typedInThePicker(hexField, "#ffffff80");
    pickerAction("use").click();
    await pickerClosed();
    const halfWhite = { red: 1, green: 1, blue: 1, alpha: 128 / 255 };
    expect(fired).toEqual([
      { name: "input", value: { red: 0, green: 0, blue: 0, alpha: 1 } },
      { name: "input", value: halfWhite },
      { name: "change", value: halfWhite },
    ]);
    expect(partOf<HTMLInputElement>(control, ".field input").value).toBe("#ffffff80");
  });

  it("fires cancel and shows the colour it opened on when the picker closes other than by Use after a pick", async () => {
    const control = mountedSwatch(ORANGE);
    const fired = gestureEventsOf(control);
    const hexField = await pickerOpenedFrom(control);
    await typedInThePicker(hexField, "#000000");
    pickerAction("cancel").click();
    await pickerClosed();
    expect(fired).toEqual([{ name: "input", value: { red: 0, green: 0, blue: 0, alpha: 1 } }, { name: "cancel" }]);
    expect(partOf<HTMLInputElement>(control, ".field input").value).toBe("#ff9933");
  });

  it("fires nothing for Use or Cancel with nothing picked", async () => {
    const control = mountedSwatch(ORANGE);
    const fired = gestureEventsOf(control);
    await pickerOpenedFrom(control);
    pickerAction("use").click();
    await pickerClosed();
    await pickerOpenedFrom(control);
    pickerAction("cancel").click();
    await pickerClosed();
    expect(fired).toEqual([]);
  });

  it("closes the picker, putting the colour back and firing nothing, when the input stops being editable", async () => {
    const control = mountedSwatch(ORANGE);
    const fired = gestureEventsOf(control);
    const hexField = await pickerOpenedFrom(control);
    await typedInThePicker(hexField, "#000000");
    control.state = "read_only";
    await pickerClosed();
    expect(fired).toEqual([{ name: "input", value: { red: 0, green: 0, blue: 0, alpha: 1 } }]);
    expect(partOf<HTMLButtonElement>(control, ".swatch").disabled).toBe(true);
    expect(partOf<HTMLInputElement>(control, ".field input").value).toBe("#ff9933");
  });

  it("commits a typed hex as a lone change: #rrggbb keeps the stored alpha, #rrggbbaa sets it, and other words are put back", () => {
    const control = mountedSwatch({ ...ORANGE, alpha: 0.5 });
    const fired = gestureEventsOf(control);
    typedInTheRow(control, "#000000");
    typedInTheRow(control, "#FFFFFFFF");
    typedInTheRow(control, "orange");
    expect(fired).toEqual([
      { name: "change", value: { red: 0, green: 0, blue: 0, alpha: 0.5 } },
      { name: "change", value: { red: 1, green: 1, blue: 1, alpha: 1 } },
    ]);
    expect(partOf<HTMLInputElement>(control, ".field input").value).toBe("#ffffff");
  });
});
