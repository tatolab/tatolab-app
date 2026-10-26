import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ControlDataAttributes } from "./control_data_attributes";
import { ICON_BUTTON_CLASS_NAMES } from "./icon_button";

/**
 * A task done over the window rather than on a page of its own: its title and what it does above, a close button,
 * the task's body scrolling between, and its actions fixed in the footer. Escape or a click outside closes it too.
 */
export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  footer,
  children,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
} & ControlDataAttributes) {
  // Opening focuses the body, not the close button, so Tab moves on to the task's first control.
  const bodyElement = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={bodyElement}
        showCloseButton={false}
        className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden bg-window p-0 sm:max-w-2xl"
        {...controlDataAttributes}
      >
        <div className="flex shrink-0 items-start gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg leading-6 font-medium">{title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-fg-3">{description}</DialogDescription>
          </div>
          <DialogClose render={<Button variant="ghost" size="icon-sm" className={ICON_BUTTON_CLASS_NAMES} />} aria-label="Close" data-form-dialog-close="">
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </DialogClose>
        </div>
        <div ref={bodyElement} tabIndex={-1} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-6 focus-visible:shadow-none">
          {children}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
