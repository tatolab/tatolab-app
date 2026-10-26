import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** What a list row button passes on to its element, beyond its own props: its state for a screen reader, and the pointer and focus its place follows. */
type ListRowButtonElementProps = Pick<
  ComponentProps<"button">,
  "aria-label" | "aria-describedby" | "aria-expanded" | "aria-pressed" | "aria-current" | "onMouseEnter" | "onMouseLeave" | "onFocus" | "onBlur" | "style"
>;

/** How a row's icon reads: quiet beside its words, or in the danger colour for a row that holds a failure. */
export type ListRowIconTone = "quiet" | "danger";

const ICON_TONE_CLASS_NAMES: Record<ListRowIconTone, string> = { quiet: "text-fg-3", danger: "text-danger" };

/**
 * A row of a list or panel that acts when pressed: its icon, its words, and what trails them; filled while selected,
 * never because it is expanded, and dim while it cannot act.
 */
export function ListRowButton({
  icon: RowIcon,
  iconTone = "quiet",
  isSelected = false,
  isDisabled = false,
  trailing,
  onPressed,
  className,
  children,
  ...elementProps
}: {
  icon?: LucideIcon;
  iconTone?: ListRowIconTone;
  isSelected?: boolean;
  isDisabled?: boolean;
  trailing?: ReactNode;
  onPressed: () => void;
  /** A one-off adjustment where the row is used. */
  className?: string;
  children: ReactNode;
} & ListRowButtonElementProps &
  ControlDataAttributes) {
  return (
    <Button
      variant="ghost"
      disabled={isDisabled}
      onClick={onPressed}
      className={cn(
        "group/list-row h-7 w-full min-w-0 justify-start gap-2 rounded-md px-2 text-left font-normal text-fg-2 hover:bg-hover hover:text-fg active:not-aria-[haspopup]:translate-y-0 aria-expanded:bg-transparent aria-expanded:hover:bg-hover dark:hover:bg-hover",
        isSelected && "bg-selected text-fg hover:bg-selected aria-expanded:bg-selected aria-expanded:hover:bg-selected dark:hover:bg-selected",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        className,
      )}
      {...elementProps}
    >
      {RowIcon !== undefined && <RowIcon className={cn("size-4 shrink-0", ICON_TONE_CLASS_NAMES[iconTone])} strokeWidth={1.75} aria-hidden />}
      {children}
      {trailing}
    </Button>
  );
}
