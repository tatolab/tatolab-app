import { expect, test } from "vitest";
import {
  searchPopoverCategoryEntryId,
  searchPopoverEntries,
  searchPopoverEntriesShown,
  searchPopoverEntryItOpensOn,
  searchPopoverItemAfterAnArrow,
  searchPopoverItemsMatching,
  searchPopoverPlaceAcrossTheElement,
  searchPopoverPreviewSide,
  searchPopoverSectionsShown,
  type SearchPopoverItem,
} from "./search_popover_rows";

const item = (itemId: string, title: string, categoryPath: readonly string[] | null, listedAbove: { entry: string; heading: string } | null = null, originWords: string | null = null): SearchPopoverItem => ({
  item_id: itemId,
  title,
  summary: "",
  origin_words: originWords,
  category_path: categoryPath,
  listed_above_the_categories: listedAbove,
});

const POSTERIZE = item("ops:Posterize", "Posterize", ["Effects", "Stylize"], null, "Core Nodes");
const GAUSSIAN_BLUR = item("ops:GaussianBlur", "Gaussian Blur", ["Effects", "Blur"]);
const HALFTONE = item("nodes.halftone:Halftone", "Halftone", ["Effects", "Stylize"], { entry: "This project", heading: "This project" }, "Night Show");
const ADD = item("ops:Add", "Add", ["Math"]);
const CAMERA = item("tatolab.stream:CameraSource", "Camera Source", []);
const MIC_LEVELS = item("graph_generator:mics", "Mic Levels", null, { entry: "This project", heading: "Subgraphs from code" }, "Night Show");
const ITEMS = [POSTERIZE, GAUSSIAN_BLUR, HALFTONE, ADD, CAMERA, MIC_LEVELS];
const INVERT = { ...item("nodes.invert:Invert", "Invert", ["Effects"]), summary: "Flips every colour" };

test("every_word_searched_must_match_the_title_id_summary_origin_or_category_ignoring_case", () => {
  expect(searchPopoverItemsMatching(ITEMS, "")).toEqual(ITEMS);
  expect(searchPopoverItemsMatching(ITEMS, "  BLUR gaussian ")).toEqual([GAUSSIAN_BLUR]);
  expect(searchPopoverItemsMatching(ITEMS, "stylize")).toEqual([POSTERIZE, HALFTONE]);
  expect(searchPopoverItemsMatching(ITEMS, "night show")).toEqual([HALFTONE, MIC_LEVELS]);
  expect(searchPopoverItemsMatching([INVERT], "colour")).toEqual([INVERT]);
  expect(searchPopoverItemsMatching(ITEMS, "fader")).toEqual([]);
});

test("the_left_hand_list_is_the_entries_above_then_each_category_by_name_with_those_inside_it_then_the_uncategorised", () => {
  expect(searchPopoverEntries(ITEMS, ITEMS, "Ungrouped").map((entry) => [entry.entry_id, entry.words, entry.kind, entry.match_count, entry.holds_categories])).toEqual([
    ["above:This project", "This project", "above_the_categories", 2, false],
    ["category:Effects", "Effects", "category", 3, true],
    ["category:Effects/Blur", "Blur", "category", 1, false],
    ["category:Effects/Stylize", "Stylize", "category", 2, false],
    ["category:Math", "Math", "category", 1, false],
    ["uncategorised", "Ungrouped", "uncategorised", 1, false],
  ]);
  expect(searchPopoverEntries([ADD], [ADD], "Ungrouped").map((entry) => entry.entry_id)).toEqual(["category:Math"]);
});

test("an_entry_counts_only_the_matches_and_stays_listed_with_none", () => {
  const entries = searchPopoverEntries(ITEMS, searchPopoverItemsMatching(ITEMS, "halftone"), "Ungrouped");
  expect(entries.map((entry) => entry.match_count)).toEqual([1, 1, 0, 1, 0, 0]);
});

