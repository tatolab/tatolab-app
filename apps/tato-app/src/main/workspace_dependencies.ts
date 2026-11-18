// A workspace's imports as Module manager lists them: each one the runtime's `list_dependencies` answers,
// with the name the runtime's `list_assets` reads from its copy in `imports/<folder>/`, and the views
// the runtime's `list_project_views` of the workspace lists under its folder.

import path from "node:path";
import { Effect } from "effect";
import type { DependencySourceKind, ProjectTheRuntimeNames, ViewsOfAWorkspaceDependency, WorkspaceDependency } from "../shared/tatolab_backend_contract.js";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { studioViewOpeningOf, type ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import type { Result } from "./result.js";

/** Asks the person in the desktop's open dialog, opened at `defaultFolder`, for a project's folder or a `.zip` of one; `null` when they cancel. */
export type DependencySourceDialog = (sourceKind: DependencySourceKind, defaultFolder: string) => Promise<Result<string | null, string>>;

/** The folder inside a project that holds each project it imports, one folder each. */
export const PROJECT_IMPORTS_FOLDER = "imports";

/** The file at the root of a project that names it and lists its imports. */
export const TATOLAB_PROJECT_FILE_NAME = "tatolab-project.json";

/** `imports/<folder>/` inside `workspaceFolder`, or `null` for a folder name that would reach outside it. */
export function importFolderInsideTheWorkspace(workspaceFolder: string, folder: string): string | null {
  if (folder === "" || folder === "." || folder === ".." || folder.includes("/") || folder.includes("\\")) return null;
  return path.join(workspaceFolder, PROJECT_IMPORTS_FOLDER, folder);
}

/** Each of `listedDependencies` as Module manager shows it, in the runtime's order, named by `nameTheProjectInAFolder` from its copy (no name when it fails), with the views of `workspaceViews` its folder brings. */
export function workspaceDependenciesOf<Services>(
  workspaceFolder: string,
  listedDependencies: readonly ListedProjectDependency[],
  workspaceViews: Result<readonly ProjectViewTheRuntimeListed[], string>,
  nameTheProjectInAFolder: (projectFolder: string) => Effect.Effect<ProjectTheRuntimeNames, unknown, Services>,
): Effect.Effect<WorkspaceDependency[], never, Services> {
  return Effect.forEach(
    listedDependencies,
    (listed) => {
      const folderPath = importFolderInsideTheWorkspace(workspaceFolder, listed.dependency.folder) ?? path.join(workspaceFolder, PROJECT_IMPORTS_FOLDER);
      return nameTheProjectInAFolder(folderPath).pipe(
        Effect.match({ onSuccess: (named): string | null => named.name, onFailure: (): string | null => null }),
        Effect.map(
          (name): WorkspaceDependency => ({
            ...listed.dependency,
            folder_path: folderPath,
            name,
            edited_files: listed.edited_files,
            newer_version_exists: listed.newer_version_exists,
            check_refused_because: listed.check_refused_because,
            views: viewsTheImportBrings(workspaceViews, listed.dependency.folder),
          }),
        ),
      );
    },
    { concurrency: "unbounded" },
  );
}

function viewsTheImportBrings(workspaceViews: Result<readonly ProjectViewTheRuntimeListed[], string>, importFolder: string): ViewsOfAWorkspaceDependency {
  if (!workspaceViews.ok) return { kind: "not_listed", because: workspaceViews.failure };
  return {
    kind: "listed",
    views: workspaceViews.value
      .filter((listedView) => listedView.import_folder === importFolder)
      .map((listedView) => ({ view_type_id: listedView.view_type, manifest_json: listedView.manifest, ...studioViewOpeningOf(listedView) })),
  };
}
