// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MatchedWords, whereTheSearchMatches } from "./matched_words";

afterEach(cleanup);

describe("the words a search matches", () => {
  it("finds the search ignoring case and its surrounding spaces, and nothing for a blank one", () => {
    expect(whereTheSearchMatches("Halftone", " HALF ")).toEqual({ start: 0, end: 4 });
    expect(whereTheSearchMatches("Halftone", "zzz")).toBeNull();
    expect(whereTheSearchMatches("Halftone", "  ")).toBeNull();
  });

  it("marks the part that matches and leaves the words whole", () => {
    const { container } = render(<MatchedWords words="Inverting Effect" searchWords="ting" />);
    expect(container.textContent).toBe("Inverting Effect");
    expect(container.querySelector("[data-matched-words]")?.textContent).toBe("ting");
  });
});
