import { cn } from "cn";
import { Input } from "@/components/ui/input";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** A one-line field the person types into: in Geist Mono for a machine word, as a stream's name; red-edged while what it holds was refused. */
export function TextField({
  id,
  label,
  text,
  onTextChanged,
  isMachineWord = false,
  isRefused = false,
  describedBy,
  className,
  ...controlDataAttributes
}: {
  /** For the `<label>` beside it that names it. */
  id?: string;
  /** The field's accessible name, as "Stream name". */
  label: string;
  text: string;
  onTextChanged: (text: string) => void;
  isMachineWord?: boolean;
  isRefused?: boolean;
  /** The id of what explains the field or its refusal. */
  describedBy?: string;
  /** A one-off adjustment where the field is used. */
  className?: string;
} & ControlDataAttributes) {
  return (
    <Input
      id={id}
      value={text}
      onChange={(changeEvent) => onTextChanged(changeEvent.target.value)}
      aria-label={label}
      aria-invalid={isRefused || undefined}
      aria-describedby={describedBy}
      spellCheck={false}
      autoComplete="off"
      className={cn(
        "h-7 rounded-md border-line-strong bg-window px-2.5 text-sm text-fg dark:bg-window",
        isMachineWord && "font-mono",
        isRefused && "border-danger dark:border-danger",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        className,
      )}
      {...controlDataAttributes}
    />
  );
}
