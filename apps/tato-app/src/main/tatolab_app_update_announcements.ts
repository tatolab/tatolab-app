// What the studio windows' update dialog announces: that a downloaded version is ready to install, or,
// the first time the app opens after an update, which version it is now. The version the app last
// opened as is remembered in one JSON file in its config directory.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TatolabAppUpdateAnnouncement, TatolabAppUpdateAnnouncementKind } from "../shared/tatolab_backend_contract.js";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { jsonObject, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the version the app last opened as is remembered in, inside the app's config directory. */
export const LAST_OPENED_APP_VERSION_FILE_NAME = "last-opened-app-version.json";

const LAST_OPENED_APP_VERSION_KEY = "app_version";

/** The release notes of Tato Studio `version`, on the app's GitHub Releases. */
export function releaseNotesUrlOfTatolabAppVersion(version: string): string {
  return `https://github.com/tatolab/tatolab-app/releases/tag/v${version}`;
}

/** The update announcements waiting for the person, the one the windows show first; `whenTheShownAnnouncementChanged` hears each change of it. */
export class TatolabAppUpdateAnnouncements {
  private readonly announcementsWaiting: TatolabAppUpdateAnnouncement[] = [];

  constructor(private readonly whenTheShownAnnouncementChanged: () => void) {}

  /** The announcement the windows show now; `null` when none waits. */
  shownAnnouncement(): TatolabAppUpdateAnnouncement | null {
    return this.announcementsWaiting[0] ?? null;
  }

  /** Say `version` downloaded and is ready to install, in place of an earlier version's ready announcement still waiting. */
  announceTheDownloadedVersionIsReady(version: string): void {
    this.changeTheWaitingAnnouncements(() => {
      const earlierReady = this.announcementsWaiting.findIndex((waiting) => waiting.kind === "update_ready");
      if (earlierReady !== -1) this.announcementsWaiting.splice(earlierReady, 1);
      this.announcementsWaiting.push({ kind: "update_ready", version });
    });
  }

  /** Take away a ready announcement whose version is no longer the one staged to install; `stagedVersion` is `null` while none is. */
  withdrawTheReadyAnnouncementUnlessStaged(stagedVersion: string | null): void {
    const noLongerStaged = this.announcementsWaiting.findIndex((waiting) => waiting.kind === "update_ready" && waiting.version !== stagedVersion);
    if (noLongerStaged === -1) return;
    this.changeTheWaitingAnnouncements(() => this.announcementsWaiting.splice(noLongerStaged, 1));
  }

  /** Say the app is now `version`, with its release notes. */
  announceTheUpdateLanded(version: string): void {
    this.changeTheWaitingAnnouncements(() => this.announcementsWaiting.push({ kind: "update_landed", version, release_notes_url: releaseNotesUrlOfTatolabAppVersion(version) }));
  }

  /** Take away the announcement of `kind` for `version` a window answered, answering it; `null` when none such waits, as when another window answered it first. */
  takeAwayTheAnswered(kind: TatolabAppUpdateAnnouncementKind, version: string): TatolabAppUpdateAnnouncement | null {
    const answeredIndex = this.announcementsWaiting.findIndex((waiting) => waiting.kind === kind && waiting.version === version);
    const answered = this.announcementsWaiting[answeredIndex];
    if (answered === undefined) return null;
    this.changeTheWaitingAnnouncements(() => this.announcementsWaiting.splice(answeredIndex, 1));
    return answered;
  }

  private changeTheWaitingAnnouncements(change: () => void): void {
    const shownBefore = this.shownAnnouncement();
    change();
    if (shownBefore !== this.shownAnnouncement()) this.whenTheShownAnnouncementChanged();
  }
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
 * The first time the app opens as `appVersion` after opening as another version, announce which version it is now;
 * a first launch, or one whose last version cannot be read, announces nothing.
 */
export async function announceWhenAnUpdateLanded(appVersion: string, lastOpenedAppVersionFile: LastOpenedAppVersionFile, announcements: TatolabAppUpdateAnnouncements): Promise<void> {
  const lastOpenedVersion = await lastOpenedAppVersionFile.loadTheLastOpenedVersion();
  if (lastOpenedVersion === appVersion) return;
  await lastOpenedAppVersionFile.rememberTheOpenedVersion(appVersion);
  if (lastOpenedVersion !== null) announcements.announceTheUpdateLanded(appVersion);
}
