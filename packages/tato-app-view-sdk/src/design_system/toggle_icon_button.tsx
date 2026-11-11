import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Toggle } from "./ui/toggle";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import type { IconButtonSize } from "./icon_button";

const TOGGLE_SIZE_CLASS_NAMES: Record<IconButtonSize, string> = { regular: "size-7 min-w-7", compact: "size-6 min-w-6" };

/** An icon button that is on or off, pressed while on; its tooltip says what pressing it does now. */
export function ToggleIconButton({
  icon: ButtonIcon,
  iconWhileOn = ButtonIcon,
  label,
  tooltipWhileOn = label,
  tooltipWhileOff = label,
  isOn,
  onToggled,
  size = "regular",
  isOutOfTheTabOrder = false,
  ...controlDataAttributes
}: {
  icon: LucideIcon;
  iconWhileOn?: LucideIcon;
  /** The button's accessible name, the same on and off; its pressed state says which it is. */
  label: string;
  tooltipWhileOn?: string;
  tooltipWhileOff?: string;
  isOn: boolean;
  onToggled: (isOn: boolean) => void;
  size?: IconButtonSize;
  /** For a button that repeats a way the keyboard already has. */
  isOutOfTheTabOrder?: boolean;
} & ControlDataAttributes) {
  const ShownIcon = isOn ? iconWhileOn : ButtonIcon;
  return (
    <WithControlTooltip
      tooltip={isOn ? tooltipWhileOn : tooltipWhileOff}
      control={
        <Toggle
          aria-label={label}
          pressed={isOn}
          onPressedChange={onToggled}
          tabIndex={isOutOfTheTabOrder ? -1 : undefined}
          className={cn(
            "rounded-md px-0 text-fg-3 hover:bg-brand-soft hover:text-brand-text hover:shadow-(--icon-button-hover-ring) aria-pressed:bg-brand aria-pressed:text-primary-foreground aria-pressed:hover:bg-brand aria-pressed:hover:text-primary-foreground",
            TOGGLE_SIZE_CLASS_NAMES[size],
            FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
          )}
          {...controlDataAttributes}
        >
          <ShownIcon className={size === "compact" ? "size-3.5" : "size-4"} strokeWidth={1.75} aria-hidden />
        </Toggle>
      }
    />
  );
}
