import type { Result } from "../result.js";
import { askThePersonThroughAnOpenDialogOverTheFocusedWindow } from "./electron_open_dialog_over_the_focused_window.js";

/**
 * The desktop's file dialog for a Python interpreter, sheeted over the focused window; `null` when the person cancels.
 * Hidden files show and packages open as folders, since interpreters live in `.venv`s, `.pyenv` and `Python.framework`.
 */
export function askThePersonForAPythonInterpreterThroughElectron(): Promise<Result<string | null, string>> {
  return askThePersonThroughAnOpenDialogOverTheFocusedWindow(
    { title: "Choose a Python interpreter", buttonLabel: "Use This Python", properties: ["openFile", "showHiddenFiles", "treatPackageAsDirectory"] },
    "The file dialog",
  );
}
