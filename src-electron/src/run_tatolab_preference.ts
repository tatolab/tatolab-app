// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The remembered "Run Tatolab" switch: one JSON file in the app's config directory, on when the
// file is absent or unreadable.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the switch is remembered in, inside the app's config directory. */
export const RUN_TATOLAB_PREFERENCE_FILE_NAME = "run-tatolab.json";

/** The file's one key, as earlier builds of the app wrote it, so the switch survives an upgrade. */
interface RunTatolabPreferenceFileContents {
  run_tatolab: boolean;
}

/** Reads and writes the remembered "Run Tatolab" switch at one path. */
export class RunTatolabPreferenceFile {
  private constructor(
    private readonly preferenceFilePath: string,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The preference file inside `appConfigDirectory`. */
  static inAppConfigDirectory(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RunTatolabPreferenceFile {
    return new RunTatolabPreferenceFile(path.join(appConfigDirectory, RUN_TATOLAB_PREFERENCE_FILE_NAME), tatolabAppLog);
  }

  /** The remembered switch; on when nothing was remembered or the file cannot be read. */
  async loadRunTatolab(): Promise<boolean> {
    let contents: string;
    try {
      contents = await readFile(this.preferenceFilePath, "utf8");
    } catch (readFailure) {
      if (isAMissingFileFailure(readFailure)) return true;
      this.tatolabAppLog.warn("the Run Tatolab preference could not be read; treating it as on", {
        path: this.preferenceFilePath,
        failure: describeCaughtFailure(readFailure),
      });
      return true;
    }
    const remembered = runTatolabPreferenceFileContentsFrom(contents);
    if (!remembered.ok) {
      this.tatolabAppLog.warn("the Run Tatolab preference is malformed; treating it as on", {
        path: this.preferenceFilePath,
        failure: remembered.failure,
      });
      return true;
    }
    return remembered.value.run_tatolab;
  }

  /** Remember the switch, replacing the file whole so a crash never leaves half of it. */
  async saveRunTatolab(runTatolab: boolean): Promise<Result<void, string>> {
    const contents: RunTatolabPreferenceFileContents = { run_tatolab: runTatolab };
    const partiallyWrittenPath = `${this.preferenceFilePath}.partial`;
    try {
      await mkdir(path.dirname(this.preferenceFilePath), { recursive: true });
      await writeFile(partiallyWrittenPath, JSON.stringify(contents, null, 2));
      await rename(partiallyWrittenPath, this.preferenceFilePath);
    } catch (writeFailure) {
      return failedWith(describeCaughtFailure(writeFailure));
    }
    return succeeded(undefined);
  }
}

function isAMissingFileFailure(caughtFailure: unknown): boolean {
  return caughtFailure instanceof Error && "code" in caughtFailure && caughtFailure.code === "ENOENT";
}

function runTatolabPreferenceFileContentsFrom(contents: string): Result<RunTatolabPreferenceFileContents, string> {
  let parsedContents: unknown;
  try {
    parsedContents = JSON.parse(contents);
  } catch (parseFailure) {
    return failedWith(describeCaughtFailure(parseFailure));
  }
  if (typeof parsedContents !== "object" || parsedContents === null || !("run_tatolab" in parsedContents)) {
    return failedWith("missing field `run_tatolab`");
  }
  const runTatolab = parsedContents.run_tatolab;
  if (typeof runTatolab !== "boolean") return failedWith("`run_tatolab` is not a boolean");
  return succeeded({ run_tatolab: runTatolab });
}
