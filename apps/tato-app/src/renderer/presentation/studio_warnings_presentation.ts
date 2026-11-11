// What Studio says of each warning that holds: in the Warnings panel of the status bar, and in the dialog the first time the app
// opens while it holds.

import type { StudioWarning, StudioWarningKind } from "../../shared/tatolab_backend_contract";

/** A warning's title and what it tells the person to do about it. */
export interface StudioWarningWords {
  title: string;
  explanation: string;
}

/** The words of the warning `kind`. */
export function presentStudioWarning(kind: StudioWarningKind): StudioWarningWords {
  switch (kind) {
    case "viewer_frames_copied_on_x11":
      return {
        title: "Running on X11",
        explanation:
          "Tato Studio is running on X11. Viewer performance may be reduced. Log in with the “Ubuntu” session (Wayland) from the gear on the login screen for full-speed viewers.",
      };
  }
}

/** What a screen reader hears of the status bar's warnings button, as "1 warning". */
export function studioWarningsButtonWordsOf(studioWarnings: readonly StudioWarning[]): string {
  return studioWarnings.length === 1 ? "1 warning" : `${studioWarnings.length} warnings`;
}

/** The first warning whose dialog is still to be shown, or `null` when none is. */
export function studioWarningWhoseDialogIsDue(studioWarnings: readonly StudioWarning[]): StudioWarning | null {
  return studioWarnings.find((studioWarning) => studioWarning.first_open_dialog_due) ?? null;
}
