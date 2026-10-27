import { cn } from "cn";

/** The fixed square a served logo is drawn in, by where it sits: 24 px in a row or a dialog's heading, 32 px in a menu of choices. */
const SERVED_LOGO_SLOT_SIZE_CLASS_NAMES = { in_a_row: "size-6", in_a_menu: "size-8" } as const;

/**
 * A provider's logo the runtime serves as a `data:image/` URI, drawn as an image filling a fixed square slot, so a column
 * of them lines up at one size and nothing shifts as one loads. The window draws no tile around it, and it is decorative:
 * the name it stands for is always beside it.
 */
export function ServedLogoSlot({ logoDataUri, size }: { logoDataUri: string; size: keyof typeof SERVED_LOGO_SLOT_SIZE_CLASS_NAMES }) {
  return (
    <span className={cn("inline-flex shrink-0", SERVED_LOGO_SLOT_SIZE_CLASS_NAMES[size])} data-served-logo-slot={size}>
      <img src={logoDataUri} alt="" draggable={false} className="size-full" />
    </span>
  );
}
