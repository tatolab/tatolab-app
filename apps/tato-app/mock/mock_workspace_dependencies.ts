// The mock's workspace imports, as the runtime's dependency tools would answer them: one project
// copied from a folder beside the workspace. `?module_manager=newer` has its source hold a newer version;
// `?module_manager=edited_files` has that and a file of its copy edited since, so Update waits on the overwrite.
// Each import's views are those the mock's own project-views listing lists under its folder.

import type { DependencySourceKind, ListedStudioView, ProjectDependency, ViewsOfAWorkspaceDependency, WorkspaceDependency, WorkspaceDependencyUpdate } from "../src/shared/tatolab_backend_contract";
import { moduleFolderNameOf } from "../src/renderer/studio_shell/module_manager_listing";

/** The state the mock workspace's imports start in. */
export type MockWorkspaceDependenciesScenario = "copied" | "edited_files" | "newer";

/** The scenario `?module_manager=` names, or `null` where the page is no Module manager window. */
export function mockWorkspaceDependenciesScenarioNamed(moduleManagerQueryValue: string | null): MockWorkspaceDependenciesScenario | null {
  switch (moduleManagerQueryValue) {
    case "open":
      return "copied";
    case "edited_files":
    case "newer":
      return moduleManagerQueryValue;
    default:
      return null;
  }
}

const MOCK_VERSION_COPIED = "9f2c4e1a7b3d5f60c8e2a4b6d8f0a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5";
const MOCK_VERSION_ON_THE_SOURCE = "1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d";

/** Answers the mock window's dependency asks over the workspace in `workspaceFolder`, rejecting in the runtime's words. */
export class MockWorkspaceDependencies {
  private readonly dependencies: WorkspaceDependency[];

  constructor(
    private readonly workspaceFolder: string,
    scenario: MockWorkspaceDependenciesScenario,
    private readonly viewsListedInTheWorkspace: () => ListedStudioView[],
  ) {
    const sourceFolder = `${workspaceFolder.slice(0, workspaceFolder.lastIndexOf("/"))}/lobby-wall`;
    this.dependencies = [
      {
        project: "5d0f7a52-8c1e-4b9a-9d3f-2e6b8a4c1f70",
        folder: "lobby-wall",
        source: sourceFolder,
        version: MOCK_VERSION_COPIED,
        folder_path: `${workspaceFolder}/imports/lobby-wall`,
        name: "lobby-wall",
        edited_files: scenario === "edited_files" ? ["nodes/wall_mapping.py"] : [],
        newer_version_exists: scenario === "copied" ? null : true,
        check_refused_because: null,
        views: { kind: "listed", views: [] },
      },
    ];
  }

  /** Each import, its newer-version mark kept only when `checkForNewer`. */
  list(checkForNewer: boolean): WorkspaceDependency[] {
    return structuredClone(this.dependencies).map((dependency) => ({
      ...dependency,
      newer_version_exists: checkForNewer ? (dependency.newer_version_exists ?? false) : null,
      views: this.viewsTheImportBrings(dependency.folder),
    }));
  }

  private viewsTheImportBrings(folder: string): ViewsOfAWorkspaceDependency {
    return {
      kind: "listed",
      views: this.viewsListedInTheWorkspace()
        .filter((listedView) => listedView.import_folder === folder)
        .map(({ view_type_id, manifest_json, ...opening }) => ({ view_type_id, manifest_json, ...(opening.opens ? { opens: true, not_opened_because: null } : { opens: false, not_opened_because: opening.not_opened_because }) })),
    };
  }

  /** What the dialog answers for `sourceKind`: a project beside the workspace. */
  sourceTheDialogAnswers(sourceKind: DependencySourceKind): string {
    const besideTheWorkspace = this.workspaceFolder.slice(0, this.workspaceFolder.lastIndexOf("/"));
    return sourceKind === "folder" ? `${besideTheWorkspace}/doorways` : `${besideTheWorkspace}/doorways.zip`;
  }

  /** `source` copied into `imports/<name in its project file>`, the folder named as the runtime names it, refused where it is held already. */
  add(source: string, nameInItsProjectFile: string = (source.split("/").pop() ?? source).replace(/\.zip$/, "")): ProjectDependency {
    const name = moduleFolderNameOf(nameInItsProjectFile);
    if (this.dependencies.some((dependency) => dependency.source === source || dependency.folder === name)) throw `the project already imports ${source} in imports/${name}`;
    const dependency: WorkspaceDependency = {
      project: crypto.randomUUID(),
      folder: name,
      source,
      version: MOCK_VERSION_COPIED,
      folder_path: `${this.workspaceFolder}/imports/${name}`,
      name: nameInItsProjectFile,
      edited_files: [],
      newer_version_exists: null,
      check_refused_because: null,
      views: { kind: "listed", views: [] },
    };
    this.dependencies.push(dependency);
    return { project: dependency.project, folder: dependency.folder, source: dependency.source, version: dependency.version };
  }

  /** The import `project` copied again, or the files it waits on the overwrite of. */
  update(project: string, overwriteEditedFiles: boolean): WorkspaceDependencyUpdate {
    const dependency = this.dependencies.find((listed) => listed.project === project);
    if (dependency === undefined) throw `the project imports no project ${project}`;
    if (dependency.edited_files.length > 0 && !overwriteEditedFiles) return { kind: "edited_since_its_copy", edited_files: [...dependency.edited_files] };
    dependency.edited_files = [];
    if (dependency.newer_version_exists === true) dependency.version = MOCK_VERSION_ON_THE_SOURCE;
    dependency.newer_version_exists = false;
    return { kind: "updated", dependency: { project: dependency.project, folder: dependency.folder, source: dependency.source, version: dependency.version } };
  }

  /** The import `project` taken out, refused in the runtime's words where the project imports none. */
  remove(project: string): ProjectDependency {
    const index = this.dependencies.findIndex((listed) => listed.project === project);
    const dependency = this.dependencies[index];
    if (dependency === undefined) throw `remove_dependency failed: the project imports no project ${project}`;
    this.dependencies.splice(index, 1);
    return { project: dependency.project, folder: dependency.folder, source: dependency.source, version: dependency.version };
  }
}
