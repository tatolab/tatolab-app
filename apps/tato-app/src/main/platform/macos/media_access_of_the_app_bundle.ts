// The camera and the microphone on macOS: TCC grants them to the app bundle, asking through its
// privacy prompt with the bundle's NSCameraUsageDescription and NSMicrophoneUsageDescription words.

import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { Result } from "../../result.js";
import type { SystemMediaAccess, SystemMediaAccessAnswer, SystemMediaDevice } from "../system_media_access.js";

/** Privacy & Security's pane for each device, as System Settings opens it by URL. */
export const PRIVACY_PANE_URL_OF_THE_DEVICE: Readonly<Record<SystemMediaDevice, string>> = {
  camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

/** TCC's status for a device, as Electron spells it. */
export type TccMediaAccessStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

/** Electron's media access for the app bundle, which the macOS module is handed. */
export interface AppMediaAccessSettings {
  readMediaAccessStatus(device: SystemMediaDevice): TccMediaAccessStatus;
  /** Show TCC's prompt for `device`, answering whether the person allowed it; macOS shows it only while the status is `not-determined`. */
  askForMediaAccess(device: SystemMediaDevice): Promise<Result<boolean, string>>;
  /** Open `url` with the app macOS hands it to, as System Settings for an `x-apple.systempreferences:` URL. */
  openExternalUrl(url: string): Promise<Result<void, string>>;
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
    const opened = await this.appMediaAccessSettings.openExternalUrl(PRIVACY_PANE_URL_OF_THE_DEVICE[device]);
    if (!opened.ok) this.tatolabAppLog.warn("System Settings did not open on the privacy pane", { device, failure: opened.failure });
  }
}
