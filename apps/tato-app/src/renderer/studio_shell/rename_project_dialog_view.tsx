import { projectRenameRefusal } from "../presentation/projects_presentation";
import { NameFormDialog } from "./name_form_dialog_view";

/** A project the Rename dialog is open for: its folder, and the name it has now. */
export interface ProjectToRename {
  folder: string;
  name: string;
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
  return (
    <NameFormDialog
      key={projectToRename.folder}
      dialogKind="rename_project"
      words={{
        title: "Rename project",
        description: "The project's name changes; its folder keeps the name it has.",
        actionWords: "Rename",
        pendingWords: "Renaming…",
        refusalLead: "The project wasn't renamed:",
      }}
      startingName={projectToRename.name}
      nameRefusal={projectRenameRefusal}
      nameTheThing={(name) => renameTheProject(projectToRename.folder, name)}
      onClosed={onClosed}
    />
  );
}
