import { UNPACKAGED_APP_UPDATE_REFUSAL, type TatolabAppUpdatePackaging } from "../tatolab_app_update_packaging.js";

/**
 * How a Linux build updates itself: an AppImage, which its runtime names in `APPIMAGE` (`appImagePath`),
 * replaces its own file; a packaged app that is not one came from the `.deb`, which only apt replaces, so
 * it opens the newer version's download.
 */
export function tatolabAppUpdatePackagingOnLinux(appIsPackaged: boolean, appImagePath: string | undefined): TatolabAppUpdatePackaging {
  if (!appIsPackaged) return { kind: "not_offered", reason: UNPACKAGED_APP_UPDATE_REFUSAL };
  if (appImagePath !== undefined && appImagePath !== "") return { kind: "appimage", appImagePath };
  return { kind: "deb" };
}