test("a_category_inside_another_shows_only_while_every_category_over_it_is_open", () => {
  const deep = item("x:Deep", "Deep", ["Effects", "Stylize", "Dots"]);
  const entries = searchPopoverEntries([...ITEMS, deep], [], "Ungrouped");
  const shownWith = (isOpenByEntryId: Record<string, boolean>) => searchPopoverEntriesShown(entries, isOpenByEntryId).map((entry) => entry.entry_id);
  expect(shownWith({})).toEqual(["above:This project", "category:Effects", "category:Math", "uncategorised"]);
  expect(shownWith({ "category:Effects": true })).toEqual(["above:This project", "category:Effects", "category:Effects/Blur", "category:Effects/Stylize", "category:Math", "uncategorised"]);
  expect(shownWith({ "category:Effects/Stylize": true })).toEqual(["above:This project", "category:Effects", "category:Math", "uncategorised"]);
  expect(shownWith({ "category:Effects": true, "category:Effects/Stylize": true })).toContain("category:Effects/Stylize/Dots");
});

test("it_opens_on_the_first_entry_above_that_lists_anything_else_on_the_first_category", () => {
  expect(searchPopoverEntryItOpensOn(searchPopoverEntries(ITEMS, ITEMS, "Ungrouped"))).toBe("above:This project");
  expect(searchPopoverEntryItOpensOn(searchPopoverEntries([ADD, CAMERA], [ADD, CAMERA], "Ungrouped"))).toBe("category:Math");
  expect(searchPopoverEntryItOpensOn(searchPopoverEntries([CAMERA], [CAMERA], "Ungrouped"))).toBe("uncategorised");
  expect(searchPopoverEntryItOpensOn([])).toBeNull();
});

test("an_entry_above_the_categories_lists_its_items_under_their_headings_there", () => {
  expect(searchPopoverSectionsShown(ITEMS, "above:This project", "Ungrouped")).toEqual([
    { section_id: "above:This project", heading: "This project", items: [HALFTONE] },
    { section_id: "above:Subgraphs from code", heading: "Subgraphs from code", items: [MIC_LEVELS] },
  ]);
});

test("a_category_lists_everything_filed_inside_it_each_under_its_path", () => {
  expect(searchPopoverSectionsShown(ITEMS, searchPopoverCategoryEntryId(["Effects"]), "Ungrouped")).toEqual([
    { section_id: "category:Effects/Blur", heading: "Effects / Blur", items: [GAUSSIAN_BLUR] },
    { section_id: "category:Effects/Stylize", heading: "Effects / Stylize", items: [POSTERIZE, HALFTONE] },
  ]);
  expect(searchPopoverSectionsShown(ITEMS, searchPopoverCategoryEntryId(["Effects", "Stylize"]), "Ungrouped")).toEqual([{ section_id: "category:Effects/Stylize", heading: "Effects / Stylize", items: [POSTERIZE, HALFTONE] }]);
  expect(searchPopoverSectionsShown(ITEMS, "uncategorised", "Ungrouped")).toEqual([{ section_id: "uncategorised", heading: "Ungrouped", items: [CAMERA] }]);
  expect(searchPopoverSectionsShown(ITEMS, searchPopoverCategoryEntryId(["Lighting"]), "Ungrouped")).toEqual([]);
});

test("no_entry_chosen_lists_every_item_once_the_uncategorised_last", () => {
  expect(searchPopoverSectionsShown(ITEMS, null, "Ungrouped")).toEqual([
    { section_id: "above:Subgraphs from code", heading: "Subgraphs from code", items: [MIC_LEVELS] },
    { section_id: "category:Effects/Blur", heading: "Effects / Blur", items: [GAUSSIAN_BLUR] },
    { section_id: "category:Effects/Stylize", heading: "Effects / Stylize", items: [POSTERIZE, HALFTONE] },
    { section_id: "category:Math", heading: "Math", items: [ADD] },
    { section_id: "uncategorised", heading: "Ungrouped", items: [CAMERA] },
  ]);
});

test("a_category_named_as_the_uncategorised_are_keeps_a_section_of_its_own", () => {
  const filedUnderACategoryNamedUngrouped = item("ops:Stray", "Stray", ["Ungrouped"]);
  expect(searchPopoverSectionsShown([CAMERA, filedUnderACategoryNamedUngrouped], null, "Ungrouped")).toEqual([
    { section_id: "category:Ungrouped", heading: "Ungrouped", items: [filedUnderACategoryNamedUngrouped] },
    { section_id: "uncategorised", heading: "Ungrouped", items: [CAMERA] },
  ]);
});

