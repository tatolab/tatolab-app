// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidePanel, WorkAreaWithSidePanel } from "./side_panel";

/** happy-dom lays nothing out; the panels measure their group, so every element measures as a 1000 × 600 window would. */
const MEASURED_WIDTH = 1000;
const MEASURED_HEIGHT = 600;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(MEASURED_WIDTH);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(MEASURED_HEIGHT);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ width: MEASURED_WIDTH, height: MEASURED_HEIGHT }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the side panel", () => {
  it("sits beside the work area behind a separator the keyboard resizes", async () => {
    render(
      <WorkAreaWithSidePanel
        sidePanel={
          <SidePanel label="Selected record" title="Line" hiding={null}>
            The record
          </SidePanel>
        }
      >
        The records
      </WorkAreaWithSidePanel>,
    );
    expect(screen.queryByRole("button", { name: "Hide details" }), "a panel a toggle elsewhere closes draws no Hide of its own").toBeNull();
    const resizer = screen.getByRole("separator", { name: "Resize the side panel" });
    const widthBefore = resizer.getAttribute("aria-valuenow");
    expect(widthBefore).not.toBeNull();

    act(() => resizer.focus());
    await act(async () => {
      fireEvent.keyDown(resizer, { key: "ArrowLeft" });
    });

    expect(screen.getByRole("complementary", { name: "Selected record" }).textContent).toContain("The record");
    expect(resizer.getAttribute("aria-valuenow")).not.toBe(widthBefore);
    const focusRingColours = resizer.className.split(/\s+/).filter((className) => /(^|:)focus-visible:ring-(?!\d|\[)/.test(className));
    expect(focusRingColours.sort()).toEqual(["dark:focus-visible:ring-ring", "focus-visible:ring-ring"]);
  });

  it("is hidden by its Hide button, and gone with the separator once hidden", () => {
    const onHidden = vi.fn();
    const { rerender } = render(
      <WorkAreaWithSidePanel
        sidePanel={
          <SidePanel label="Inspector" title="main" subtitle="Nothing selected" hiding={{ hideLabel: "Hide inspector", onHidden }}>
            Summary
          </SidePanel>
        }
      >
        The canvas
      </WorkAreaWithSidePanel>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide inspector" }));
    expect(onHidden).toHaveBeenCalledOnce();
    rerender(<WorkAreaWithSidePanel sidePanel={null}>The canvas</WorkAreaWithSidePanel>);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });
});
