import { shell, systemPreferences } from "electron";
import type { AppMediaAccessSettings } from "../platform/macos/media_access_of_the_app_bundle.js";
import type { SystemMediaDevice } from "../platform/system_media_access.js";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";

/** Privacy & Security's pane for each device, as System Settings opens it by URL. */
const PRIVACY_PANE_URL_OF_THE_DEVICE: Readonly<Record<SystemMediaDevice, string>> = {
  camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

/** The app bundle's camera and microphone access through Electron's `systemPreferences`, which exists on macOS only. */
export const ELECTRON_APP_MEDIA_ACCESS_SETTINGS: AppMediaAccessSettings = {
  readMediaAccessStatus: (device) => systemPreferences.getMediaAccessStatus(device),
  askForMediaAccess: async (device) => {
    try {
      return succeeded(await systemPreferences.askForMediaAccess(device));
    } catch (askFailure) {
      return failedWith(describeCaughtFailure(askFailure));
    }
  },
  openThePrivacyPaneOf: async (device) => {
    try {
      await shell.openExternal(PRIVACY_PANE_URL_OF_THE_DEVICE[device]);
      return succeeded(undefined);
    } catch (openFailure) {
      return failedWith(describeCaughtFailure(openFailure));
    }
  },
};
