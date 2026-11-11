import { BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** The desktop's open dialog with `openDialogOptions`, sheeted over the focused window: every path chosen, `null` when the person cancels, refused naming `whatDidNotOpen` when it does not open. */
export async function askThePersonForEveryPathThroughAnOpenDialogOverTheFocusedWindow(openDialogOptions: OpenDialogOptions, whatDidNotOpen: string): Promise<Result<readonly string[] | null, string>> {
  const parentWindow = BrowserWindow.getFocusedWindow();
  try {
    const openDialogAnswer = parentWindow === null ? await dialog.showOpenDialog(openDialogOptions) : await dialog.showOpenDialog(parentWindow, openDialogOptions);
    return succeeded(openDialogAnswer.canceled ? null : openDialogAnswer.filePaths);
  } catch (caughtFailure) {
    return failedWith(`${whatDidNotOpen} did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}

/** The desktop's open dialog with `openDialogOptions`, sheeted over the focused window: the first path chosen, `null` when the person cancels, refused naming `whatDidNotOpen` when it does not open. */
export async function askThePersonThroughAnOpenDialogOverTheFocusedWindow(openDialogOptions: OpenDialogOptions, whatDidNotOpen: string): Promise<Result<string | null, string>> {
  const everyPathChosen = await askThePersonForEveryPathThroughAnOpenDialogOverTheFocusedWindow(openDialogOptions, whatDidNotOpen);
  if (!everyPathChosen.ok) return everyPathChosen;
  return succeeded(everyPathChosen.value === null ? null : (everyPathChosen.value[0] ?? null));
}
