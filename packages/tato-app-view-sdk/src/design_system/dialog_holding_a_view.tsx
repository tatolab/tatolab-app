import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { DialogOverTheWindow } from "./dialog_over_the_window";

/** A dialog over the window that holds one view, as the asset picker holds the Library: its title and a close button over the view, which fills the rest. */
export function DialogHoldingAView({ isOpen, onOpenChange, title, children, ...controlDataAttributes }: { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; title: string; children: ReactNode } & ControlDataAttributes) {
  return (
    <DialogOverTheWindow isOpen={isOpen} onOpenChange={onOpenChange} title={title} width="wider" {...controlDataAttributes}>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </DialogOverTheWindow>
  );
}
