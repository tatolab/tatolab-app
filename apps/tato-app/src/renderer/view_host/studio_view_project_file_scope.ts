// A project's view reaches Studio only through its bridge, so the bridge is where its file asks are
// held to the project that brings it: the open project for its own view, the import's folder for an
// import's, never the folder of the project that imported it.

import type { OpenProjectReading } from "../../shared/tatolab_backend_contract";
import type { StudioViewHostServices } from "./studio_view_contract";

/** The folder of the project that brings a view: the open project's, or the folder under its `imports/` named `importFolder`; `null` while no project is read. */
export function folderOfTheProjectBringingTheView(openProject: OpenProjectReading | null, importFolder: string | null): string | null {
  if (openProject?.kind !== "read") return null;
  const openProjectFolder = openProject.open_project.project.folder;
  return importFolder === null ? openProjectFolder : `${openProjectFolder}/imports/${importFolder}`;
}

/** Whether `file` names `folder` or a path under it, with no `.` or `..` step that could climb out. */
function isAtOrUnderTheFolder(file: string, folder: string): boolean {
  if (file.split("/").some((pathSegment) => pathSegment === "." || pathSegment === "..")) return false;
  return file === folder || file.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
}

/** `hostServices` with its project file asks held to the folder `viewsProjectFolderNow` answers at each ask, of the project bringing the view `viewTitle`, and refused for any file outside it. */
export function hostServicesHoldingFilesToTheViewsProject(hostServices: StudioViewHostServices, viewTitle: string, viewsProjectFolderNow: () => string | null): StudioViewHostServices {
  const refusalOfAFileOutside = (file: string) => {
    const viewsProjectFolder = viewsProjectFolderNow();
    return viewsProjectFolder === null ? `${viewTitle} reads project files only while its project is open.` : `${viewTitle} reads and writes only its own project's files, in ${viewsProjectFolder}; ${file} is outside it.`;
  };
  const isTheViewsOwn = (file: string) => {
    const viewsProjectFolder = viewsProjectFolderNow();
    return viewsProjectFolder !== null && isAtOrUnderTheFolder(file, viewsProjectFolder);
  };
  return {
    ...hostServices,
    readProjectFile: async (file) => (isTheViewsOwn(file) ? hostServices.readProjectFile(file) : { kind: "not_read", because: refusalOfAFileOutside(file) }),
    saveProjectFile: async (file, text, basedOnVersion) =>
      isTheViewsOwn(file) ? hostServices.saveProjectFile(file, text, basedOnVersion) : { kind: "not_saved", because: refusalOfAFileOutside(file) },
    listProjectFiles: async (projectFolder) => (isTheViewsOwn(projectFolder) ? hostServices.listProjectFiles(projectFolder) : { kind: "not_listed", because: refusalOfAFileOutside(projectFolder) }),
  };
}
