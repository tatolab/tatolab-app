// The Library's Import asset…: files the person chooses in the desktop's open dialog, each copied into the
// open project by the runtime's `import_asset` under its own name, numbered past a file already there, in
// the folder the Library shows. One refusal leaves the other files to import.

import path from "node:path";
import type { ProjectAssetsImported, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { firstNumberedNameNothingHoldsIn, type ProjectChangesThroughTheRuntime } from "./open_project.js";
import { assetFolderRefusal } from "../shared/asset_folder_in_a_project.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** Asks the person for the files to import as assets, in the desktop's open dialog opened at `defaultFolder`; `null` when they cancel. */
export type ProjectAssetFilesDialog = (defaultFolder: string) => Promise<Result<readonly string[] | null, string>>;

/** What importing chosen files reaches: the dialog, the person's home folder it opens at, and the runtime's `import_asset`. */
export interface ProjectAssetsImportedFromChosenFilesSources {
  homeDirectory: string;
  projectAssetFilesDialog: ProjectAssetFilesDialog;
  projectChanges: Pick<ProjectChangesThroughTheRuntime, "importAsset">;
}

/** The files the person chooses, imported into a project one after another. */
export class ProjectAssetsImportedFromChosenFiles {
  constructor(private readonly sources: ProjectAssetsImportedFromChosenFilesSources) {}

  /** Each file the person chooses imported into `intoFolder` of the project in `projectDirectory` by `author`, with the files the runtime refused in its own words; `null` when they cancel. */
  async importTheFilesThePersonChooses(projectDirectory: string, intoFolder: string, author: ProjectTransactionAuthor): Promise<Result<ProjectAssetsImported | null, string>> {
    const folderRefusal = assetFolderRefusal(intoFolder);
    if (folderRefusal !== null) return failedWith(folderRefusal);
    const chosenFiles = await this.sources.projectAssetFilesDialog(this.sources.homeDirectory);
    if (!chosenFiles.ok) return chosenFiles;
    if (chosenFiles.value === null || chosenFiles.value.length === 0) return succeeded(null);
    const assetsImported: ProjectAssetsImported = { imported: [], refused: [] };
    for (const chosenFile of chosenFiles.value) {
      const fileName = path.basename(chosenFile);
      const extension = path.extname(fileName);
      const freeName = await firstNumberedNameNothingHoldsIn(path.join(projectDirectory, intoFolder), path.basename(fileName, extension), extension);
      const assetPath = intoFolder === "" ? `${freeName}${extension}` : `${intoFolder}/${freeName}${extension}`;
      const imported = await this.sources.projectChanges.importAsset(projectDirectory, chosenFile, assetPath, author);
      if (imported.ok) assetsImported.imported.push(imported.value);
      else assetsImported.refused.push({ file_name: fileName, because: imported.failure.failureDescription });
    }
    return succeeded(assetsImported);
  }
}
