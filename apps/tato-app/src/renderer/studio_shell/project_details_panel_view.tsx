import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { MultiLineTextField } from "@tatolab/tato-app-view-sdk/design_system/multi_line_text_field";
import { ProjectDetailsCover, ProjectDetailsCoverAction } from "@tatolab/tato-app-view-sdk/design_system/project_card";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SidePanel } from "@tatolab/tato-app-view-sdk/design_system/side_panel";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { projectDescriptionToSave, projectNameToSave, projectRenameRefusal, type RecentProjectCardPresentation } from "../presentation/projects_presentation";

/** What the Project details panel changes a recent project through, each rejecting in the runtime's own words. */
export interface ProjectDetailsSources {
  renameARecentProject(folder: string, name: string): Promise<void>;
  /** A blank description clears it. */
  setARecentProjectDescription(folder: string, description: string): Promise<void>;
  /** An image chosen in the desktop's dialog; `null` when the person cancels. */
  chooseAProjectCoverImage(): Promise<string | null>;
  /** `null` shows the project by its plain cover again. */
  setARecentProjectCover(folder: string, image: string | null): Promise<void>;
}

/** The cover change running in the panel: an image being chosen and imported, or the plain cover coming back. */
type ProjectCoverChangeRunning = "choosing_an_image" | "removing_the_image";

/** `typedText` kept in step with `textTheProjectHas` while its field does not have the keyboard's focus, so a change saved elsewhere shows. */
function useFieldTextFollowingTheProject(textTheProjectHas: string): [string, (typedText: string) => void, RefObject<HTMLDivElement | null>] {
  const [typedText, setTypedText] = useState(textTheProjectHas);
  const fieldHolder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fieldHolder.current?.contains(document.activeElement) === true) return;
    setTypedText(textTheProjectHas);
  }, [textTheProjectHas]);
  return [typedText, setTypedText, fieldHolder];
}

/**
 * The project `card` shows, to change: its cover with Choose image… and Remove, its name and its description, each saved through the runtime as
 * its field loses the keyboard's focus, or on Enter in the name.
 */
