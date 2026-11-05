import type { ProjectFolderDialogPurpose } from "../open_project.js";
import type { Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/** The desktop's folder dialog, sheeted over the focused window, for an existing project or the folder a new project goes in; `null` when the person cancels. */
export async function askThePersonForAProjectFolderThroughElectron(purpose: ProjectFolderDialogPurpose, defaultFolder: string): Promise<Result<string | null, string>> {
  return purpose === "project_to_open"
    ? askThePersonThroughAnOpenDialogOverTheFocusedWindow(
        { title: "Open a project", buttonLabel: "Open", defaultPath: defaultFolder, properties: ["openDirectory", "createDirectory"] },
        "The project dialog",
      )
    : askThePersonThroughAnOpenDialogOverTheFocusedWindow(
        { title: "Choose where the project goes", buttonLabel: "Choose", defaultPath: defaultFolder, properties: ["openDirectory", "createDirectory"] },
        "The location dialog",
      );
}
