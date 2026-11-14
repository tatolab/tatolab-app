import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** An icon button's size: regular in toolbars, title bars and rows; compact beside a heading or in a small header. */
export type IconButtonSize = "regular" | "compact";

/** The look every icon-only control shares, the menu buttons that open from one included. */
export const ICON_BUTTON_CLASS_NAMES = cn(
  "rounded-md text-fg-3 aria-expanded:bg-selected aria-expanded:text-fg data-popup-open:bg-selected data-popup-open:text-fg",
  "hover:bg-selected hover:text-brand-text hover:shadow-(--icon-button-hover-ring) dark:hover:bg-selected hover:data-popup-open:bg-selected hover:data-popup-open:text-brand-text",
  FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
);

/** An icon button's ground: the window's own, or the brand's while what it controls is live, as the title row's player control while the project plays. */
export type IconButtonGround = "window" | "brand";

/** The brand's ground, its icon in the brand's foreground, kept through hover and an open menu. */
export const ICON_BUTTON_BRAND_GROUND_CLASS_NAMES =
  "bg-brand text-primary-foreground hover:bg-brand hover:text-primary-foreground dark:hover:bg-brand aria-expanded:bg-brand aria-expanded:text-primary-foreground data-popup-open:bg-brand data-popup-open:text-primary-foreground hover:data-popup-open:bg-brand hover:data-popup-open:text-primary-foreground";

/** The dim look of an icon button that cannot act now. */
const ICON_BUTTON_DISABLED_CLASS_NAMES = "text-fg-4 hover:bg-transparent hover:text-fg-4 hover:shadow-none dark:hover:bg-transparent hover:data-popup-open:bg-transparent hover:data-popup-open:text-fg-4";

/** The stock icon size each of ours is. */
export const STOCK_ICON_BUTTON_SIZE = { regular: "icon-sm", compact: "icon-xs" } as const;

/** A button that shows only an icon, its name in a tooltip; one that cannot act now reads dim and gives the reason in its tooltip instead. */
export function IconButton({
  icon: ButtonIcon,
  label,
  tooltip = label,
  disabledReason = null,
  isIconFilled = false,
  size = "regular",
  ground = "window",
  isJoinedToAMenuOnItsRight = false,
  onPressed,
  ...controlDataAttributes
}: {
  icon: LucideIcon;
  /** The button's accessible name. */
  label: string;
  /** What the tooltip says, when it says more than the button's name. */
  tooltip?: string;
  /** Why the button cannot act now; it keeps its focus, so a keyboard reaches the reason. */
  disabledReason?: string | null;
  /** A play or stop square drawn filled and smaller, as media controls are. */
  isIconFilled?: boolean;
  size?: IconButtonSize;
  /** A button on the brand's ground never reads dim, so it never takes a `disabledReason`. */
  ground?: IconButtonGround;
  /** Squares its right edge onto the chevron of a `StudioSplitMenuButton`. */
  isJoinedToAMenuOnItsRight?: boolean;
  onPressed: () => void;
} & ControlDataAttributes) {
  const isDisabled = disabledReason !== null;
  return (
    <WithControlTooltip
      tooltip={disabledReason ?? tooltip}
      isWide
      control={
        <Button
          variant="ghost"
          size={STOCK_ICON_BUTTON_SIZE[size]}
          aria-label={isDisabled ? `${label}: ${disabledReason}` : label}
          aria-disabled={isDisabled || undefined}
          onClick={() => {
            if (!isDisabled) onPressed();
          }}
          className={cn(
            ICON_BUTTON_CLASS_NAMES,
            isJoinedToAMenuOnItsRight && "rounded-r-none",
            ground === "brand" ? ICON_BUTTON_BRAND_GROUND_CLASS_NAMES : isDisabled && ICON_BUTTON_DISABLED_CLASS_NAMES,
          )}
          {...controlDataAttributes}
        >
          <ButtonIcon className={isIconFilled ? "size-3 fill-current" : size === "compact" ? "size-3.5" : "size-4"} strokeWidth={1.75} aria-hidden />
        </Button>
      }
    />
  );
}
