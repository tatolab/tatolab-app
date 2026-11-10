import { Switch } from "./ui/switch";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** An on-or-off setting that takes effect as it is switched, Tatolab blue while on, labelled and described by the words of its row. */
export function ToggleSwitch({
  isOn,
  onSwitched,
  isDisabled = false,
  labelledBy,
  describedBy,
  ...controlDataAttributes
}: {
  isOn: boolean;
  onSwitched: (isOn: boolean) => void;
  isDisabled?: boolean;
  labelledBy: string;
  describedBy?: string;
} & ControlDataAttributes) {
  return (
    <Switch
      checked={isOn}
      onCheckedChange={(isSwitchedOn) => onSwitched(isSwitchedOn)}
      disabled={isDisabled}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`data-checked:bg-brand data-unchecked:bg-line-strong dark:data-unchecked:bg-line-strong ${FULL_STRENGTH_FOCUS_RING_CLASS_NAMES}`}
      {...controlDataAttributes}
    />
  );
}
