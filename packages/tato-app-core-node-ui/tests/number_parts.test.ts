import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations, VectorComponentCount } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import RectangleFields from "../node_ui/rectangle_fields.ts";
import TransformFields from "../node_ui/transform_fields.ts";
import VectorFields from "../node_ui/vector_fields.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-vector_fields-test", VectorFields);
customElements.define("tato-studio-rectangle_fields-test", RectangleFields);
customElements.define("tato-studio-transform_fields-test", TransformFields);

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mountedVector(componentCount: VectorComponentCount, value: { x: number; y: number; z?: number; w?: number }, annotations: PinAnnotations = {}): VectorFields {
  const control = new VectorFields();
  const pin: ControlledPin<"vector"> = { declaration: { input_name: "spot", label: "spot", pin_type: { type: "vector", component_count: componentCount }, annotations, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

function mountedRectangle(value: { x: number; y: number; width: number; height: number }): RectangleFields {
  const control = new RectangleFields();
  const pin: ControlledPin<"rectangle"> = { declaration: { input_name: "area", label: "area", pin_type: { type: "rectangle" }, annotations: {}, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

function mountedTransform(value: number[], state: "editable" | "read_only" = "editable"): TransformFields {
  const control = new TransformFields();
  const pin: ControlledPin<"transform"> = { declaration: { input_name: "move", label: "move", pin_type: { type: "transform" }, annotations: {}, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** Each number field the control draws, with the name shown beside it and how a screen reader names it. */
function fieldsOf(control: HTMLElement): { shown: string | null; spoken: string | null; words: string }[] {
  return [...(control.shadowRoot?.querySelectorAll(".number-part") ?? [])].map((part) => {
    const words = part.querySelector("input");
    return { shown: part.querySelector(".number-part-name")?.textContent ?? null, spoken: words?.getAttribute("aria-label") ?? null, words: words?.value ?? "" };
  });
}

/** Types `typed` into the field of part `index` and commits it with Enter. */
function typedInto(control: HTMLElement, index: number, typed: string): void {
  const words = control.shadowRoot?.querySelectorAll("input")[index] ?? expect.unreachable(`no field ${index}`);
  words.focus();
  words.value = typed;
  words.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Vector, Rectangle and Transform controls", () => {
  it("are the classes the Studio defines for each type's input", () => {
    expectTypeOf(VectorFields).toExtend<InputControlElementClass<"vector">>();
    expectTypeOf(RectangleFields).toExtend<InputControlElementClass<"rectangle">>();
    expectTypeOf(TransformFields).toExtend<InputControlElementClass<"transform">>();
  });

  it("draw a Vector's components as one labelled field each, as many as its size", () => {
    expect(fieldsOf(mountedVector("two", { x: 0.5, y: 0.25 }))).toEqual([
      { shown: "x", spoken: "spot x", words: "0.5" },
      { shown: "y", spoken: "spot y", words: "0.25" },
    ]);
    expect(fieldsOf(mountedVector("four", { x: 1, y: 2, z: 3, w: 4 })).map(({ shown, words }) => [shown, words])).toEqual([
      ["x", "1"],
      ["y", "2"],
      ["z", "3"],
      ["w", "4"],
    ]);
  });

  it("fire the whole Vector as a component changes", () => {
    const control = mountedVector("three", { x: 1, y: 2, z: 3 });
    const fired = eventsFiredBy(control);
    typedInto(control, 2, "7.5");
    expect(fired).toEqual([{ name: "change", value: { x: 1, y: 2, z: 7.5 } }]);
  });

  it("draw a Rectangle's edges and sizes, and hold a size at 0 or more", () => {
    const control = mountedRectangle({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(fieldsOf(control).map(({ shown, spoken }) => [shown, spoken])).toEqual([
      ["x", "area x"],
      ["y", "area y"],
      ["w", "area width"],
      ["h", "area height"],
    ]);
    const fired = eventsFiredBy(control);
    typedInto(control, 2, "-3");
    typedInto(control, 0, "-0.5");
    expect(fired).toEqual([
      { name: "change", value: { x: 0.25, y: 0.25, width: 0, height: 0.5 } },
      { name: "change", value: { x: -0.5, y: 0.25, width: 0, height: 0.5 } },
    ]);
  });

  it("draw a Transform as four rows of four fields, row by row, each named by its row and column", () => {
    const control = mountedTransform(IDENTITY);
    const fields = fieldsOf(control);
    expect(control.shadowRoot?.querySelector(".number-parts")?.getAttribute("data-layout")).toBe("rows_of_four");
    expect(fields).toHaveLength(16);
    expect(fields.map(({ words }) => words)).toEqual(IDENTITY.map(String));
    expect(fields[3]).toEqual({ shown: null, spoken: "move row 1, column 4", words: "0" });
    const fired = eventsFiredBy(control);
    typedInto(control, 3, "0.2");
    expect(fired).toEqual([{ name: "change", value: [1, 0, 0, 0.2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }]);
  });

  it("take no typed number while read only", () => {
    const control = mountedTransform(IDENTITY, "read_only");
    const fired = eventsFiredBy(control);
    typedInto(control, 0, "5");
    expect(fired).toEqual([]);
  });
});
