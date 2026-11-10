import { expect, test } from "vitest";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import type { TatolabAppUpdateState } from "../shared/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  TatolabAppUpdater,
  type TatolabAppUpdateFeedForThisBuild,
  type TatolabAppUpdateFeedInstallingInPlace,
  type TatolabAppUpdateFeedOpeningTheDownload,
  type ChoiceInTheUpdateReadyDialog,
  type TatolabAppUpdateNotifier,
  tatolabAppUpdateNotifierOver,
} from "./tatolab_app_updater.js";

/** A feed installing in place, offering what the test sets and recording each download and install. */
class FakeTatolabAppUpdateFeedInstallingInPlace implements TatolabAppUpdateFeedInstallingInPlace {
  readonly delivery = "install_and_relaunch";
  newerVersion: Result<string | null, string> = succeeded(null);
  downloading: Result<void, string> = succeeded(undefined);
  installing: Result<void, string> = succeeded(undefined);
  downloadProgressPercents: number[] = [];
  downloadCount = 0;
  installCount = 0;

  async findANewerVersion(): Promise<Result<string | null, string>> {
    return this.newerVersion;
  }

  async downloadTheNewerVersion(onDownloadProgress: (percent: number) => void): Promise<Result<void, string>> {
    this.downloadCount += 1;
    for (const percent of this.downloadProgressPercents) onDownloadProgress(percent);
    return this.downloading;
  }

  async installTheDownloadedVersionAndRelaunch(): Promise<Result<void, string>> {
    this.installCount += 1;
    return this.installing;
  }
}

/** A `.deb`'s feed, offering what the test sets and recording each download it opened. */
class FakeTatolabAppUpdateFeedOpeningTheDownload implements TatolabAppUpdateFeedOpeningTheDownload {
  readonly delivery = "open_the_download";
  newerVersion: Result<string | null, string> = succeeded(null);
  openCount = 0;

  async findANewerVersion(): Promise<Result<string | null, string>> {
    return this.newerVersion;
  }

  async openTheNewerVersionsDownload(): Promise<Result<void, string>> {
    this.openCount += 1;
    return succeeded(undefined);
  }
}

/** Flush the update-ready dialog's answer, which the updater takes without waiting on it. */
function settleTheUpdateReadyDialog(): Promise<void> {
  return new Promise((settled) => setImmediate(settled));
}

function updaterOver(feedForThisBuild: TatolabAppUpdateFeedForThisBuild) {
  const notifications: string[] = [];
  const updateReadyDialogsShown: string[] = [];
  const choicesInTheNextUpdateReadyDialogs: ChoiceInTheUpdateReadyDialog[] = [];
  const statesSeen: TatolabAppUpdateState[] = [];
  const notifier: TatolabAppUpdateNotifier = {
    notifyANewerVersionIsAvailable: (version) => notifications.push(`available ${version}`),
    notifyTheAppIsUpToDate: () => notifications.push("up to date"),
    notifyTheUpdateFailed: () => notifications.push("failed"),
  };
  const askWhetherToInstallTheDownloadedVersion = (version: string) => {
    updateReadyDialogsShown.push(version);
    return Promise.resolve(choicesInTheNextUpdateReadyDialogs.shift() ?? "cancel");
  };
  const updater: TatolabAppUpdater = new TatolabAppUpdater(
    feedForThisBuild,
    notifier,
    askWhetherToInstallTheDownloadedVersion,
    () => statesSeen.push(updater.state()),
    createTatolabAppLog("error", () => {}),
  );
  return { updater, notifications, statesSeen, updateReadyDialogsShown, choicesInTheNextUpdateReadyDialogs };
}

function updaterOverAFeedInstallingInPlace() {
  const feed = new FakeTatolabAppUpdateFeedInstallingInPlace();
  return { feed, ...updaterOver({ kind: "offered", feed }) };
}

function updaterOverADebFeed() {
  const feed = new FakeTatolabAppUpdateFeedOpeningTheDownload();
  return { feed, ...updaterOver({ kind: "offered", feed }) };
}

