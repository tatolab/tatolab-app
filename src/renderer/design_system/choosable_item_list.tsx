import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributeName } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** One item a list offers: its id, its title, a quiet line under it, and what trails its title. */
export interface ChoosableItem {
  item_id: string;
  title: string;
  summary: string;
  trailing?: ReactNode;
}

/** A list of items down the side of the item shown at length beside it, each a title over a quiet line, the chosen one selected. */
export function ChoosableItemList({
  label,
  items,
  chosenItemId,
  onItemChosen,
  dataAttributeOfEachItem,
}: {
  label: string;
  items: readonly ChoosableItem[];
  chosenItemId: string | null;
  onItemChosen: (itemId: string) => void;
  /** Set on each item's button to its id, as `data-get-more-row="camera-halftone"`. */
  dataAttributeOfEachItem: ControlDataAttributeName;
}) {
  return (
    <ul aria-label={label} className="scrollbar-thin w-72 shrink-0 overflow-y-auto border-r p-1">
      {items.map(({ item_id, title, summary, trailing }) => (
        <li key={item_id}>
          <button
            type="button"
            aria-current={item_id === chosenItemId || undefined}
            onClick={() => onItemChosen(item_id)}
            {...{ [dataAttributeOfEachItem]: item_id }}
            className={cn(
              "flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left outline-none hover:bg-hover",
              FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
              item_id === chosenItemId && "bg-selected",
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[13px] text-fg">{title}</span>
              {trailing !== undefined && <span className="ml-auto shrink-0 text-2xs text-fg-3">{trailing}</span>}
            </span>
            <span className="w-full truncate text-xs text-fg-3">{summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