export function ProjectDetailsFieldsView({
  card,
  coverImageUrl,
  projectDetailsSources,
  onTheProjectChanged,
}: {
  card: RecentProjectCardPresentation;
  coverImageUrl: string | null;
  projectDetailsSources: ProjectDetailsSources;
  /** Called once a change the fields asked for has been made, so the project is read again. */
  onTheProjectChanged: () => void;
}) {
  const nameFieldId = useId();
  const descriptionFieldId = useId();
  const [nameTyped, setNameTyped, nameFieldHolder] = useFieldTextFollowingTheProject(card.name);
  const [descriptionTyped, setDescriptionTyped, descriptionFieldHolder] = useFieldTextFollowingTheProject(card.descriptionToEdit);
  const nameRefusalId = useId();
  const [refusal, setRefusal] = useState<{ lead: string; words: string; isTheNames: boolean } | null>(null);
  const nameLastSent = useRef<string | null>(null);
  const descriptionLastSent = useRef<string | null>(null);
  const [coverChangeRunning, setCoverChangeRunning] = useState<ProjectCoverChangeRunning | null>(null);
  const changeTheProject = (lead: string, change: () => Promise<void>, isTheNames = false, onRefused: () => void = () => undefined) => {
    setRefusal(null);
    return change().then(onTheProjectChanged, (rejection: unknown) => {
      onRefused();
      setRefusal({ lead, words: describeBackendRejection(rejection), isTheNames });
    });
  };
  const saveTheName = () => {
    const nameToSave = projectNameToSave(nameTyped, card.name, nameLastSent.current);
    if (nameToSave === null) return;
    const nameRefusal = projectRenameRefusal(nameToSave);
    if (nameRefusal !== null) {
      setRefusal({ lead: "The project wasn't renamed:", words: nameRefusal, isTheNames: true });
      return;
    }
    nameLastSent.current = nameToSave.trim();
    void changeTheProject("The project wasn't renamed:", () => projectDetailsSources.renameARecentProject(card.folder, nameToSave), true, () => {
      nameLastSent.current = null;
    });
  };
  const saveTheNameOnEnter = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== "Enter" || keyboardEvent.nativeEvent.isComposing) return;
    keyboardEvent.preventDefault();
    saveTheName();
  };
  const saveTheDescription = () => {
    const descriptionToSave = projectDescriptionToSave(descriptionTyped, card.descriptionToEdit, descriptionLastSent.current);
    if (descriptionToSave === null) return;
    descriptionLastSent.current = descriptionToSave;
    void changeTheProject("The description wasn't saved:", () => projectDetailsSources.setARecentProjectDescription(card.folder, descriptionToSave), false, () => {
      descriptionLastSent.current = null;
    });
  };
  const changeTheCover = (coverChange: ProjectCoverChangeRunning) => {
    if (coverChangeRunning !== null) return;
    setCoverChangeRunning(coverChange);
    const coverChanged =
      coverChange === "removing_the_image"
        ? changeTheProject("The cover wasn't removed:", () => projectDetailsSources.setARecentProjectCover(card.folder, null))
        : projectDetailsSources.chooseAProjectCoverImage().then(
            (chosenImage) => (chosenImage === null ? undefined : changeTheProject("The cover wasn't changed:", () => projectDetailsSources.setARecentProjectCover(card.folder, chosenImage))),
            (rejection: unknown) => setRefusal({ lead: "The cover wasn't changed:", words: describeBackendRejection(rejection), isTheNames: false }),
          );
    void coverChanged.finally(() => setCoverChangeRunning(null));
  };
  return (
    <div className="flex flex-col gap-3.5">
        <ProjectDetailsCover
          coverNumber={card.coverNumber}
          coverInitial={card.coverInitial}
          coverImageUrl={coverImageUrl}
          coverActions={
            card.isUnreadable ? null : (
              <>
                <ProjectDetailsCoverAction onPressed={() => changeTheCover("choosing_an_image")} isDisabled={coverChangeRunning !== null} data-project-details-action="choose-image">
                  {coverChangeRunning === "choosing_an_image" ? "Choosing…" : "Choose image…"}
                </ProjectDetailsCoverAction>
                {card.hasAChosenCover && (
                  <ProjectDetailsCoverAction onPressed={() => changeTheCover("removing_the_image")} isDisabled={coverChangeRunning !== null} data-project-details-action="remove-image">
                    {coverChangeRunning === "removing_the_image" ? "Removing…" : "Remove"}
                  </ProjectDetailsCoverAction>
                )}
              </>
            )
          }
        />
        {card.isUnreadable ? (
          <p className="text-xs text-fg-2">The runtime names no project in {card.folderWords} now, so it has no details to change.</p>
        ) : (
          <>
            <div ref={nameFieldHolder} className="flex flex-col gap-1.5" onKeyDown={saveTheNameOnEnter} onBlur={saveTheName}>
              <label htmlFor={nameFieldId} className="text-xs text-fg-2">
                Name
              </label>
              <TextField
                id={nameFieldId}
                label="Name"
                text={nameTyped}
                onTextChanged={setNameTyped}
                isRefused={refusal?.isTheNames === true}
                describedBy={refusal?.isTheNames === true ? nameRefusalId : undefined}
                className="h-8.5"
                data-project-details-name=""
              />
            </div>
            <div ref={descriptionFieldHolder} className="flex flex-col gap-1.5" onBlur={saveTheDescription}>
              <label htmlFor={descriptionFieldId} className="text-xs text-fg-2">
                Description
              </label>
              <MultiLineTextField
                id={descriptionFieldId}
                label="Description"
                text={descriptionTyped}
                onTextChanged={setDescriptionTyped}
                placeholder="What the project is"
                data-project-details-description=""
              />
            </div>
          </>
        )}
        {refusal !== null && (
          <div id={refusal.isTheNames ? nameRefusalId : undefined}>
            <RefusalLine lead={refusal.lead} words={refusal.words} />
          </div>
        )}
        <p className="text-xs text-fg-3">With no image, the card shows a plain cover in a colour picked from the name.</p>
    </div>
  );
}

/** The Project details panel beside the Projects window's projects, for the project `card` shows. */
export function ProjectDetailsPanelView({
  card,
  coverImageUrl,
  projectDetailsSources,
  onTheProjectChanged,
  onHidden,
  isShownOnlyInAWideWindow,
}: {
  card: RecentProjectCardPresentation;
  coverImageUrl: string | null;
  projectDetailsSources: ProjectDetailsSources;
  /** Called once a change the panel asked for has been made, so the projects are read again. */
  onTheProjectChanged: () => void;
  onHidden: () => void;
  /** Whether the panel stays out of a window too narrow to show it beside the projects, as it does until the person asks for it. */
  isShownOnlyInAWideWindow: boolean;
}) {
  return (
    <SidePanel
      label="Project details"
      title="Project details"
      subtitle={card.name}
      hiding={{ hideLabel: "Hide project details", onHidden }}
      placement="floating"
      className={isShownOnlyInAWideWindow ? "hidden min-[1360px]:flex" : undefined}
      data-project-details={card.folder}
    >
      <div className="p-5">
        <ProjectDetailsFieldsView card={card} coverImageUrl={coverImageUrl} projectDetailsSources={projectDetailsSources} onTheProjectChanged={onTheProjectChanged} />
      </div>
    </SidePanel>
  );
}