test("an app that cannot update itself says why and checks nothing", async () => {
  const { updater, statesSeen } = updaterOver({ kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." });
  const repeatedIntervals: number[] = [];
  updater.startCheckingOnItsOwn((intervalMs) => repeatedIntervals.push(intervalMs));
  await updater.checkForUpdatesOnRequest("window");
  await updater.takeTheNewerVersion("window");
  expect(updater.state()).toEqual({ kind: "not_offered", reason: "Only a packaged Tato Studio updates itself." });
  expect(repeatedIntervals).toEqual([]);
  expect(statesSeen).toEqual([]);
});

test("the app checks at launch and then once a day", () => {
  const { updater, statesSeen } = updaterOverAFeedInstallingInPlace();
  const repeatedIntervals: number[] = [];
  updater.startCheckingOnItsOwn((intervalMs) => repeatedIntervals.push(intervalMs));
  expect(statesSeen[0]).toEqual({ kind: "checking" });
  expect(repeatedIntervals).toEqual([APP_UPDATE_CHECK_INTERVAL_MS]);
});

test("a check on its own downloads a newer version in the background, and the update-ready dialog says so once per version", async () => {
  const { updater, feed, notifications, statesSeen, updateReadyDialogsShown } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  feed.downloadProgressPercents = [0, 42, 42, 100];
  await updater.checkOnItsOwn();
  expect(statesSeen).toEqual([
    { kind: "checking" },
    { kind: "downloading", version: "0.47.0", percent: 0 },
    { kind: "downloading", version: "0.47.0", percent: 42 },
    { kind: "downloading", version: "0.47.0", percent: 100 },
    { kind: "ready_to_restart", version: "0.47.0" },
  ]);
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(feed.downloadCount).toBe(1);
  expect(feed.installCount).toBe(0);
  expect(updateReadyDialogsShown).toEqual(["0.47.0"]);
  feed.newerVersion = succeeded("0.48.0");
  await updater.checkOnItsOwn();
  await settleTheUpdateReadyDialog();
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.48.0" });
  expect(updateReadyDialogsShown).toEqual(["0.47.0", "0.48.0"]);
  expect(feed.installCount).toBe(0);
  expect(notifications).toEqual([]);
});

test("a background download that fails leaves the newer version available to download on request", async () => {
  const { updater, feed, notifications } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  feed.downloading = failedWith("net::ERR_CONNECTION_RESET");
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" });
  expect(notifications).toEqual(["available 0.47.0"]);
  feed.downloading = succeeded(undefined);
  await updater.takeTheNewerVersion("window");
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(feed.downloadCount).toBe(2);
});

test("a check on its own with nothing newer reads up to date and notifies nobody", async () => {
  const { updater, notifications } = updaterOverAFeedInstallingInPlace();
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "up_to_date" });
  expect(notifications).toEqual([]);
});

test("a failed check on its own keeps a version already staged, and otherwise shows the updater's words", async () => {
  const { updater, feed, updateReadyDialogsShown } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = failedWith("net::ERR_INTERNET_DISCONNECTED");
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "failed", refusal: "net::ERR_INTERNET_DISCONNECTED" });
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkOnItsOwn();
  feed.newerVersion = failedWith("net::ERR_INTERNET_DISCONNECTED");
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(updateReadyDialogsShown).toEqual(["0.47.0"]);
});

test("choosing Check for Updates… downloads a newer version and waits for Restart to Update, which installs it and relaunches", async () => {
  const { updater, feed, statesSeen, notifications } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkForUpdatesOnRequest("window");
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(feed.installCount).toBe(0);
  expect(notifications).toEqual([]);
  await updater.takeTheNewerVersion("window");
  expect(feed.installCount).toBe(1);
  expect(statesSeen.at(-1)).toEqual({ kind: "installing", version: "0.47.0" });
});

test("the tray's updates item checks, then restarts into the version it staged", async () => {
  const { updater, feed, updateReadyDialogsShown } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  await updater.respondToTheTrayUpdatesItem();
  await settleTheUpdateReadyDialog();
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(updateReadyDialogsShown).toEqual(["0.47.0"]);
  await updater.respondToTheTrayUpdatesItem();
  expect(feed.installCount).toBe(1);
  expect(updater.state()).toEqual({ kind: "installing", version: "0.47.0" });
});

test("choosing Check for Updates… with nothing newer says Tato Studio is up to date, by notification only from the tray", async () => {
  const { updater, notifications } = updaterOverAFeedInstallingInPlace();
  await updater.checkForUpdatesOnRequest("window");
  expect(updater.state()).toEqual({ kind: "up_to_date" });
  expect(notifications).toEqual([]);
  await updater.checkForUpdatesOnRequest("tray");
  expect(notifications).toEqual(["up to date"]);
});

test("a failed update says why in the updater's own words, by notification only from the tray", async () => {
  const { updater, feed, notifications } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkForUpdatesOnRequest("window");
  feed.installing = failedWith("Could not get code signature for running application");
  await updater.takeTheNewerVersion("window");
  expect(updater.state()).toEqual({ kind: "failed", refusal: "Could not get code signature for running application" });
  expect(notifications).toEqual([]);
  feed.newerVersion = failedWith("HttpError: 404");
  await updater.checkForUpdatesOnRequest("tray");
  expect(notifications).toEqual(["failed"]);
});

