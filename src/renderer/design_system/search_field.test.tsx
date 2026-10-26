// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchField } from "./search_field";

afterEach(cleanup);

function LogSearch() {
  const [searchText, setSearchText] = useState("");
  return <SearchField label="Search main logs" placeholder="Search logs" text={searchText} onTextChanged={setSearchText} shortcut={{ hint: "⌘F", ariaKeyShortcuts: "Meta+F" }} />;
}

describe("the search field", () => {
  it("shows the shortcut's key cap while empty, and a button that clears it once there is text", () => {
    render(<LogSearch />);
    const searchInput = screen.getByRole("textbox", { name: "Search main logs" });

    expect(screen.getByText("⌘F")).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: "MEAN=127" } });
    expect(screen.queryByText("⌘F")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(searchInput).toHaveProperty("value", "");
  });

  it("clears its text with Escape, then leaves the field with a second", () => {
    render(<LogSearch />);
    const searchInput = screen.getByRole("textbox", { name: "Search main logs" });
    act(() => searchInput.focus());
    fireEvent.change(searchInput, { target: { value: "MEAN=127" } });

    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(searchInput).toHaveProperty("value", "");
    expect(document.activeElement).toBe(searchInput);
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(document.activeElement).not.toBe(searchInput);
  });
});
