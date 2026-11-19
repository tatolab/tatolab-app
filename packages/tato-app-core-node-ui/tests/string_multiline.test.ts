import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import StringMultiline from "../node_ui/string_multiline.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-string_multiline-test", StringMultiline);

/** A String input's multi-line field as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedMultiline(value: string): StringMultiline {
  const control = new StringMultiline();
  const pin: ControlledPin<"string"> = { declaration: { input_name: "caption", label: "Caption", pin_type: { type: "string" }, annotations: { control: "multiline" }, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

/** Types `words` into `field` as a keystroke does: the field holds them, then fires `input`. */
function typed(field: HTMLTextAreaElement, words: string): void {
  field.value = words;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function keyPressed(field: HTMLTextAreaElement, key: string, held: { metaKey?: boolean; ctrlKey?: boolean } = {}): void {
  field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...held }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the String multi-line field", () => {
  it("is the class the Studio registers as the multiline control of a String input", () => {
    expectTypeOf(StringMultiline).toExtend<InputControlElementClass<"string">>();
  });

  it("shows the words the host sets, named by the input's label, on as many lines as they hold up to eight", () => {
    const control = mountedMultiline("one\ntwo\nthree");
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    expect(field.getAttribute("aria-label")).toBe("Caption");
    expect(field.value).toBe("one\ntwo\nthree");
    expect(field.getAttribute("rows")).toBe("3");
    control.value = "short";
    expect(field.getAttribute("rows")).toBe("2");
    control.value = Array.from({ length: 12 }, (_, line) => `line ${line}`).join("\n");
    expect(field.getAttribute("rows")).toBe("8");
  });

  it("fires each keystroke as input and the words left by leaving the field as one change", () => {
    const control = mountedMultiline("hello");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    field.focus();
    typed(field, "hello\n");
    typed(field, "hello\nworld");
    field.blur();
    expect(fired).toEqual([
      { name: "input", value: "hello\n" },
      { name: "input", value: "hello\nworld" },
      { name: "change", value: "hello\nworld" },
    ]);
  });

  it("commits at ⌘Enter or Ctrl+Enter, and leaving with the words unchanged commits nothing", () => {
    const control = mountedMultiline("a");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    field.focus();
    field.blur();
    expect(fired).toEqual([]);
    field.focus();
    typed(field, "ab");
    keyPressed(field, "Enter", { ctrlKey: true });
    expect(fired.at(-1)).toEqual({ name: "change", value: "ab" });
  });

  it("puts back the words it was focused on at Escape, firing no change", () => {
    const control = mountedMultiline("kept");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    field.focus();
    typed(field, "dropped");
    keyPressed(field, "Escape");
    expect(field.value).toBe("kept");
    expect(fired).toEqual([{ name: "input", value: "dropped" }]);
  });

  it("leaves words being typed when the host sets a value, and shows it once the field is left with nothing typed", () => {
    const control = mountedMultiline("first");
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    field.focus();
    control.value = "from the host";
    expect(field.value).toBe("first");
    field.blur();
    expect(field.value).toBe("from the host");
  });

  it("puts the words back as the input stops being editable, and is read only after", () => {
    const control = mountedMultiline("kept");
    const fired = eventsFiredBy(control);
    const field = partOf<HTMLTextAreaElement>(control, "textarea");
    field.focus();
    typed(field, "dropped");
    control.state = "read_only";
    field.blur();
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe("kept");
    expect(fired).toEqual([{ name: "input", value: "dropped" }]);
  });
});
