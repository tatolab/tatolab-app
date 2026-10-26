// Linux: the app's uv and built-in Python in the package's resources folder — under
// /usr/lib/tatolab for the .deb, inside the AppImage's mount, which moves on every launch. Copies go to the XDG data folder,
// since the app's config folder is no place for an interpreter.

import path from "node:path";
import { BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES, bundledPythonToolchainFoundAt, type BundledPythonToolchain } from "../bundled_python_toolchain.js";
import { TATOLAB_APP_IDENTIFIER } from "../tatolab_app_identifier.js";

/** uv's file name in the resources folder. */
const BUNDLED_UV_FILE_NAME = "uv";

/** The XDG data folder when `XDG_DATA_HOME` names none, from the home folder. */
const DEFAULT_XDG_DATA_HOME_INSIDE_THE_HOME_FOLDER = path.join(".local", "share");

/** Why an unpackaged app has no toolchain: its resources are Electron's own. */
const UNPACKAGED_APP_PYTHON_TOOLCHAIN_REFUSAL = "This app runs unpackaged, from Electron's own resources, which carry no uv or Python of Tatolab's.";

/** `<XDG data folder>/com.tatolab.tatolab/python`, where the built-in Python is copied: `XDG_DATA_HOME` when it is an absolute path, as the XDG spec takes it, else `~/.local/share`. */
export function builtInPythonCopiesFolderOnLinux(xdgDataHome: string | undefined, homeDirectory: string): string {
  const xdgDataFolder = xdgDataHome !== undefined && path.isAbsolute(xdgDataHome) ? xdgDataHome : path.join(homeDirectory, DEFAULT_XDG_DATA_HOME_INSIDE_THE_HOME_FOLDER);
  return path.join(xdgDataFolder, TATOLAB_APP_IDENTIFIER, BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES);
}

/** The uv and built-in Python in the packaged app's `appResourcesDirectory`, copied into `builtInPythonCopiesFolder`; not offered by an unpackaged app. */
export async function pythonToolchainInTheAppResources(
  appIsPackaged: boolean,
  appResourcesDirectory: string,
  builtInPythonCopiesFolder: string,
): Promise<BundledPythonToolchain> {
  if (!appIsPackaged) return { kind: "not_offered", reason: UNPACKAGED_APP_PYTHON_TOOLCHAIN_REFUSAL };
  return bundledPythonToolchainFoundAt(
    path.join(appResourcesDirectory, BUNDLED_UV_FILE_NAME),
    path.join(appResourcesDirectory, BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES),
    builtInPythonCopiesFolder,
  );
}
