import { useId, useState, type KeyboardEvent } from "react";
import { newProjectFolderNameRefusal } from "../../shared/new_project_folder_name";
import type { ChosenProjectFolder } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { abbreviateHomeDirectory } from "../presentation/platform_presentation";
import type { NewProjectSheetOpening } from "./studio_window_model";

/** What the New project sheet asks the app for: the folder a project goes in, through its dialog, and the project made there. */
export interface NewProjectSources {
  /** The folder the person chooses in the app's dialog, opened at `startingAt`; `null` when they cancel. */
  chooseNewProjectLocation(startingAt: string): Promise<string | null>;
  /** The project `name` made in `location` by the runtime and opened, rejecting in the app's or the runtime's own words. */
  createNewProject(name: string, location: string): Promise<ChosenProjectFolder>;
  /** The project `name` made in `location` by the runtime from the `.zip` `archive` and opened, rejecting in the app's or the runtime's own words. */
  importProjectArchive(archive: string, name: string, location: string): Promise<ChosenProjectFolder>;
}

/** The words the sheet shows for what it opened with: its title, what it does, its button and the words while it works. */
function sheetWordsFor(openedWith: NewProjectSheetOpening) {
  if (openedWith.kind === "new_project") {
    return {
      title: "New project",
      description: "Tato Studio makes a folder for the project, with a stream to start from.",
      nameLabel: "Name",
      actionWords: "Create",
      pendingWords: "Creating…",
      refusalLead: "The project wasn't created:",
    };
  }
  return {
    title: "Import project",
    description: `Tato Studio makes a project of its own from ${openedWith.chosen.archive.slice(openedWith.chosen.archive.lastIndexOf("/") + 1)}, in a new folder. It keeps the name it was saved with.`,
    nameLabel: "Folder name",
    actionWords: "Import",
    pendingWords: "Importing…",
    refusalLead: "The project wasn't imported:",
  };
}

/** `name` in `location`, as the folder the project is made in. */
function newProjectFolderOf(location: string, name: string): string {
  return `${location.replace(/\/+$/, "")}/${name.trim()}`;
}

/** The sheet's fields, opened with `openedWith`, and its Create or Import and Cancel; it closes once the project is made and open. */
function NewProjectSheetFields({ openedWith, sources, onClosed }: { openedWith: NewProjectSheetOpening; sources: NewProjectSources; onClosed: () => void }) {
  const nameFieldId = useId();
  const nameRefusalId = useId();
  const startingAt = openedWith.kind === "new_project" ? openedWith.defaults : openedWith.chosen;
  const sheetWords = sheetWordsFor(openedWith);
  const [name, setName] = useState(startingAt.name);
  const [location, setLocation] = useState(startingAt.location);
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
    const made = openedWith.kind === "new_project" ? sources.createNewProject(name, location) : sources.importProjectArchive(openedWith.chosen.archive, name, location);
    made.then(onClosed, (rejection: unknown) => {
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
      title={sheetWords.title}
      description={sheetWords.description}
      focusOnOpen="first_field_selected"
      footer={
        <FormDialogFooter>
          <span className="mr-auto" />
          <ActionButton appearance="quiet" onPressed={onClosed} data-new-project-action="cancel">
            Cancel
          </ActionButton>
          {isCreating ? (
            <PendingActionWords words={sheetWords.pendingWords} />
          ) : (
            <ActionButton appearance="primary" disabledReason={nameRefusal} onPressed={createTheProject} data-new-project-action="create">
              {sheetWords.actionWords}
            </ActionButton>
          )}
        </FormDialogFooter>
      }
      data-new-project-sheet=""
    >
      <div onKeyDown={createOnEnterInAField}>
        <FormDialogRows>
          <FormDialogRow
            label={sheetWords.nameLabel}
            labelFor={nameFieldId}
            below={name.trim() !== "" && nameRefusal !== null ? <span id={nameRefusalId}><RefusalLine words={nameRefusal} /></span> : undefined}
          >
            <TextField
              id={nameFieldId}
              label={sheetWords.nameLabel}
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
            <RefusalLine lead={sheetWords.refusalLead} words={creationRefusal} />
          </div>
        )}
      </div>
    </FormDialog>
  );
}

/** The New project sheet, or the Import project sheet for a `.zip`, over the window while `openedWith` holds what it opened with: a name, the folder it goes in with Browse…, and the full path the project is made at. */
export function NewProjectSheetView({ openedWith, sources, onClosed }: { openedWith: NewProjectSheetOpening | null; sources: NewProjectSources; onClosed: () => void }) {
  if (openedWith === null) return null;
  return <NewProjectSheetFields openedWith={openedWith} sources={sources} onClosed={onClosed} />;
}
