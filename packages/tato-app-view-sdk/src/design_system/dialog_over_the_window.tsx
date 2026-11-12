import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { ICON_BUTTON_CLASS_NAMES } from "./icon_button";

/** How wide a dialog over the window is: wide for sections, wider for a view it holds. */
export type DialogOverTheWindowWidth = "wide" | "wider";

const DIALOG_OVER_THE_WINDOW_WIDTH_CLASS_NAMES: Record<DialogOverTheWindowWidth, string> = { wide: "sm:max-w-3xl", wider: "sm:max-w-4xl" };

/** A tall dialog over the window: its title and a close button in a row over `children`, which fill the rest. */
export function DialogOverTheWindow({
  isOpen,
  onOpenChange,
  title,
  width,
  children,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  width: DialogOverTheWindowWidth;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={`flex h-[min(640px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden bg-window p-0 ${DIALOG_OVER_THE_WINDOW_WIDTH_CLASS_NAMES[width]}`} {...controlDataAttributes}>
        <div className="flex h-11 shrink-0 items-center border-b pr-2 pl-4">
          <DialogTitle className="flex-1 text-sm font-medium">{title}</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" className={ICON_BUTTON_CLASS_NAMES} />} aria-label="Close">
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </DialogClose>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
