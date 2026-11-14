/** One item a search popover offers: its id, its title, what it does, where it comes from, and where the popover lists it. */
export interface SearchPopoverItem {
  item_id: string;
  title: string;
  /** What it does: searched with its title, never drawn. */
  summary: string;
  /** A quiet line under its title naming where it comes from, as its project's name; `null` for none. */
  origin_words: string | null;
  /** The category it is filed under as a path, outermost first, as `["Effects", "Stylize"]`, no part holding a `/`; empty for one filed under none; `null` for an item no category lists. */
  category_path: readonly string[] | null;
  /** The entry above the categories that also lists it, with the heading it is listed under there; `null` for none. */
  listed_above_the_categories: { entry: string; heading: string } | null;
}

/** One row of the popover's left-hand list: an entry above the categories, a category at its depth, or the entry of the items filed under no category. */
export interface SearchPopoverEntry {
  entry_id: string;
  words: string;
  kind: "above_the_categories" | "category" | "uncategorised";
  /** A category's own path; empty for any other entry. */
  category_path: readonly string[];
  /** How many of the matching items it lists, those of the categories inside it included. */
  match_count: number;
  /** Whether categories are filed inside it, so it opens and closes. */
  holds_categories: boolean;
}

/** A run of the items the list shows under one heading; `null` for a run with no heading over it. */
export interface SearchPopoverSection {
  heading: string | null;
  items: SearchPopoverItem[];
}

const UNCATEGORISED_ENTRY_ID = "uncategorised";

function entryIdAboveTheCategories(entry: string): string {
  return `above:${entry}`;
}

/** The id of the entry of the category at `categoryPath`, as `category:Effects/Stylize`. */
export function searchPopoverCategoryEntryId(categoryPath: readonly string[]): string {
  return `category:${categoryPath.join("/")}`;
}

