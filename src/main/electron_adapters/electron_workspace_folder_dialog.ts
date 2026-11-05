import { BrowserWindow, dialog, type SaveDialogOptions } from "electron";
import type { WorkspaceFolderChosenFor } from "../../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/** The desktop's folder dialog, sheeted over the focused window: an open dialog for an existing workspace, a save dialog for a new one's folder, which need not exist yet; `null` when the person cancels. */
export async function askThePersonForAWorkspaceFolderThroughElectron(chosenFor: WorkspaceFolderChosenFor, defaultFolder: string): Promise<Result<string | null, string>> {
  if (chosenFor === "workspace_to_open") {
    return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
      { title: "Open a workspace", buttonLabel: "Open", defaultPath: defaultFolder, properties: ["openDirectory", "createDirectory"] },
      "The workspace dialog",
    );
  }
  const parentWindow = BrowserWindow.getFocusedWindow();
  const saveDialogOptions: SaveDialogOptions = { title: "Create a workspace", buttonLabel: "Create", defaultPath: defaultFolder, properties: ["createDirectory"] };
  try {
    const saveDialogAnswer = parentWindow === null ? await dialog.showSaveDialog(saveDialogOptions) : await dialog.showSaveDialog(parentWindow, saveDialogOptions);
    return succeeded(saveDialogAnswer.canceled || saveDialogAnswer.filePath === "" ? null : saveDialogAnswer.filePath);
  } catch (caughtFailure) {
    return failedWith(`The workspace dialog did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
