// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import type { TatolabAppUpdateDelivery, TatolabAppUpdateState } from "../../src/backend/tatolab_backend_contract.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  TatolabAppUpdater,
  type TatolabAppUpdateFeed,
  type TatolabAppUpdateFeedForThisBuild,
  type TatolabAppUpdateNotifier,
  type TatolabAppUpdateProgress,
} from "./tatolab_app_updater.js";

/** A feed offering what the test sets, recording each time it was taken from. */
class FakeTatolabAppUpdateFeed implements TatolabAppUpdateFeed {
  newerVersion: Result<string | null, string> = succeeded(null);
  takingTheNewerVersion: Result<void, string> = succeeded(undefined);
  downloadProgressPercents: number[] = [];
  takenCount = 0;

  constructor(readonly delivery: TatolabAppUpdateDelivery) {}

  async findANewerVersion(): Promise<Result<string | null, string>> {
    return this.newerVersion;
  }

  async takeTheNewerVersion(progress: TatolabAppUpdateProgress): Promise<Result<void, string>> {
    this.takenCount += 1;
    if (this.delivery === "open_the_download") return this.takingTheNewerVersion;
    for (const percent of this.downloadProgressPercents) progress.onDownloadProgress(percent);
    if (this.takingTheNewerVersion.ok) progress.onInstalling();
    return this.takingTheNewerVersion;
  }
}

function updaterOver(feedForThisBuild: TatolabAppUpdateFeedForThisBuild) {
  const notifications: string[] = [];
  const statesSeen: TatolabAppUpdateState[] = [];
  const notifier: TatolabAppUpdateNotifier = {
    notifyANewerVersionIsAvailable: (version) => notifications.push(`available ${version}`),
    notifyTheAppIsUpToDate: () => notifications.push("up to date"),
    notifyTheUpdateFailed: (refusal) => notifications.push(`failed: ${refusal}`),
  };
  const updater: TatolabAppUpdater = new TatolabAppUpdater(feedForThisBuild, notifier, () => statesSeen.push(updater.state()), createTatolabAppLog("error", () => {}));
  return { updater, notifications, statesSeen };
}

function updaterOverAFeed(delivery: TatolabAppUpdateDelivery = "install_and_relaunch") {
  const feed = new FakeTatolabAppUpdateFeed(delivery);
  return { feed, ...updaterOver({ kind: "offered", feed }) };
}

test("an app that cannot update itself says why and checks nothing", async () => {
  const { updater, statesSeen } = updaterOver({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." });
  const repeatedIntervals: number[] = [];
  updater.startCheckingOnItsOwn((intervalMs) => repeatedIntervals.push(intervalMs));
  await updater.checkAndTakeANewerVersion("window");
  expect(updater.state()).toEqual({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." });
  expect(repeatedIntervals).toEqual([]);
  expect(statesSeen).toEqual([]);
});

test("the app checks at launch and then once a day", () => {
  const { updater, statesSeen } = updaterOverAFeed();
  const repeatedIntervals: number[] = [];
  updater.startCheckingOnItsOwn((intervalMs) => repeatedIntervals.push(intervalMs));
  expect(statesSeen[0]).toEqual({ kind: "checking" });
  expect(repeatedIntervals).toEqual([APP_UPDATE_CHECK_INTERVAL_MS]);
});

test("a check on its own finds a newer version, says so once per version, and takes nothing", async () => {
  const { updater, feed, notifications } = updaterOverAFeed();
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkOnItsOwn();
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" });
  expect(notifications).toEqual(["available 0.47.0"]);
  expect(feed.takenCount).toBe(0);
  feed.newerVersion = succeeded("0.48.0");
  await updater.checkOnItsOwn();
  expect(notifications).toEqual(["available 0.47.0", "available 0.48.0"]);
});

test("a check on its own with nothing newer reads up to date and notifies nobody", async () => {
  const { updater, notifications } = updaterOverAFeed();
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "up_to_date" });
  expect(notifications).toEqual([]);
});

test("a failed check on its own keeps a version already found, and otherwise shows the updater's words", async () => {
  const { updater, feed, notifications } = updaterOverAFeed();
  feed.newerVersion = failedWith("net::ERR_INTERNET_DISCONNECTED");
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "failed", refusal: "net::ERR_INTERNET_DISCONNECTED" });
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkOnItsOwn();
  feed.newerVersion = failedWith("net::ERR_INTERNET_DISCONNECTED");
  await updater.checkOnItsOwn();
  expect(updater.state()).toEqual({ kind: "available", version: "0.47.0", delivery: "install_and_relaunch" });
  expect(notifications).toEqual(["available 0.47.0"]);
});

test("choosing Check for Updates… downloads a newer version, then installs it and relaunches", async () => {
  const { updater, feed, statesSeen } = updaterOverAFeed();
  feed.newerVersion = succeeded("0.47.0");
  feed.downloadProgressPercents = [0, 42, 42, 100];
  await updater.checkAndTakeANewerVersion("window");
  expect(feed.takenCount).toBe(1);
  expect(statesSeen).toEqual([
    { kind: "checking" },
    { kind: "downloading", version: "0.47.0", percent: 0 },
    { kind: "downloading", version: "0.47.0", percent: 42 },
    { kind: "downloading", version: "0.47.0", percent: 100 },
    { kind: "installing", version: "0.47.0" },
  ]);
});

test("choosing Check for Updates… with nothing newer says Tatolab is up to date, by notification only from the tray", async () => {
  const { updater, notifications } = updaterOverAFeed();
  await updater.checkAndTakeANewerVersion("window");
  expect(updater.state()).toEqual({ kind: "up_to_date" });
  expect(notifications).toEqual([]);
  await updater.checkAndTakeANewerVersion("tray");
  expect(notifications).toEqual(["up to date"]);
});

test("a failed update says why in the updater's own words, by notification only from the tray", async () => {
  const { updater, feed, notifications } = updaterOverAFeed();
  feed.newerVersion = succeeded("0.47.0");
  feed.takingTheNewerVersion = failedWith("Could not get code signature for running application");
  await updater.checkAndTakeANewerVersion("window");
  expect(updater.state()).toEqual({ kind: "failed", refusal: "Could not get code signature for running application" });
  expect(notifications).toEqual([]);
  feed.newerVersion = failedWith("HttpError: 404");
  await updater.checkAndTakeANewerVersion("tray");
  expect(notifications).toEqual(["failed: HttpError: 404"]);
});

test("a .deb opens the newer version's download and keeps offering it", async () => {
  const { updater, feed, statesSeen } = updaterOverAFeed("open_the_download");
  feed.newerVersion = succeeded("0.47.0");
  await updater.checkAndTakeANewerVersion("tray");
  expect(feed.takenCount).toBe(1);
  expect(statesSeen).toEqual([{ kind: "checking" }, { kind: "available", version: "0.47.0", delivery: "open_the_download" }]);
});

test("a second choice while an update is under way does nothing", async () => {
  const { updater, feed } = updaterOverAFeed();
  feed.newerVersion = succeeded("0.47.0");
  const firstChoice = updater.checkAndTakeANewerVersion("window");
  const secondChoice = updater.checkAndTakeANewerVersion("tray");
  const checkOnItsOwn = updater.checkOnItsOwn();
  await Promise.all([firstChoice, secondChoice, checkOnItsOwn]);
  expect(feed.takenCount).toBe(1);
  expect(updater.state()).toEqual({ kind: "installing", version: "0.47.0" });
});
