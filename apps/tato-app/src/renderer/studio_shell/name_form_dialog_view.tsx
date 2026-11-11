import { useId, useState, type KeyboardEvent } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";

/** The words of a dialog that asks for one thing's name: its title and what it does, the button that names the thing and what it says while the runtime does, and the lead of a refusal. */
export interface NameFormDialogWords {
  title: string;
  description: string;
  actionWords: string;
  pendingWords: string;
  refusalLead: string;
}

/**
 * A dialog that asks for one thing's name, starting from `startingName`, and names it through `nameTheThing`; it closes
 * once that resolves, at once for a name left as it was, and shows a rejection in its words.
 */
export function NameFormDialog({
  dialogKind,
  words,
  startingName,
  nameRefusal,
  nameTheThing,
  onClosed,
}: {
  /** The dialog's `data-name-form-dialog`, as `rename_project`. */
  dialogKind: string;
  words: NameFormDialogWords;
  startingName: string;
  /** Why a typed name cannot be the thing's, before the runtime is asked; `null` for one it can be. */
  nameRefusal: (typedName: string) => string | null;
  nameTheThing: (name: string) => Promise<void>;
  onClosed: () => void;
}) {
  const nameFieldId = useId();
  const [name, setName] = useState(startingName);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const typedNameRefusal = nameRefusal(name);
  const nameIt = () => {
    if (typedNameRefusal !== null || isAsking) return;
    if (startingName !== "" && name.trim() === startingName) {
      onClosed();
      return;
    }
    setIsAsking(true);
    setRefusal(null);
    nameTheThing(name.trim()).then(onClosed, (rejection: unknown) => {
      setIsAsking(false);
      setRefusal(describeBackendRejection(rejection));
    });
  };
  const nameOnEnterInTheField = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== "Enter" || keyboardEvent.nativeEvent.isComposing || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    nameIt();
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && !isAsking && onClosed()}
      title={words.title}
      description={words.description}
      focusOnOpen="first_field_selected"
      footer={
        <FormDialogFooter>
          <span className="mr-auto" />
          <ActionButton appearance="quiet" disabledReason={isAsking ? words.pendingWords : null} onPressed={onClosed} data-name-form-action="cancel">
            Cancel
          </ActionButton>
          {isAsking ? (
            <PendingActionWords words={words.pendingWords} />
          ) : (
            <ActionButton appearance="primary" disabledReason={typedNameRefusal} onPressed={nameIt} data-name-form-action="name">
              {words.actionWords}
            </ActionButton>
          )}
        </FormDialogFooter>
      }
      data-name-form-dialog={dialogKind}
    >
      <div onKeyDown={nameOnEnterInTheField}>
        <FormDialogRows>
          <FormDialogRow label="Name" labelFor={nameFieldId}>
            <TextField
              id={nameFieldId}
              label="Name"
              text={name}
              onTextChanged={(typedName) => {
                setName(typedName);
                setRefusal(null);
              }}
              isRequired
              className="w-72"
              data-name-form-name=""
            />
          </FormDialogRow>
        </FormDialogRows>
        {refusal !== null && (
          <div data-name-form-refusal="">
            <RefusalLine lead={words.refusalLead} words={refusal} />
          </div>
        )}
      </div>
    </FormDialog>
  );
}
