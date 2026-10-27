import { X, type LucideIcon } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
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
  icon: TaskIcon,
  footer,
  children,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: ReactNode;
  /** Drawn large above the body, the task's picture. */
  icon?: LucideIcon;
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
        className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden bg-window p-0 sm:max-w-xl"
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
          {TaskIcon !== undefined && (
            <div className="flex justify-center pt-2 pb-6">
              <span className="grid size-14 place-items-center rounded-full bg-well">
                <TaskIcon className="size-6 text-fg-3" strokeWidth={1.5} aria-hidden />
              </span>
            </div>
          )}
          {children}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}

/** A form dialog's footer: only its actions, in a row under a hairline. */
export function FormDialogFooter({ children }: { children: ReactNode }) {
  return <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t px-6 py-3">{children}</footer>;
}

/** A form dialog's rows, hairlines between them, each a label on the left and its value or control on the right. */
export function FormDialogRows({ children }: { children: ReactNode }) {
  return <div className="divide-y border-y">{children}</div>;
}

/** A titled group of a form dialog's rows below its first, as the optional settings under Additional options. */
export function FormDialogRowsSection({ title, children, ...controlDataAttributes }: { title: string; children: ReactNode } & ControlDataAttributes) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="mt-6" {...controlDataAttributes}>
      <h3 id={titleId} className="mb-1.5 label-caps">
        {title}
      </h3>
      <FormDialogRows>{children}</FormDialogRows>
    </section>
  );
}

/** One row of a form dialog: what it sets on the left, its value or control on the right, and what was said about it under both. */
export function FormDialogRow({
  label,
  labelFor,
  below,
  children,
  ...controlDataAttributes
}: {
  label: string;
  /** The control's id, where the value is a field the label names. */
  labelFor?: string;
  below?: ReactNode;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <div className="py-2" {...controlDataAttributes}>
      <div className="flex min-h-9 items-center justify-between gap-6">
        {labelFor === undefined ? (
          <span className="shrink-0 text-fg-2">{label}</span>
        ) : (
          <label htmlFor={labelFor} className="shrink-0 text-fg-2">
            {label}
          </label>
        )}
        <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
      </div>
      {below}
    </div>
  );
}
