// A switch the app remembers between launches: one JSON file in the app's config directory with
// one key, read as the switch's default when the file is absent or unreadable. The stream-failure
// notifications and Developer mode are two.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject, requiredTrueOrFalse } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the stream-failure notifications switch is remembered in, inside the app's config directory. */
export const STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME = "stream-failure-notifications.json";

/** The file Developer mode is remembered in, inside the app's config directory. */
export const DEVELOPER_MODE_PREFERENCE_FILE_NAME = "developer-mode.json";

/** One remembered switch: its file, its key, what it reads when nothing was remembered, and its name in the app's log. */
interface RememberedSwitchSpecification {
  fileName: string;
  key: string;
  valueWhenNotRemembered: boolean;
  switchNameInTheLog: string;
}

const STREAM_FAILURE_NOTIFICATIONS_SWITCH: RememberedSwitchSpecification = {
  fileName: STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME,
  key: "notify_when_a_stream_fails",
  valueWhenNotRemembered: true,
  switchNameInTheLog: "the stream-failure notifications preference",
};

const DEVELOPER_MODE_SWITCH: RememberedSwitchSpecification = {
  fileName: DEVELOPER_MODE_PREFERENCE_FILE_NAME,
  key: "developer_mode",
  valueWhenNotRemembered: false,
  switchNameInTheLog: "the Developer mode preference",
};

/** Reads and writes one remembered switch at one path. */
export class RememberedSwitchFile {
  private constructor(
    private readonly preferenceFilePath: string,
    private readonly rememberedSwitch: RememberedSwitchSpecification,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Whether a stream failing shows a notification, remembered inside `appConfigDirectory`; on when nothing was remembered. */
  static streamFailureNotificationsInAppConfigDirectory(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RememberedSwitchFile {
    return RememberedSwitchFile.inAppConfigDirectory(STREAM_FAILURE_NOTIFICATIONS_SWITCH, appConfigDirectory, tatolabAppLog);
  }

  /** Whether Developer mode is on, remembered inside `appConfigDirectory`; off when nothing was remembered. */
  static developerModeInAppConfigDirectory(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RememberedSwitchFile {
    return RememberedSwitchFile.inAppConfigDirectory(DEVELOPER_MODE_SWITCH, appConfigDirectory, tatolabAppLog);
  }

  private static inAppConfigDirectory(rememberedSwitch: RememberedSwitchSpecification, appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RememberedSwitchFile {
    return new RememberedSwitchFile(path.join(appConfigDirectory, rememberedSwitch.fileName), rememberedSwitch, tatolabAppLog);
  }

  /** The remembered switch; its default when nothing was remembered or the file cannot be read. */
  async loadRememberedSwitch(): Promise<boolean> {
    const { valueWhenNotRemembered, switchNameInTheLog } = this.rememberedSwitch;
    const valueWhenNotRememberedWords = valueWhenNotRemembered ? "on" : "off";
    let contents: string;
    try {
      contents = await readFile(this.preferenceFilePath, "utf8");
    } catch (readFailure) {
      if (isAMissingFileFailure(readFailure)) return valueWhenNotRemembered;
      this.tatolabAppLog.warn(`${switchNameInTheLog} could not be read; treating it as ${valueWhenNotRememberedWords}`, {
        path: this.preferenceFilePath,
        failure: describeCaughtFailure(readFailure),
      });
      return valueWhenNotRemembered;
    }
    const remembered = rememberedSwitchFrom(contents, this.rememberedSwitch.key);
    if (!remembered.ok) {
      this.tatolabAppLog.warn(`${switchNameInTheLog} is malformed; treating it as ${valueWhenNotRememberedWords}`, {
        path: this.preferenceFilePath,
        failure: remembered.failure,
      });
      return valueWhenNotRemembered;
    }
    return remembered.value;
  }

  /** Remember the switch, replacing the file whole so a crash never leaves half of it; a failure is logged and returned. */
  async saveRememberedSwitch(switchedOn: boolean): Promise<Result<void, string>> {
    const saved = await replaceFileWhole(this.preferenceFilePath, JSON.stringify({ [this.rememberedSwitch.key]: switchedOn }, null, 2));
    if (!saved.ok) this.tatolabAppLog.warn(`${this.rememberedSwitch.switchNameInTheLog} could not be remembered`, { path: this.preferenceFilePath, failure: saved.failure });
    return saved;
  }
}

/** A remembered switch as it holds now: a choice holds until the app quits even when it could not be remembered. */
export class HeldRememberedSwitch {
  /** Saves run one after another, since every save replaces the file through the same partial path. */
  private latestSave: Promise<Result<void, string>> = Promise.resolve(succeeded(undefined));

  private constructor(
    private switchedOn: boolean,
    private readonly rememberedSwitchFile: RememberedSwitchFile,
  ) {}

  /** The switch as `rememberedSwitchFile` remembers it. */
  static async load(rememberedSwitchFile: RememberedSwitchFile): Promise<HeldRememberedSwitch> {
    return new HeldRememberedSwitch(await rememberedSwitchFile.loadRememberedSwitch(), rememberedSwitchFile);
  }

  /** Whether the switch is on now. */
  isOnNow(): boolean {
    return this.switchedOn;
  }

  /** Turn the switch on or off and remember it; refused in words when it could not be remembered, though it holds until the app quits. */
  async setAndRemember(switchedOn: boolean): Promise<Result<void, string>> {
    this.switchedOn = switchedOn;
    const remembered = this.latestSave.then(() => this.rememberedSwitchFile.saveRememberedSwitch(switchedOn));
    this.latestSave = remembered;
    const rememberedResult = await remembered;
    if (rememberedResult.ok) return rememberedResult;
    return failedWith(`Tato Studio couldn't remember this, so it holds only until Tato Studio quits: ${rememberedResult.failure}`);
  }
}

function rememberedSwitchFrom(contents: string, key: string): Result<boolean, string> {
  let parsedContents: unknown;
  try {
    parsedContents = JSON.parse(contents);
  } catch (parseFailure) {
    return failedWith(describeCaughtFailure(parseFailure));
  }
  return isAJsonObject(parsedContents) ? requiredTrueOrFalse(parsedContents, key) : failedWith(`missing field \`${key}\``);
}
