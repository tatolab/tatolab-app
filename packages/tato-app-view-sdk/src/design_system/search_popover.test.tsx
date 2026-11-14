// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Store } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPopover } from "./search_popover";
import type { SearchPopoverItem } from "./support/search_popover_rows";

afterEach(cleanup);

const ITEMS: SearchPopoverItem[] = [
  { item_id: "nodes.halftone:Halftone", title: "Halftone", summary: "Dots of an image", origin_words: "Night Show", category_path: ["Effects", "Stylize"], listed_above_the_categories: { entry: "This project", heading: "This project" } },
  { item_id: "ops:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", origin_words: "Core Nodes", category_path: ["Effects", "Blur"], listed_above_the_categories: null },
  { item_id: "ops:Add", title: "Add", summary: "Adds two numbers", origin_words: null, category_path: ["Math"], listed_above_the_categories: null },
  { item_id: "tatolab.stream:CameraSource", title: "Camera Source", summary: "Captures a camera", origin_words: null, category_path: [], listed_above_the_categories: null },
];

function openedPopover(popoverProps: Partial<Parameters<typeof SearchPopover>[0]> = {}) {
  const onItemChosen = vi.fn();
  const onClosed = vi.fn();
  render(<SearchPopover label="Add a node" placeholder="Search nodes" items={ITEMS} emptyWords="No node type matches." uncategorisedWords="Ungrouped" at={{ x: 10, y: 10 }} onItemChosen={onItemChosen} onClosed={onClosed} {...popoverProps} />);
  return { onItemChosen, onClosed, searchInput: screen.getByRole("combobox", { name: "Add a node" }) };
}

const entryButton = (entryId: string) => document.querySelector<HTMLElement>(`[data-search-popover-entry="${entryId}"]`) ?? expect.unreachable(`no entry ${entryId}`);
const entriesListed = () => [...document.querySelectorAll<HTMLElement>("[data-search-popover-entry]")].map((entry) => entry.textContent);
const optionsListed = () => screen.getAllByRole("option").map((option) => option.textContent);
const headingsListed = () => [...document.querySelectorAll("[data-search-popover-section-heading]")].map((heading) => heading.textContent);

