import { useId, useRef, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { ActionButton } from "./action_button";
import { PendingActionWords } from "./pending_action_words";
import { RefusalLine } from "./refusal_line";
import { TextField } from "./text_field";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/**
 * Asks for one thing's name, in the confirmation dialog's shape: the question and what it does, the name's field
 * (focused with its text selected as it opens; Return answers), why it was refused, and Cancel beside the button
 * that names it.
 */
export function NamingDialog({
  isOpen,
  onOpenChange,
  title,
  explanation,
  name,
  onNameChanged,
  nameRefusal,
  confirmWords,
  pendingWords,
  isAsking,
  refusal,
  onConfirmed,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  explanation: string;
  name: string;
  onNameChanged: (name: string) => void;
  /** Why the typed name cannot be the thing's, which holds the confirm button back; `null` for one it can be. */
  nameRefusal: string | null;
  confirmWords: string;
  /** What shows in the confirm button's place while the name is being given. */
  pendingWords: string;
  isAsking: boolean;
  /** Why the last name given was refused, led by `lead`; `null` while nothing was. */
  refusal: { lead: string; words: string } | null;
  onConfirmed: () => void;
} & ControlDataAttributes) {
  const nameFieldId = useId();
  const nameFieldWrapper = useRef<HTMLDivElement>(null);
  const nameFieldFocusedOnOpen = () => {
    const nameField = nameFieldWrapper.current?.querySelector<HTMLInputElement>("input") ?? null;
    nameField?.select();
    return nameField;
  };
  const confirmOnReturnInTheField = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== "Enter" || keyboardEvent.nativeEvent.isComposing || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    if (nameRefusal === null && !isAsking) onConfirmed();
  };
  return (
    <Dialog open={isOpen} onOpenChange={(isOpening) => (isOpening || !isAsking) && onOpenChange(isOpening)}>
      <DialogContent showCloseButton={false} initialFocus={nameFieldFocusedOnOpen} className="sm:max-w-md" {...controlDataAttributes}>
        <div onKeyDown={confirmOnReturnInTheField} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg leading-5 font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-sm text-fg-2">{explanation}</DialogDescription>
          </DialogHeader>
          <div ref={nameFieldWrapper} className="flex flex-col gap-1.5">
            <label htmlFor={nameFieldId} className="text-sm text-fg-2">
              Name
            </label>
            <TextField id={nameFieldId} label="Name" text={name} onTextChanged={onNameChanged} isRequired isRefused={refusal !== null} className="h-8 w-full" data-naming-dialog-name="" />
            {refusal !== null && (
              <div data-naming-dialog-refusal="">
                <RefusalLine lead={refusal.lead} words={refusal.words} layout="under_field" />
              </div>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 rounded-none border-t-0 bg-transparent p-0">
            <ActionButton disabledReason={isAsking ? pendingWords : null} onPressed={() => onOpenChange(false)} data-naming-dialog-action="cancel">
              Cancel
            </ActionButton>
            {isAsking ? (
              <PendingActionWords words={pendingWords} />
            ) : (
              <ActionButton appearance="primary" disabledReason={nameRefusal} onPressed={onConfirmed} data-naming-dialog-action="confirm">
                {confirmWords}
              </ActionButton>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
