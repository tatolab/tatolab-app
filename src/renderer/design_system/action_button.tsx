import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** How an action button reads: primary (blue, the one action a place leads with), secondary (outlined), quiet (no frame until hovered) or destructive (red). */
export type ActionButtonAppearance = "primary" | "secondary" | "quiet" | "destructive";

const STOCK_VARIANT_OF_APPEARANCE = { primary: "default", secondary: "outline", quiet: "ghost", destructive: "destructive" } as const;

const APPEARANCE_CLASS_NAMES: Record<ActionButtonAppearance, string> = {
  primary: "",
  secondary: "border-line-strong bg-raised text-fg hover:bg-hover dark:border-line-strong dark:bg-raised dark:hover:bg-hover",
  quiet: "text-fg-2 hover:bg-hover hover:text-fg dark:hover:bg-hover",
  destructive:
    "bg-danger text-primary-foreground hover:bg-danger-text focus-visible:border-transparent dark:bg-danger-soft dark:text-danger-text dark:hover:bg-danger/20",
};

/** The text and icon sizes the window's controls take over stock's: stock's small size sets its words at 0.8rem, under the window's 13 px body text. */
const SIZE_CLASS_NAMES = {
  regular: "gap-1.5 rounded-md text-sm [&_svg:not([class*='size-'])]:size-3.5",
  small: "gap-1 rounded-md text-xs [&_svg:not([class*='size-'])]:size-3.5",
} as const;

/** A button that runs an action, named by its words and an optional icon before them. */
export function ActionButton({
  appearance = "secondary",
  size = "regular",
  icon: ButtonIcon,
  label,
  tooltip,
  isDisabled = false,
  hasFocusOnOpen = false,
  onPressed,
  className,
  children,
  ...controlDataAttributes
}: {
  appearance?: ActionButtonAppearance;
  size?: keyof typeof SIZE_CLASS_NAMES;
  icon?: LucideIcon;
  /** The button's accessible name, where its words alone would not say what it does. */
  label?: string;
  /** What the button does, said beside it while the pointer rests on it. */
  tooltip?: ReactNode;
  isDisabled?: boolean;
  /** Takes keyboard focus when it first shows, as a dialog's safe choice does. */
  hasFocusOnOpen?: boolean;
  onPressed: () => void;
  /** A one-off adjustment where the button is used. */
  className?: string;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <WithControlTooltip
      tooltip={tooltip}
      isWide
      control={
        <Button
          variant={STOCK_VARIANT_OF_APPEARANCE[appearance]}
          size={size === "regular" ? "sm" : "xs"}
          aria-label={label}
          disabled={isDisabled}
          autoFocus={hasFocusOnOpen}
          onClick={onPressed}
          className={cn(APPEARANCE_CLASS_NAMES[appearance], SIZE_CLASS_NAMES[size], FULL_STRENGTH_FOCUS_RING_CLASS_NAMES, className)}
          {...controlDataAttributes}
        >
          {ButtonIcon !== undefined && <ButtonIcon strokeWidth={1.75} aria-hidden />}
          {children}
        </Button>
      }
    />
  );
}
