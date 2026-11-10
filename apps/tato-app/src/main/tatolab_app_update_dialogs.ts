// The two dialogs about updates: one when a newer version has downloaded and is ready to install,
// and one the first time the app opens after an update landed, which compares this copy's version
// with the version the app last opened as, remembered in one JSON file in its config directory.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { jsonObject, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";
import type { QuestionOverTheWindow } from "./tatolab_main_window.js";
import type { AskWhetherToInstallTheDownloadedVersion } from "./tatolab_app_updater.js";

/** The file the version the app last opened as is remembered in, inside the app's config directory. */
export const LAST_OPENED_APP_VERSION_FILE_NAME = "last-opened-app-version.json";

/** The update-ready dialog's button that installs the downloaded version. */
export const INSTALL_UPDATE_BUTTON_LABEL = "Install Update";

/** The update-landed dialog's button that opens the version's release notes. */
export const RELEASE_NOTES_BUTTON_LABEL = "Release Notes";

const LAST_OPENED_APP_VERSION_KEY = "app_version";

/** The release notes of Tato Studio `version`, on the app's GitHub Releases. */
export function releaseNotesUrlOfTatolabAppVersion(version: string): string {
  return `https://github.com/tatolab/tatolab-app/releases/tag/v${version}`;
}

/** What the update dialogs are shown through. */
export interface TatolabAppUpdateDialogsSources {
  /** Ask `question` over the window the person is looking at, answering the index of the button chosen. */
  askAQuestionOverTheWindowInFront(question: QuestionOverTheWindow): Promise<Result<number, string>>;
  /** Open `webPageUrl` in the person's browser. */
  openAWebPageInTheBrowser(webPageUrl: string): Promise<Result<void, string>>;
  tatolabAppLog: TatolabAppLog;
}

/** The update-ready dialog over the window in front: Install Update, or Cancel, which a dialog that could not be shown also reads as. */
export function updateReadyDialogOverTheWindowInFront(sources: TatolabAppUpdateDialogsSources): AskWhetherToInstallTheDownloadedVersion {
  return async (version) => {
    const choice = await sources.askAQuestionOverTheWindowInFront({
      message: `Tato Studio ${version} is ready to install.`,
      detail: "Installing it restarts Tato Studio, which stops every stream it runs until you run it again.",
      buttonLabels: [INSTALL_UPDATE_BUTTON_LABEL, "Cancel"],
      // Return keeps the app running: the dialog opens on its own, maybe over a live show.
      defaultButtonIndex: 1,
      cancelButtonIndex: 1,
    });
    if (!choice.ok) {
      sources.tatolabAppLog.warn("the update-ready dialog was not shown", { version, failure: choice.failure });
      return "cancel";
    }
    return choice.value === 0 ? "install_update" : "cancel";
  };
}

/** The version the app last opened as, remembered at one path. */
export class LastOpenedAppVersionFile {
  private constructor(
    private readonly versionFilePath: string,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The version remembered inside `appConfigDirectory`. */
  static inAppConfigDirectory(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): LastOpenedAppVersionFile {
    return new LastOpenedAppVersionFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), tatolabAppLog);
  }

  /** The version the app last opened as; `null` when none was remembered or the file cannot be read. */
  async loadTheLastOpenedVersion(): Promise<string | null> {
    let contents: string;
    try {
      contents = await readFile(this.versionFilePath, "utf8");
    } catch (readFailure) {
      if (!isAMissingFileFailure(readFailure)) {
        this.tatolabAppLog.warn("the version Tato Studio last opened as could not be read", { path: this.versionFilePath, failure: describeCaughtFailure(readFailure) });
      }
      return null;
    }
    const parsed = parseJsonOnTheWire(contents);
    const versionFile = parsed.ok ? jsonObject(parsed.value, "the last opened version") : parsed;
    const version = versionFile.ok ? requiredText(versionFile.value, LAST_OPENED_APP_VERSION_KEY) : versionFile;
    if (!version.ok) {
      this.tatolabAppLog.warn("the version Tato Studio last opened as is malformed", { path: this.versionFilePath, failure: version.failure });
      return null;
    }
    return version.value;
  }

  /** Remember `version`, replacing the file whole; a failure is logged and returned. */
  async rememberTheOpenedVersion(version: string): Promise<Result<void, string>> {
    const saved = await replaceFileWhole(this.versionFilePath, JSON.stringify({ [LAST_OPENED_APP_VERSION_KEY]: version }, null, 2));
    if (!saved.ok) this.tatolabAppLog.warn("the version Tato Studio opened as could not be remembered", { path: this.versionFilePath, failure: saved.failure });
    return saved;
  }
}

/**
 * The first time the app opens as `appVersion` after opening as another version, say which version it is now, with its release notes,
 * and that projects update their dependencies on their own; a first launch, or one whose last version cannot be read, says nothing.
 */
export async function tellThePersonWhenAnUpdateLanded(appVersion: string, lastOpenedAppVersionFile: LastOpenedAppVersionFile, sources: TatolabAppUpdateDialogsSources): Promise<void> {
  const lastOpenedVersion = await lastOpenedAppVersionFile.loadTheLastOpenedVersion();
  if (lastOpenedVersion === appVersion) return;
  await lastOpenedAppVersionFile.rememberTheOpenedVersion(appVersion);
  if (lastOpenedVersion === null) return;
  const choice = await sources.askAQuestionOverTheWindowInFront({
    message: `Tato Studio is now version ${appVersion}.`,
    detail: "Each project's dependencies are brought up to date automatically the next time it runs.",
    buttonLabels: ["OK", RELEASE_NOTES_BUTTON_LABEL],
    defaultButtonIndex: 0,
    cancelButtonIndex: 0,
  });
  if (!choice.ok) {
    sources.tatolabAppLog.warn("the update-landed dialog was not shown", { version: appVersion, failure: choice.failure });
    return;
  }
  if (choice.value !== 1) return;
  const opened = await sources.openAWebPageInTheBrowser(releaseNotesUrlOfTatolabAppVersion(appVersion));
  if (!opened.ok) sources.tatolabAppLog.warn("the release notes did not open", { version: appVersion, failure: opened.failure });
}
