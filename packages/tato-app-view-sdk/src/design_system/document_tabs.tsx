import { cn } from "cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** One open document's tab: its id, the quiet words it sits under, and its name. */
export interface DocumentTab {
  tab_id: string;
  /** Where the document belongs, before its name, as a stream's project. */
  context_words: string;
  name: string;
}

/** The open documents' tabs along the top of the work, the active one joined to the areas under it; each closes from its ×. */
export function DocumentTabs({
  label,
  tabs,
  activeTabId,
  onTabChosen,
  onTabClosed,
  whenNoneIsOpen,
}: {
  label: string;
  tabs: readonly DocumentTab[];
  activeTabId: string | null;
  onTabChosen: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  /** What the strip says while no tab is open. */
  whenNoneIsOpen: ReactNode;
}) {
  return (
    <div className="flex h-(--studio-stream-tabs-height) shrink-0 items-end gap-0.5 bg-studio-stream-tabs px-2">
      {tabs.length === 0 ? (
        <p className="flex h-full items-center px-2 text-2xs text-fg-3">{whenNoneIsOpen}</p>
      ) : (
        <div role="tablist" aria-label={label} className="flex min-w-0 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.tab_id === activeTabId;
            return (
              <div
                key={tab.tab_id}
                className={cn("group flex h-7 shrink-0 items-center rounded-t-[7px] pr-1 text-xs", isActive ? "bg-studio-area text-fg" : "text-fg-2 hover:bg-hover")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTabChosen(tab.tab_id)}
                  data-document-tab={tab.tab_id}
                  className={cn("flex h-full items-center gap-1.5 rounded-t-[7px] pl-3 outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
                >
                  <span className="text-fg-3">{tab.context_words} /</span>
                  <span className="font-mono text-2xs">{tab.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.name}`}
                  onClick={() => onTabClosed(tab.tab_id)}
                  className={cn(
                    "ml-1 flex size-4 items-center justify-center rounded-sm text-fg-3 opacity-0 outline-none group-hover:opacity-100 hover:bg-hover hover:text-fg focus-visible:opacity-100",
                    isActive && "opacity-100",
                    FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
                  )}
                >
                  <X className="size-3" strokeWidth={2} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
