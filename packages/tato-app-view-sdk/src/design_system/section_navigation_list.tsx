import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributeName } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** One section a list leads to: its id, its name, its icon, and how many things it holds where that is counted. */
export interface NavigationSection {
  section_id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

/** Where a section list sits: down a dialog's side, or down a window's side as its sidebar. */
export type SectionNavigationListPlacement = "dialog" | "window";

const SECTION_NAVIGATION_LIST_PLACEMENT_CLASS_NAMES: Record<SectionNavigationListPlacement, string> = {
  dialog: "px-2 pt-3",
  window: "px-3 pt-6",
};

/** How wide a section list is: regular for short names, wide for longer ones and counts, or a window's sidebar. */
export type SectionNavigationListWidth = "regular" | "wide" | "sidebar";

const SECTION_NAVIGATION_LIST_WIDTH_CLASS_NAMES: Record<SectionNavigationListWidth, string> = {
  regular: "w-48",
  wide: "w-56",
  sidebar: "w-55",
};

/** A view's own list of its sections, in named groups, down its left side beside the section shown, the shown one selected, over an optional footer at its foot. */
export function SectionNavigationList({
  label,
  sectionGroups,
  shownSectionId,
  onSectionChosen,
  dataAttributeOfEachSection,
  footer,
  placement = "dialog",
  width = "regular",
}: {
  label: string;
  sectionGroups: readonly { groupLabel: string; sections: readonly NavigationSection[] }[];
  shownSectionId: string;
  onSectionChosen: (sectionId: string) => void;
  /** Set on each section's button to its id, as `data-settings-section="runtime"`. */
  dataAttributeOfEachSection: ControlDataAttributeName;
  /** What sits at the list's foot, as the app's name and its Preferences. */
  footer?: ReactNode;
  placement?: SectionNavigationListPlacement;
  width?: SectionNavigationListWidth;
}) {
  return (
    <nav aria-label={label} className={cn("scrollbar-thin flex shrink-0 flex-col gap-5 overflow-y-auto border-r pb-4", SECTION_NAVIGATION_LIST_PLACEMENT_CLASS_NAMES[placement], SECTION_NAVIGATION_LIST_WIDTH_CLASS_NAMES[width])}>
      {sectionGroups.map(({ groupLabel, sections }) => (
        <section key={groupLabel}>
          <h2 className="label-caps flex h-8 items-center px-2">{groupLabel}</h2>
          {sections.map(({ section_id, label: sectionLabel, icon: SectionIcon, count }) => (
            <button
              key={section_id}
              type="button"
              aria-current={section_id === shownSectionId ? "page" : undefined}
              onClick={() => onSectionChosen(section_id)}
              {...{ [dataAttributeOfEachSection]: section_id }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-fg outline-none hover:bg-hover",
                FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
                section_id === shownSectionId && "bg-selected",
              )}
            >
              <SectionIcon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
              <span className="truncate">{sectionLabel}</span>
              {count !== undefined && <span className="ml-auto text-xs text-fg-3 tabular-nums">{count}</span>}
            </button>
          ))}
        </section>
      ))}
      {footer !== undefined && <div className="mt-auto">{footer}</div>}
    </nav>
  );
}
