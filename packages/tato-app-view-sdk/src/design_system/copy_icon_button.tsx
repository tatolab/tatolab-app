import { Check, Copy } from "lucide-react";
import { Button } from "./ui/button";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { useCopiedConfirmation } from "./support/copied_confirmation";
import { WithControlTooltip } from "./control_tooltip";
import { ICON_BUTTON_CLASS_NAMES, STOCK_ICON_BUTTON_SIZE, type IconButtonSize } from "./icon_button";

/** An icon button that copies what `readTextToCopy` reads when it is pressed, saying Copied for a moment once the copy is made. */
export function CopyIconButton({
  label,
  readTextToCopy,
  size = "regular",
  ...controlDataAttributes
}: {
  /** What it copies, as "Copy as JSON". */
  label: string;
  readTextToCopy: () => string;
  size?: IconButtonSize;
} & ControlDataAttributes) {
  const { wasCopied, copy } = useCopiedConfirmation(readTextToCopy);
  const ShownIcon = wasCopied ? Check : Copy;
  return (
    <WithControlTooltip
      tooltip={wasCopied ? "Copied" : label}
      control={
        <Button
          variant="ghost"
          size={STOCK_ICON_BUTTON_SIZE[size]}
          aria-label={wasCopied ? "Copied" : label}
          onClick={copy}
          className={ICON_BUTTON_CLASS_NAMES}
          {...controlDataAttributes}
        >
          <ShownIcon className={size === "compact" ? "size-3.5" : "size-4"} strokeWidth={1.75} aria-hidden />
        </Button>
      }
    />
  );
}
