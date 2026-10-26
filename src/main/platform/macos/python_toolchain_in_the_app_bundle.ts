// macOS: the app's uv beside its binary in `Contents/MacOS/`, and its built-in Python in
// `Contents/Resources/python/<cpython-…>/`, whose Mach-O files are links into
// `Contents/Frameworks/tatolab-python/` (code signing seals code only under MacOS/ and
// Frameworks/). Copies go to the app's own config directory, which uninstalling removes.

import path from "node:path";
import { BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES, bundledPythonToolchainFoundAt, type BundledPythonToolchain } from "../bundled_python_toolchain.js";
import { appBundleOfTheExecutable } from "./tatolab_machine_paths.js";

/** uv's file name beside the app binary. */
const BUNDLED_UV_INSIDE_THE_BUNDLE = path.join("Contents", "MacOS", "uv");

/** The built-in Python's parent folder inside the bundle. */
const BUILT_IN_PYTHON_PARENT_INSIDE_THE_BUNDLE = path.join("Contents", "Resources", BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES);

/** Why an unpackaged app has no toolchain: it runs from Electron's own bundle. */
const UNPACKAGED_APP_PYTHON_TOOLCHAIN_REFUSAL = "This app runs unpackaged, from Electron's own bundle, which carries no uv or Python of Tatolab's.";

/** The uv and built-in Python of the bundle the packaged app binary at `appExecutable` runs from, copied into `<appConfigDirectory>/python`; not offered by an unpackaged app. */
export async function pythonToolchainInTheAppBundle(appExecutable: string, appIsPackaged: boolean, appConfigDirectory: string): Promise<BundledPythonToolchain> {
  if (!appIsPackaged) return { kind: "not_offered", reason: UNPACKAGED_APP_PYTHON_TOOLCHAIN_REFUSAL };
  const appBundle = await appBundleOfTheExecutable(appExecutable);
  if (appBundle === null) return { kind: "not_offered", reason: `${appExecutable} does not run from an app bundle's Contents/MacOS/` };
  return bundledPythonToolchainFoundAt(
    path.join(appBundle, BUNDLED_UV_INSIDE_THE_BUNDLE),
    path.join(appBundle, BUILT_IN_PYTHON_PARENT_INSIDE_THE_BUNDLE),
    path.join(appConfigDirectory, BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES),
  );
}
