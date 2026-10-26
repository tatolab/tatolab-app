import { BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/**
 * The desktop's file dialog for a Python interpreter, sheeted over the focused window; `null` when the person cancels.
 * Hidden files show and packages open as folders, since interpreters live in `.venv`s, `.pyenv` and `Python.framework`.
 */
export async function askThePersonForAPythonInterpreterThroughElectron(): Promise<Result<string | null, string>> {
  const parentWindow = BrowserWindow.getFocusedWindow();
  const openDialogOptions: OpenDialogOptions = {
    title: "Choose a Python interpreter",
    buttonLabel: "Use This Python",
    properties: ["openFile", "showHiddenFiles", "treatPackageAsDirectory"],
  };
  try {
    const openDialogAnswer = parentWindow === null ? await dialog.showOpenDialog(openDialogOptions) : await dialog.showOpenDialog(parentWindow, openDialogOptions);
    return succeeded(openDialogAnswer.canceled ? null : (openDialogAnswer.filePaths[0] ?? null));
  } catch (caughtFailure) {
    return failedWith(`The file dialog did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
