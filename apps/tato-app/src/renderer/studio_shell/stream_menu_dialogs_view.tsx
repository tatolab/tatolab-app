import { useId, useState, type KeyboardEvent } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import type { StreamMenuQuestion } from "./studio_window_model";

/** What the Stream menu's dialogs change through the runtime: a create or a rename resolves once it has and rejects in the runtime's words; a delete shows its own refusal. */
export interface StreamEditsOfTheStreamMenu {
  createStream(displayName: string): Promise<void>;
  renameStream(stream: string, displayName: string): Promise<void>;
  deleteStream(stream: string): void;
}

/** Why a name typed for a stream cannot be one, before the runtime is asked; `null` for a name it can be. */
function streamNameRefusal(displayName: string): string | null {
  return displayName.trim() === "" ? "Name the stream" : null;
}

/** New stream's and Rename stream's dialog: the name, and the button that makes or renames the stream; it closes once the runtime has. */
function StreamNameDialog({
  title,
  description,
  startingName,
  actionWords,
  pendingWords,
  refusalLead,
  nameTheStream,
  onClosed,
  ...dataAttributes
}: {
  title: string;
  description: string;
  startingName: string;
  actionWords: string;
  pendingWords: string;
  refusalLead: string;
  nameTheStream: (displayName: string) => Promise<void>;
  onClosed: () => void;
  "data-stream-name-dialog": string;
}) {
  const nameFieldId = useId();
  const [name, setName] = useState(startingName);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const nameRefusal = streamNameRefusal(name);
  const nameIt = () => {
    if (nameRefusal !== null || isAsking) return;
    if (startingName !== "" && name.trim() === startingName) {
      onClosed();
      return;
    }
    setIsAsking(true);
    setRefusal(null);
    nameTheStream(name.trim()).then(onClosed, (rejection: unknown) => {
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
      onOpenChange={(isOpen) => !isOpen && onClosed()}
      title={title}
      description={description}
      focusOnOpen="first_field_selected"
      footer={
        <FormDialogFooter>
          <span className="mr-auto" />
          <ActionButton appearance="quiet" onPressed={onClosed} data-stream-name-action="cancel">
            Cancel
          </ActionButton>
          {isAsking ? (
            <PendingActionWords words={pendingWords} />
          ) : (
            <ActionButton appearance="primary" disabledReason={nameRefusal} onPressed={nameIt} data-stream-name-action="name">
              {actionWords}
            </ActionButton>
          )}
        </FormDialogFooter>
      }
      {...dataAttributes}
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
              data-stream-name=""
            />
          </FormDialogRow>
        </FormDialogRows>
        {refusal !== null && (
          <div data-stream-name-refusal="">
            <RefusalLine lead={refusalLead} words={refusal} />
          </div>
        )}
      </div>
    </FormDialog>
  );
}

/** The Stream menu's dialog for `question`: New stream's name, Rename stream's new name, or Delete stream's confirmation naming the stream. */
export function StreamMenuDialogsView({
  question,
  streamEdits,
  onClosed,
}: {
  question: StreamMenuQuestion | null;
  streamEdits: StreamEditsOfTheStreamMenu;
  onClosed: () => void;
}) {
  if (question?.kind === "name_a_new_stream") {
    return (
      <StreamNameDialog
        title="New stream"
        description="A new stream in this project, which plays with the project."
        startingName=""
        actionWords="Create"
        pendingWords="Creating…"
        refusalLead="The stream wasn't created:"
        nameTheStream={(displayName) => streamEdits.createStream(displayName)}
        onClosed={onClosed}
        data-stream-name-dialog="new_stream"
      />
    );
  }
  if (question?.kind === "rename_stream") {
    return (
      <StreamNameDialog
        key={question.stream}
        title="Rename stream"
        description="The name the project shows this stream under."
        startingName={question.display_name}
        actionWords="Rename"
        pendingWords="Renaming…"
        refusalLead="The stream wasn't renamed:"
        nameTheStream={(displayName) => streamEdits.renameStream(question.stream, displayName)}
        onClosed={onClosed}
        data-stream-name-dialog="rename_stream"
      />
    );
  }
  return (
    <ConfirmationDialog
      isOpen={question?.kind === "delete_stream"}
      onOpenChange={(isOpen) => !isOpen && onClosed()}
      question={
        question?.kind === "delete_stream"
          ? {
              title: `Delete ${question.display_name}?`,
              explanation: `${question.display_name} and its graph leave the project. Edit › Undo brings them back.`,
              confirmWords: "Delete stream",
            }
          : null
      }
      isDestructive
      onConfirmed={() => {
        if (question?.kind === "delete_stream") streamEdits.deleteStream(question.stream);
        onClosed();
      }}
      confirmDataAttributes={{ "data-delete-stream-action": "delete" }}
      data-delete-stream-dialog=""
    />
  );
}