test("the_arrows_walk_the_items_across_sections_and_go_round_at_either_end", () => {
  const sections = searchPopoverSectionsShown(ITEMS, searchPopoverCategoryEntryId(["Effects"]), "Ungrouped");
  expect(searchPopoverItemAfterAnArrow(sections, null, "down")).toBe("ops:GaussianBlur");
  expect(searchPopoverItemAfterAnArrow(sections, null, "up")).toBe("nodes.halftone:Halftone");
  expect(searchPopoverItemAfterAnArrow(sections, "ops:GaussianBlur", "down")).toBe("ops:Posterize");
  expect(searchPopoverItemAfterAnArrow(sections, "nodes.halftone:Halftone", "down")).toBe("ops:GaussianBlur");
  expect(searchPopoverItemAfterAnArrow(sections, "ops:GaussianBlur", "up")).toBe("nodes.halftone:Halftone");
  expect(searchPopoverItemAfterAnArrow([], null, "down")).toBeNull();
});

test("the_preview_sits_on_its_first_side_unless_only_the_other_has_the_room", () => {
  expect(searchPopoverPreviewSide("right", 400, 300, 260)).toBe("right");
  expect(searchPopoverPreviewSide("right", 400, 100, 260)).toBe("left");
  expect(searchPopoverPreviewSide("left", 100, 400, 260)).toBe("right");
  expect(searchPopoverPreviewSide("left", 300, 400, 260)).toBe("left");
  expect(searchPopoverPreviewSide("right", 50, 100, 260)).toBe("right");
  expect(searchPopoverPreviewSide("right", 0, 0, 260)).toBe("right");
});

test("a_popover_with_no_preview_opens_where_asked_at_its_widest_and_stays_inside_the_element", () => {
  expect(searchPopoverPlaceAcrossTheElement(1200, 300, 560, null)).toEqual({ left: 300, width: 560 });
  expect(searchPopoverPlaceAcrossTheElement(1200, 900, 560, null)).toEqual({ left: 632, width: 560 });
  expect(searchPopoverPlaceAcrossTheElement(1200, -40, 560, null)).toEqual({ left: 8, width: 560 });
  expect(searchPopoverPlaceAcrossTheElement(400, 120, 560, null)).toEqual({ left: 8, width: 384 });
});

test("a_popover_narrows_until_the_element_holds_it_and_its_preview", () => {
  const previewOnTheRight = { roomNeeded: 165, narrowestWidth: 400, drawnOnFirst: "right" } as const;
  expect(searchPopoverPlaceAcrossTheElement(612, 8, 560, previewOnTheRight)).toEqual({ left: 8, width: 431 });
  expect(searchPopoverPlaceAcrossTheElement(756, 8, 560, previewOnTheRight)).toEqual({ left: 8, width: 560 });
  expect(searchPopoverPlaceAcrossTheElement(581, 8, 560, previewOnTheRight)).toEqual({ left: 8, width: 400 });
});

test("an_element_too_narrow_for_a_popover_and_its_preview_leaves_the_popover_as_one_with_none", () => {
  const previewOnTheRight = { roomNeeded: 165, narrowestWidth: 400, drawnOnFirst: "right" } as const;
  expect(searchPopoverPlaceAcrossTheElement(580, 60, 560, previewOnTheRight)).toEqual(searchPopoverPlaceAcrossTheElement(580, 60, 560, null));
  expect(searchPopoverPlaceAcrossTheElement(300, 60, 560, previewOnTheRight)).toEqual({ left: 8, width: 284 });
});

test("a_popover_moves_the_least_it_must_for_one_side_to_keep_its_previews_room", () => {
  const previewOnTheLeft = { roomNeeded: 165, narrowestWidth: 320, drawnOnFirst: "left" } as const;
  expect(searchPopoverPlaceAcrossTheElement(1200, 400, 420, previewOnTheLeft)).toEqual({ left: 400, width: 420 });
  expect(searchPopoverPlaceAcrossTheElement(1200, 40, 420, previewOnTheLeft)).toEqual({ left: 40, width: 420 });
  expect(searchPopoverPlaceAcrossTheElement(612, 100, 420, previewOnTheLeft)).toEqual({ left: 173, width: 420 });
  expect(searchPopoverPlaceAcrossTheElement(612, 60, 420, previewOnTheLeft)).toEqual({ left: 19, width: 420 });
  expect(searchPopoverPlaceAcrossTheElement(612, 96, 420, previewOnTheLeft)).toEqual({ left: 173, width: 420 });
  expect(searchPopoverPlaceAcrossTheElement(612, 96, 420, { ...previewOnTheLeft, drawnOnFirst: "right" })).toEqual({ left: 19, width: 420 });
});
