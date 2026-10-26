import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";
import { KeyboardKey } from "./keyboard_key";

/** The title bar's search: reads as a field, and opens the window's search when pressed. */
export function SearchOpeningButton({
  label,
  shortcut,
  onPressed,
  ...controlDataAttributes
}: {
  label: string;
  /** The shortcut that opens the search: its key cap, as ⌘K, and as `aria-keyshortcuts` writes it, as Meta+K. */
  shortcut: { hint: string; ariaKeyShortcuts: string };
  onPressed: () => void;
} & ControlDataAttributes) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={label}
      aria-keyshortcuts={shortcut.ariaKeyShortcuts}
      onClick={onPressed}
      className={`mx-auto w-[min(420px,40%)] justify-start gap-2 rounded-md border-line bg-well px-2.5 text-sm font-normal text-fg-3 hover:border-line-strong hover:bg-well hover:text-fg-3 dark:border-line dark:bg-well dark:hover:bg-well ${FULL_STRENGTH_FOCUS_RING_CLASS_NAMES}`}
      {...controlDataAttributes}
    >
      <Search className="size-3.5" strokeWidth={1.75} aria-hidden />
      Search
      <span className="ml-auto">
        <KeyboardKey isAlreadyAnnounced>{shortcut.hint}</KeyboardKey>
      </span>
    </Button>
  );
}
