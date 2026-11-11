// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioViewFrame, StudioViewToolbarTools } from "./studio_area_frame";

afterEach(cleanup);

describe("a view's frame", () => {
  it("draws the header row, then the toolbar row, then the view, the row there even with no tools", () => {
    render(
      <StudioViewFrame headerRow={{ leading_inset_px: 120, height_px: 30 }} toolbarLabel="Outliner tools">
        <p>the view</p>
      </StudioViewFrame>,
    );
    const toolbarRow = screen.getByRole("toolbar", { name: "Outliner tools" });
    expect(toolbarRow.getAttribute("data-toolbar-look")).toBe("view_ribbon");
    expect(toolbarRow.children).toHaveLength(0);
    expect(toolbarRow.previousElementSibling?.getAttribute("style")).toContain("padding-left: 120px");
    expect(toolbarRow.compareDocumentPosition(screen.getByText("the view")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("takes tools from deep in the view into its toolbar row, after the frame's own", () => {
    render(
      <StudioViewFrame headerRow={null} toolbarLabel="Stream graph tools" toolbarTools={<button type="button">Frame's own</button>}>
        <div>
          <StudioViewToolbarTools label="Graph tools">
            <button type="button">Zoom in</button>
          </StudioViewToolbarTools>
          <p>the canvas</p>
        </div>
      </StudioViewFrame>,
    );
    const toolbarRow = screen.getByRole("toolbar", { name: "Stream graph tools" });
    expect([...toolbarRow.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Frame's own", "Zoom in"]);
    expect(screen.queryByRole("toolbar", { name: "Graph tools" })).toBeNull();
  });

  it("outside a view's frame, draws the tools in a toolbar row of their own", () => {
    render(
      <StudioViewToolbarTools label="Graph tools">
        <button type="button">Zoom in</button>
      </StudioViewToolbarTools>,
    );
    expect(screen.getByRole("toolbar", { name: "Graph tools" }).textContent).toBe("Zoom in");
  });
});
