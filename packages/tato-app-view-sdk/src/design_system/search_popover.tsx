import { cn } from "cn";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { KeyboardKey } from "./keyboard_key";
import { searchPopoverCategoriesMatching, searchPopoverItemAfterAnArrow, type SearchPopoverItem } from "./support/search_popover_rows";

/** How wide and how tall at most the popover is, so it stays inside the element it opens over. */
const SEARCH_POPOVER_WIDTH_PX = 304;
const SEARCH_POPOVER_TALLEST_PX = 360;

/**
 * A search that opens at a point over what it adds to, as Tab opens the node search over a graph: a field, the matching
 * items by category, ↑↓ to move, ↵ to choose and close, ⇧↵ to choose and stay open, Escape or a press outside to close.
 */
export function SearchPopover({
  label,
  heading,
  placeholder,
  items,
  emptyWords,
  at,
  chooseWords,
  chooseAndStayWords,
  onItemChosen,
  onClosed,
  ...controlDataAttributes
}: {
  /** The search's accessible name, as "Add a node". */
  label: string;
  /** What the popover is adding, over the field, as "Add node" or "Add node wired to pattern.video". */
  heading: string;
  placeholder: string;
  items: readonly SearchPopoverItem[];
  /** What the list says when nothing matches. */
  emptyWords: string;
  /** Its top-left corner, in pixels of the element it opens over. */
  at: { x: number; y: number };
  /** What ↵ does, as the footer names it, as "place". */
  chooseWords: string;
  /** What ⇧↵ does, as the footer names it, as "place another". */
  chooseAndStayWords: string;
  /** `staysOpen` is set when ⇧↵ chose it. */
  onItemChosen: (itemId: string, staysOpen: boolean) => void;
  onClosed: () => void;
} & ControlDataAttributes) {
  const [searchText, setSearchText] = useState("");
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const categories = useMemo(() => searchPopoverCategoriesMatching(items, searchText), [items, searchText]);
  const shownItemIds = useMemo(() => categories.flatMap((category) => category.items.map((item) => item.item_id)), [categories]);
  const highlighted = highlightedItemId !== null && shownItemIds.includes(highlightedItemId) ? highlightedItemId : (shownItemIds[0] ?? null);
  const popoverElement = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionIdOf = (itemId: string) => `${listId}-option-${shownItemIds.indexOf(itemId)}`;

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
    popoverElement.current?.querySelector(`[data-search-popover-item="${CSS.escape(highlighted)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);

  return (
    <div
      ref={popoverElement}
      role="dialog"
      aria-label={label}
      className="absolute z-20 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-raised shadow-(--shadow-pop)"
      style={{
        left: `max(8px, min(${at.x}px, calc(100% - ${SEARCH_POPOVER_WIDTH_PX + 8}px)))`,
        top: `max(8px, min(${at.y}px, calc(100% - ${SEARCH_POPOVER_TALLEST_PX + 8}px)))`,
        width: SEARCH_POPOVER_WIDTH_PX,
        maxHeight: `min(${SEARCH_POPOVER_TALLEST_PX}px, calc(100% - 16px))`,
      }}
      {...controlDataAttributes}
    >
      <div className="border-b px-2.5 pt-2 pb-1.5">
        <div className="mb-1.5 truncate text-2xs font-medium text-fg-3">{heading}</div>
        <div className="flex items-center gap-2">
          <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          <input
            autoFocus
            value={searchText}
            onChange={(changeEvent) => setSearchText(changeEvent.target.value)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
                keyboardEvent.preventDefault();
                setHighlightedItemId(searchPopoverItemAfterAnArrow(categories, highlighted, keyboardEvent.key === "ArrowDown" ? "down" : "up"));
              } else if (keyboardEvent.key === "Enter") {
                keyboardEvent.preventDefault();
                if (highlighted !== null) onItemChosen(highlighted, keyboardEvent.shiftKey);
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
            aria-activedescendant={highlighted === null ? undefined : optionIdOf(highlighted)}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
        </div>
      </div>
      {categories.length === 0 && (
        <p role="status" className="px-2.5 py-3 text-xs text-fg-3">
          {emptyWords}
        </p>
      )}
      <ul id={listId} role="listbox" aria-label={label} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1">
        {categories.map(({ category, items: categoryItems }) => (
          <li key={category} role="presentation">
            <div className="px-2 pt-1.5 pb-0.5 text-2xs text-fg-3" aria-hidden>
              {category}
            </div>
            <ul role="group" aria-label={category}>
              {categoryItems.map((item) => (
                <li
                  key={item.item_id}
                  id={optionIdOf(item.item_id)}
                  role="option"
                  aria-selected={item.item_id === highlighted}
                  data-search-popover-item={item.item_id}
                  onPointerMove={() => setHighlightedItemId(item.item_id)}
                  onClick={(clickEvent) => onItemChosen(item.item_id, clickEvent.shiftKey)}
                  className={cn("flex min-w-0 cursor-default items-baseline gap-2 rounded-md px-2 py-1 text-sm", item.item_id === highlighted && "bg-selected")}
                >
                  <span className="shrink-0 text-fg">{item.title}</span>
                  <span className="min-w-0 truncate text-xs text-fg-3">{item.summary}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-t px-2.5 py-1 text-2xs text-fg-3" aria-hidden>
        <span>
          <KeyboardKey>↑↓</KeyboardKey> move
        </span>
        <span>
          <KeyboardKey>↵</KeyboardKey> {chooseWords}
        </span>
        <span>
          <KeyboardKey>⇧↵</KeyboardKey> {chooseAndStayWords}
        </span>
        <span className="ml-auto">
          <KeyboardKey>esc</KeyboardKey>
        </span>
      </div>
    </div>
  );
}
