import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";
import type { ControlDataAttributeName } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** One section a page's list leads to: where it is, its name, and its icon. */
export interface NavigationSection {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Set on its link as the list's data attribute, as `data-settings-section="runtime"`. */
  dataValue: string;
}

/** A view's own list of its sections, in named groups, down its left side beside the section shown, the shown one selected. */
export function SectionNavigationList({
  label,
  sectionGroups,
  dataAttributeOfEachSection,
}: {
  label: string;
  sectionGroups: readonly { groupLabel: string; sections: readonly NavigationSection[] }[];
  dataAttributeOfEachSection: ControlDataAttributeName;
}) {
  return (
    <nav aria-label={label} className="scrollbar-thin flex w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r px-2 pt-3 pb-4">
      {sectionGroups.map(({ groupLabel, sections }) => (
        <section key={groupLabel}>
          <h2 className="label-caps flex h-8 items-center px-2">{groupLabel}</h2>
          {sections.map(({ path, label: sectionLabel, icon: SectionIcon, dataValue }) => (
            <NavLink
              key={path}
              to={path}
              {...{ [dataAttributeOfEachSection]: dataValue }}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-fg outline-none hover:bg-hover",
                  FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
                  isActive && "bg-selected",
                )
              }
            >
              <SectionIcon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
              <span className="truncate">{sectionLabel}</span>
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}
