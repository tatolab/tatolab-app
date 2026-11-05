// Checking for a newer Tatolab and taking it. The app checks on its own at launch and once a
// day, and then only says a newer version is available; it installs only when the person chooses
// Check for Updates… in the tray or its button in Settings, either of which is the confirmation.
// Every state reaches the tray and the window as the status's `app_update`.

import type { SystemNotifications } from "./system_notifications.js";
import type { TatolabAppUpdateDelivery, TatolabAppUpdateState } from "../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** How often the app checks on its own after the check at launch. */
export const APP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What taking a newer version reports as it goes: whole percents of its download, then the install beginning, after which the app quits and reopens. */
export interface TatolabAppUpdateProgress {
  onDownloadProgress(percent: number): void;
  onInstalling(): void;
}

/** Where newer versions of Tatolab come from: the update feed, read and taken through the platform's updater. */
export interface TatolabAppUpdateFeed {
  /** How a newer version found here reaches the person. */
  readonly delivery: TatolabAppUpdateDelivery;
  /** The version the feed offers over this app's, `null` when this app is the newest; refused in the updater's own words. */
  findANewerVersion(): Promise<Result<string | null, string>>;
  /**
   * Take the version `findANewerVersion` last found: download it and install it, reporting to `progress`,
   * and quit so it reopens, answering only if that fails; or, for `open_the_download`, open its download.
   * Refused in the updater's own words, leaving the installed app as it was.
   */
  takeTheNewerVersion(progress: TatolabAppUpdateProgress): Promise<Result<void, string>>;
}

/** This build's feed, or why this app cannot update itself. */
export type TatolabAppUpdateFeedForThisBuild = { kind: "offered"; feed: TatolabAppUpdateFeed } | { kind: "not_offered"; reason: string };

/** What tells the person about updates outside the window: one notification per newer version found on its own, and the outcome of a check chosen from the tray. The updater's own words for a failure are in Settings, not the notification. */
export interface TatolabAppUpdateNotifier {
  notifyANewerVersionIsAvailable(version: string): void;
  notifyTheAppIsUpToDate(): void;
  notifyTheUpdateFailed(): void;
}

/** The update notifications, over the desktop's `systemNotifications`; clicking one calls `onNotificationClicked`. */
export function tatolabAppUpdateNotifierOver(systemNotifications: SystemNotifications, onNotificationClicked: () => void): TatolabAppUpdateNotifier {
  return {
    notifyANewerVersionIsAvailable: (version) =>
      systemNotifications.showNotification(`Spudnik Studio ${version} is available`, "Click to open Settings and install it.", onNotificationClicked),
    notifyTheAppIsUpToDate: () => systemNotifications.showNotification("Spudnik Studio is up to date", "You have the newest version.", onNotificationClicked),
    notifyTheUpdateFailed: () =>
      systemNotifications.showNotification(
        "Tatolab couldn't update",
        "Something went wrong while updating. Open Settings to see what happened and try again.",
        onNotificationClicked,
      ),
  };
}

/** Where a check the person chose was chosen: the tray, whose outcome only a notification shows, or the window, where Settings shows it. */
export type TatolabAppUpdateCheckChosenFrom = "tray" | "window";

/** Starts `work` every `intervalMs`, as `setInterval` does. */
export type RepeatingTimer = (intervalMs: number, work: () => void) => void;

/** Where checking for a newer Tatolab stands, and how it moves. */
export class TatolabAppUpdater {
  private appUpdateState: TatolabAppUpdateState;
  private readonly versionsAlreadyNotified = new Set<string>();

