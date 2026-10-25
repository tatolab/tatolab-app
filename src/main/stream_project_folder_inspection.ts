// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// What a project folder holds that `run_stream` needs, read from the person's own folder and never
// from the runtime's state: the `stream.py` the runtime compiles and the `@stream` functions in it,
// and the interpreter at `.venv/bin/python`, the only one the runtime takes (StreamLib's
// `stream_function_compile_in_the_projects_interpreter.rs`).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { StreamProjectFolderReport, StreamProjectPythonEnvironment } from "../shared/tatolab_backend_contract.js";
import { isAFileOnThisMachine, isAnExistingFolderOnThisMachine } from "./file_system_entries_on_this_machine.js";

/** The file the runtime compiles a project's stream function from. */
const STREAM_FILE_NAME = "stream.py";

/** The folder `uv sync` makes a project's environment in. */
const PYTHON_ENVIRONMENT_FOLDER_NAME = ".venv";

/** The distribution name `tatolab-stream` installs its metadata folder under, `tatolab_stream-<version>.dist-info`. */
const TATOLAB_STREAM_DIST_INFO_PATTERN = /^tatolab_stream-(.+)\.dist-info$/;

/** The decorator line marking a module-level stream function: `@stream` takes no arguments. */
const STREAM_DECORATOR_LINE_PATTERN = /^@stream\s*(#.*)?$/;

/** A module-level function's first line, naming it. */
const MODULE_LEVEL_FUNCTION_LINE_PATTERN = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

/** The functions `streamFileText` marks `@stream` at module level, in file order. */
export function streamFunctionsMarkedIn(streamFileText: string): string[] {
  const streamFunctions: string[] = [];
  let isUnderAStreamDecorator = false;
  for (const line of streamFileText.split(/\r?\n/)) {
    if (STREAM_DECORATOR_LINE_PATTERN.test(line)) {
      isUnderAStreamDecorator = true;
      continue;
    }
    if (!isUnderAStreamDecorator) continue;
    const functionName = MODULE_LEVEL_FUNCTION_LINE_PATTERN.exec(line)?.[1];
    if (functionName !== undefined) {
      streamFunctions.push(functionName);
      isUnderAStreamDecorator = false;
    } else if (!line.startsWith("@") && line.trim() !== "" && !line.trimStart().startsWith("#")) {
      isUnderAStreamDecorator = false;
    }
  }
  return streamFunctions;
}

/** The Python version a `pyvenv.cfg` names: uv's `version_info`, or the standard library's `version`. */
export function pythonVersionNamedIn(pyvenvConfigurationText: string): string | null {
  const settings = new Map<string, string>();
  for (const line of pyvenvConfigurationText.split(/\r?\n/)) {
    const equalsSign = line.indexOf("=");
    if (equalsSign === -1) continue;
    settings.set(line.slice(0, equalsSign).trim(), line.slice(equalsSign + 1).trim());
  }
  return settings.get("version_info") || settings.get("version") || null;
}

async function textOfFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function entriesOfFolderOrNone(folder: string): Promise<string[]> {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
}

/** The `tatolab-stream` version installed in the environment at `pythonEnvironmentFolder`, from the `site-packages` of its `lib/python3.<minor>`. */
async function tatolabStreamVersionInstalledIn(pythonEnvironmentFolder: string): Promise<string | null> {
  const libraryFolder = path.join(pythonEnvironmentFolder, "lib");
  for (const pythonFolderName of await entriesOfFolderOrNone(libraryFolder)) {
    if (!pythonFolderName.startsWith("python")) continue;
    for (const installedEntry of await entriesOfFolderOrNone(path.join(libraryFolder, pythonFolderName, "site-packages"))) {
      const version = TATOLAB_STREAM_DIST_INFO_PATTERN.exec(installedEntry)?.[1];
      if (version !== undefined) return version;
    }
  }
  return null;
}

async function pythonEnvironmentOf(projectFolder: string): Promise<StreamProjectPythonEnvironment> {
  const pythonEnvironmentFolder = path.join(projectFolder, PYTHON_ENVIRONMENT_FOLDER_NAME);
  if (!(await isAFileOnThisMachine(path.join(pythonEnvironmentFolder, "bin", "python")))) return { kind: "missing" };
  const pyvenvConfigurationText = await textOfFileOrNull(path.join(pythonEnvironmentFolder, "pyvenv.cfg"));
  return {
    kind: "present",
    python_version: pyvenvConfigurationText === null ? null : pythonVersionNamedIn(pyvenvConfigurationText),
    tatolab_stream_version: await tatolabStreamVersionInstalledIn(pythonEnvironmentFolder),
  };
}

/** What `folder`, an absolute path, holds that `run_stream` needs; a folder that does not exist holds nothing. */
export async function inspectStreamProjectFolder(folder: string): Promise<StreamProjectFolderReport> {
  const streamFileText = await textOfFileOrNull(path.join(folder, STREAM_FILE_NAME));
  return {
    folder,
    folder_exists: await isAnExistingFolderOnThisMachine(folder),
    stream_file_present: streamFileText !== null,
    stream_functions: streamFileText === null ? [] : streamFunctionsMarkedIn(streamFileText),
    python_environment: await pythonEnvironmentOf(folder),
  };
}
