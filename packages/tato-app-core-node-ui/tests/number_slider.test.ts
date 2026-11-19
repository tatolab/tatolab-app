import type { ControlledPin, InputControlElementClass } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinAnnotations } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import FloatSlider from "../node_ui/float_slider.ts";
import IntegerSlider from "../node_ui/integer_slider.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-float_slider-test", FloatSlider);
customElements.define("tato-studio-integer_slider-test", IntegerSlider);

/** A Float input's slider as the host mounts one: `pin`, then `state` and `value`, then connected. */
function mountedFloatSlider(value: number, annotations: PinAnnotations, state: "editable" | "read_only" = "editable"): FloatSlider {
  const control = new FloatSlider();
  const pin: ControlledPin<"float"> = { declaration: { input_name: "base", label: "Base", pin_type: { type: "float" }, annotations, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** An Integer input's slider as the host mounts one. */
function mountedIntegerSlider(value: number, annotations: PinAnnotations): IntegerSlider {
  const control = new IntegerSlider();
  const pin: ControlledPin<"integer"> = { declaration: { input_name: "beats_per_bar", label: "Beats per bar", pin_type: { type: "integer" }, annotations, may_be_unset: false }, surface: "node", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = "editable";
  control.value = value;
  document.body.append(control);
  return control;
}

/** Moves `track` to `value` as a person's drag does: an `input` at each move. */
function moved(track: HTMLInputElement, value: number): void {
  track.value = String(value);
  track.dispatchEvent(new Event("input", { bubbles: true }));
}

function released(track: HTMLInputElement): void {
  track.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the ranged number sliders", () => {
  it("are the classes the Studio registers as the slider of a Float and an Integer input", () => {
    expectTypeOf(FloatSlider).toExtend<InputControlElementClass<"float">>();
    expectTypeOf(IntegerSlider).toExtend<InputControlElementClass<"integer">>();
  });

  it("span the input's range on its step, with the number and its unit beside the track", () => {
    const control = mountedFloatSlider(0.1, { range: { minimum: 0, maximum: 1 }, step: 0.01, unit: "Hz" });
    const track = partOf<HTMLInputElement>(control, "input[type=range]");
    expect([track.min, track.max, track.step]).toEqual(["0", "1", "0.01"]);
    expect(track.getAttribute("aria-label")).toBe("Base");
    expect(partOf<HTMLOutputElement>(control, ".slider-words").value).toBe("0.10 Hz");
  });

  it("fire input at each move of a drag and change once on release", () => {
    const control = mountedFloatSlider(0.1, { range: { minimum: 0, maximum: 1 }, step: 0.01 });
    const fired = eventsFiredBy(control);
    const track = partOf<HTMLInputElement>(control, "input[type=range]");
    moved(track, 0.25);
    moved(track, 0.5);
    released(track);
    expect(fired).toEqual([
      { name: "input", value: 0.25 },
      { name: "input", value: 0.5 },
      { name: "change", value: 0.5 },
    ]);
    expect(partOf<HTMLOutputElement>(control, ".slider-words").value).toBe("0.50");
  });

  it("put the number back as input and no change when the host takes a drag away", () => {
    const control = mountedFloatSlider(0.1, { range: { minimum: 0, maximum: 1 }, step: 0.01 });
    const fired = eventsFiredBy(control);
    const track = partOf<HTMLInputElement>(control, "input[type=range]");
    moved(track, 0.75);
    control.state = "read_only";
    released(track);
    expect(fired).toEqual([
      { name: "input", value: 0.75 },
      { name: "input", value: 0.1 },
    ]);
    expect(track.disabled).toBe(true);
  });

  it("hold an Integer's slider on whole numbers, a step of at least one", () => {
    const control = mountedIntegerSlider(4, { range: { minimum: 1, maximum: 16 }, step: 0.3 });
    const track = partOf<HTMLInputElement>(control, "input[type=range]");
    expect([track.min, track.max, track.step]).toEqual(["1", "16", "1"]);
    expect(partOf<HTMLOutputElement>(control, ".slider-words").value).toBe("4");
  });
});