  /** An updater over `feedForThisBuild`, calling `onStateChanged` after each change of `state()`. */
  constructor(
    private readonly feedForThisBuild: TatolabAppUpdateFeedForThisBuild,
    private readonly notifier: TatolabAppUpdateNotifier,
    private readonly onStateChanged: () => void,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {
    this.appUpdateState = feedForThisBuild.kind === "offered" ? { kind: "not_checked" } : { kind: "not_offered", reason: feedForThisBuild.reason };
  }

  /** Where checking for a newer Tatolab stands now. */
  state(): TatolabAppUpdateState {
    return this.appUpdateState;
  }

  /** Check now, as the app launches, then every `APP_UPDATE_CHECK_INTERVAL_MS` on `repeatingTimer`; nothing when this app cannot update itself. */
  startCheckingOnItsOwn(repeatingTimer: RepeatingTimer): void {
    if (this.feedForThisBuild.kind === "not_offered") return;
    const checkInTheBackground = () => {
      this.checkOnItsOwn().catch((unexpectedFailure: unknown) => {
        this.tatolabAppLog.error("the update check on its own stopped on a failure nothing expected", { failure: describeCaughtFailure(unexpectedFailure) });
      });
    };
    checkInTheBackground();
    repeatingTimer(APP_UPDATE_CHECK_INTERVAL_MS, checkInTheBackground);
  }

  /** The check the app makes on its own: it finds a newer version and says so, once per version, but takes nothing; it leaves a check or an install already under way alone. */
  async checkOnItsOwn(): Promise<void> {
    if (this.feedForThisBuild.kind === "not_offered" || this.anUpdateIsUnderWay()) return;
    const feed = this.feedForThisBuild.feed;
    const previousState = this.appUpdateState;
    this.changeStateTo({ kind: "checking" });
    const newerVersion = await feed.findANewerVersion();
    if (!newerVersion.ok) {
      this.tatolabAppLog.warn("the update check on its own failed", { refusal: newerVersion.failure });
      this.changeStateTo(previousState.kind === "available" ? previousState : { kind: "failed", refusal: newerVersion.failure });
      return;
    }
    if (newerVersion.value === null) {
      this.changeStateTo({ kind: "up_to_date" });
      return;
    }
    this.changeStateTo({ kind: "available", version: newerVersion.value, delivery: feed.delivery });
    if (!this.versionsAlreadyNotified.has(newerVersion.value)) {
      this.versionsAlreadyNotified.add(newerVersion.value);
      this.notifier.notifyANewerVersionIsAvailable(newerVersion.value);
    }
  }

  /** Check for Updates…, chosen from `chosenFrom`: check, and take a newer version if there is one; a second choice while one is under way does nothing. */
  async checkAndTakeANewerVersion(chosenFrom: TatolabAppUpdateCheckChosenFrom): Promise<void> {
    if (this.feedForThisBuild.kind === "not_offered" || this.anUpdateIsUnderWay()) return;
    const feed = this.feedForThisBuild.feed;
    this.changeStateTo({ kind: "checking" });
    const newerVersion = await feed.findANewerVersion();
    if (!newerVersion.ok) {
      this.failChosenUpdate(chosenFrom, newerVersion.failure);
      return;
    }
    if (newerVersion.value === null) {
      this.changeStateTo({ kind: "up_to_date" });
      if (chosenFrom === "tray") this.notifier.notifyTheAppIsUpToDate();
      return;
    }
    const version = newerVersion.value;
    this.tatolabAppLog.info("taking a newer Tatolab", { version, delivery: feed.delivery });
    if (feed.delivery === "install_and_relaunch") this.changeStateTo({ kind: "downloading", version, percent: 0 });
    const taken = await feed.takeTheNewerVersion({
      onDownloadProgress: (percent) => {
        if (this.appUpdateState.kind === "downloading" && this.appUpdateState.percent !== percent) this.changeStateTo({ kind: "downloading", version, percent });
      },
      onInstalling: () => this.changeStateTo({ kind: "installing", version }),
    });
    if (!taken.ok) {
      this.failChosenUpdate(chosenFrom, taken.failure);
      return;
    }
    if (feed.delivery === "open_the_download") this.changeStateTo({ kind: "available", version, delivery: feed.delivery });
  }

  private anUpdateIsUnderWay(): boolean {
    return this.appUpdateState.kind === "checking" || this.appUpdateState.kind === "downloading" || this.appUpdateState.kind === "installing";
  }

  private failChosenUpdate(chosenFrom: TatolabAppUpdateCheckChosenFrom, refusal: string): void {
    this.tatolabAppLog.warn("the update failed; the installed Tatolab keeps running", { refusal });
    this.changeStateTo({ kind: "failed", refusal });
    if (chosenFrom === "tray") this.notifier.notifyTheUpdateFailed();
  }

  private changeStateTo(appUpdateState: TatolabAppUpdateState): void {
    this.appUpdateState = appUpdateState;
    this.onStateChanged();
  }
}