function compareByText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCategoryPaths(left: readonly string[], right: readonly string[]): number {
  for (let depth = 0; depth < Math.min(left.length, right.length); depth++) {
    const order = compareByText(left[depth] ?? "", right[depth] ?? "");
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

function isFiledInsideTheCategory(itemCategoryPath: readonly string[], categoryPath: readonly string[]): boolean {
  return categoryPath.length <= itemCategoryPath.length && categoryPath.every((part, depth) => itemCategoryPath[depth] === part);
}

/** The items whose title, id, summary, origin or category hold every word of `searchText`, ignoring case, in the order given. */
export function searchPopoverItemsMatching(items: readonly SearchPopoverItem[], searchText: string): SearchPopoverItem[] {
  const searchedWords = searchText.toLowerCase().split(/\s+/).filter((word) => word !== "");
  return items.filter((item) => {
    const searchedIn = `${item.title} ${item.item_id} ${item.summary} ${item.origin_words ?? ""} ${(item.category_path ?? []).join(" ")}`.toLowerCase();
    return searchedWords.every((word) => searchedIn.includes(word));
  });
}

/**
 * The left-hand list of `items`, top to bottom: each entry above the categories in the order the items first name it,
 * each category by name with the categories inside it under it, then the entry of the items filed under none, named
 * `uncategorisedWords`. Each counts the `matchingItems` it lists.
 */
export function searchPopoverEntries(items: readonly SearchPopoverItem[], matchingItems: readonly SearchPopoverItem[], uncategorisedWords: string): SearchPopoverEntry[] {
  const entriesAbove = [...new Set(items.flatMap((item) => (item.listed_above_the_categories === null ? [] : [item.listed_above_the_categories.entry])))];
  const categoryPathsById = new Map<string, readonly string[]>();
  for (const item of items) {
    for (let depth = 1; depth <= (item.category_path?.length ?? 0); depth++) {
      const categoryPath = item.category_path?.slice(0, depth) ?? [];
      categoryPathsById.set(searchPopoverCategoryEntryId(categoryPath), categoryPath);
    }
  }
  const categoryPaths = [...categoryPathsById.values()].sort(compareCategoryPaths);
  const matchingCategoryPaths = matchingItems.flatMap((item) => (item.category_path === null ? [] : [item.category_path]));
  const isAnyItemUncategorised = items.some((item) => item.category_path?.length === 0);
  return [
    ...entriesAbove.map(
      (entry): SearchPopoverEntry => ({
        entry_id: entryIdAboveTheCategories(entry),
        words: entry,
        kind: "above_the_categories",
        category_path: [],
        match_count: matchingItems.filter((item) => item.listed_above_the_categories?.entry === entry).length,
        holds_categories: false,
      }),
    ),
    ...categoryPaths.map(
      (categoryPath): SearchPopoverEntry => ({
        entry_id: searchPopoverCategoryEntryId(categoryPath),
        words: categoryPath.at(-1) ?? "",
        kind: "category",
        category_path: categoryPath,
        match_count: matchingCategoryPaths.filter((itemCategoryPath) => isFiledInsideTheCategory(itemCategoryPath, categoryPath)).length,
        holds_categories: categoryPaths.some((otherPath) => otherPath.length === categoryPath.length + 1 && isFiledInsideTheCategory(otherPath, categoryPath)),
      }),
    ),
    ...(isAnyItemUncategorised
      ? [
          {
            entry_id: UNCATEGORISED_ENTRY_ID,
            words: uncategorisedWords,
            kind: "uncategorised",
            category_path: [],
            match_count: matchingCategoryPaths.filter((itemCategoryPath) => itemCategoryPath.length === 0).length,
            holds_categories: false,
          } satisfies SearchPopoverEntry,
        ]
      : []),
  ];
}

/** The entries of `entries` that show: every one but a category inside a category that is closed, as `isOpenByEntryId` has it; a category is closed until it is opened. */
export function searchPopoverEntriesShown(entries: readonly SearchPopoverEntry[], isOpenByEntryId: Readonly<Record<string, boolean>>): SearchPopoverEntry[] {
  return entries.filter((entry) => entry.category_path.slice(0, -1).every((_, depth) => isOpenByEntryId[searchPopoverCategoryEntryId(entry.category_path.slice(0, depth + 1))] === true));
}

/** The entry the popover opens on: the first above the categories that lists anything, else the first category; `null` with no entries. */
export function searchPopoverEntryItOpensOn(entries: readonly SearchPopoverEntry[]): string | null {
  return (entries.find((entry) => entry.kind === "above_the_categories" && entry.match_count > 0) ?? entries.find((entry) => entry.kind !== "above_the_categories") ?? entries[0])?.entry_id ?? null;
}

function sectionsByHeading(headedItems: readonly { heading: string; item: SearchPopoverItem }[]): SearchPopoverSection[] {
  const itemsByHeading = new Map<string, SearchPopoverItem[]>();
  for (const { heading, item } of headedItems) itemsByHeading.set(heading, [...(itemsByHeading.get(heading) ?? []), item]);
  return [...itemsByHeading].map(([heading, items]) => ({ heading, items }));
}

function sectionsByCategory(categorisedItems: readonly SearchPopoverItem[], uncategorisedWords: string): SearchPopoverSection[] {
  const inCategoryOrder = categorisedItems
    .map((item, index) => ({ item, index, categoryPath: item.category_path ?? [] }))
    .sort((left, right) => Number(left.categoryPath.length === 0) - Number(right.categoryPath.length === 0) || compareCategoryPaths(left.categoryPath, right.categoryPath) || left.index - right.index);
  return sectionsByHeading(inCategoryOrder.map(({ item, categoryPath }) => ({ heading: categoryPath.length === 0 ? uncategorisedWords : categoryPath.join(" / "), item })));
}

/**
 * The `matchingItems` the list shows under the entry `chosenEntryId`, by heading: an entry above the categories lists its
 * items under their headings there; a category lists everything filed inside it, each category's items under its path;
 * `null` lists every item, those no category lists first, under their headings above the categories.
 */
export function searchPopoverSectionsShown(matchingItems: readonly SearchPopoverItem[], chosenEntryId: string | null, uncategorisedWords: string): SearchPopoverSection[] {
  if (chosenEntryId === null) {
    return [
      ...sectionsByHeading(matchingItems.flatMap((item) => (item.category_path === null ? [{ heading: item.listed_above_the_categories?.heading ?? "", item }] : []))),
      ...sectionsByCategory(
        matchingItems.filter((item) => item.category_path !== null),
        uncategorisedWords,
      ),
    ];
  }
  if (chosenEntryId === UNCATEGORISED_ENTRY_ID) {
    return sectionsByCategory(
      matchingItems.filter((item) => item.category_path?.length === 0),
      uncategorisedWords,
    );
  }
  const itemsListedAbove = matchingItems.flatMap((item) =>
    item.listed_above_the_categories !== null && entryIdAboveTheCategories(item.listed_above_the_categories.entry) === chosenEntryId ? [{ heading: item.listed_above_the_categories.heading, item }] : [],
  );
  if (itemsListedAbove.length > 0) return sectionsByHeading(itemsListedAbove);
  return sectionsByCategory(
    matchingItems.filter((item) => {
      const categoryPath = item.category_path ?? [];
      return categoryPath.length > 0 && categoryPath.some((_, depth) => searchPopoverCategoryEntryId(categoryPath.slice(0, depth + 1)) === chosenEntryId);
    }),
    uncategorisedWords,
  );
}

/** The item ↑ or ↓ highlights from `highlightedItemId` among `sections`, going round at either end; the first when none is highlighted. */
export function searchPopoverItemAfterAnArrow(sections: readonly SearchPopoverSection[], highlightedItemId: string | null, arrow: "up" | "down"): string | null {
  const itemIds = sections.flatMap((section) => section.items.map((item) => item.item_id));
  if (itemIds.length === 0) return null;
  const highlightedIndex = highlightedItemId === null ? -1 : itemIds.indexOf(highlightedItemId);
  if (highlightedIndex === -1) return arrow === "down" ? (itemIds[0] ?? null) : (itemIds.at(-1) ?? null);
  const step = arrow === "down" ? 1 : -1;
  return itemIds[(highlightedIndex + step + itemIds.length) % itemIds.length] ?? null;
}

/** The side of the popover the highlighted item's preview sits on: `preferredSide` when it has `roomNeeded` there or the other side has no more, else the other side. */
export function searchPopoverPreviewSide(preferredSide: "left" | "right", roomOnTheLeft: number, roomOnTheRight: number, roomNeeded: number): "left" | "right" {
  const roomOnThePreferredSide = preferredSide === "left" ? roomOnTheLeft : roomOnTheRight;
  const roomOnTheOtherSide = preferredSide === "left" ? roomOnTheRight : roomOnTheLeft;
  if (roomOnThePreferredSide >= roomNeeded || roomOnTheOtherSide <= roomOnThePreferredSide) return preferredSide;
  return preferredSide === "left" ? "right" : "left";
}