describe("the search popover", () => {
  it("opens focused on its field, on the first entry above the categories, and enter chooses its first item and asks to close", () => {
    const { onItemChosen, searchInput } = openedPopover();
    expect(document.activeElement).toBe(searchInput);
    expect(entryButton("above:This project").getAttribute("aria-pressed")).toBe("true");
    expect(optionsListed()).toEqual(["HalftoneNight Show"]);
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledWith("nodes.halftone:Halftone", false);
  });

  it("lists the entries above the categories, a divider, each top category with its count, then the uncategorised", () => {
    openedPopover();
    expect(entriesListed()).toEqual(["This project1", "Effects2", "Math1", "Ungrouped1"]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(entryButton("category:Effects").previousElementSibling?.getAttribute("aria-expanded")).toBe("false");
  });

  it("a category that holds categories opens and closes, and choosing it lists everything inside it under each path", () => {
    const { searchInput, onItemChosen } = openedPopover();
    fireEvent.click(entryButton("category:Effects"));
    expect(document.activeElement).toBe(searchInput);
    expect(entriesListed()).toEqual(["This project1", "Effects2", "Blur1", "Stylize1", "Math1", "Ungrouped1"]);
    expect(headingsListed()).toEqual(["Effects / Blur", "Effects / Stylize"]);
    expect(optionsListed()).toEqual(["Gaussian BlurCore Nodes", "HalftoneNight Show"]);
    fireEvent.click(entryButton("category:Effects/Stylize"));
    expect(optionsListed()).toEqual(["HalftoneNight Show"]);
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledWith("nodes.halftone:Halftone", false);
    fireEvent.click(document.querySelector<HTMLElement>(`[data-search-popover-entry-opener="category:Effects"]`) ?? expect.unreachable("no opener"));
    expect(entriesListed()).toEqual(["This project1", "Effects2", "Math1", "Ungrouped1"]);
  });

  it("a category chosen before the categories inside it arrive shows them once they do", () => {
    const popoverOf = (items: SearchPopoverItem[]) => (
      <SearchPopover label="Add a node" placeholder="Search nodes" items={items} emptyWords="No node type matches." uncategorisedWords="Ungrouped" at={{ x: 10, y: 10 }} onItemChosen={vi.fn()} onClosed={vi.fn()} />
    );
    const { rerender } = render(popoverOf(ITEMS.filter((item) => item.category_path?.length !== 2)));
    fireEvent.click(entryButton("category:Math"));
    rerender(popoverOf([...ITEMS, { item_id: "ops:Sine", title: "Sine", summary: "The sine of a number", origin_words: null, category_path: ["Math", "Trigonometry"], listed_above_the_categories: null }]));
    expect(entriesListed()).toEqual(["This project1", "Effects2", "Math2", "Trigonometry1", "Ungrouped1"]);
  });

  it("typing searches every category whatever was chosen, counts each entry's matches, and a cleared field goes back to the entry it opened on", () => {
    const { searchInput } = openedPopover();
    fireEvent.click(entryButton("category:Math"));
    expect(optionsListed()).toEqual(["Add"]);
    fireEvent.change(searchInput, { target: { value: "a" } });
    expect(optionsListed()).toEqual(["Gaussian BlurCore Nodes", "HalftoneNight Show", "Add", "Camera Source"]);
    fireEvent.change(searchInput, { target: { value: "blur" } });
    expect(entriesListed()).toEqual(["This project0", "Effects1", "Math0", "Ungrouped0"]);
    expect(optionsListed()).toEqual(["Gaussian BlurCore Nodes"]);
    fireEvent.click(entryButton("category:Math"));
    expect(screen.getByText("No node type matches.")).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(optionsListed()).toEqual(["HalftoneNight Show"]);
  });

  it("the arrows move the highlight, shift enter chooses and stays open, and nothing is chosen with no match", () => {
    const { onItemChosen, searchInput } = openedPopover();
    fireEvent.change(searchInput, { target: { value: "a" } });
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true });
    expect(onItemChosen).toHaveBeenLastCalledWith("nodes.halftone:Halftone", true);
    fireEvent.change(searchInput, { target: { value: "fader" } });
    expect(screen.getByText("No node type matches.")).toBeTruthy();
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(onItemChosen).toHaveBeenCalledTimes(1);
  });

  it("a row is its title over where it comes from, with nothing at its end, and the popover has no details, key footer or foot link", () => {
    openedPopover();
    const [halftoneRow] = screen.getAllByRole("option");
    expect([...(halftoneRow?.children ?? [])].map((part) => part.textContent)).toEqual(["Halftone", "Night Show"]);
    fireEvent.click(entryButton("category:Math"));
    expect([...(screen.getAllByRole("option")[0]?.children ?? [])].map((part) => part.textContent)).toEqual(["Add"]);
    expect(document.querySelector("[data-search-popover-details]")).toBeNull();
    expect(document.querySelector("[data-search-popover-foot-link]")).toBeNull();
    expect(screen.queryByText("Esc")).toBeNull();
  });

  it("draws the highlighted item's preview beside it, following the arrows and the pointer, and none for an item with nothing to show", () => {
    const { searchInput } = openedPopover({ previewOfTheItem: (itemId) => (itemId === "ops:Add" ? null : <span>preview of {itemId}</span>) });
    const preview = () => document.querySelector("[data-search-popover-preview]");
    expect(preview()?.textContent).toBe("preview of nodes.halftone:Halftone");
    expect(preview()?.getAttribute("data-search-popover-preview-side")).toBe("right");
    fireEvent.change(searchInput, { target: { value: "a" } });
    expect(preview()?.textContent).toBe("preview of ops:GaussianBlur");
    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    expect(preview()?.textContent).toBe("preview of nodes.halftone:Halftone");
    fireEvent.pointerMove(screen.getByRole("option", { name: /Camera Source/ }));
    expect(preview()?.textContent).toBe("preview of tatolab.stream:CameraSource");
    fireEvent.pointerMove(screen.getByRole("option", { name: /Add/ }));
    expect(preview()).toBeNull();
  });

  it("narrowed, drops the left-hand list, lists its matches flat under their count, says what choosing one does and previews on the left", () => {
    openedPopover({ narrowedTo: { heading: "Takes Image", footnote: "Placing one links video to it." }, previewOfTheItem: (itemId) => <span>{itemId}</span> });
    expect(document.querySelector("[data-search-popover-entry]")).toBeNull();
    expect(headingsListed()).toEqual([]);
    expect(document.querySelector("[data-search-popover-heading]")?.textContent).toBe("Takes Image · 4 matches");
    expect(optionsListed()).toEqual(["HalftoneNight Show", "Gaussian BlurCore Nodes", "Add", "Camera Source"]);
    expect(screen.getByText("Placing one links video to it.")).toBeTruthy();
    expect(document.querySelector("[data-search-popover-preview]")?.getAttribute("data-search-popover-preview-side")).toBe("left");
  });

  it("draws each action beside its field as an icon button that asks to close, then does what it names", () => {
    const pressesInOrder: string[] = [];
    openedPopover({ onClosed: () => pressesInOrder.push("closed"), actionsBesideTheField: [{ label: "Install modules from marketplace", icon: Store, onPressed: () => pressesInOrder.push("marketplace") }] });
    const actionButton = screen.getByRole("button", { name: "Install modules from marketplace" });
    fireEvent.pointerDown(actionButton);
    expect(pressesInOrder).toEqual([]);
    fireEvent.click(actionButton);
    expect(pressesInOrder).toEqual(["closed", "marketplace"]);
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
    const { unmount } = render(<SearchPopover label="Add a node" placeholder="Search nodes" items={ITEMS} emptyWords="No node type matches." uncategorisedWords="Ungrouped" at={{ x: 10, y: 10 }} onItemChosen={vi.fn()} onClosed={vi.fn()} />);
    expect(document.activeElement).not.toBe(canvas);
    unmount();
    expect(document.activeElement).toBe(canvas);
    canvas.remove();
  });
});
