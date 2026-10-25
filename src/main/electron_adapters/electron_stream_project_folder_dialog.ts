// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import type { StreamProjectFolderChosenFor } from "../../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/**
 * The desktop's folder dialog, sheeted over the focused window: an open dialog for an existing project, a save dialog for a
 * new project's directory, which need not exist yet; `null` when the person cancels.
 */
export async function askThePersonForAStreamProjectFolderThroughElectron(
  chosenFor: StreamProjectFolderChosenFor,
  defaultFolder: string,
): Promise<Result<string | null, string>> {
  const parentWindow = BrowserWindow.getFocusedWindow();
  try {
    switch (chosenFor) {
      case "project_to_run": {
        const openDialogOptions: OpenDialogOptions = {
          title: "Choose a project folder",
          buttonLabel: "Choose",
          defaultPath: defaultFolder,
          properties: ["openDirectory", "createDirectory"],
        };
        const openDialogAnswer =
          parentWindow === null ? await dialog.showOpenDialog(openDialogOptions) : await dialog.showOpenDialog(parentWindow, openDialogOptions);
        return succeeded(openDialogAnswer.canceled ? null : (openDialogAnswer.filePaths[0] ?? null));
      }
      case "new_project_directory": {
        const saveDialogOptions: SaveDialogOptions = {
          title: "Choose where to create the project",
          buttonLabel: "Choose",
          defaultPath: defaultFolder,
          properties: ["createDirectory"],
        };
        const saveDialogAnswer =
          parentWindow === null ? await dialog.showSaveDialog(saveDialogOptions) : await dialog.showSaveDialog(parentWindow, saveDialogOptions);
        return succeeded(saveDialogAnswer.canceled || saveDialogAnswer.filePath === "" ? null : saveDialogAnswer.filePath);
      }
    }
  } catch (caughtFailure) {
    return failedWith(`The folder dialog did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
