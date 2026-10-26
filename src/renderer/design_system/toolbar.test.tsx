// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolbarWords } from "./toolbar";

afterEach(cleanup);

describe("toolbar words that leave a narrow toolbar", () => {
  it("leave the view only below 960 px, stay read by a screen reader, and keep their own spacing above it", () => {
    render(<ToolbarWords isDroppedWhenNarrow>Load #4</ToolbarWords>);
    const loadWords = screen.getByText("Load #4");
    const classNames = loadWords.className.split(/\s+/);

    expect(classNames).toContain("@max-[960px]:sr-only");
    expect(classNames.filter((className) => className === "hidden" || className.endsWith(":hidden") || className.includes("not-sr-only"))).toEqual([]);
    expect(classNames).toEqual(expect.arrayContaining(["mr-2", "whitespace-nowrap"]));
    expect(loadWords.closest("[aria-hidden]")).toBeNull();
  });
});
