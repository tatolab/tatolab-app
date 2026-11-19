import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import TextLine from "../node_ui/text_line.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-text_line-test", TextLine);

/** A String input's control as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedTextLine(value: string, state: "editable" | "read_only" = "editable"): TextLine {
  const control = new TextLine();
  const pin: ControlledPin<"string"> = { declaration: { input_name: "words", label: "words", pin_type: { type: "string" }, annotations: {}, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** Types `typed` at the end of the field's words, one native `input` for each character, as a person does. */
function typedInto(field: HTMLInputElement, typed: string): void {
  for (const character of typed) {
    field.value += character;
    field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the String text line", () => {
  it("is the class the Studio defines for a String input", () => {
    expectTypeOf(TextLine).toExtend<InputControlElementClass<"string">>();
  });

  it("shows the words the host sets, named by the input's label", () => {
    const field = partOf<HTMLInputElement>(mountedTextLine("Live"), "input");
    expect(field.value).toBe("Live");
    expect(field.getAttribute("aria-label")).toBe("words");
  });

  it("fires each keystroke as input and the words the field's change leaves as one change", () => {
    const control = mountedTextLine("Live");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLInputElement>(control, "input");
    field.focus();
    typedInto(field, " on");
    field.dispatchEvent(new Event("change"));
    expect(fired).toEqual([
      { name: "input", value: "Live " },
      { name: "input", value: "Live o" },
      { name: "input", value: "Live on" },
      { name: "change", value: "Live on" },
    ]);
  });

  it("puts back the words it was focused on at Escape, firing no change, and takes the empty string as words", () => {
    const control = mountedTextLine("Live");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLInputElement>(control, "input");
    field.focus();
    typedInto(field, "!");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(field.value).toBe("Live");
    expect(fired.filter(({ name }) => name === "change")).toEqual([]);
    field.focus();
    field.value = "";
    field.dispatchEvent(new Event("change"));
    expect(fired.at(-1)).toEqual({ name: "change", value: "" });
  });

  it("leaves words being typed as they are when the host sets a value, and shows it once the field is left", () => {
    const control = mountedTextLine("Live");
    const field = partOf<HTMLInputElement>(control, "input");
    field.focus();
    typedInto(field, "!");
    control.value = "Elsewhere";
    expect(field.value).toBe("Live!");
    field.blur();
    expect(field.value).toBe("Elsewhere");
  });

  it("puts the words back as the input stops being editable, and commits nothing while read only", () => {
    const control = mountedTextLine("Live");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLInputElement>(control, "input");
    field.focus();
    typedInto(field, "!");
    control.state = "read_only";
    expect(field.value).toBe("Live");
    expect(field.readOnly).toBe(true);
    field.dispatchEvent(new Event("change"));
    expect(fired.filter(({ name }) => name === "change")).toEqual([]);
  });
});
