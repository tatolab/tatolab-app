// The views the open project and its imports bring, as the window's view-type menu lists them: the
// runtime's `list_project_views`, each view's folder served under the window page's scheme from the bytes
// `read_project_file` answers.

import path from "node:path";
import type { ListedStudioView, OpenProjectReading } from "../shared/tatolab_backend_contract.js";
import { projectViewFolderUrl, type ProjectViewsListedToTheWindows } from "./project_view_files.js";
import type { ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The runtime's `list_project_views`, refused in its own words. */
export type ListTheProjectViewsOfTheRuntime = (projectDirectory: string) => Promise<Result<ProjectViewTheRuntimeListed[], string>>;

/** The folder of the project whose `views/<folder>` is `viewFolderInTheProject` of the project in `openProjectFolder`: that project's own, or an import's under `imports/`. */
function folderOfTheProjectBringingTheView(openProjectFolder: string, viewFolderInTheProject: string): string {
  return path.join(openProjectFolder, path.posix.dirname(path.posix.dirname(viewFolderInTheProject)));
}

/** The views the open project in `openProjectReading` and its imports bring, each with the URL its folder is served under, kept in `projectViewsListed` as the only views served; refused while no project is read, or in the runtime's words. */
export async function studioViewsOfTheOpenProject(
  openProjectReading: OpenProjectReading,
  listTheProjectViews: ListTheProjectViewsOfTheRuntime,
  projectViewsListed: ProjectViewsListedToTheWindows,
): Promise<Result<ListedStudioView[], string>> {
  if (openProjectReading.kind === "unreadable") return failedWith(openProjectReading.refusal);
  if (openProjectReading.kind !== "read") return failedWith("No project is open in this window.");
  const openProjectFolder = openProjectReading.open_project.project.folder;
  const listed = await listTheProjectViews(openProjectFolder);
  if (!listed.ok) return listed;
  projectViewsListed.rememberTheListing(openProjectFolder, listed.value);
  return succeeded(
    listed.value.map((listedView) => ({
      view_type_id: listedView.view_type,
      project_name: listedView.project_name,
      import_folder: listedView.import_folder,
      project_folder: folderOfTheProjectBringingTheView(openProjectFolder, listedView.view_folder_in_the_project),
      manifest_json: listedView.manifest,
      folder_url: projectViewFolderUrl(openProjectFolder, listedView.view_folder_in_the_project),
      ...(listedView.opens ? { opens: true, not_opened_because: null } : { opens: false, not_opened_because: listedView.not_opened_because }),
    })),
  );
}
