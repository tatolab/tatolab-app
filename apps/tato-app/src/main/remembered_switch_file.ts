// A switch the app remembers between launches: one JSON file in the app's config directory with
// one key, read as the switch's default when the file is absent or unreadable. The stream-failure
// notifications are one.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { isAJsonObject, requiredTrueOrFalse } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the stream-failure notifications switch is remembered in, inside the app's config directory. */
export const STREAM_FAILURE_NOTIFICATIONS_PREFERENCE_FILE_NAME = "stream-failure-notifications.json";

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

/** Reads and writes one remembered switch at one path. */
export class RememberedSwitchFile {
  private constructor(
    private readonly preferenceFilePath: string,
    private readonly rememberedSwitch: RememberedSwitchSpecification,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** Whether a stream failing shows a notification, remembered inside `appConfigDirectory`; on when nothing was remembered. */
  static streamFailureNotificationsInAppConfigDirectory(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): RememberedSwitchFile {
    return new RememberedSwitchFile(
      path.join(appConfigDirectory, STREAM_FAILURE_NOTIFICATIONS_SWITCH.fileName),
      STREAM_FAILURE_NOTIFICATIONS_SWITCH,
      tatolabAppLog,
    );
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

  /** Remember the switch, replacing the file whole so a crash never leaves half of it. */
  saveRememberedSwitch(switchedOn: boolean): Promise<Result<void, string>> {
    return replaceFileWhole(this.preferenceFilePath, JSON.stringify({ [this.rememberedSwitch.key]: switchedOn }, null, 2));
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
