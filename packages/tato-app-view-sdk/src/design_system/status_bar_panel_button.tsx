import { cn } from "cn";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "./ui/popover";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/**
 * A phrase of a window's status bar that opens a panel above it when pressed: with a spinner while `isBusy`, in the danger
 * colour while `isFailing`, and the panel titled `panelTitle` with `panelActions` beside the title. With `icon`, the button shows
 * only the icon and its `words` are read to a screen reader. `isOpen` and `onOpenChange` let the screen open it too; opened that way,
 * with `takesFocusOnOpen` false, it leaves the keyboard focus where the person had it.
 */
export function StatusBarPanelButton({
  words,
  icon,
  isBusy,
  isFailing,
  panelTitle,
  panelActions,
  isOpen,
  onOpenChange,
  takesFocusOnOpen,
  children,
  ...controlDataAttributes
}: {
  words: string;
  icon?: ReactNode;
  isBusy: boolean;
  isFailing: boolean;
  panelTitle: string;
  panelActions?: ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  takesFocusOnOpen: boolean;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-5 items-center gap-1.5 rounded-[3px] px-1.5 text-2xs outline-none hover:bg-hover",
          isFailing ? "text-danger-text" : "text-fg-2",
          FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        )}
        {...controlDataAttributes}
      >
        {isBusy && <LoaderCircle className="size-3 animate-spin" strokeWidth={1.75} aria-hidden />}
        {icon}
        <span role="status" className={cn(icon !== undefined && "sr-only")}>
          {words}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        initialFocus={takesFocusOnOpen}
        finalFocus={takesFocusOnOpen}
        className="max-h-96 w-80 gap-1 overflow-y-auto p-3"
      >
        <PopoverHeader className="flex-row items-center justify-between">
          <PopoverTitle className="text-xs">{panelTitle}</PopoverTitle>
          {panelActions}
        </PopoverHeader>
        {children}
      </PopoverContent>
    </Popover>
  );
}
