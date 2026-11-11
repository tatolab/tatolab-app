import { BrowserWindow, dialog, type SaveDialogOptions } from "electron";
import type { StreamProjectFolderChosenFor } from "../../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/**
 * The desktop's folder dialog, sheeted over the focused window: an open dialog for an existing project, a save dialog for a
 * new project's directory, which need not exist yet; `null` when the person cancels.
 */
export async function askThePersonForAStreamProjectFolderThroughElectron(
  chosenFor: StreamProjectFolderChosenFor,
  defaultFolder: string,
): Promise<Result<string | null, string>> {
  if (chosenFor === "project_to_open") {
    return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
      { title: "Choose a project folder", buttonLabel: "Choose", defaultPath: defaultFolder, properties: ["openDirectory", "createDirectory"] },
      "The folder dialog",
    );
  }
  const parentWindow = BrowserWindow.getFocusedWindow();
  const saveDialogOptions: SaveDialogOptions = {
    title: "Choose where to create the project",
    buttonLabel: "Choose",
    defaultPath: defaultFolder,
    properties: ["createDirectory"],
  };
  try {
    const saveDialogAnswer = parentWindow === null ? await dialog.showSaveDialog(saveDialogOptions) : await dialog.showSaveDialog(parentWindow, saveDialogOptions);
    return succeeded(saveDialogAnswer.canceled || saveDialogAnswer.filePath === "" ? null : saveDialogAnswer.filePath);
  } catch (caughtFailure) {
    return failedWith(`The folder dialog did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
