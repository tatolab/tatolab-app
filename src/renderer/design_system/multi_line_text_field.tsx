import { cn } from "cn";
import { Textarea } from "@/components/ui/textarea";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** A field that holds text over several lines, as a pasted file's: in Geist Mono for machine words; dots for a secret; red-edged while what it holds was refused. */
export function MultiLineTextField({
  id,
  label,
  text,
  onTextChanged,
  isMachineWord = false,
  isMasked = false,
  isRequired = false,
  isRefused = false,
  placeholder,
  describedBy,
  className,
  ...controlDataAttributes
}: {
  /** For the `<label>` beside it that names it. */
  id?: string;
  /** The field's accessible name, as "Signing key". */
  label: string;
  text: string;
  onTextChanged: (text: string) => void;
  isMachineWord?: boolean;
  /** Shows a secret as dots, keeping its line breaks, which a one-line password field would strip; its text is never copied or cut out, as a password field's is not. */
  isMasked?: boolean;
  /** Announced as required to assistive technology. */
  isRequired?: boolean;
  isRefused?: boolean;
  /** Shown while it holds nothing, as "Default". */
  placeholder?: string;
  /** The id of what explains the field or its refusal. */
  describedBy?: string;
  /** A one-off adjustment where the field is used. */
  className?: string;
} & ControlDataAttributes) {
  return (
    <Textarea
      id={id}
      value={text}
      onChange={(changeEvent) => onTextChanged(changeEvent.target.value)}
      // Chromium guards copy and cut only for `<input type=password>`; `-webkit-text-security` masks the text and nothing more.
      onCopy={isMasked ? (clipboardEvent) => clipboardEvent.preventDefault() : undefined}
      onCut={isMasked ? (clipboardEvent) => clipboardEvent.preventDefault() : undefined}
      placeholder={placeholder}
      aria-label={label}
      aria-required={isRequired || undefined}
      aria-invalid={isRefused || undefined}
      aria-describedby={describedBy}
      spellCheck={false}
      autoComplete="off"
      rows={3}
      className={cn(
        "max-h-40 min-h-16 rounded-md border-line-strong bg-window px-2.5 py-1.5 text-sm text-fg dark:bg-window",
        isMachineWord && "font-mono",
        isMasked && "[-webkit-text-security:disc]",
        isRefused && "border-danger dark:border-danger",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        className,
      )}
      {...controlDataAttributes}
    />
  );
}
