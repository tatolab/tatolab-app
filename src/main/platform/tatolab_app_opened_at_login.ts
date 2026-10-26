// The seam between "Open Tatolab at login" and the desktop's own login items: the app's login
// item on macOS, an XDG autostart entry on Linux. It opens the app; the runtime starts at login
// through its own agent either way.

import type { TatolabAppOpenAtLogin } from "../../shared/tatolab_backend_contract.js";
import { failedWith, type Result } from "../result.js";

/** Why an unpackaged app does not offer to open at login: it runs from Electron's own bundle, which is not Tatolab. */
export const UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL = "Only a packaged Tatolab opens at login.";

/** Whether the desktop opens the app at login, and turning it on or off. */
export interface TatolabAppOpenedAtLogin {
  /** What the desktop reports now. */
  readOpenAtLogin(): Promise<TatolabAppOpenAtLogin>;
  /** Have the desktop open the app at login, or stop; refused in the desktop's own words, or with why it is not offered. */
  setOpenAtLogin(openAtLogin: boolean): Promise<Result<void, string>>;
}

/** Opening at login where the build cannot: it reads and refuses `not_offered`, with why. */
export function tatolabAppNotOpenedAtLogin(reason: string): TatolabAppOpenedAtLogin {
  return {
    readOpenAtLogin: async () => ({ kind: "not_offered", reason }),
    setOpenAtLogin: async () => failedWith(reason),
  };
}
