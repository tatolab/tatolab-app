// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { ControlDataAttributes } from "./control_data_attributes";
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
  shortcutHint,
  inputRef,
  ...controlDataAttributes
}: {
  /** The field's accessible name, as "Search main logs". */
  label: string;
  placeholder: string;
  text: string;
  onTextChanged: (text: string) => void;
  /** The shortcut that reaches the field, as ⌘ F, shown while it is empty. */
  shortcutHint?: string;
  /** For a page that moves focus into the field. */
  inputRef?: Ref<HTMLInputElement>;
} & ControlDataAttributes) {
  return (
    <InputGroup className="h-7 w-auto max-w-56 min-w-40 flex-1 basis-40 rounded-md border-line bg-window dark:bg-window has-[[data-slot=input-group-control]:focus-visible]:border-line-strong has-[[data-slot=input-group-control]:focus-visible]:ring-ring">
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
        spellCheck={false}
        autoComplete="off"
        className="h-full px-0 text-sm placeholder:text-fg-3"
        {...controlDataAttributes}
      />
      {(text !== "" || shortcutHint !== undefined) && (
        <InputGroupAddon align="inline-end" className="py-0 pr-1">
          {text !== "" ? (
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onTextChanged("")} className="text-fg-3 hover:bg-hover hover:text-fg">
              <X className="size-3.5" aria-hidden />
            </InputGroupButton>
          ) : (
            <KeyboardKey>{shortcutHint}</KeyboardKey>
          )}
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
