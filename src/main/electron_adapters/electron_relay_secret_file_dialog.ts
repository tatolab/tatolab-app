import type { Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/** The desktop's file dialog for a relay secret, sheeted over the focused window; `null` when the person cancels. */
export function askThePersonForARelaySecretFileThroughElectron(): Promise<Result<string | null, string>> {
  return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
    { title: "Choose the file that holds the secret", buttonLabel: "Use This File", properties: ["openFile"] },
    "The file dialog",
  );
}
