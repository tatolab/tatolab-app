import { cn } from "cn";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { InlineLink } from "./inline_link";
import { KeyboardKey } from "./keyboard_key";
import { searchPopoverCategoriesMatching, searchPopoverItemAfterAnArrow, type SearchPopoverCategory, type SearchPopoverItem } from "./support/search_popover_rows";

/** How big the popover is at most in each layout, so it stays inside the element it opens over. */
const SEARCH_POPOVER_SIZE_PX = {
  browsing_every_category: { width: 560, tallest: 460 },
  narrowed: { width: 420, tallest: 420 },
} as const;

/** What the popover's list is narrowed to, as a wire dragged off an Image pin narrows the node search. */
export interface SearchPopoverNarrowing {
  /** What every item offered has in common, as "Takes Image", headed with the count of matches. */
  heading: string;
  /** A quiet line under the list on what choosing an item does. */
  footnote: string;
}

const SECTION_HEADING_CLASS_NAMES = "px-2 pt-2 pb-1 text-2xs font-semibold tracking-wider text-fg-3 uppercase";

/**
 * A search that opens at a point over what it adds to, as Tab opens the node search over a graph: a field, the matching
 * items under a list of their categories with the highlighted item's details, ↑↓ to move, ↵ to choose and close, ⇧↵ to
 * choose and stay open, Escape or a press outside to close. Narrowed, it drops the category list and heads its matches.
 */
