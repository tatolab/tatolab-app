import { streamDisplayNameRefusal } from "../presentation/stream_menu_presentation";
import { NameFormDialog } from "./name_form_dialog_view";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import type { StreamMenuQuestion } from "./studio_window_model";

/** What the Stream menu's dialogs change through the runtime: a create or a rename resolves once it has and rejects in the runtime's words; a delete shows its own refusal. */
export interface StreamEditsOfTheStreamMenu {
  createStream(displayName: string): Promise<void>;
  renameStream(stream: string, displayName: string): Promise<void>;
  deleteStream(stream: string): void;
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
      <NameFormDialog
        dialogKind="new_stream"
        words={{ title: "New stream", description: "A new stream in this project, which plays with the project.", actionWords: "Create", pendingWords: "Creating…", refusalLead: "The stream wasn't created:" }}
        startingName=""
        nameRefusal={streamDisplayNameRefusal}
        nameTheThing={(displayName) => streamEdits.createStream(displayName)}
        onClosed={onClosed}
      />
    );
  }
  if (question?.kind === "rename_stream") {
    return (
      <NameFormDialog
        key={question.stream}
        dialogKind="rename_stream"
        words={{ title: "Rename stream", description: "The name the project shows this stream under.", actionWords: "Rename", pendingWords: "Renaming…", refusalLead: "The stream wasn't renamed:" }}
        startingName={question.display_name}
        nameRefusal={streamDisplayNameRefusal}
        nameTheThing={(displayName) => streamEdits.renameStream(question.stream, displayName)}
        onClosed={onClosed}
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
