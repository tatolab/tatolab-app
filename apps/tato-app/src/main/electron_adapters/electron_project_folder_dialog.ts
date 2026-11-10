import { PROJECT_COVER_IMAGE_MEDIA_TYPES, type ProjectFolderDialogPurpose } from "../open_project.js";
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

/** The desktop's open dialog, sheeted over the focused window, for a project `.zip` to import; `null` when the person cancels. */
export async function askThePersonForAProjectArchiveThroughElectron(defaultFolder: string): Promise<Result<string | null, string>> {
  return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
    { title: "Import a project .zip", buttonLabel: "Import", defaultPath: defaultFolder, properties: ["openFile"], filters: [{ name: "Project archive", extensions: ["zip"] }] },
    "The import dialog",
  );
}

/** The desktop's open dialog, sheeted over the focused window, for an image to cover a project; `null` when the person cancels. */
export async function askThePersonForAProjectCoverImageThroughElectron(defaultFolder: string): Promise<Result<string | null, string>> {
  return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
    {
      title: "Choose a cover image",
      buttonLabel: "Choose",
      defaultPath: defaultFolder,
      properties: ["openFile"],
      filters: [{ name: "Image", extensions: Object.keys(PROJECT_COVER_IMAGE_MEDIA_TYPES).map((extension) => extension.slice(1)) }],
    },
    "The cover image dialog",
  );
}
