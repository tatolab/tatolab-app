import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations, VectorComponentCount, VectorPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import VectorXyPad from "../node_ui/vector_xy_pad.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-vector_xy_pad-test", VectorXyPad);

/** The pad's area as these tests lay it out: 100 pixels square at the page's corner. */
const PAD_AREA = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as const;

function mountedPad(value: VectorPinValue, { annotations = {}, componentCount = "two", state = "editable" }: { annotations?: PinAnnotations; componentCount?: VectorComponentCount; state?: InputControlState } = {}): VectorXyPad {
  const control = new VectorXyPad();
  const pin: ControlledPin<"vector"> = {
    declaration: { input_name: "centre", label: "Centre", pin_type: { type: "vector", component_count: componentCount }, annotations: { ...annotations, control: "xy_pad" }, may_be_unset: false },
    surface: "properties",
    studio: NO_STUDIO_CALLS,
  };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  vi.spyOn(partOf(control, ".xy-pad-area"), "getBoundingClientRect").mockReturnValue(PAD_AREA);
  return control;
}

function pointerAt(type: string, clientX: number, clientY: number): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientX, clientY, bubbles: true });
}

function keyPressed(area: HTMLElement, key: string): void {
  area.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Vector two-axis pad", () => {
  it("is the class the Studio registers as the xy_pad control of a Vector input", () => {
    expectTypeOf(VectorXyPad).toExtend<InputControlElementClass<"vector">>();
  });

  it("puts the point at x across and y up over the input's range, with the numbers under the pad", () => {
    const control = mountedPad({ x: 0.25, y: 0.75 }, { annotations: { range: { minimum: 0, maximum: 1 } } });
    const point = partOf(control, ".xy-pad-point");
    expect([point.style.left, point.style.bottom]).toEqual(["25%", "75%"]);
    expect(partOf<HTMLOutputElement>(control, ".xy-pad-words").value).toBe("x 0.25  y 0.75");
    expect(partOf(control, ".xy-pad-area").getAttribute("aria-label")).toBe("Centre: x across, y up");
  });

  it("spans −1 to 1 when the input states no range", () => {
    const control = mountedPad({ x: 0, y: -1 });
    const point = partOf(control, ".xy-pad-point");
    expect([point.style.left, point.style.bottom]).toEqual(["50%", "0%"]);
  });

  it("moves the point under a press and a drag, firing input at each move and change once on release", () => {
    const control = mountedPad({ x: 0, y: 0 }, { annotations: { range: { minimum: 0, maximum: 1 } } });
    const fired = eventsFiredBy(control);
    const area = partOf(control, ".xy-pad-area");
    area.dispatchEvent(pointerAt("pointerdown", 10, 75));
    area.dispatchEvent(pointerAt("pointermove", 50, 50));
    area.dispatchEvent(pointerAt("pointermove", 150, -20));
    area.dispatchEvent(pointerAt("pointerup", 150, -20));
    expect(fired).toEqual([
      { name: "input", value: { x: 0.1, y: 0.25 } },
      { name: "input", value: { x: 0.5, y: 0.5 } },
      { name: "input", value: { x: 1, y: 1 } },
      { name: "change", value: { x: 1, y: 1 } },
    ]);
  });

  it("keeps a Vector of four's z and w as held while it moves x and y", () => {
    const control = mountedPad({ x: 0, y: 0, z: 3, w: 4 }, { componentCount: "four" });
    const fired = eventsFiredBy(control);
    keyPressed(partOf(control, ".xy-pad-area"), "ArrowRight");
    expect(fired.at(-1)).toEqual({ name: "change", value: { x: 0.02, y: 0, z: 3, w: 4 } });
    expect(partOf<HTMLOutputElement>(control, ".xy-pad-words").value).toBe("x 0.02  y 0.00  z 3.00  w 4.00");
  });

  it("moves one step at an arrow key, as input then change", () => {
    const control = mountedPad({ x: 0, y: 0 }, { annotations: { range: { minimum: -10, maximum: 10 }, step: 1 } });
    const fired = eventsFiredBy(control);
    const area = partOf(control, ".xy-pad-area");
    keyPressed(area, "ArrowUp");
    keyPressed(area, "ArrowLeft");
    expect(fired).toEqual([
      { name: "input", value: { x: 0, y: 1 } },
      { name: "change", value: { x: 0, y: 1 } },
      { name: "input", value: { x: -1, y: 1 } },
      { name: "change", value: { x: -1, y: 1 } },
    ]);
  });

  it("puts the point back as input and no change when the host takes a drag away", () => {
    const control = mountedPad({ x: 0.2, y: 0.2 }, { annotations: { range: { minimum: 0, maximum: 1 } } });
    const fired = eventsFiredBy(control);
    const area = partOf(control, ".xy-pad-area");
    area.dispatchEvent(pointerAt("pointerdown", 80, 20));
    control.state = "driven_by_wire";
    expect(fired).toEqual([
      { name: "input", value: { x: 0.8, y: 0.8 } },
      { name: "input", value: { x: 0.2, y: 0.2 } },
    ]);
    area.dispatchEvent(pointerAt("pointerdown", 50, 50));
    keyPressed(area, "ArrowUp");
    expect(fired).toHaveLength(2);
  });
});
