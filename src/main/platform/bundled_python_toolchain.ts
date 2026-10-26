// The uv and the built-in Python the app carries, so that it can make a stream project's `.venv`
// on a machine with neither. The built-in Python is never run from the app: a venv records its
// interpreter's absolute path, and an update replaces the app (an AppImage mounts somewhere new on
// every launch), so it is copied out into a folder of its own first.

import { readdir } from "node:fs/promises";
import path from "node:path";
import { isAFileOnThisMachine, isAMissingFileFailure } from "../file_system_entries_on_this_machine.js";
import { describeCaughtFailure } from "../result.js";

/** The app's own uv and built-in Python, or `not_offered` with why in a build that carries none. */
export type BundledPythonToolchain = BundledPythonToolchainInTheApp | { kind: "not_offered"; reason: string };

/** The toolchain in a build that carries one: uv's path, the built-in Python's folder inside the app and its name, and the folder its copies are made in. */
export interface BundledPythonToolchainInTheApp {
  kind: "in_the_app";
  uvPath: string;
  builtInPythonInTheApp: string;
  builtInPythonFolderName: string;
  builtInPythonCopiesFolder: string;
}

/** The toolchain as the app's log names it: the built-in Python inside the app, or why the build offers none. */
export function bundledPythonToolchainAsTheLogNamesIt(bundledPythonToolchain: BundledPythonToolchain): string {
  return bundledPythonToolchain.kind === "in_the_app" ? bundledPythonToolchain.builtInPythonInTheApp : bundledPythonToolchain.reason;
}

/** Why a build without the toolchain cannot make a project's environment. */
export const NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL = "This build of Tatolab carries no uv or Python of its own, so it cannot make a project's .venv. Run uv sync in the project's folder instead.";

/** The folder the built-in Python's one version folder sits in, inside the app's resources. */
export const BUILT_IN_PYTHON_FOLDER_IN_THE_APP_RESOURCES = "python";

/** The prefix of the built-in Python's version folder, `cpython-3.12.12+20251014`: python-build-standalone's own name for the build. */
const BUILT_IN_PYTHON_FOLDER_NAME_PREFIX = "cpython-";

/** The interpreter inside a Python folder, as python-build-standalone lays it out. */
const PYTHON_INTERPRETER_INSIDE_A_PYTHON_FOLDER = path.join("bin", "python3");

/** The interpreter of the Python in `pythonFolder`. */
export function pythonInterpreterInsideThePythonFolder(pythonFolder: string): string {
  return path.join(pythonFolder, PYTHON_INTERPRETER_INSIDE_A_PYTHON_FOLDER);
}

/** The Python version a built-in Python's folder is named for, `3.12.12` of `cpython-3.12.12+20251014`; `null` for a name that is not one. */
export function pythonVersionOfTheBuiltInPythonFolder(builtInPythonFolderName: string): string | null {
  const versionMatch = /^cpython-(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(builtInPythonFolderName);
  return versionMatch?.[1] ?? null;
}

/** The toolchain whose uv is `uvPath` and whose built-in Python is the one `cpython-*` folder in `builtInPythonParentInTheApp`, copied into `builtInPythonCopiesFolder`; not offered, naming what is missing, when either is absent. */
export async function bundledPythonToolchainFoundAt(
  uvPath: string,
  builtInPythonParentInTheApp: string,
  builtInPythonCopiesFolder: string,
): Promise<BundledPythonToolchain> {
  if (!(await isAFileOnThisMachine(uvPath))) return { kind: "not_offered", reason: `${NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL} (no uv at ${uvPath})` };
  let builtInPythonFolderNames: string[];
  try {
    const entries = await readdir(builtInPythonParentInTheApp, { withFileTypes: true });
    builtInPythonFolderNames = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(BUILT_IN_PYTHON_FOLDER_NAME_PREFIX)).map((entry) => entry.name);
  } catch (readFailure) {
    if (!isAMissingFileFailure(readFailure)) {
      return { kind: "not_offered", reason: `${NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL} (${builtInPythonParentInTheApp} could not be read: ${describeCaughtFailure(readFailure)})` };
    }
    builtInPythonFolderNames = [];
  }
  const [builtInPythonFolderName, ...otherBuiltInPythonFolderNames] = builtInPythonFolderNames;
  if (builtInPythonFolderName === undefined || otherBuiltInPythonFolderNames.length > 0) {
    return {
      kind: "not_offered",
      reason: `${NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL} (${builtInPythonParentInTheApp} holds ${builtInPythonFolderNames.length} built-in Pythons, not one)`,
    };
  }
  return {
    kind: "in_the_app",
    uvPath,
    builtInPythonInTheApp: path.join(builtInPythonParentInTheApp, builtInPythonFolderName),
    builtInPythonFolderName,
    builtInPythonCopiesFolder,
  };
}
