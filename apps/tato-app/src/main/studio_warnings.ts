// The warnings Studio shows while they hold, each with a dialog the first time the app opens while it holds, remembered once per
// machine. The one warning so far: viewers copying their frames through the CPU, outside a Wayland session.

import type { StudioWarning, StudioWarningKind } from "../shared/tatolab_backend_contract.js";
import type { ViewerImageFrameReading } from "./platform/viewer_image_frame_reading.js";
import type { HeldRememberedSwitch } from "./remembered_switch_file.js";
import type { Result } from "./result.js";

/** The warnings of this run of the app, decided as it opens, and whether each one's dialog was shown. */
export class StudioWarningsOfThisRun {
  constructor(
    private readonly viewerImageFrameReading: ViewerImageFrameReading,
    private readonly x11WarningDialogShown: HeldRememberedSwitch,
  ) {}

  /** Each warning that holds now, which every status carries. */
  warningsNow(): StudioWarning[] {
    if (this.viewerImageFrameReading !== "cpu_read") return [];
    return [{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: !this.x11WarningDialogShown.isOnNow() }];
  }

  /** Remember that the dialog of `kind` was shown, so no window shows it again; refused when that could not be remembered, though no window shows it again until the app quits. */
  rememberTheDialogWasShown(kind: StudioWarningKind): Promise<Result<void, string>> {
    switch (kind) {
      case "viewer_frames_copied_on_x11":
        return this.x11WarningDialogShown.setAndRemember(true);
    }
  }
}
