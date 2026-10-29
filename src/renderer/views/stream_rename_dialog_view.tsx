import { useState, type ReactNode } from "react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "../design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { RefusalLine } from "../design_system/refusal_line";
import { TextField } from "../design_system/text_field";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { canRenameStreamTo, displayNameToRenameTo, presentStreamRenameDialog } from "../presentation/stream_rename_presentation";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The stream the rename dialog is open on, the name typed so far, whether the runtime is renaming it, and its last refusal. */
interface StreamRenameDialogState {
  stream: ListedStream;
  typedDisplayName: string;
  isRenaming: boolean;
  refusal: string | null;
}

/** Opens the dialog that renames a stream through the backend, and the dialog to place once on the page that asks. */
export function useStreamRenameDialog(): { askToRename: (stream: ListedStream) => void; renameDialog: ReactNode } {
  const { backend } = useTatolabWindowEnvironment();
  const [dialogState, setDialogState] = useState<StreamRenameDialogState | null>(null);
  const askToRename = (stream: ListedStream) => setDialogState({ stream, typedDisplayName: stream.display_name, isRenaming: false, refusal: null });
  const rename = () => {
    if (dialogState === null || dialogState.isRenaming || !canRenameStreamTo(dialogState.stream, dialogState.typedDisplayName)) return;
    const renamedStreamId = dialogState.stream.stream;
    // An answer is for the dialog that asked: one closed meanwhile, or opened on another stream, is left as it is.
    const whileTheAskingDialogIsOpen = (next: (stateNow: StreamRenameDialogState) => StreamRenameDialogState | null) => (stateNow: StreamRenameDialogState | null) =>
      stateNow?.stream.stream === renamedStreamId && stateNow.isRenaming ? next(stateNow) : stateNow;
    setDialogState({ ...dialogState, isRenaming: true, refusal: null });
    backend.renameStream(renamedStreamId, displayNameToRenameTo(dialogState.typedDisplayName)).then(
      () => setDialogState(whileTheAskingDialogIsOpen(() => null)),
      (rejection: unknown) => setDialogState(whileTheAskingDialogIsOpen((stateNow) => ({ ...stateNow, isRenaming: false, refusal: describeBackendRejection(rejection) }))),
    );
  };
  const presentation = dialogState === null ? null : presentStreamRenameDialog(dialogState.stream);
  const renameDialog = (
    <FormDialog
      isOpen={dialogState !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) setDialogState(null);
      }}
      title={presentation?.title ?? ""}
      focusOnOpen="first_field_selected"
      description={presentation?.description ?? ""}
      footer={
        <FormDialogFooter>
          <div className="flex-1" />
          <ActionButton onPressed={() => setDialogState(null)} data-stream-rename-action="cancel">
            Cancel
          </ActionButton>
          <ActionButton
            appearance="primary"
            isDisabled={dialogState === null || dialogState.isRenaming || !canRenameStreamTo(dialogState.stream, dialogState.typedDisplayName)}
            onPressed={rename}
            data-stream-rename-action="rename"
          >
            {dialogState?.isRenaming === true ? "Renaming…" : "Rename"}
          </ActionButton>
        </FormDialogFooter>
      }
      data-stream-rename-dialog={dialogState?.stream.stream ?? ""}
    >
      {dialogState !== null && (
        <form
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            rename();
          }}
        >
          <FormDialogRows>
            <FormDialogRow
              label="Name"
              labelFor="stream-rename-display-name"
              below={
                dialogState.refusal !== null && (
                  <div id="stream-rename-refusal" className="mt-2">
                    <RefusalLine lead="Rename was refused:" words={dialogState.refusal} />
                  </div>
                )
              }
            >
              <TextField
                id="stream-rename-display-name"
                label="Stream name"
                text={dialogState.typedDisplayName}
                onTextChanged={(typedDisplayName) => setDialogState({ ...dialogState, typedDisplayName, refusal: null })}
                isRefused={dialogState.refusal !== null}
                describedBy={dialogState.refusal === null ? undefined : "stream-rename-refusal"}
                className="w-72"
                data-stream-rename-display-name=""
              />
            </FormDialogRow>
          </FormDialogRows>
        </form>
      )}
    </FormDialog>
  );
  return { askToRename, renameDialog };
}
