// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** An icon button's size: regular in toolbars, title bars and rows; compact beside a heading or in a small header. */
export type IconButtonSize = "regular" | "compact";

/** The look every icon-only control shares, the menu buttons that open from one included. */
export const ICON_BUTTON_CLASS_NAMES = cn(
  "rounded-md text-fg-3 hover:bg-hover hover:text-fg dark:hover:bg-hover aria-expanded:bg-selected aria-expanded:text-fg data-popup-open:bg-selected data-popup-open:text-fg",
  FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
);

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
  isOutOfTheTabOrder = false,
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
  /** For a button that repeats a way the keyboard already has. */
  isOutOfTheTabOrder?: boolean;
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
          tabIndex={isOutOfTheTabOrder ? -1 : undefined}
          onClick={() => {
            if (!isDisabled) onPressed();
          }}
          className={cn(ICON_BUTTON_CLASS_NAMES, isDisabled && "text-fg-4 hover:bg-transparent hover:text-fg-4 dark:hover:bg-transparent")}
          {...controlDataAttributes}
        >
          <ButtonIcon className={isIconFilled ? "size-3 fill-current" : size === "compact" ? "size-3.5" : "size-4"} strokeWidth={1.75} aria-hidden />
        </Button>
      }
    />
  );
}
