import type { DependencySourceKind } from "../../shared/tatolab_backend_contract.js";
import type { Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/** The desktop's open dialog, sheeted over the focused window, for a project's folder or a `.zip` of one to import; `null` when the person cancels. */
export async function askThePersonForADependencySourceThroughElectron(sourceKind: DependencySourceKind, defaultFolder: string): Promise<Result<string | null, string>> {
  // GTK's and Windows' open dialogs choose files or folders, never both in one, so each kind has its own.
  return sourceKind === "folder"
    ? askThePersonThroughAnOpenDialogOverTheFocusedWindow({ title: "Import a project folder", buttonLabel: "Import", defaultPath: defaultFolder, properties: ["openDirectory"] }, "The import dialog")
    : askThePersonThroughAnOpenDialogOverTheFocusedWindow(
        { title: "Import a project .zip", buttonLabel: "Import", defaultPath: defaultFolder, properties: ["openFile"], filters: [{ name: "Project archive", extensions: ["zip"] }] },
        "The import dialog",
      );
}
