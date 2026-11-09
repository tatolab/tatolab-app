import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ControlDataAttributeName } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** One section a list leads to: its id, its name, and its icon. */
export interface NavigationSection {
  section_id: string;
  label: string;
  icon: LucideIcon;
}

/** A view's own list of its sections, in named groups, down its left side beside the section shown, the shown one selected. */
export function SectionNavigationList({
  label,
  sectionGroups,
  shownSectionId,
  onSectionChosen,
  dataAttributeOfEachSection,
}: {
  label: string;
  sectionGroups: readonly { groupLabel: string; sections: readonly NavigationSection[] }[];
  shownSectionId: string;
  onSectionChosen: (sectionId: string) => void;
  /** Set on each section's button to its id, as `data-settings-section="runtime"`. */
  dataAttributeOfEachSection: ControlDataAttributeName;
}) {
  return (
    <nav aria-label={label} className="scrollbar-thin flex w-48 shrink-0 flex-col gap-5 overflow-y-auto border-r px-2 pt-3 pb-4">
      {sectionGroups.map(({ groupLabel, sections }) => (
        <section key={groupLabel}>
          <h2 className="label-caps flex h-8 items-center px-2">{groupLabel}</h2>
          {sections.map(({ section_id, label: sectionLabel, icon: SectionIcon }) => (
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
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}
