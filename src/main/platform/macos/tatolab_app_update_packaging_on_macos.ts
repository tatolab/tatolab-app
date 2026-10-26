import { UNPACKAGED_APP_UPDATE_REFUSAL, type TatolabAppUpdatePackaging } from "../tatolab_app_update_packaging.js";

/** Squirrel.Mac replaces a packaged app's bundle from a signed `.zip`; an unpackaged app runs from Electron's bundle, which it never replaces. */
export function tatolabAppUpdatePackagingOnMacos(appIsPackaged: boolean): TatolabAppUpdatePackaging {
  return appIsPackaged ? { kind: "squirrel_mac_zip" } : { kind: "not_offered", reason: UNPACKAGED_APP_UPDATE_REFUSAL };
}
