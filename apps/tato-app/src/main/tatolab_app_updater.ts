// Checking for a newer Tatolab, downloading it and installing it. The app checks at launch and once
// a day; a newer version that installs in place downloads in the background, a dialog says it is
// ready, and it installs only when the person chooses Install Update or Restart to Update: quitting
// never installs it. A `.deb`'s newer version only opens its download, once the person chooses it. Every state reaches the tray, the menus and
// Settings as the status's `app_update`.

import type { SystemNotifications } from "./system_notifications.js";
import type { TatolabAppUpdateState } from "../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** How often the app checks on its own after the check at launch. */
export const APP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A feed whose newer version downloads and installs in place, then the app reopens: Squirrel.Mac's `.zip`, or the AppImage. */
export interface TatolabAppUpdateFeedInstallingInPlace {
  readonly delivery: "install_and_relaunch";
  /** The version the feed offers over this app's, `null` when this app is the newest; refused in the updater's own words. */
  findANewerVersion(): Promise<Result<string | null, string>>;
  /** Download the version `findANewerVersion` last found, reporting whole percents to `onDownloadProgress`; it installs only through `installTheDownloadedVersionAndRelaunch`. */
  downloadTheNewerVersion(onDownloadProgress: (percent: number) => void): Promise<Result<void, string>>;
  /** Quit, install the staged version and reopen, answering only if that fails, in the updater's own words; the installed app is then as it was. */
  installTheDownloadedVersionAndRelaunch(): Promise<Result<void, string>>;
}

/** A `.deb`'s feed: apt alone replaces the package, so the newer version's download opens in the browser. */
export interface TatolabAppUpdateFeedOpeningTheDownload {
  readonly delivery: "open_the_download";
  /** The version the feed offers over this app's, `null` when this app is the newest; refused in the updater's own words. */
  findANewerVersion(): Promise<Result<string | null, string>>;
  /** Open the download of the version `findANewerVersion` last found. */
  openTheNewerVersionsDownload(): Promise<Result<void, string>>;
}

/** Where newer versions of Tatolab come from: the update feed, read and taken through the platform's updater. */
export type TatolabAppUpdateFeed = TatolabAppUpdateFeedInstallingInPlace | TatolabAppUpdateFeedOpeningTheDownload;

/** This build's feed, or why this app cannot update itself. */
export type TatolabAppUpdateFeedForThisBuild = { kind: "offered"; feed: TatolabAppUpdateFeed } | { kind: "not_offered"; reason: string };

/** What tells the person about updates outside the window. The updater's own words for a failure are in Settings, not the notification. */
export interface TatolabAppUpdateNotifier {
  notifyANewerVersionIsAvailable(version: string): void;
  notifyTheAppIsUpToDate(): void;
  notifyTheUpdateFailed(): void;
}

/** The update notifications, over the desktop's `systemNotifications`; clicking one calls `onNotificationClicked`. */
export function tatolabAppUpdateNotifierOver(systemNotifications: SystemNotifications, onNotificationClicked: () => void): TatolabAppUpdateNotifier {
  return {
    notifyANewerVersionIsAvailable: (version) =>
      systemNotifications.showNotification(`Tato Studio ${version} is available`, "Click to open Settings and get it.", onNotificationClicked),
    notifyTheAppIsUpToDate: () => systemNotifications.showNotification("Tato Studio is up to date", "You have the newest version.", onNotificationClicked),
    notifyTheUpdateFailed: () =>
      systemNotifications.showNotification(
        "Tato Studio couldn't update",
        "Something went wrong while updating. Open Settings to see what happened and try again.",
        onNotificationClicked,
      ),
  };
}

/** Where a choice the person made was made: the tray or the update-ready dialog, whose outcome only a notification shows, or the window, where its menus and Settings show it. */
export type TatolabAppUpdateCheckChosenFrom = "tray" | "update_ready_dialog" | "window";

/** What the person chose in the dialog that says a downloaded version is ready: install it now, or close the dialog until the app next opens. */
export type ChoiceInTheUpdateReadyDialog = "install_update" | "cancel";

