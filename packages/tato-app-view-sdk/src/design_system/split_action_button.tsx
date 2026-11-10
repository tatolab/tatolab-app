import { cn } from "cn";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { ActionButton } from "./action_button";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/**
 * The primary action a place leads with, joined to a chevron that opens a menu of the other ways to do it, as New
 * project beside Import project….
 */
export function SplitActionButton({
  icon: ButtonIcon,
  menuLabel,
  onPressed,
  menuChoices,
  menuDataAttributes = {},
  children,
  ...controlDataAttributes
}: {
  icon?: LucideIcon;
  /** The chevron's accessible name, as "More ways to start a project". */
  menuLabel: string;
  onPressed: () => void;
  /** The menu's choices, as `MenuItem`s. */
  menuChoices: ReactNode;
  /** The `data-*` attributes of the chevron, as the button's own go on the button. */
  menuDataAttributes?: ControlDataAttributes;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <span className="flex shrink-0">
      <ActionButton appearance="primary" icon={ButtonIcon} onPressed={onPressed} className="rounded-r-none" {...controlDataAttributes}>
        {children}
      </ActionButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="default" size="icon-sm" className={cn("rounded-md rounded-l-none border-l border-l-primary-foreground/25", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)} />}
          aria-label={menuLabel}
          {...menuDataAttributes}
        >
          <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          {menuChoices}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
