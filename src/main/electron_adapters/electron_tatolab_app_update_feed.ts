// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The update feed through electron-updater: `MacUpdater` hands the signed `.zip` to Squirrel.Mac,
// which replaces the bundle and reopens it; `AppImageUpdater` replaces the AppImage's file and
// reopens it; `DebUpdater` only reads the feed, and the `.deb`'s download opens in the browser.
// Nothing downloads or installs on its own: only taking the newer version does.

import { shell } from "electron";
import electronUpdater, { type AppUpdater, type Logger, type UpdateCheckResult } from "electron-updater";
import type { TatolabAppUpdatePackaging } from "../platform/mod.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import type { TatolabAppUpdateFeed, TatolabAppUpdateFeedForThisBuild, TatolabAppUpdateProgress } from "../tatolab_app_updater.js";

/** How long Squirrel.Mac may take to install a downloaded update and quit before the update reads as failed. */
const SQUIRREL_MAC_INSTALL_LIMIT_MS = 120_000;

/** electron-updater's own log lines, at debug in the app's log. */
function electronUpdaterLogger(tatolabAppLog: TatolabAppLog): Logger {
  const logAt = (level: string) => (message?: unknown) => tatolabAppLog.debug("electron-updater", { level, message: describeCaughtFailure(message) });
  return { info: logAt("info"), warn: logAt("warn"), error: logAt("error"), debug: logAt("debug") };
}

/** One of electron-updater's updaters over the generic feed at `appUpdateFeedUrl`, downloading and installing only when asked. */
function electronUpdaterReading(appUpdater: AppUpdater, appUpdateFeedUrl: string, tatolabAppLog: TatolabAppLog): AppUpdater {
  appUpdater.setFeedURL({ provider: "generic", url: appUpdateFeedUrl });
  appUpdater.autoDownload = false;
  appUpdater.autoInstallOnAppQuit = false;
  appUpdater.allowDowngrade = false;
  // The feed publishes no blockmaps, so every update downloads whole.
  appUpdater.disableDifferentialDownload = true;
  appUpdater.logger = electronUpdaterLogger(tatolabAppLog);
  return appUpdater;
}

/** The feed electron-updater reads at `appUpdateFeedUrl` for `appUpdatePackaging`, or why this app cannot update itself. */
export function createElectronTatolabAppUpdateFeed(
  appUpdatePackaging: TatolabAppUpdatePackaging,
  appUpdateFeedUrl: string,
  tatolabAppLog: TatolabAppLog,
): TatolabAppUpdateFeedForThisBuild {
  switch (appUpdatePackaging.kind) {
    case "not_offered":
      return { kind: "not_offered", reason: appUpdatePackaging.reason };
    case "squirrel_mac_zip":
      return {
        kind: "offered",
        feed: new ElectronInstallingTatolabAppUpdateFeed(electronUpdaterReading(new electronUpdater.MacUpdater(), appUpdateFeedUrl, tatolabAppLog), SQUIRREL_MAC_INSTALL_LIMIT_MS),
      };
    case "appimage":
      return {
        kind: "offered",
        feed: new ElectronInstallingTatolabAppUpdateFeed(electronUpdaterReading(new electronUpdater.AppImageUpdater(), appUpdateFeedUrl, tatolabAppLog), null),
      };
    case "deb":
      return {
        kind: "offered",
        feed: new ElectronDownloadOpeningTatolabAppUpdateFeed(electronUpdaterReading(new electronUpdater.DebUpdater(), appUpdateFeedUrl, tatolabAppLog), appUpdateFeedUrl),
      };
  }
}

/** The newer version a check found, `null` when this app is the newest; refused in electron-updater's words. */
async function newerVersionFoundBy(appUpdater: AppUpdater): Promise<Result<UpdateCheckResult | null, string>> {
  try {
    const updateCheck = await appUpdater.checkForUpdates();
    if (updateCheck === null) return failedWith("the updater is not active in this app");
    return succeeded(updateCheck.isUpdateAvailable ? updateCheck : null);
  } catch (checkFailure) {
    return failedWith(describeCaughtFailure(checkFailure));
  }
}

/** A feed whose newer version installs in place and reopens the app: Squirrel.Mac's `.zip`, or the AppImage. */
class ElectronInstallingTatolabAppUpdateFeed implements TatolabAppUpdateFeed {
  readonly delivery = "install_and_relaunch";

  /** `installLimitMs`: how long the install may take to quit the app before it reads as failed; `null` where the install quits at once or fails at once. */
  constructor(
    private readonly appUpdater: AppUpdater,
    private readonly installLimitMs: number | null,
  ) {}

  async findANewerVersion(): Promise<Result<string | null, string>> {
    const updateCheck = await newerVersionFoundBy(this.appUpdater);
    return updateCheck.ok ? succeeded(updateCheck.value?.updateInfo.version ?? null) : updateCheck;
  }

  async takeTheNewerVersion(progress: TatolabAppUpdateProgress): Promise<Result<void, string>> {
    const reportDownloadProgress = (downloadProgress: { percent: number }) => progress.onDownloadProgress(Math.floor(downloadProgress.percent));
    this.appUpdater.on("download-progress", reportDownloadProgress);
    try {
      await this.appUpdater.downloadUpdate();
    } catch (downloadFailure) {
      return failedWith(describeCaughtFailure(downloadFailure));
    } finally {
      this.appUpdater.off("download-progress", reportDownloadProgress);
    }
    progress.onInstalling();
    // Squirrel.Mac installs after quitAndInstall returns, and says only through `error` that it could not.
    const installFailure = new Promise<Result<void, string>>((answer) => {
      this.appUpdater.once("error", (updaterError: Error) => answer(failedWith(describeCaughtFailure(updaterError))));
      if (this.installLimitMs !== null) {
        setTimeout(() => answer(failedWith("the update downloaded, but Tatolab did not reopen to install it")), this.installLimitMs);
      }
    });
    try {
      this.appUpdater.quitAndInstall(false, true);
    } catch (installFailureAtOnce) {
      return failedWith(describeCaughtFailure(installFailureAtOnce));
    }
    return installFailure;
  }
}

/** A `.deb`'s feed: apt alone replaces the package, so the newer version's download opens in the browser. */
class ElectronDownloadOpeningTatolabAppUpdateFeed implements TatolabAppUpdateFeed {
  readonly delivery = "open_the_download";
  private newerDebUrl: string | null = null;

  constructor(
    private readonly appUpdater: AppUpdater,
    private readonly appUpdateFeedUrl: string,
  ) {}

  async findANewerVersion(): Promise<Result<string | null, string>> {
    const updateCheck = await newerVersionFoundBy(this.appUpdater);
    if (!updateCheck.ok) return updateCheck;
    if (updateCheck.value === null) return succeeded(null);
    const debFile = updateCheck.value.updateInfo.files.find((updateFile) => updateFile.url.endsWith(".deb"));
    if (debFile === undefined) return failedWith(`the feed lists no .deb for Tatolab ${updateCheck.value.updateInfo.version}`);
    this.newerDebUrl = new URL(debFile.url, this.appUpdateFeedUrl).toString();
    return succeeded(updateCheck.value.updateInfo.version);
  }

  async takeTheNewerVersion(): Promise<Result<void, string>> {
    if (this.newerDebUrl === null) return failedWith("no newer version has been found to download");
    try {
      await shell.openExternal(this.newerDebUrl);
    } catch (openFailure) {
      return failedWith(describeCaughtFailure(openFailure));
    }
    return succeeded(undefined);
  }
}
