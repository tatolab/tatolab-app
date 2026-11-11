import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { ICON_BUTTON_CLASS_NAMES } from "./icon_button";
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex h-[min(640px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden bg-window p-0 sm:max-w-3xl" {...controlDataAttributes}>
        <div className="flex h-11 shrink-0 items-center border-b pr-2 pl-4">
          <DialogTitle className="flex-1 text-sm font-medium">{title}</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" className={ICON_BUTTON_CLASS_NAMES} />} aria-label="Close">
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </DialogClose>
        </div>
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
      </DialogContent>
    </Dialog>
  );
}
