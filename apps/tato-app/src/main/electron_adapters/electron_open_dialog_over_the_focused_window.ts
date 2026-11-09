import { BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** The desktop's open dialog with `openDialogOptions`, sheeted over the focused window: the first path chosen, `null` when the person cancels, refused naming `whatDidNotOpen` when it does not open. */
export async function askThePersonThroughAnOpenDialogOverTheFocusedWindow(openDialogOptions: OpenDialogOptions, whatDidNotOpen: string): Promise<Result<string | null, string>> {
  const parentWindow = BrowserWindow.getFocusedWindow();
  try {
    const openDialogAnswer = parentWindow === null ? await dialog.showOpenDialog(openDialogOptions) : await dialog.showOpenDialog(parentWindow, openDialogOptions);
    return succeeded(openDialogAnswer.canceled ? null : (openDialogAnswer.filePaths[0] ?? null));
  } catch (caughtFailure) {
    return failedWith(`${whatDidNotOpen} did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
