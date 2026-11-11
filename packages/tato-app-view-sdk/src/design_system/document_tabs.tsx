import { cn } from "cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { studioIconNamed, type StudioIconName } from "./support/studio_icons";

/** One open document's tab: its id and its name. */
export interface DocumentTab {
  tab_id: string;
  name: string;
}

/** The open documents' tabs along the bottom of the window's title row, each led by `icon`; the active one is the colour of the work under it, so the two read as one, and only it, or a tab under the pointer, shows the × that closes it. */
export function DocumentTabs({
  label,
  icon,
  tabs,
  activeTabId,
  onTabChosen,
  onTabClosed,
  whenNoneIsOpen,
}: {
  label: string;
  icon: StudioIconName;
  tabs: readonly DocumentTab[];
  activeTabId: string | null;
  onTabChosen: (tabId: string) => void;
  onTabClosed: (tabId: string) => void;
  /** What the row says while no tab is open. */
  whenNoneIsOpen: ReactNode;
}) {
  const Icon = studioIconNamed(icon);
  if (tabs.length === 0) return <p className="flex h-full min-w-0 items-center px-2 text-2xs text-fg-3"><span className="truncate">{whenNoneIsOpen}</span></p>;
  return (
    <div role="tablist" aria-label={label} className="flex h-full min-w-0 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((tab) => {
        const isActive = tab.tab_id === activeTabId;
        return (
          <div
            key={tab.tab_id}
            className={cn(
              "group flex h-7.5 max-w-50 shrink-0 items-center rounded-t-lg pr-1.5 text-xs",
              isActive ? "bg-studio-frame text-fg" : "text-fg-3 hover:bg-studio-frame/50 hover:text-fg-2",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChosen(tab.tab_id)}
              data-document-tab={tab.tab_id}
              className={cn("flex h-full min-w-0 items-center gap-1.5 rounded-t-lg pl-3 outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
            >
              <Icon className={cn("size-3.5 shrink-0", isActive ? "text-fg-2" : "text-fg-3")} strokeWidth={1.75} aria-hidden />
              <span className="truncate">{tab.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={() => onTabClosed(tab.tab_id)}
              data-document-tab-close={tab.tab_id}
              className={cn(
                "ml-1.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-3 outline-none hover:bg-hover hover:text-fg",
                !isActive && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
              )}
            >
              <X className="size-3" strokeWidth={2} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
