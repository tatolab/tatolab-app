import { useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { NamingDialog } from "@tatolab/tato-app-view-sdk/design_system/naming_dialog";

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
  return (
    <NamingDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClosed()}
      title={words.title}
      explanation={words.description}
      name={name}
      onNameChanged={(typedName) => {
        setName(typedName);
        setRefusal(null);
      }}
      nameRefusal={typedNameRefusal}
      confirmWords={words.actionWords}
      pendingWords={words.pendingWords}
      isAsking={isAsking}
      refusal={refusal === null ? null : { lead: words.refusalLead, words: refusal }}
      onConfirmed={nameIt}
      data-name-form-dialog={dialogKind}
    />
  );
}
