import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { KeyboardKey } from "./keyboard_key";

/**
 * A field that filters or searches what a page shows: a magnifier, the text, and a button that clears it once there is
 * text, else the key cap of the shortcut that reaches it. Escape clears the text, then leaves the field.
 */
export function SearchField({
  label,
  placeholder,
  text,
  onTextChanged,
  shortcut,
  inputRef,
  ...controlDataAttributes
}: {
  /** The field's accessible name, as "Search main logs". */
  label: string;
  placeholder: string;
  text: string;
  onTextChanged: (text: string) => void;
  /** The shortcut that reaches the field: its key cap, as ⌘F, shown while the field is empty, and as `aria-keyshortcuts` writes it, as Meta+F. */
  shortcut?: { hint: string; ariaKeyShortcuts: string };
  /** For a page that moves focus into the field. */
  inputRef?: Ref<HTMLInputElement>;
} & ControlDataAttributes) {
  return (
    <InputGroup className="h-7 w-auto max-w-56 min-w-32 flex-1 basis-32 rounded-md border-line bg-window dark:bg-window has-[[data-slot=input-group-control]:focus-visible]:border-line-strong has-[[data-slot=input-group-control]:focus-visible]:ring-ring">
      <InputGroupAddon className="py-0 pl-2 text-fg-3">
        <Search className="size-3.5" strokeWidth={1.75} aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={text}
        onChange={(changeEvent) => onTextChanged(changeEvent.target.value)}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key !== "Escape") return;
          keyboardEvent.preventDefault();
          if (text !== "") onTextChanged("");
          else keyboardEvent.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts={shortcut?.ariaKeyShortcuts}
        spellCheck={false}
        autoComplete="off"
        className="h-full px-0 text-sm placeholder:text-fg-3"
        {...controlDataAttributes}
      />
      {text !== "" ? (
        <InputGroupAddon align="inline-end" className="py-0 pr-1">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={(clickEvent) => {
              onTextChanged("");
              // The clear button goes once the text is empty, so focus goes back to the text rather than to the page.
              clickEvent.currentTarget.closest('[data-slot="input-group"]')?.querySelector("input")?.focus();
            }} className={`text-fg-3 hover:bg-hover hover:text-fg ${FULL_STRENGTH_FOCUS_RING_CLASS_NAMES}`}>
            <X className="size-3.5" aria-hidden />
          </InputGroupButton>
        </InputGroupAddon>
      ) : shortcut !== undefined ? (
        <InputGroupAddon align="inline-end" className="py-0 pr-1">
          <KeyboardKey isAlreadyAnnounced>{shortcut.hint}</KeyboardKey>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
