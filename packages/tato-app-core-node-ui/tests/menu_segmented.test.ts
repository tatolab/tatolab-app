import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import MenuSegmented from "../node_ui/menu_segmented.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-menu_segmented-test", MenuSegmented);

function mountedSegments(value: string, state: InputControlState = "editable"): MenuSegmented {
  const control = new MenuSegmented();
  const pin: ControlledPin<"menu"> = {
    declaration: { input_name: "blend", label: "Blend", pin_type: { type: "menu", option_names: ["over", "add", "multiply"] }, annotations: { control: "segmented" }, may_be_unset: false },
    surface: "properties",
    studio: NO_STUDIO_CALLS,
  };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** The segments the control draws, once React has drawn them. */
async function segmentsOf(control: MenuSegmented): Promise<HTMLButtonElement[]> {
  return vi.waitFor(() => {
    const segments = [...control.querySelectorAll<HTMLButtonElement>("[role=group] button")];
    if (segments.length === 0) throw new Error("the control draws no segments yet");
    return segments;
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Menu segments", () => {
  it("is the class the Studio registers as the segmented control of a Menu input", () => {
    expectTypeOf(MenuSegmented).toExtend<InputControlElementClass<"menu">>();
  });

  it("draws a segment for each option, in the declared order, the one held pressed, the group named by the input's label", async () => {
    const control = mountedSegments("add");
    const segments = await segmentsOf(control);
    expect(segments.map((segment) => segment.textContent)).toEqual(["over", "add", "multiply"]);
    expect(segments.map((segment) => segment.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(control.querySelector("[role=group]")?.getAttribute("aria-label")).toBe("Blend");
  });

  it("says it takes its own width, so on a node the card grows to hold every segment's words", async () => {
    const control = mountedSegments("add");
    await segmentsOf(control);
    expect(control.hasAttribute("data-takes-its-own-width")).toBe(true);
  });

  it("fires one change carrying the option pressed, and none for the option held", async () => {
    const control = mountedSegments("over");
    const fired = eventsFiredBy(control);
    const segments = await segmentsOf(control);
    segments[0]?.click();
    expect(fired).toEqual([]);
    segments[2]?.click();
    expect(fired).toEqual([{ name: "change", value: "multiply" }]);
  });

  it("fires nothing while the input is not editable, each segment marked as not chosen here", async () => {
    const control = mountedSegments("over", "driven_by_wire");
    const fired = eventsFiredBy(control);
    const segments = await segmentsOf(control);
    expect(segments.every((segment) => segment.getAttribute("aria-disabled") === "true")).toBe(true);
    segments[1]?.click();
    expect(fired).toEqual([]);
  });
});
