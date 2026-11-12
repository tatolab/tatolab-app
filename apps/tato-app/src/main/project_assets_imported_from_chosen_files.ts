// The Library's Import asset…: files the person chooses in the desktop's open dialog, each copied into the
// open project by the runtime's `import_asset`, which places it in its kind's folder under its own name,
// numbered past a name already taken. One refusal leaves the other files to import.

import path from "node:path";
import type { ProjectAssetsImported, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import type { ProjectChangesThroughTheRuntime } from "./open_project.js";
import { projectAssetFileFiltersFor, type ProjectAssetFileFilter } from "./project_asset_file_filters.js";
import { succeeded, type Result } from "./result.js";

/** Asks the person for the files to import as assets, in the desktop's open dialog opened at `defaultFolder` offering `fileFilters`, the first chosen; `null` when they cancel. */
export type ProjectAssetFilesDialog = (defaultFolder: string, fileFilters: readonly ProjectAssetFileFilter[]) => Promise<Result<readonly string[] | null, string>>;

/** What importing chosen files reaches: the dialog, the person's home folder it opens at, and the runtime's `import_asset`. */
export interface ProjectAssetsImportedFromChosenFilesSources {
  homeDirectory: string;
  projectAssetFilesDialog: ProjectAssetFilesDialog;
  projectChanges: Pick<ProjectChangesThroughTheRuntime, "importAsset">;
}

/** The files the person chooses, imported into a project one after another. */
export class ProjectAssetsImportedFromChosenFiles {
  constructor(private readonly sources: ProjectAssetsImportedFromChosenFilesSources) {}

  /** Each file the person chooses, the dialog offering the files of `media` first (`null` for any), imported into the project in `projectDirectory` by `author`, with the files the runtime refused in its own words; `null` when they cancel. */
  async importTheFilesThePersonChooses(projectDirectory: string, media: readonly string[] | null, author: ProjectTransactionAuthor): Promise<Result<ProjectAssetsImported | null, string>> {
    const chosenFiles = await this.sources.projectAssetFilesDialog(this.sources.homeDirectory, projectAssetFileFiltersFor(media));
    if (!chosenFiles.ok) return chosenFiles;
    if (chosenFiles.value === null || chosenFiles.value.length === 0) return succeeded(null);
    const assetsImported: ProjectAssetsImported = { imported: [], refused: [] };
    for (const chosenFile of chosenFiles.value) {
      const imported = await this.sources.projectChanges.importAsset(projectDirectory, chosenFile, null, author);
      if (imported.ok) assetsImported.imported.push(imported.value);
      else assetsImported.refused.push({ file_name: path.basename(chosenFile), because: imported.failure.failureDescription });
    }
    return succeeded(assetsImported);
  }
}
