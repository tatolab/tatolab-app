import { cn } from "cn";

/** The fixed square a served logo is drawn in, by where it sits: 24 px in a row or beside a dialog's adapter name, 32 px in a menu of choices. */
const SERVED_LOGO_SLOT_SIZE_CLASS_NAMES = { in_a_row: "size-6", in_a_menu: "size-8" } as const;

/** Where a served logo sits, which sets its slot's size. */
export type ServedLogoSlotSize = keyof typeof SERVED_LOGO_SLOT_SIZE_CLASS_NAMES;

/** A provider's logo the runtime serves as a `data:image/` URI, drawn filling a fixed square slot, beside the name it stands for. */
export function ServedLogoSlot({ logoDataUri, size }: { logoDataUri: string; size: ServedLogoSlotSize }) {
  return (
    <span className={cn("inline-flex shrink-0", SERVED_LOGO_SLOT_SIZE_CLASS_NAMES[size])} data-served-logo-slot={size}>
      <img src={logoDataUri} alt="" draggable={false} className="size-full object-contain select-none" />
    </span>
  );
}