export function SearchPopover({
  label,
  placeholder,
  items,
  narrowedTo = null,
  emptyWords,
  at,
  chooseWords,
  chooseAndStayWords,
  onItemChosen,
  onClosed,
  footLink,
  ...controlDataAttributes
}: {
  /** The search's accessible name, as "Add a node". */
  label: string;
  placeholder: string;
  items: readonly SearchPopoverItem[];
  /** `null` browses every category from a list beside the items. */
  narrowedTo?: SearchPopoverNarrowing | null;
  /** What the list says when nothing matches. */
  emptyWords: string;
  /** Its top-left corner, in pixels of the element it opens over. */
  at: { x: number; y: number };
  /** What ↵ does, as the footer names it, as "place at cursor". */
  chooseWords: string;
  /** What ⇧↵ does, as the footer names it, as "place and keep open". */
  chooseAndStayWords: string;
  /** `staysOpen` is set when ⇧↵ chose it. */
  onItemChosen: (itemId: string, staysOpen: boolean) => void;
  onClosed: () => void;
  /** A way on from the search at its foot, as "Install modules…", pressed after the popover asks to close. */
  footLink?: { words: string; onPressed: () => void };
} & ControlDataAttributes) {
  const [searchText, setSearchText] = useState("");
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const categoriesMatching = useMemo(() => searchPopoverCategoriesMatching(items, searchText), [items, searchText]);
  const everyCategory = useMemo(() => searchPopoverCategoriesMatching(items, "").map(({ category }) => category), [items]);
  const categoriesShown = useMemo(
    () => (narrowedTo !== null || chosenCategory === null ? categoriesMatching : categoriesMatching.filter(({ category }) => category === chosenCategory)),
    [categoriesMatching, chosenCategory, narrowedTo],
  );
  const shownItems = useMemo(() => categoriesShown.flatMap((category) => category.items), [categoriesShown]);
  const highlighted = shownItems.find((item) => item.item_id === highlightedItemId) ?? shownItems[0] ?? null;
  const popoverElement = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionIdOf = (itemId: string) => `${listId}-option-${shownItems.findIndex((item) => item.item_id === itemId)}`;
  const size = SEARCH_POPOVER_SIZE_PX[narrowedTo === null ? "browsing_every_category" : "narrowed"];

  const [focusedBeforeOpening] = useState(() => document.activeElement);
  useEffect(() => {
    return () => {
      if (focusedBeforeOpening instanceof HTMLElement && focusedBeforeOpening.isConnected) focusedBeforeOpening.focus();
    };
  }, [focusedBeforeOpening]);

  useEffect(() => {
    const closeOnAPressOutside = (pointerEvent: PointerEvent) => {
      if (pointerEvent.target instanceof Node && popoverElement.current?.contains(pointerEvent.target) === true) return;
      onClosed();
    };
    document.addEventListener("pointerdown", closeOnAPressOutside, true);
    return () => document.removeEventListener("pointerdown", closeOnAPressOutside, true);
  }, [onClosed]);

  useEffect(() => {
    if (highlighted === null) return;
    popoverElement.current?.querySelector(`[data-search-popover-item="${CSS.escape(highlighted.item_id)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);

  const matchCountOf = (category: string | null) =>
    category === null ? categoriesMatching.reduce((count, matching) => count + matching.items.length, 0) : (categoriesMatching.find((matching) => matching.category === category)?.items.length ?? 0);

  return (
    <div
      ref={popoverElement}
      role="dialog"
      aria-label={label}
      className="absolute z-20 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-raised shadow-(--shadow-pop)"
      style={{
        left: `max(8px, min(${at.x}px, calc(100% - ${size.width + 8}px)))`,
        top: `max(8px, min(${at.y}px, calc(100% - ${size.tallest + 8}px)))`,
        width: `min(${size.width}px, calc(100% - 16px))`,
        height: narrowedTo === null ? `min(${size.tallest}px, calc(100% - 16px))` : undefined,
        maxHeight: `min(${size.tallest}px, calc(100% - 16px))`,
      }}
      data-search-popover-layout={narrowedTo === null ? "browsing_every_category" : "narrowed"}
      {...controlDataAttributes}
    >
      <div className="border-b p-2">
        <div className="flex h-7 items-center gap-2 rounded-md border border-line bg-window px-2 focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_var(--ring)]">
          <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          <input
            ref={searchInput}
            autoFocus
            value={searchText}
            onChange={(changeEvent) => setSearchText(changeEvent.target.value)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
                keyboardEvent.preventDefault();
                setHighlightedItemId(searchPopoverItemAfterAnArrow(categoriesShown, highlighted?.item_id ?? null, keyboardEvent.key === "ArrowDown" ? "down" : "up"));
              } else if (keyboardEvent.key === "Enter") {
                keyboardEvent.preventDefault();
                if (highlighted !== null) onItemChosen(highlighted.item_id, keyboardEvent.shiftKey);
              } else if (keyboardEvent.key === "Escape") {
                keyboardEvent.preventDefault();
                onClosed();
              }
              keyboardEvent.stopPropagation();
            }}
            placeholder={placeholder}
            aria-label={label}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={highlighted === null ? undefined : optionIdOf(highlighted.item_id)}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:shadow-none"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {narrowedTo === null && (
          <nav aria-label="Categories" className="scrollbar-thin flex w-44 shrink-0 flex-col gap-px overflow-y-auto border-r p-1.5">
            {[null, ...everyCategory].map((category) => (
              <button
                key={category ?? ""}
                type="button"
                aria-pressed={chosenCategory === category}
                onClick={() => {
                  setChosenCategory(category);
                  setHighlightedItemId(null);
                  searchInput.current?.focus();
                }}
                className={cn(
                  "flex h-6.5 shrink-0 items-center justify-between gap-2 rounded-md px-2 text-left text-xs text-fg-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
                  chosenCategory === category && "bg-selected text-fg",
                )}
                data-search-popover-category={category ?? "all"}
              >
                <span className="min-w-0 truncate">{category ?? "All"}</span>
                <span className="shrink-0 text-fg-3 tabular-nums">{matchCountOf(category)}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {narrowedTo !== null && (
            <div className={SECTION_HEADING_CLASS_NAMES} data-search-popover-heading="">
              {narrowedTo.heading} · {shownItems.length === 1 ? "1 match" : `${shownItems.length} matches`}
            </div>
          )}
          {shownItems.length === 0 && (
            <p role="status" className="px-3 py-3 text-xs text-fg-3">
              {emptyWords}
            </p>
          )}
          <SearchPopoverList
            listId={listId}
            label={label}
            categories={categoriesShown}
            highlightedItemId={highlighted?.item_id ?? null}
            optionIdOf={optionIdOf}
            showsCategoryHeadings={narrowedTo === null || categoriesShown.length > 1}
            onItemHighlighted={setHighlightedItemId}
            onItemChosen={onItemChosen}
          />
          {narrowedTo === null && highlighted !== null && (
            <div className="m-1.5 mt-1 flex shrink-0 flex-col gap-1 rounded-md bg-well p-2.5" data-search-popover-details={highlighted.item_id}>
              <div className="truncate text-sm font-semibold text-fg">{highlighted.title}</div>
              {highlighted.summary !== "" && <p className="line-clamp-2 text-xs text-fg-2">{highlighted.summary}</p>}
              {highlighted.details !== null && <p className="truncate text-2xs text-fg-3">{highlighted.details}</p>}
            </div>
          )}
        </div>
      </div>
      {narrowedTo !== null && <p className="border-t px-3 py-2 text-2xs text-fg-3">{narrowedTo.footnote}</p>}
      {footLink !== undefined && (
        <div className="border-t px-3 py-1.5 text-xs">
          <InlineLink
            destination={{
              onPressed: () => {
                onClosed();
                footLink.onPressed();
              },
            }}
            data-search-popover-foot-link=""
          >
            {footLink.words}
          </InlineLink>
        </div>
      )}
      <div className="flex items-center gap-3 border-t px-3 py-1.5 text-2xs whitespace-nowrap text-fg-3" aria-hidden>
        <span>
          <KeyboardKey>↑↓</KeyboardKey> choose
        </span>
        <span>
          <KeyboardKey>↵</KeyboardKey> {chooseWords}
        </span>
        <span>
          <KeyboardKey>⇧↵</KeyboardKey> {chooseAndStayWords}
        </span>
        <span className="ml-auto">
          <KeyboardKey>Esc</KeyboardKey>
          {narrowedTo === null && " close"}
        </span>
      </div>
    </div>
  );
}

/** The popover's matching items, by category, the highlighted one marked. */
function SearchPopoverList({
  listId,
  label,
  categories,
  highlightedItemId,
  optionIdOf,
  showsCategoryHeadings,
  onItemHighlighted,
  onItemChosen,
}: {
  listId: string;
  label: string;
  categories: readonly SearchPopoverCategory[];
  highlightedItemId: string | null;
  optionIdOf: (itemId: string) => string;
  showsCategoryHeadings: boolean;
  onItemHighlighted: (itemId: string) => void;
  onItemChosen: (itemId: string, staysOpen: boolean) => void;
}) {
  return (
    <ul id={listId} role="listbox" aria-label={label} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
      {categories.map(({ category, items: categoryItems }) => (
        <li key={category} role="presentation">
          {showsCategoryHeadings && (
            <div className={SECTION_HEADING_CLASS_NAMES} aria-hidden>
              {category}
            </div>
          )}
          <ul role="group" aria-label={category}>
            {categoryItems.map((item) => (
              <li
                key={item.item_id}
                id={optionIdOf(item.item_id)}
                role="option"
                aria-selected={item.item_id === highlightedItemId}
                data-search-popover-item={item.item_id}
                onPointerMove={() => onItemHighlighted(item.item_id)}
                onClick={(clickEvent) => onItemChosen(item.item_id, clickEvent.shiftKey)}
                className={cn("flex h-6.5 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-sm text-fg-2", item.item_id === highlightedItemId && "bg-selected text-fg")}
              >
                <span className="min-w-0 truncate">{item.title}</span>
                {item.tag !== null && <span className="ml-auto shrink-0 text-2xs text-fg-3">{item.tag}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
