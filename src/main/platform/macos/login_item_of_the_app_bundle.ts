// "Open Spudnik Studio at login" on macOS: the app bundle's own login item, which Electron registers
// through `SMAppService.mainApp` on macOS 13 and later and reads back with its status.

import type { TatolabAppOpenAtLogin } from "../../../shared/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppOpenedAtLogin } from "../tatolab_app_opened_at_login.js";

/**
 * The app's login item as Electron reads it: `openAtLogin`, and `status`, `SMAppService.mainApp`'s status spelled
 * `not-registered`, `enabled`, `requires-approval` or `not-found`, absent where Electron gives none.
 */
export interface AppLoginItemReading {
  openAtLogin: boolean;
  status?: string;
}

/** Electron's login-item settings for the app's own bundle, which the macOS module is handed. */
export interface AppLoginItemSettings {
  readAppLoginItem(): AppLoginItemReading;
  /** Register or unregister the bundle's login item; refused in Electron's words when it throws. */
  setAppOpensAtLogin(openAtLogin: boolean): Result<void, string>;
}

/** What `SMAppService.mainApp`'s status says, or what `openAtLogin` says where it gives none. */
export function tatolabAppOpenAtLoginFrom(appLoginItem: AppLoginItemReading): TatolabAppOpenAtLogin {
  switch (appLoginItem.status) {
    case "enabled":
      return { kind: "on" };
    case "requires-approval":
      return { kind: "needs_approval_in_login_items" };
    case "not-registered":
    case "not-found":
      return { kind: "off" };
    default:
      return appLoginItem.openAtLogin ? { kind: "on" } : { kind: "off" };
  }
}

/** The bundle's login item, through Electron's login-item settings. */
export class LoginItemOfTheAppBundle implements TatolabAppOpenedAtLogin {
  constructor(private readonly appLoginItemSettings: AppLoginItemSettings) {}

  async readOpenAtLogin(): Promise<TatolabAppOpenAtLogin> {
    return tatolabAppOpenAtLoginFrom(this.appLoginItemSettings.readAppLoginItem());
  }

  async setOpenAtLogin(openAtLogin: boolean): Promise<Result<void, string>> {
    const set = this.appLoginItemSettings.setAppOpensAtLogin(openAtLogin);
    if (!set.ok) return set;
    // Electron logs a refused registration rather than throwing it, so the status read back is what happened.
    const readBack = tatolabAppOpenAtLoginFrom(this.appLoginItemSettings.readAppLoginItem());
    if (openAtLogin) {
      // A registration awaiting the person's approval in Login Items was carried out; the status says so.
      return readBack.kind === "on" || readBack.kind === "needs_approval_in_login_items"
        ? succeeded(undefined)
        : failedWith("macOS did not add Spudnik Studio to your login items. Add it in System Settings › General › Login Items.");
    }
    return readBack.kind === "off"
      ? succeeded(undefined)
      : failedWith("macOS did not remove Spudnik Studio from your login items. Remove it in System Settings › General › Login Items.");
  }
}