test("Install Update in the update-ready dialog installs the downloaded version and relaunches, as Restart to Update does", async () => {
  const { updater, feed, statesSeen, choicesInTheNextUpdateReadyDialogs } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  choicesInTheNextUpdateReadyDialogs.push("install_update");
  await updater.checkOnItsOwn();
  await settleTheUpdateReadyDialog();
  expect(feed.installCount).toBe(1);
  expect(statesSeen.at(-1)).toEqual({ kind: "installing", version: "0.47.0" });
});

test("Cancel in the update-ready dialog installs nothing, and the next launch's updater asks again", async () => {
  const thisLaunch = updaterOverAFeedInstallingInPlace();
  thisLaunch.feed.newerVersion = succeeded("0.47.0");
  thisLaunch.choicesInTheNextUpdateReadyDialogs.push("cancel");
  await thisLaunch.updater.checkOnItsOwn();
  await thisLaunch.updater.checkForUpdatesOnRequest("window");
  await settleTheUpdateReadyDialog();
  expect(thisLaunch.feed.installCount).toBe(0);
  expect(thisLaunch.updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
  expect(thisLaunch.updateReadyDialogsShown).toEqual(["0.47.0"]);
  const nextLaunch = updaterOverAFeedInstallingInPlace();
  nextLaunch.feed.newerVersion = succeeded("0.47.0");
  await nextLaunch.updater.checkOnItsOwn();
  expect(nextLaunch.updateReadyDialogsShown).toEqual(["0.47.0"]);
});

test("an install chosen in the update-ready dialog that fails says so by notification", async () => {
  const { updater, feed, notifications, choicesInTheNextUpdateReadyDialogs } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  feed.installing = failedWith("Could not get code signature for running application");
  choicesInTheNextUpdateReadyDialogs.push("install_update");
  await updater.checkForUpdatesOnRequest("window");
  await settleTheUpdateReadyDialog();
  expect(updater.state()).toEqual({ kind: "failed", refusal: "Could not get code signature for running application" });
  expect(notifications).toEqual(["failed"]);
});

test("Install Update chosen after Restart to Update already started installs once", async () => {
  let answerTheDialog: (choice: ChoiceInTheUpdateReadyDialog) => void = () => {};
  const feed = new FakeTatolabAppUpdateFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  const updater = new TatolabAppUpdater(
    { kind: "offered", feed },
    { notifyANewerVersionIsAvailable: () => {}, notifyTheAppIsUpToDate: () => {}, notifyTheUpdateFailed: () => {} },
    () => new Promise((answer) => (answerTheDialog = answer)),
    () => {},
    createTatolabAppLog("error", () => {}),
  );
  await updater.checkOnItsOwn();
  await updater.takeTheNewerVersion("window");
  answerTheDialog("install_update");
  await settleTheUpdateReadyDialog();
  expect(feed.installCount).toBe(1);
});

test("a .deb finds the newer version, and opens its download only when the person takes it", async () => {
  const { updater, feed, statesSeen, notifications } = updaterOverADebFeed();
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkOnItsOwn();
  expect(statesSeen).toEqual([{ kind: "checking" }, { kind: "available", version: "0.47.0", delivery: "open_the_download" }]);
  expect(notifications).toEqual(["available 0.47.0"]);
  expect(feed.openCount).toBe(0);
  await updater.respondToTheTrayUpdatesItem();
  expect(feed.openCount).toBe(1);
  expect(updater.state()).toEqual({ kind: "available", version: "0.47.0", delivery: "open_the_download" });
});

test("a second choice while an update is under way does nothing", async () => {
  const { updater, feed } = updaterOverAFeedInstallingInPlace();
  feed.newerVersion = succeeded("0.47.0");
  const firstChoice = updater.checkForUpdatesOnRequest("window");
  const secondChoice = updater.checkForUpdatesOnRequest("tray");
  const checkOnItsOwn = updater.checkOnItsOwn();
  await Promise.all([firstChoice, secondChoice, checkOnItsOwn]);
  expect(feed.downloadCount).toBe(1);
  expect(updater.state()).toEqual({ kind: "ready_to_restart", version: "0.47.0" });
});

test("each update notification reads as plain sentences, and the update's own words stay out of it", () => {
  const systemNotifications = new FakeSystemNotifications();
  const notifier = tatolabAppUpdateNotifierOver(systemNotifications, () => {});

  notifier.notifyANewerVersionIsAvailable("0.56.0");
  notifier.notifyTheAppIsUpToDate();
  notifier.notifyTheUpdateFailed();

  expect(systemNotifications.notificationsShown).toEqual([
    { title: "Tato Studio 0.56.0 is available", body: "Click to open Settings and get it." },
    { title: "Tato Studio is up to date", body: "You have the newest version." },
    { title: "Tato Studio couldn't update", body: "Something went wrong while updating. Open Settings to see what happened and try again." },
  ]);
});
