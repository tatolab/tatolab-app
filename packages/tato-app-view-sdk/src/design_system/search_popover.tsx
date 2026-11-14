import { cn } from "cn";
import { ChevronDown, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { IconButton } from "./icon_button";
import {
  searchPopoverEntries,
  searchPopoverEntriesShown,
  searchPopoverEntryItOpensOn,
  searchPopoverItemAfterAnArrow,
  searchPopoverItemsMatching,
  searchPopoverPreviewSide,
  searchPopoverSectionsShown,
  type SearchPopoverEntry,
  type SearchPopoverItem,
  type SearchPopoverSection,
} from "./support/search_popover_rows";

/** How big the popover is at most in each layout, so it stays inside the element it opens over. */
const SEARCH_POPOVER_SIZE_PX = {
  browsing_every_category: { width: 560, tallest: 460 },
  narrowed: { width: 420, tallest: 420 },
} as const;

/** The gap between the popover and the highlighted item's preview, and the room a preview is given beside the popover. */
const SEARCH_POPOVER_PREVIEW_GAP_PX = 12;
const SEARCH_POPOVER_PREVIEW_ROOM_PX = 260;

/** How far each level of categories is indented in the left-hand list. */
const SEARCH_POPOVER_CATEGORY_INDENT_PX = 14;

/** What the popover's list is narrowed to, as a wire dragged off an Image pin narrows the node search. */
export interface SearchPopoverNarrowing {
  /** What every item offered has in common, as "Takes Image", headed with the count of matches. */
  heading: string;
  /** A quiet line under the list on what choosing an item does. */
  footnote: string;
}

/** A way on from the search, drawn as an icon button beside its field, as "Install modules from marketplace"; pressed after the popover asks to close. */
export interface SearchPopoverAction {
  label: string;
  icon: LucideIcon;
  onPressed: () => void;
}

/** Which entry of the left-hand list the items are listed under: the one the popover opens on, every one while text is searched for, or the one the person chose. */
type SearchPopoverEntryChoice = { kind: "the_entry_it_opens_on" } | { kind: "every_entry" } | { kind: "chosen"; entry_id: string };

const SECTION_HEADING_CLASS_NAMES = "px-2 pt-2 pb-1 text-2xs font-semibold tracking-wider text-fg-3 uppercase";

/**
 * A search that opens at a point over what it adds to, as Tab opens the node search over a graph: a field, then the
 * matching items beside a list of the entries and categories they are filed under, the highlighted item's preview
 * beside the popover. ↑↓ move, ↵ chooses and closes, ⇧↵ chooses and stays open, Escape or a press outside closes.
 * Typing searches every category. Narrowed, it drops the left-hand list and heads its matches.
 */
export function SearchPopover({
  label,
  placeholder,
  items,
  narrowedTo = null,
  emptyWords,
  uncategorisedWords,
  at,
  onItemChosen,
  onClosed,
  actionsBesideTheField = [],
  previewOfTheItem,
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
  /** What the entry of the items filed under no category is called, as "Ungrouped". */
  uncategorisedWords: string;
  /** Its top-left corner, in pixels of the element it opens over. */
  at: { x: number; y: number };
  /** `staysOpen` is set when ⇧↵ chose it. */
  onItemChosen: (itemId: string, staysOpen: boolean) => void;
  onClosed: () => void;
  actionsBesideTheField?: readonly SearchPopoverAction[];
  /** What the highlighted item looks like once chosen, drawn beside the popover; `null` for an item with nothing to show. */
  previewOfTheItem?: (itemId: string) => ReactNode;
} & ControlDataAttributes) {
  const [searchText, setSearchText] = useState("");
  const [entryChoice, setEntryChoice] = useState<SearchPopoverEntryChoice>({ kind: "the_entry_it_opens_on" });
  const [isOpenByEntryId, setIsOpenByEntryId] = useState<Readonly<Record<string, boolean>>>({});
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const matchingItems = useMemo(() => searchPopoverItemsMatching(items, searchText), [items, searchText]);
  const entries = useMemo(() => searchPopoverEntries(items, matchingItems, uncategorisedWords), [items, matchingItems, uncategorisedWords]);
  const entryItOpensOn = useMemo(() => searchPopoverEntryItOpensOn(searchPopoverEntries(items, items, uncategorisedWords)), [items, uncategorisedWords]);
  const chosenEntryId = entryChoice.kind === "chosen" ? entryChoice.entry_id : entryChoice.kind === "every_entry" ? null : entryItOpensOn;
  const sectionsShown = useMemo(
    (): SearchPopoverSection[] => (narrowedTo !== null ? [{ heading: null, items: matchingItems }] : searchPopoverSectionsShown(matchingItems, chosenEntryId, uncategorisedWords)),
    [matchingItems, chosenEntryId, narrowedTo, uncategorisedWords],
  );
  const shownItems = useMemo(() => sectionsShown.flatMap((section) => section.items), [sectionsShown]);
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

  const highlightedId = highlighted?.item_id ?? null;
  useEffect(() => {
    if (highlightedId === null) return;
    popoverElement.current?.querySelector(`[data-search-popover-item="${CSS.escape(highlightedId)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedId]);

  const preview = highlightedId === null || previewOfTheItem === undefined ? null : previewOfTheItem(highlightedId);
  const hasAPreview = preview !== null && preview !== undefined && preview !== false;
  const sideThePreviewIsDrawnOnFirst = narrowedTo === null ? "right" : "left";
  const [previewPlace, setPreviewPlace] = useState<{ side: "left" | "right"; top: number }>({ side: sideThePreviewIsDrawnOnFirst, top: 0 });
  useLayoutEffect(() => {
    const popover = popoverElement.current;
    if (popover === null || highlightedId === null || !hasAPreview) return;
    const elementItOpensOver = popover.offsetParent;
    const highlightedRow = popover.querySelector(`[data-search-popover-item="${CSS.escape(highlightedId)}"]`);
    const roomOnTheLeft = popover.offsetLeft;
    const roomOnTheRight = (elementItOpensOver instanceof HTMLElement ? elementItOpensOver.clientWidth : 0) - popover.offsetLeft - popover.offsetWidth;
    const side = searchPopoverPreviewSide(sideThePreviewIsDrawnOnFirst, roomOnTheLeft, roomOnTheRight, SEARCH_POPOVER_PREVIEW_ROOM_PX);
    const top = highlightedRow === null ? 0 : Math.max(0, Math.min(highlightedRow.getBoundingClientRect().top - popover.getBoundingClientRect().top, popover.offsetHeight));
    setPreviewPlace((place) => (place.side === side && place.top === top ? place : { side, top }));
  }, [highlightedId, hasAPreview, sideThePreviewIsDrawnOnFirst, sectionsShown, at.x, at.y]);

  const entriesShown = searchPopoverEntriesShown(entries, isOpenByEntryId);
  const isAnyEntryHoldingCategories = entries.some((entry) => entry.holds_categories);
  const chooseTheEntry = (entry: SearchPopoverEntry) => {
    setEntryChoice({ kind: "chosen", entry_id: entry.entry_id });
    setIsOpenByEntryId((isOpen) => ({ ...isOpen, [entry.entry_id]: true }));
    setHighlightedItemId(null);
    searchInput.current?.focus();
  };

  return (
    <div
      ref={popoverElement}
      role="dialog"
      aria-label={label}
      className="absolute z-20"
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
      <div className="flex size-full max-h-[inherit] flex-col overflow-hidden rounded-lg border border-line-strong bg-raised shadow-(--shadow-pop)">
        <div className="flex items-center gap-1.5 border-b p-2">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-window px-2 focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_var(--ring)]">
            <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
            <input
              ref={searchInput}
              autoFocus
              value={searchText}
              onChange={(changeEvent) => {
                setSearchText(changeEvent.target.value);
                setEntryChoice({ kind: changeEvent.target.value.trim() === "" ? "the_entry_it_opens_on" : "every_entry" });
              }}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
                  keyboardEvent.preventDefault();
                  setHighlightedItemId(searchPopoverItemAfterAnArrow(sectionsShown, highlightedId, keyboardEvent.key === "ArrowDown" ? "down" : "up"));
                } else if (keyboardEvent.key === "Enter") {
                  keyboardEvent.preventDefault();
                  if (highlightedId !== null) onItemChosen(highlightedId, keyboardEvent.shiftKey);
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
              aria-activedescendant={highlightedId === null ? undefined : optionIdOf(highlightedId)}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:shadow-none"
            />
          </div>
          {actionsBesideTheField.map((action) => (
            <IconButton
              key={action.label}
              icon={action.icon}
              label={action.label}
              onPressed={() => {
                onClosed();
                action.onPressed();
              }}
              data-search-popover-action={action.label}
            />
          ))}
        </div>
        <div className="flex min-h-0 flex-1">
          {narrowedTo === null && (
            <nav aria-label="Categories" className="scrollbar-thin flex w-44 shrink-0 flex-col gap-px overflow-y-auto border-r p-1.5">
              {entriesShown.map((entry, entryIndex) => (
                <SearchPopoverEntryRow
                  key={entry.entry_id}
                  entry={entry}
                  isChosen={chosenEntryId === entry.entry_id}
                  isOpen={isOpenByEntryId[entry.entry_id] === true}
                  leavesRoomForAnOpener={isAnyEntryHoldingCategories}
                  isFirstUnderTheEntriesAbove={entry.kind !== "above_the_categories" && entriesShown[entryIndex - 1]?.kind === "above_the_categories"}
                  onChosen={() => chooseTheEntry(entry)}
                  onOpenedOrClosed={(isOpen) => setIsOpenByEntryId((isOpenNow) => ({ ...isOpenNow, [entry.entry_id]: isOpen }))}
                />
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
            <SearchPopoverList listId={listId} label={label} sections={sectionsShown} highlightedItemId={highlightedId} optionIdOf={optionIdOf} onItemHighlighted={setHighlightedItemId} onItemChosen={onItemChosen} />
          </div>
        </div>
        {narrowedTo !== null && <p className="border-t px-3 py-2 text-2xs text-fg-3">{narrowedTo.footnote}</p>}
      </div>
      {hasAPreview && highlightedId !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute w-max"
          style={{ top: previewPlace.top, [previewPlace.side === "right" ? "left" : "right"]: `calc(100% + ${SEARCH_POPOVER_PREVIEW_GAP_PX}px)` }}
          data-search-popover-preview={highlightedId}
          data-search-popover-preview-side={previewPlace.side}
        >
          {preview}
        </div>
      )}
    </div>
  );
}

/** One row of the left-hand list: the entry's words and how many matches it lists; a category that holds categories opens and closes from the mark before its words. */
function SearchPopoverEntryRow({
  entry,
  isChosen,
  isOpen,
  leavesRoomForAnOpener,
  isFirstUnderTheEntriesAbove,
  onChosen,
  onOpenedOrClosed,
}: {
  entry: SearchPopoverEntry;
  isChosen: boolean;
  isOpen: boolean;
  /** Whether any entry opens and closes, so every entry's words line up after the mark's place. */
  leavesRoomForAnOpener: boolean;
  /** Whether a divider is drawn over it, as over the first category under the entries above the categories. */
  isFirstUnderTheEntriesAbove: boolean;
  onChosen: () => void;
  onOpenedOrClosed: (isOpen: boolean) => void;
}) {
  const OpenerMark = isOpen ? ChevronDown : ChevronRight;
  return (
    <>
      {isFirstUnderTheEntriesAbove && <div role="separator" className="mx-1 my-1.5 h-px shrink-0 bg-line" />}
      <div
        className={cn("flex h-6.5 shrink-0 items-center rounded-md text-xs text-fg-2 hover:bg-hover", isChosen && "bg-selected text-fg")}
        style={{ paddingLeft: Math.max(0, entry.category_path.length - 1) * SEARCH_POPOVER_CATEGORY_INDENT_PX }}
      >
        {entry.holds_categories ? (
          <button
            type="button"
            aria-label={`${entry.words} categories`}
            aria-expanded={isOpen}
            onClick={() => onOpenedOrClosed(!isOpen)}
            className="ml-1 flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-3 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
            data-search-popover-entry-opener={entry.entry_id}
          >
            <OpenerMark className="size-3" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          leavesRoomForAnOpener && <span className="ml-1 size-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          aria-pressed={isChosen}
          onClick={onChosen}
          className={cn("flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-md pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", leavesRoomForAnOpener ? "pl-1" : "pl-2")}
          data-search-popover-entry={entry.entry_id}
        >
          <span className="min-w-0 truncate">{entry.words}</span>
          <span className="shrink-0 text-fg-3 tabular-nums">{entry.match_count}</span>
        </button>
      </div>
    </>
  );
}

/** The popover's matching items under their headings, the highlighted one marked: each a title over where it comes from. */
function SearchPopoverList({
  listId,
  label,
  sections,
  highlightedItemId,
  optionIdOf,
  onItemHighlighted,
  onItemChosen,
}: {
  listId: string;
  label: string;
  sections: readonly SearchPopoverSection[];
  highlightedItemId: string | null;
  optionIdOf: (itemId: string) => string;
  onItemHighlighted: (itemId: string) => void;
  onItemChosen: (itemId: string, staysOpen: boolean) => void;
}) {
  return (
    <ul id={listId} role="listbox" aria-label={label} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-1">
      {sections.map(({ heading, items: sectionItems }) => (
        <li key={heading ?? ""} role="presentation">
          {heading !== null && (
            <div className={SECTION_HEADING_CLASS_NAMES} aria-hidden data-search-popover-section-heading="">
              {heading}
            </div>
          )}
          <ul role="group" aria-label={heading ?? label}>
            {sectionItems.map((item) => (
              <li
                key={item.item_id}
                id={optionIdOf(item.item_id)}
                role="option"
                aria-selected={item.item_id === highlightedItemId}
                data-search-popover-item={item.item_id}
                onPointerMove={() => onItemHighlighted(item.item_id)}
                onClick={(clickEvent) => onItemChosen(item.item_id, clickEvent.shiftKey)}
                className={cn("flex h-10 min-w-0 cursor-default flex-col justify-center rounded-md px-2 text-fg-2", item.item_id === highlightedItemId && "bg-selected text-fg")}
              >
                <span className="min-w-0 truncate text-sm leading-4">{item.title}</span>
                {item.origin_words !== null && (
                  <span className="min-w-0 truncate text-2xs leading-3.5 text-fg-3" data-search-popover-item-origin="">
                    {item.origin_words}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
