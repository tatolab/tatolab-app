// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeyboardKey } from "./keyboard_key";
import { ToolbarWords } from "./toolbar";

afterEach(cleanup);

describe("the key cap", () => {
  it("is read by a screen reader, so a list of shortcuts names its keys", () => {
    render(
      <p>
        Fit to view <KeyboardKey>F</KeyboardKey>
      </p>,
    );

    expect(screen.getByText("F").closest("[aria-hidden]")).toBeNull();
  });

  it("is left out of what a screen reader reads beside a control that already announces its shortcut", () => {
    render(<KeyboardKey isAlreadyAnnounced>⌘K</KeyboardKey>);

    expect(screen.getByText("⌘K").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("toolbar words that leave a narrow toolbar", () => {
  it("stay in the page for a screen reader, hidden only from view", () => {
    render(<ToolbarWords isDroppedWhenNarrow>Load #4</ToolbarWords>);
    const loadWords = screen.getByText("Load #4");

    expect(loadWords.className).toContain("sr-only");
    expect(loadWords.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(loadWords.closest("[aria-hidden]")).toBeNull();
  });
});
