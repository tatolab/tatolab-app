import { describe, expect, it } from "vitest";
import { clampLogDockHeight, defaultLogDockHeight } from "./log_dock_splitter";

describe("defaultLogDockHeight", () => {
  it("gives the dock 46% of the workspace, within 200 and 420 px", () => {
    expect(defaultLogDockHeight(528)).toBe(243);
    expect(defaultLogDockHeight(648)).toBe(298);
    expect(defaultLogDockHeight(848)).toBe(390);
    expect(defaultLogDockHeight(1400)).toBe(420);
    expect(defaultLogDockHeight(400)).toBe(200);
  });

  it("still leaves the canvas its 160 px in a short workspace", () => {
    expect(defaultLogDockHeight(340)).toBe(180);
  });
});

describe("clampLogDockHeight", () => {
  it("keeps the dock at least 120 px and the canvas at least 160 px", () => {
    expect(clampLogDockHeight(60, 648)).toBe(120);
    expect(clampLogDockHeight(600, 648)).toBe(488);
    expect(clampLogDockHeight(300, 648)).toBe(300);
  });

  it("lets the dock win when the workspace can't hold both", () => {
    expect(clampLogDockHeight(300, 250)).toBe(120);
  });
});
