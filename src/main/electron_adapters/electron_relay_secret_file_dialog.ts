import { BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** The desktop's file dialog for a relay secret, sheeted over the focused window; `null` when the person cancels. */
export async function askThePersonForARelaySecretFileThroughElectron(): Promise<Result<string | null, string>> {
  const parentWindow = BrowserWindow.getFocusedWindow();
  const openDialogOptions: OpenDialogOptions = { title: "Choose the file that holds the secret", buttonLabel: "Use This File", properties: ["openFile"] };
  try {
    const openDialogAnswer = parentWindow === null ? await dialog.showOpenDialog(openDialogOptions) : await dialog.showOpenDialog(parentWindow, openDialogOptions);
    return succeeded(openDialogAnswer.canceled ? null : (openDialogAnswer.filePaths[0] ?? null));
  } catch (caughtFailure) {
    return failedWith(`The file dialog did not open: ${describeCaughtFailure(caughtFailure)}`);
  }
}
