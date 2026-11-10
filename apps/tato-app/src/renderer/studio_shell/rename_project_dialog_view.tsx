import { useId, useState, type KeyboardEvent } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { projectRenameRefusal } from "../presentation/projects_presentation";

/** A project the Rename dialog is open for: its folder, and the name it has now. */
export interface ProjectToRename {
  folder: string;
  name: string;
}

/** The Rename dialog's fields for `projectToRename`, and its Rename and Cancel; it closes once the runtime has renamed the project. */
function RenameProjectDialogFields({
  projectToRename,
  renameTheProject,
  onClosed,
}: {
  projectToRename: ProjectToRename;
  renameTheProject: (folder: string, name: string) => Promise<void>;
  onClosed: () => void;
}) {
  const nameFieldId = useId();
  const [name, setName] = useState(projectToRename.name);
  const [renameRefusal, setRenameRefusal] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const nameRefusal = projectRenameRefusal(name);
  const renameIt = () => {
    if (nameRefusal !== null || isRenaming) return;
    if (name.trim() === projectToRename.name) {
      onClosed();
      return;
    }
    setIsRenaming(true);
    setRenameRefusal(null);
    renameTheProject(projectToRename.folder, name).then(onClosed, (rejection: unknown) => {
      setIsRenaming(false);
      setRenameRefusal(describeBackendRejection(rejection));
    });
  };
  const renameOnEnterInTheField = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== "Enter" || keyboardEvent.nativeEvent.isComposing || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    renameIt();
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClosed()}
      title="Rename project"
      description="The project's name changes; its folder keeps the name it has."
      focusOnOpen="first_field_selected"
      footer={
        <FormDialogFooter>
          <span className="mr-auto" />
          <ActionButton appearance="quiet" onPressed={onClosed} data-rename-project-action="cancel">
            Cancel
          </ActionButton>
          {isRenaming ? (
            <PendingActionWords words="Renaming…" />
          ) : (
            <ActionButton appearance="primary" disabledReason={nameRefusal} onPressed={renameIt} data-rename-project-action="rename">
              Rename
            </ActionButton>
          )}
        </FormDialogFooter>
      }
      data-rename-project-dialog=""
    >
      <div onKeyDown={renameOnEnterInTheField}>
        <FormDialogRows>
          <FormDialogRow label="Name" labelFor={nameFieldId}>
            <TextField
              id={nameFieldId}
              label="Name"
              text={name}
              onTextChanged={(typedName) => {
                setName(typedName);
                setRenameRefusal(null);
              }}
              isRequired
              className="w-72"
              data-rename-project-name=""
            />
          </FormDialogRow>
        </FormDialogRows>
        {renameRefusal !== null && (
          <div data-rename-project-refusal="">
            <RefusalLine lead="The project wasn't renamed:" words={renameRefusal} />
          </div>
        )}
      </div>
    </FormDialog>
  );
}

/** The Rename dialog over the Projects window while `projectToRename` names the project it is open for: the name, Rename and Cancel. */
export function RenameProjectDialogView({
  projectToRename,
  renameTheProject,
  onClosed,
}: {
  projectToRename: ProjectToRename | null;
  renameTheProject: (folder: string, name: string) => Promise<void>;
  onClosed: () => void;
}) {
  if (projectToRename === null) return null;
  return <RenameProjectDialogFields projectToRename={projectToRename} renameTheProject={renameTheProject} onClosed={onClosed} />;
}
