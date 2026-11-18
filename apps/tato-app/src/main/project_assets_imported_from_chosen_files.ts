// The Library's Import asset…: files the person chooses in the desktop's open dialog, each copied into the
// open project by the runtime's `import_asset`, which places it in its kind's folder under its own name,
// numbered past a name already taken. One refusal leaves the other files to import.

import path from "node:path";
import { Effect, Result } from "effect";
import type { ProjectAssetsImported, ProjectTransactionAuthor } from "../shared/tatolab_backend_contract.js";
import { projectAssetFileFiltersFor, type ProjectAssetFileFilter } from "./project_asset_file_filters.js";
import type { Result as PlainResult } from "./result.js";
import { importAsset } from "./runtime_operations.js";
import { ProjectDialogs, ThisMachinesFolders } from "./studio_runtime.js";

/** Asks the person for the files to import as assets, in the desktop's open dialog opened at `defaultFolder` offering `fileFilters`, the first chosen; `null` when they cancel. */
export type ProjectAssetFilesDialog = (defaultFolder: string, fileFilters: readonly ProjectAssetFileFilter[]) => Promise<PlainResult<readonly string[] | null, string>>;

/** Each file the person chooses, the dialog opened at home offering the files of `media` first (`null` for any), imported into the project in `projectDirectory` by `author` one after another, with the files the runtime refused in its own words; `null` when they cancel. */
export const importTheFilesThePersonChooses = Effect.fn("importTheFilesThePersonChooses")(function* (
  projectDirectory: string,
  media: readonly string[] | null,
  author: ProjectTransactionAuthor,
) {
  const { homeDirectory } = yield* ThisMachinesFolders;
  const chosenFiles = yield* (yield* ProjectDialogs).chooseAssetFilesToImport(homeDirectory, projectAssetFileFiltersFor(media));
  if (chosenFiles === null || chosenFiles.length === 0) return null;
  const assetsImported: ProjectAssetsImported = { imported: [], refused: [] };
  for (const chosenFile of chosenFiles) {
    const imported = yield* Effect.result(importAsset(projectDirectory, chosenFile, null, author));
    if (Result.isSuccess(imported)) assetsImported.imported.push(imported.success);
    else assetsImported.refused.push({ file_name: path.basename(chosenFile), because: imported.failure.words });
  }
  return assetsImported;
});
