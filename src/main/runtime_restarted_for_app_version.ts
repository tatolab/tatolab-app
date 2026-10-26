// The app version the bundled runtime was last restarted under: one JSON file in the app's config
// directory. An app whose version differs has been replaced since, by an update or by hand, while
// the runtime may still run from the bundle as it was.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import type { Result } from "./result.js";

/** The file the version is remembered in, inside the app's config directory. */
export const RUNTIME_RESTARTED_FOR_APP_VERSION_FILE_NAME = "runtime-restarted-for-app-version.json";

/** The file's one key. */
interface RuntimeRestartedForAppVersionFileContents {
  app_version: string;
}

/** Reads and writes the app version the bundled runtime was last restarted under, at one path. */
export class RuntimeRestartedForAppVersionFile {
  private constructor(private readonly versionFilePath: string) {}

  /** The version file inside `appConfigDirectory`. */
  static inAppConfigDirectory(appConfigDirectory: string): RuntimeRestartedForAppVersionFile {
    return new RuntimeRestartedForAppVersionFile(path.join(appConfigDirectory, RUNTIME_RESTARTED_FOR_APP_VERSION_FILE_NAME));
  }

  /** The remembered version; `null` when none was remembered or the file cannot be read, which reads as a runtime never restarted under this app. */
  async loadAppVersion(): Promise<string | null> {
    let contents: string;
    try {
      contents = await readFile(this.versionFilePath, "utf8");
    } catch {
      return null;
    }
    let parsedContents: unknown;
    try {
      parsedContents = JSON.parse(contents);
    } catch {
      return null;
    }
    if (typeof parsedContents !== "object" || parsedContents === null || !("app_version" in parsedContents)) return null;
    return typeof parsedContents.app_version === "string" ? parsedContents.app_version : null;
  }

  /** Remember `appVersion`, replacing the file whole so a crash never leaves half of it. */
  saveAppVersion(appVersion: string): Promise<Result<void, string>> {
    const contents: RuntimeRestartedForAppVersionFileContents = { app_version: appVersion };
    return replaceFileWhole(this.versionFilePath, JSON.stringify(contents, null, 2));
  }
}
