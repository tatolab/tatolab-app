/** One item a search popover offers: its id, its title, a quiet line beside it, and the category it is listed under. */
export interface SearchPopoverItem {
  item_id: string;
  title: string;
  summary: string;
  category: string;
}

/** A category of the items that match, in the order the items first name it. */
export interface SearchPopoverCategory {
  category: string;
  items: SearchPopoverItem[];
}

/** The items whose title, id, summary or category hold every word of `searchText`, ignoring case, by category. */
export function searchPopoverCategoriesMatching(items: readonly SearchPopoverItem[], searchText: string): SearchPopoverCategory[] {
  const searchedWords = searchText.toLowerCase().split(/\s+/).filter((word) => word !== "");
  const categories = new Map<string, SearchPopoverItem[]>();
  for (const item of items) {
    const searchedIn = `${item.title} ${item.item_id} ${item.summary} ${item.category}`.toLowerCase();
    if (!searchedWords.every((word) => searchedIn.includes(word))) continue;
    const itemsOfTheCategory = categories.get(item.category);
    if (itemsOfTheCategory === undefined) categories.set(item.category, [item]);
    else itemsOfTheCategory.push(item);
  }
  return [...categories].map(([category, categoryItems]) => ({ category, items: categoryItems }));
}

/** The item ↑ or ↓ highlights from `highlightedItemId` among `categories`, going round at either end; the first when none is highlighted. */
export function searchPopoverItemAfterAnArrow(categories: readonly SearchPopoverCategory[], highlightedItemId: string | null, arrow: "up" | "down"): string | null {
  const itemIds = categories.flatMap((category) => category.items.map((item) => item.item_id));
  if (itemIds.length === 0) return null;
  const highlightedIndex = highlightedItemId === null ? -1 : itemIds.indexOf(highlightedItemId);
  if (highlightedIndex === -1) return arrow === "down" ? (itemIds[0] ?? null) : (itemIds.at(-1) ?? null);
  const step = arrow === "down" ? 1 : -1;
  return itemIds[(highlightedIndex + step + itemIds.length) % itemIds.length] ?? null;
}
