import { app } from "electron";
import type { AppLoginItemSettings } from "../platform/macos/login_item_of_the_app_bundle.js";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";

/** The app bundle's own login item through Electron, `SMAppService.mainApp` on macOS 13 and later. */
export const ELECTRON_APP_LOGIN_ITEM_SETTINGS: AppLoginItemSettings = {
  readAppLoginItem: () => {
    const loginItemSettings = app.getLoginItemSettings({ type: "mainAppService" });
    return { openAtLogin: loginItemSettings.openAtLogin, status: loginItemSettings.status };
  },
  setAppOpensAtLogin: (openAtLogin) => {
    try {
      app.setLoginItemSettings({ openAtLogin, type: "mainAppService" });
      return succeeded(undefined);
    } catch (loginItemFailure) {
      return failedWith(describeCaughtFailure(loginItemFailure));
    }
  },
};
