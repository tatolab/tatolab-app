import { useId, useState, type KeyboardEvent } from "react";
import { newProjectFolderNameRefusal } from "../../shared/new_project_folder_name";
import type { ChosenProjectFolder, NewProjectDefaults } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { TextField } from "../design_system/text_field";
import { abbreviateHomeDirectory } from "../presentation/platform_presentation";

/** What the New project sheet asks the app for: the folder a project goes in, through its dialog, and the project made there. */
export interface NewProjectSources {
  /** The folder the person chooses in the app's dialog, opened at `startingAt`; `null` when they cancel. */
  chooseNewProjectLocation(startingAt: string): Promise<string | null>;
  /** The project `name` made in `location` by the runtime and opened, rejecting in the app's or the runtime's own words. */
  createNewProject(name: string, location: string): Promise<ChosenProjectFolder>;
}

/** `name` in `location`, as the folder the project is made in. */
function newProjectFolderOf(location: string, name: string): string {
  return `${location.replace(/\/+$/, "")}/${name.trim()}`;
}

/** The sheet's fields, opened with `openedWith`, and its Create and Cancel; it closes once the project is made and open. */
function NewProjectSheetFields({ openedWith, sources, onClosed }: { openedWith: NewProjectDefaults; sources: NewProjectSources; onClosed: () => void }) {
  const nameFieldId = useId();
  const nameRefusalId = useId();
  const [name, setName] = useState(openedWith.name);
  const [location, setLocation] = useState(openedWith.location);
  const [creationRefusal, setCreationRefusal] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const nameRefusal = newProjectFolderNameRefusal(name);
  const folderWords = abbreviateHomeDirectory(newProjectFolderOf(location, name));

  const browseForALocation = () => {
    setIsBrowsing(true);
    sources.chooseNewProjectLocation(location).then(
      (chosenLocation) => {
        setIsBrowsing(false);
        if (chosenLocation === null) return;
        setLocation(chosenLocation);
        setCreationRefusal(null);
      },
      (rejection: unknown) => {
        setIsBrowsing(false);
        setCreationRefusal(describeBackendRejection(rejection));
      },
    );
  };
  const createTheProject = () => {
    if (nameRefusal !== null || isCreating) return;
    setIsCreating(true);
    setCreationRefusal(null);
    sources.createNewProject(name, location).then(onClosed, (rejection: unknown) => {
      setIsCreating(false);
      setCreationRefusal(describeBackendRejection(rejection));
    });
  };
  const createOnEnterInAField = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== "Enter" || keyboardEvent.nativeEvent.isComposing || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    createTheProject();
  };

  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClosed()}
      title="New project"
      description="Tato Studio makes a folder for the project, with a stream to start from."
      focusOnOpen="first_field_selected"
      footer={
        <FormDialogFooter>
          <span className="mr-auto" />
          <ActionButton appearance="quiet" onPressed={onClosed} data-new-project-action="cancel">
            Cancel
          </ActionButton>
          {isCreating ? (
            <PendingActionWords words="Creating…" />
          ) : (
            <ActionButton appearance="primary" disabledReason={nameRefusal} onPressed={createTheProject} data-new-project-action="create">
              Create
            </ActionButton>
          )}
        </FormDialogFooter>
      }
      data-new-project-sheet=""
    >
      <div onKeyDown={createOnEnterInAField}>
        <FormDialogRows>
          <FormDialogRow
            label="Name"
            labelFor={nameFieldId}
            below={name.trim() !== "" && nameRefusal !== null ? <span id={nameRefusalId}><RefusalLine words={nameRefusal} /></span> : undefined}
          >
            <TextField
              id={nameFieldId}
              label="Name"
              text={name}
              onTextChanged={(typedName) => {
                setName(typedName);
                setCreationRefusal(null);
              }}
              isRequired
              isRefused={name.trim() !== "" && nameRefusal !== null}
              describedBy={nameRefusal === null ? undefined : nameRefusalId}
              className="w-72"
              data-new-project-name=""
            />
          </FormDialogRow>
          <FormDialogRow label="Location">
            <span className="min-w-0 truncate text-fg-2" title={location} data-new-project-location="">
              {abbreviateHomeDirectory(location)}
            </span>
            <ActionButton size="small" isDisabled={isBrowsing || isCreating} onPressed={browseForALocation} data-new-project-action="browse">
              Browse…
            </ActionButton>
          </FormDialogRow>
        </FormDialogRows>
        <p className="mt-3 text-xs text-fg-3">
          Creates <span className="font-mono break-all text-fg-2 select-text" data-new-project-folder="">{folderWords}</span>
        </p>
        {creationRefusal !== null && (
          <div data-new-project-refusal="">
            <RefusalLine lead="The project wasn't created:" words={creationRefusal} />
          </div>
        )}
      </div>
    </FormDialog>
  );
}

/** The New project sheet over the window while `openedWith` holds what it opened with: a name, the folder it goes in with Browse…, and the full path the project is made at. */
export function NewProjectSheetView({ openedWith, sources, onClosed }: { openedWith: NewProjectDefaults | null; sources: NewProjectSources; onClosed: () => void }) {
  if (openedWith === null) return null;
  return <NewProjectSheetFields openedWith={openedWith} sources={sources} onClosed={onClosed} />;
}