/** The dialog that says `version` downloaded and is ready to install, answering the person's choice. */
export type AskWhetherToInstallTheDownloadedVersion = (version: string) => Promise<ChoiceInTheUpdateReadyDialog>;

/** Starts `work` every `intervalMs`, as `setInterval` does. */
export type RepeatingTimer = (intervalMs: number, work: () => void) => void;

/** Who started a check: the app on its own, which tells the person once per version, or the person, from `chosenFrom`. */
type TatolabAppUpdateCheckStartedBy = { kind: "the_app_on_its_own" } | { kind: "the_person"; chosenFrom: TatolabAppUpdateCheckChosenFrom };

/** Where checking for a newer Tatolab stands, and how it moves. */
export class TatolabAppUpdater {
  private appUpdateState: TatolabAppUpdateState;
  private readonly versionsAlreadyNotified = new Set<string>();
  private readonly versionsTheUpdateReadyDialogAskedAbout = new Set<string>();

  /** An updater over `feedForThisBuild`, calling `onStateChanged` after each change of `state()`. */
  constructor(
    private readonly feedForThisBuild: TatolabAppUpdateFeedForThisBuild,
    private readonly notifier: TatolabAppUpdateNotifier,
    private readonly askWhetherToInstallTheDownloadedVersion: AskWhetherToInstallTheDownloadedVersion,
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

  /** The check the app makes on its own: a newer version that installs in place downloads and is staged; the person hears once per version; a failure keeps a version already found. */
  async checkOnItsOwn(): Promise<void> {
    await this.checkAndDownload({ kind: "the_app_on_its_own" });
  }

  /** Check for Updates…, chosen from `chosenFrom`: check, and download a newer version that installs in place; a choice while one is under way does nothing. */
  async checkForUpdatesOnRequest(chosenFrom: TatolabAppUpdateCheckChosenFrom): Promise<void> {
    await this.checkAndDownload({ kind: "the_person", chosenFrom });
  }

  /** Take the newer version, chosen from `chosenFrom`: restart into a staged one, download one a check found, or open a `.deb`'s download; nothing in any other state. */
  async takeTheNewerVersion(chosenFrom: TatolabAppUpdateCheckChosenFrom): Promise<void> {
    if (this.feedForThisBuild.kind === "not_offered") return;
    const feed = this.feedForThisBuild.feed;
    const currentState = this.appUpdateState;
    if (currentState.kind === "ready_to_restart" && feed.delivery === "install_and_relaunch") {
      this.tatolabAppLog.info("restarting to install a newer Tatolab", { version: currentState.version });
      this.changeStateTo({ kind: "installing", version: currentState.version });
      const installed = await feed.installTheDownloadedVersionAndRelaunch();
      if (!installed.ok) this.failChosenUpdate(chosenFrom, installed.failure);
      return;
    }
    if (currentState.kind !== "available") return;
    if (feed.delivery === "install_and_relaunch") {
      await this.checkForUpdatesOnRequest(chosenFrom);
      return;
    }
    const opened = await feed.openTheNewerVersionsDownload();
    if (!opened.ok) this.failChosenUpdate(chosenFrom, opened.failure);
  }

  /** The tray's updates item: take a newer version already found or staged, otherwise check for one. */
  async respondToTheTrayUpdatesItem(): Promise<void> {
    if (this.appUpdateState.kind === "available" || this.appUpdateState.kind === "ready_to_restart") {
      await this.takeTheNewerVersion("tray");
      return;
    }
    await this.checkForUpdatesOnRequest("tray");
  }

  private async checkAndDownload(startedBy: TatolabAppUpdateCheckStartedBy): Promise<void> {
    if (this.feedForThisBuild.kind === "not_offered" || this.anUpdateIsUnderWay()) return;
    const feed = this.feedForThisBuild.feed;
    const previousState = this.appUpdateState;
    this.changeStateTo({ kind: "checking" });
    const newerVersion = await feed.findANewerVersion();
    if (!newerVersion.ok) {
      if (startedBy.kind === "the_person") {
        this.failChosenUpdate(startedBy.chosenFrom, newerVersion.failure);
        return;
      }
      this.tatolabAppLog.warn("the update check on its own failed", { refusal: newerVersion.failure });
      this.changeStateTo(previousState.kind === "available" || previousState.kind === "ready_to_restart" ? previousState : { kind: "failed", refusal: newerVersion.failure });
      return;
    }
    const version = newerVersion.value;
    if (version === null) {
      this.changeStateTo(previousState.kind === "ready_to_restart" ? previousState : { kind: "up_to_date" });
      if (startedBy.kind === "the_person" && startedBy.chosenFrom === "tray") this.notifier.notifyTheAppIsUpToDate();
      return;
    }
    if (feed.delivery === "open_the_download") {
      this.changeStateTo({ kind: "available", version, delivery: feed.delivery });
      this.notifyOnce(startedBy, version, () => this.notifier.notifyANewerVersionIsAvailable(version));
      return;
    }
    if (previousState.kind === "ready_to_restart" && previousState.version === version) {
      this.changeStateTo(previousState);
      return;
    }
    this.tatolabAppLog.info("downloading a newer Tatolab", { version });
    this.changeStateTo({ kind: "downloading", version, percent: 0 });
    const downloaded = await feed.downloadTheNewerVersion((percent) => {
      if (this.appUpdateState.kind === "downloading" && this.appUpdateState.percent !== percent) this.changeStateTo({ kind: "downloading", version, percent });
    });
    if (!downloaded.ok) {
      if (startedBy.kind === "the_person") {
        this.failChosenUpdate(startedBy.chosenFrom, downloaded.failure);
        return;
      }
      this.tatolabAppLog.warn("the newer Tatolab did not download in the background", { version, refusal: downloaded.failure });
      this.changeStateTo({ kind: "available", version, delivery: feed.delivery });
      this.notifyOnce(startedBy, version, () => this.notifier.notifyANewerVersionIsAvailable(version));
      return;
    }
    this.changeStateTo({ kind: "ready_to_restart", version });
    this.versionsAlreadyNotified.add(version);
    this.askOnceWhetherToInstall(version);
  }

  /** Show the update-ready dialog for `version` once while the app runs, without waiting on it; Install Update takes the version as Restart to Update does. */
  private askOnceWhetherToInstall(version: string): void {
    if (this.versionsTheUpdateReadyDialogAskedAbout.has(version)) return;
    this.versionsTheUpdateReadyDialogAskedAbout.add(version);
    this.askWhetherToInstallTheDownloadedVersion(version)
      .then((choice) => (choice === "install_update" && this.appUpdateState.kind === "ready_to_restart" && this.appUpdateState.version === version ? this.takeTheNewerVersion("update_ready_dialog") : undefined))
      .catch((unexpectedFailure: unknown) => {
        this.tatolabAppLog.error("the update-ready dialog ended on a failure nothing expected", { version, failure: describeCaughtFailure(unexpectedFailure) });
      });
  }

  /** Tell the person through `notify`: once per version for a check on its own, every time for a choice from the tray, and never for one from the window, which shows it. */
  private notifyOnce(startedBy: TatolabAppUpdateCheckStartedBy, version: string, notify: () => void): void {
    if (startedBy.kind === "the_person") {
      if (startedBy.chosenFrom === "tray") notify();
      this.versionsAlreadyNotified.add(version);
      return;
    }
    if (this.versionsAlreadyNotified.has(version)) return;
    this.versionsAlreadyNotified.add(version);
    notify();
  }

  private anUpdateIsUnderWay(): boolean {
    return this.appUpdateState.kind === "checking" || this.appUpdateState.kind === "downloading" || this.appUpdateState.kind === "installing";
  }

  private failChosenUpdate(chosenFrom: TatolabAppUpdateCheckChosenFrom, refusal: string): void {
    this.tatolabAppLog.warn("the update failed; the installed Tatolab keeps running", { refusal });
    this.changeStateTo({ kind: "failed", refusal });
    if (chosenFrom !== "window") this.notifier.notifyTheUpdateFailed();
  }

  private changeStateTo(appUpdateState: TatolabAppUpdateState): void {
    this.appUpdateState = appUpdateState;
    this.onStateChanged();
  }
}
