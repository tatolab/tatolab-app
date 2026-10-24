// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// A notification each time a stream fails while the app runs, with the reason the runtime gives,
// while the person keeps the switch on. A stream fails when its listing says `failed` and the last
// listing before it did not; the first listing after launch only sets where the app starts from.

import type { StreamFailureNotificationsState, TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { RememberedSwitchFile } from "./remembered_switch_file.js";
import type { SystemNotifications } from "./system_notifications.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The state the runtime lists a stream in once it has failed. */
const FAILED_STREAM_STATE = "failed";

/** What a failed stream's notification says when the runtime gave no reason. */
export const FAILED_WITHOUT_A_REASON_NOTIFICATION_BODY = "The runtime gave no reason.";

/** The switch, the desktop's notifications, and the failed streams the last listing held. */
export class StreamFailureNotifications {
  /** `null` until the first listing after launch. */
  private failedStreamsInTheLastListing: ReadonlySet<string> | null = null;

  private constructor(
    private notifyWhenAStreamFails: boolean,
    private readonly rememberedSwitch: RememberedSwitchFile,
    private readonly systemNotifications: SystemNotifications,
    private readonly showTheStreamsPage: (streamName: string) => void,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  /** The notifications as remembered in `rememberedSwitch`, shown through `systemNotifications`; clicking one calls `showTheStreamsPage` with its stream. */
  static async load(
    rememberedSwitch: RememberedSwitchFile,
    systemNotifications: SystemNotifications,
    showTheStreamsPage: (streamName: string) => void,
    tatolabAppLog: TatolabAppLog,
  ): Promise<StreamFailureNotifications> {
    return new StreamFailureNotifications(await rememberedSwitch.loadRememberedSwitch(), rememberedSwitch, systemNotifications, showTheStreamsPage, tatolabAppLog);
  }

  /** The switch and whether this desktop shows notifications, as the status carries them. */
  stateNow(): StreamFailureNotificationsState {
    return { enabled: this.notifyWhenAStreamFails, shown_by_this_desktop: this.systemNotifications.shownByThisDesktop() };
  }

  /** Turn the notifications on or off and remember it; refused when it could not be remembered, though it holds until the app quits. */
  async setNotifyWhenAStreamFails(notifyWhenAStreamFails: boolean): Promise<Result<void, string>> {
    this.notifyWhenAStreamFails = notifyWhenAStreamFails;
    const remembered = await this.rememberedSwitch.saveRememberedSwitch(notifyWhenAStreamFails);
    if (remembered.ok) return succeeded(undefined);
    this.tatolabAppLog.warn("the stream-failure notifications switch could not be remembered", { failure: remembered.failure });
    return failedWith(`Tatolab couldn't remember this, so it holds only until Tatolab quits: ${remembered.failure}`);
  }

  /** Notify each stream that `status` lists as newly failed, when the switch is on; a status listing no streams changes nothing. */
  noticeStatus(status: TatolabStatus): void {
    if (status.streams === null) return;
    const failedStreams = status.streams.filter((listedStream) => listedStream.state === FAILED_STREAM_STATE);
    const failedStreamsBefore = this.failedStreamsInTheLastListing;
    this.failedStreamsInTheLastListing = new Set(failedStreams.map((failedStream) => failedStream.name));
    if (failedStreamsBefore === null || !this.notifyWhenAStreamFails) return;
    for (const newlyFailedStream of failedStreams.filter((failedStream) => !failedStreamsBefore.has(failedStream.name))) {
      this.tatolabAppLog.info("a stream failed; notifying", { stream: newlyFailedStream.name });
      this.systemNotifications.showNotification(
        `${newlyFailedStream.name} failed`,
        newlyFailedStream.failed_because ?? FAILED_WITHOUT_A_REASON_NOTIFICATION_BODY,
        () => this.showTheStreamsPage(newlyFailedStream.name),
      );
    }
  }
}
