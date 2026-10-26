import type { Result } from "../result.js";
import type { RunTatolabReconciliation } from "../run_tatolab_switch.js";

/** The switch uninstalling turns off, which unregisters the runtime's agent and answers how that went. */
export interface RunTatolabSwitchToTurnOff {
  setRunTatolab(runTatolab: boolean): Promise<RunTatolabReconciliation>;
}

/** "Uninstall Tatolab…": on macOS the service and the files go and the app quits; on Linux it is refused, since the installer uninstalls. */
export interface TatolabUninstall {
  /** Uninstall Tatolab, ending with the app quitting; refused with the reason in its own words, leaving the app usable. */
  uninstallTatolab(runTatolabSwitch: RunTatolabSwitchToTurnOff): Promise<Result<void, string>>;
}
