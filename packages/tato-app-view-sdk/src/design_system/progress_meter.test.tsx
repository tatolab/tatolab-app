// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressMeter } from "./progress_meter";

afterEach(cleanup);

describe("ProgressMeter", () => {
  it("shows a bar at its percent while under way, and a sweep with no percent when the share is unknown", () => {
    render(<ProgressMeter label="Tato Studio 0.68.69" detail="Downloading · 42%" percent={41.6} outcome="in_progress" />);
    expect(screen.getByRole("progressbar", { name: "Tato Studio 0.68.69" }).getAttribute("aria-valuenow")).toBe("41.6");
    expect(screen.getByText("42%")).toBeTruthy();
    cleanup();
    render(<ProgressMeter label="Night Show's Python packages" detail="Downloading and installing…" percent={null} outcome="in_progress" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("drops the bar once ended, saying how in its detail, a failure in the refusal's own words", () => {
    render(<ProgressMeter label="Night Show's Python packages" detail="error: Failed to fetch" percent={null} outcome="failed" data-meter-under-test="" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("error: Failed to fetch").className).toContain("text-danger-text");
    expect(document.querySelector("[data-meter-under-test]")?.getAttribute("data-progress-meter-outcome")).toBe("failed");
  });
});
