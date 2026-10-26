import { app, shell } from "electron";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";
import type { TatolabUninstallAppSurface } from "../platform/macos/tatolab_uninstall.js";

/** The Trash through Electron's `shell`, which on macOS moves the item as Finder does, and quitting through `app`. */
export const ELECTRON_TATOLAB_UNINSTALL_APP_SURFACE: TatolabUninstallAppSurface = {
  moveToTheTrash: (itemPath) =>
    shell.trashItem(itemPath).then(
      () => succeeded(undefined),
      (trashFailure: unknown) => failedWith(describeCaughtFailure(trashFailure)),
    ),
  quitTheApp: () => app.exit(0),
};
