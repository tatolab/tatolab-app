import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { DialogOverTheWindow } from "./dialog_over_the_window";
import { SectionNavigationList, type NavigationSection } from "./section_navigation_list";

/** A dialog of several sections over the window, as Settings: its title and a close button, its sections' list down the left, the shown section scrolling beside it. */
export function SectionedDialog({
  isOpen,
  onOpenChange,
  title,
  sectionGroups,
  shownSectionId,
  onSectionChosen,
  children,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  sectionGroups: readonly { groupLabel: string; sections: readonly NavigationSection[] }[];
  shownSectionId: string;
  onSectionChosen: (sectionId: string) => void;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <DialogOverTheWindow isOpen={isOpen} onOpenChange={onOpenChange} title={title} width="wide" {...controlDataAttributes}>
      <div className="flex min-h-0 flex-1">
        <SectionNavigationList
          label={title}
          sectionGroups={sectionGroups}
          shownSectionId={shownSectionId}
          onSectionChosen={onSectionChosen}
          dataAttributeOfEachSection="data-settings-section"
        />
        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto px-6 pt-5 pb-8">{children}</div>
      </div>
    </DialogOverTheWindow>
  );
}
