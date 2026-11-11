import { expect, test } from "vitest";
import { searchPopoverCategoriesMatching, searchPopoverItemAfterAnArrow, type SearchPopoverItem } from "./search_popover_rows";

const ITEMS: SearchPopoverItem[] = [
  { item_id: "nodes.blur:GaussianBlur", title: "Gaussian Blur", summary: "Softens an image", category: "nodes.blur", details: null, tag: null },
  { item_id: "nodes.colour:Halftone", title: "Halftone", summary: "Dots of an image", category: "nodes.colour", details: null, tag: null },
  { item_id: "nodes.blur:BoxBlur", title: "Box Blur", summary: "A cheaper blur", category: "nodes.blur", details: null, tag: null },
];

test("every_word_searched_must_match_somewhere_ignoring_case_and_matches_keep_their_category_in_first_named_order", () => {
  expect(searchPopoverCategoriesMatching(ITEMS, "")).toEqual([
    { category: "nodes.blur", items: [ITEMS[0], ITEMS[2]] },
    { category: "nodes.colour", items: [ITEMS[1]] },
  ]);
  expect(searchPopoverCategoriesMatching(ITEMS, "  BLUR box ")).toEqual([{ category: "nodes.blur", items: [ITEMS[2]] }]);
  expect(searchPopoverCategoriesMatching(ITEMS, "image")).toEqual([
    { category: "nodes.blur", items: [ITEMS[0]] },
    { category: "nodes.colour", items: [ITEMS[1]] },
  ]);
  expect(searchPopoverCategoriesMatching(ITEMS, "fader")).toEqual([]);
});

test("the_arrows_walk_the_items_across_categories_and_go_round_at_either_end", () => {
  const categories = searchPopoverCategoriesMatching(ITEMS, "");
  expect(searchPopoverItemAfterAnArrow(categories, null, "down")).toBe("nodes.blur:GaussianBlur");
  expect(searchPopoverItemAfterAnArrow(categories, null, "up")).toBe("nodes.colour:Halftone");
  expect(searchPopoverItemAfterAnArrow(categories, "nodes.blur:BoxBlur", "down")).toBe("nodes.colour:Halftone");
  expect(searchPopoverItemAfterAnArrow(categories, "nodes.colour:Halftone", "down")).toBe("nodes.blur:GaussianBlur");
  expect(searchPopoverItemAfterAnArrow(categories, "nodes.blur:GaussianBlur", "up")).toBe("nodes.colour:Halftone");
  expect(searchPopoverItemAfterAnArrow([], null, "down")).toBeNull();
});
