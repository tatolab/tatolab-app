import type { TatolabAppLog } from "../../tatolab_app_log.js";
import { tatolabAppNotOpenedAtLogin, UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL, type TatolabAppOpenedAtLogin } from "../tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging } from "../tatolab_app_update_packaging.js";
import { XdgAutostartDesktopEntry, xdgAutostartDirectory } from "./xdg_autostart_desktop_entry.js";

/** An autostart entry opening the AppImage this build updates as, or the installed app binary; not offered by an unpackaged app. */
export function tatolabAppOpenedAtLoginOnLinux(
  appUpdatePackaging: TatolabAppUpdatePackaging,
  appExecutable: string,
  xdgConfigHome: string | undefined,
  homeDirectory: string,
  tatolabAppLog: TatolabAppLog,
): TatolabAppOpenedAtLogin {
  if (appUpdatePackaging.kind === "not_offered") return tatolabAppNotOpenedAtLogin(UNPACKAGED_APP_OPEN_AT_LOGIN_REFUSAL);
  const appProgramPath = appUpdatePackaging.kind === "appimage" ? appUpdatePackaging.appImagePath : appExecutable;
  return new XdgAutostartDesktopEntry(xdgAutostartDirectory(xdgConfigHome, homeDirectory), appProgramPath, tatolabAppLog);
}
