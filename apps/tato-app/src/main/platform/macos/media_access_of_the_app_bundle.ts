// The camera and the microphone on macOS: TCC grants them to the app bundle, asking through its
// privacy prompt with the bundle's NSCameraUsageDescription and NSMicrophoneUsageDescription words.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { Result } from "../../result.js";
import type { SystemMediaAccess, SystemMediaAccessAnswer, SystemMediaDevice } from "../system_media_access.js";

/** Electron's media access for the app bundle, which the macOS module is handed. */
export interface AppMediaAccessSettings {
  /** TCC's status for `device`, as Electron spells it: `not-determined`, `granted`, `denied`, `restricted` or `unknown`. */
  readMediaAccessStatus(device: SystemMediaDevice): string;
  /** Show TCC's prompt for `device`, answering whether the person allowed it; macOS shows it only while the status is `not-determined`. */
  askForMediaAccess(device: SystemMediaDevice): Promise<Result<boolean, string>>;
  /** Open System Settings on Privacy & Security's pane for `device`. */
  openThePrivacyPaneOf(device: SystemMediaDevice): Promise<Result<void, string>>;
}

/** The bundle's camera and microphone access, through Electron's media access. */
export class MediaAccessOfTheAppBundle implements SystemMediaAccess {
  constructor(
    private readonly appMediaAccessSettings: AppMediaAccessSettings,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  async askAheadFor(device: SystemMediaDevice): Promise<SystemMediaAccessAnswer> {
    const status = this.appMediaAccessSettings.readMediaAccessStatus(device);
    if (status === "granted") return { kind: "allowed" };
    if (status === "not-determined") {
      const asked = await this.appMediaAccessSettings.askForMediaAccess(device);
      if (asked.ok && asked.value) return { kind: "allowed" };
      if (!asked.ok) this.tatolabAppLog.warn("macOS did not ask for a device a view declares", { device, failure: asked.failure });
    }
    return { kind: "refused", openWhereThePersonAllowsIt: () => void this.openThePrivacyPaneOf(device) };
  }

  private async openThePrivacyPaneOf(device: SystemMediaDevice): Promise<void> {
    const opened = await this.appMediaAccessSettings.openThePrivacyPaneOf(device);
    if (!opened.ok) this.tatolabAppLog.warn("System Settings did not open on the privacy pane", { device, failure: opened.failure });
  }
}
