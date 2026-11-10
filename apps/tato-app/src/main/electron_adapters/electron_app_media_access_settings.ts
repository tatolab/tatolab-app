import { shell, systemPreferences } from "electron";
import type { AppMediaAccessSettings } from "../platform/macos/media_access_of_the_app_bundle.js";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";

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
  openExternalUrl: async (url) => {
    try {
      await shell.openExternal(url);
      return succeeded(undefined);
    } catch (openFailure) {
      return failedWith(describeCaughtFailure(openFailure));
    }
  },
};
