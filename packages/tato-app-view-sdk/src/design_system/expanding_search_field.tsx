import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { IconButton } from "./icon_button";
import { SearchField } from "./search_field";

/**
 * A search that waits as a magnifier button and opens into a search field when pressed, focused; it folds back to the
 * button when it is left empty, by Escape (focus returning to the button) or by focus moving elsewhere.
 */
export function ExpandingSearchField({
  label,
  placeholder,
  text,
  onTextChanged,
  ...controlDataAttributes
}: {
  /** The button's and the field's accessible name, as "Search projects". */
  label: string;
  placeholder: string;
  text: string;
  onTextChanged: (text: string) => void;
} & ControlDataAttributes) {
  const [isOpenedByThePerson, setIsOpenedByThePerson] = useState(false);
  const searchInputElement = useRef<HTMLInputElement>(null);
  const magnifierButtonHolderElement = useRef<HTMLSpanElement>(null);
  const isFoldingFromTheKeyboard = useRef(false);
  const isOpen = isOpenedByThePerson || text !== "";
  useEffect(() => {
    if (isOpen) {
      if (isOpenedByThePerson) searchInputElement.current?.focus();
      return;
    }
    if (!isFoldingFromTheKeyboard.current) return;
    isFoldingFromTheKeyboard.current = false;
    magnifierButtonHolderElement.current?.querySelector("button")?.focus();
  }, [isOpen, isOpenedByThePerson]);
  if (!isOpen) {
    return (
      <span ref={magnifierButtonHolderElement} className="flex">
        <IconButton icon={Search} label={label} onPressed={() => setIsOpenedByThePerson(true)} {...controlDataAttributes} />
      </span>
    );
  }
  return (
    <span
      className="flex w-56 min-w-0"
      onKeyDownCapture={(keyboardEvent) => {
        if (keyboardEvent.key === "Escape" && text === "") isFoldingFromTheKeyboard.current = true;
      }}
      onBlur={(focusEvent) => {
        if (focusEvent.relatedTarget instanceof Node && focusEvent.currentTarget.contains(focusEvent.relatedTarget)) return;
        if (text === "") setIsOpenedByThePerson(false);
        else isFoldingFromTheKeyboard.current = false;
      }}
    >
      <SearchField label={label} placeholder={placeholder} text={text} onTextChanged={onTextChanged} inputRef={searchInputElement} {...controlDataAttributes} />
    </span>
  );
}
