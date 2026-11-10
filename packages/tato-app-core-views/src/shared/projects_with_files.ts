import type { OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A project whose files a view lists: the open project or one of its folder imports, by its name and folder. */
export interface ProjectWithFiles {
  readonly project_name: string;
  readonly project_folder: string;
  readonly is_an_import: boolean;
}

/** The open project first, then each import the runtime read from its folder, in the order it lists them. */
export function projectsWithFilesOf(openProject: OpenProject): ProjectWithFiles[] {
  return [
    { project_name: openProject.project.name, project_folder: openProject.project.folder, is_an_import: false },
    ...openProject.imports.flatMap((importedProject) =>
      importedProject.source.kind === "folder" ? [{ project_name: importedProject.source.project.name, project_folder: importedProject.source.project.folder, is_an_import: true }] : [],
    ),
  ];
}
