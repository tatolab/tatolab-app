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

/** A page's own list of its sections, in named groups, on the chrome beside the section shown, the shown one selected. */
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
    <nav aria-label={label} className="scrollbar-thin flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-chrome px-2 pt-4 pb-4">
      {sectionGroups.map(({ groupLabel, sections }) => (
        <section key={groupLabel}>
          <h2 className="label-caps px-2 pb-1">{groupLabel}</h2>
          {sections.map(({ path, label: sectionLabel, icon: SectionIcon, dataValue }) => (
            <NavLink
              key={path}
              to={path}
              {...{ [dataAttributeOfEachSection]: dataValue }}
              className={({ isActive }) =>
                cn(
                  "flex h-7 items-center gap-2 rounded-md px-2 text-fg outline-none hover:bg-hover",
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
