import { cn } from "cn";
import { Link } from "react-router";
import type { ControlDataAttributeName } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** One tab of a page: its words, the path it shows, and why it cannot be shown now, if it cannot. */
export interface PageTab<TabKey extends string> {
  tab: TabKey;
  label: string;
  path: string;
  /** What the tooltip says, when it says more than the tab's words (its shortcut). */
  tooltip?: string;
  disabledReason?: string | null;
}

/** A view's tabs in its bar, each a link to its path; the shown one filled, one that cannot be shown dimmed with its reason. */
export function PageTabs<TabKey extends string>({
  label,
  tabs,
  shownTab,
  dataAttributeOfEachTab,
}: {
  label: string;
  tabs: readonly PageTab<TabKey>[];
  shownTab: TabKey;
  /** Set on each tab to its key, as `data-stream-tab="logs"`. */
  dataAttributeOfEachTab?: ControlDataAttributeName;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {tabs.map(({ tab, label: tabLabel, path, tooltip, disabledReason }) => {
        const tabClassNames = "flex h-7 items-center rounded-md px-3";
        if (disabledReason !== undefined && disabledReason !== null) {
          return (
            <span key={tab} aria-disabled title={`${tabLabel}: ${disabledReason}`} className={cn(tabClassNames, "cursor-default text-fg-4")}>
              {tabLabel}
            </span>
          );
        }
        return (
          <Link
            key={tab}
            to={path}
            aria-current={tab === shownTab ? "page" : undefined}
            title={tooltip ?? tabLabel}
            className={cn(
              tabClassNames,
              "cursor-default outline-none transition-colors",
              tab === shownTab ? "bg-selected text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
              FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
            )}
            {...(dataAttributeOfEachTab === undefined ? {} : { [dataAttributeOfEachTab]: tab })}
          >
            {tabLabel}
          </Link>
        );
      })}
    </nav>
  );
}
