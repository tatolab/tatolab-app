// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPopover } from "./search_popover";
import type { SearchPopoverItem } from "./support/search_popover_rows";

afterEach(cleanup);

const ITEMS: SearchPopoverItem[] = [
  { item_id: "nodes.blur:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", category: "nodes.blur", details: "in: frames · out: image", tag: null },
  { item_id: "nodes.colour:Halftone", title: "Halftone", summary: "Dots of an image", category: "nodes.colour", details: null, tag: "this project" },
];

function openedPopover() {
  const onItemChosen = vi.fn();
  const onClosed = vi.fn();
  render(<SearchPopover label="Add a node" placeholder="Search nodes" items={ITEMS} emptyWords="No node type matches." chooseWords="place" chooseAndStayWords="place another" at={{ x: 10, y: 10 }} onItemChosen={onItemChosen} onClosed={onClosed} />);
  return { onItemChosen, onClosed, searchInput: screen.getByRole("combobox", { name: "Add a node" }) };
}

describe("the search popover", () => {
  it("opens focused on its field with the first match highlighted, and enter chooses it and asks to close", () => {
    const { onItemChosen, searchInput } = openedPopover();
    expect(document.activeElement).toBe(searchInput);
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledWith("nodes.blur:GaussianBlur", false);
  });

  it("filters as it is typed, the arrows move the highlight, shift enter chooses and stays open", () => {
    const { onItemChosen, searchInput } = openedPopover();
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true });
    expect(onItemChosen).toHaveBeenLastCalledWith("nodes.colour:Halftone", true);
    fireEvent.change(searchInput, { target: { value: "fader" } });
    expect(screen.getByText("No node type matches.")).toBeTruthy();
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledTimes(1);
  });

  it("lists every category with its matches beside the items, narrows to one chosen, and details the highlighted item", () => {
    const { searchInput, onItemChosen } = openedPopover();
    const categoryButton = (category: string) => document.querySelector<HTMLElement>(`[data-search-popover-category="${category}"]`) ?? expect.unreachable(`no ${category}`);
    expect(categoryButton("all").textContent).toBe("All2");
    expect(categoryButton("nodes.colour").textContent).toBe("nodes.colour1");
    expect(document.querySelector("[data-search-popover-details]")?.textContent).toBe("Gaussian BlurSoftens an imagein: frames · out: image");
    fireEvent.click(categoryButton("nodes.colour"));
    expect(document.activeElement).toBe(searchInput);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Halftonethis project"]);
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledWith("nodes.colour:Halftone", false);
    fireEvent.change(searchInput, { target: { value: "soft" } });
    expect(categoryButton("nodes.colour").textContent).toBe("nodes.colour0");
    expect(screen.getByText("No node type matches.")).toBeTruthy();
  });

  it("narrowed, drops the category list and the details, heads its matches with their count and says what choosing one does", () => {
    render(
      <SearchPopover
        label="Add a node"
        placeholder="Search node types"
        items={ITEMS}
        narrowedTo={{ heading: "Takes Image", footnote: "Placing one links video to it." }}
        emptyWords="No node type matches."
        chooseWords="place at cursor"
        chooseAndStayWords="place and keep open"
        at={{ x: 10, y: 10 }}
        onItemChosen={vi.fn()}
        onClosed={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-search-popover-category]")).toBeNull();
    expect(document.querySelector("[data-search-popover-details]")).toBeNull();
    expect(document.querySelector("[data-search-popover-heading]")?.textContent).toBe("Takes Image · 2 matches");
    expect(screen.getByText("Placing one links video to it.")).toBeTruthy();
  });

  it("draws a foot link that asks to close, then does what it names", () => {
    const pressesInOrder: string[] = [];
    render(
      <SearchPopover
        label="Add a node"
        placeholder="Search nodes"
        items={ITEMS}
        emptyWords="No node type matches."
        chooseWords="place"
        chooseAndStayWords="place another"
        at={{ x: 10, y: 10 }}
        onItemChosen={vi.fn()}
        onClosed={() => pressesInOrder.push("closed")}
        footLink={{ words: "Install modules…", onPressed: () => pressesInOrder.push("install") }}
      />,
    );
    const footLink = screen.getByRole("button", { name: "Install modules…" });
    fireEvent.pointerDown(footLink);
    expect(pressesInOrder).toEqual([]);
    fireEvent.click(footLink);
    expect(pressesInOrder).toEqual(["closed", "install"]);
  });

  it("closes on escape and on a press outside it, but not on a press inside", () => {
    const { onClosed, searchInput } = openedPopover();
    fireEvent.pointerDown(searchInput);
    expect(onClosed).not.toHaveBeenCalled();
    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(onClosed).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(onClosed).toHaveBeenCalledTimes(2);
  });

  it("gives the focus back to what held it when it closes, so the next Tab opens it again", () => {
    const canvas = document.createElement("div");
    canvas.tabIndex = 0;
    document.body.append(canvas);
    canvas.focus();
    const { unmount } = render(<SearchPopover label="Add a node" placeholder="Search nodes" items={ITEMS} emptyWords="No node type matches." chooseWords="place" chooseAndStayWords="place another" at={{ x: 10, y: 10 }} onItemChosen={vi.fn()} onClosed={vi.fn()} />);
    expect(document.activeElement).not.toBe(canvas);
    unmount();
    expect(document.activeElement).toBe(canvas);
    canvas.remove();
  });
});
