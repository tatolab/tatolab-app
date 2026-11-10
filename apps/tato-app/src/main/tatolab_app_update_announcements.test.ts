import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import {
  announceWhenAnUpdateLanded,
  LAST_OPENED_APP_VERSION_FILE_NAME,
  LastOpenedAppVersionFile,
  TatolabAppUpdateAnnouncements,
} from "./tatolab_app_update_announcements.js";

const appConfigDirectoriesMade: string[] = [];

afterEach(async () => {
  await Promise.all(appConfigDirectoriesMade.splice(0).map((appConfigDirectory) => rm(appConfigDirectory, { recursive: true, force: true })));
});

async function anEmptyAppConfigDirectory(): Promise<string> {
  const appConfigDirectory = path.join(os.tmpdir(), `tl-update-announcements-${randomUUID()}`);
  await mkdir(appConfigDirectory, { recursive: true });
  appConfigDirectoriesMade.push(appConfigDirectory);
  return appConfigDirectory;
}

/** Announcements that count each change of the one shown. */
function countedUpdateAnnouncements() {
  const shownAnnouncementChanges = { count: 0 };
  const announcements = new TatolabAppUpdateAnnouncements(() => {
    shownAnnouncementChanges.count += 1;
  });
  return { announcements, shownAnnouncementChanges };
}

function lastOpenedVersionFileIn(appConfigDirectory: string): LastOpenedAppVersionFile {
  return LastOpenedAppVersionFile.inAppConfigDirectory(appConfigDirectory, createTatolabAppLog("error", () => {}));
}

test("a downloaded version is announced ready, and a newer one replaces it while the first still waits", () => {
  const { announcements, shownAnnouncementChanges } = countedUpdateAnnouncements();

  announcements.announceTheDownloadedVersionIsReady("0.69.0");
  expect(announcements.shownAnnouncement()).toEqual({ kind: "update_ready", version: "0.69.0" });
  announcements.announceTheDownloadedVersionIsReady("0.69.1");

  expect(announcements.shownAnnouncement()).toEqual({ kind: "update_ready", version: "0.69.1" });
  expect(shownAnnouncementChanges.count).toBe(2);
});

test("an answered announcement is taken away once, and the next waiting one is shown", () => {
  const { announcements, shownAnnouncementChanges } = countedUpdateAnnouncements();
  announcements.announceTheUpdateLanded("0.69.0");
  announcements.announceTheDownloadedVersionIsReady("0.69.1");

  expect(announcements.takeAwayTheAnswered("update_landed", "0.69.0")).toEqual({
    kind: "update_landed",
    version: "0.69.0",
    release_notes_url: "https://github.com/tatolab/tatolab-app/releases/tag/v0.69.0",
  });
  expect(announcements.takeAwayTheAnswered("update_landed", "0.69.0")).toBeNull();
  expect(announcements.shownAnnouncement()).toEqual({ kind: "update_ready", version: "0.69.1" });
  expect(shownAnnouncementChanges.count).toBe(2);
});

test("an answer naming another version takes nothing away", () => {
  const { announcements, shownAnnouncementChanges } = countedUpdateAnnouncements();
  announcements.announceTheDownloadedVersionIsReady("0.69.1");

  expect(announcements.takeAwayTheAnswered("update_ready", "0.69.0")).toBeNull();
  expect(announcements.shownAnnouncement()).toEqual({ kind: "update_ready", version: "0.69.1" });
  expect(shownAnnouncementChanges.count).toBe(1);
});

test("a ready announcement is withdrawn once its version is no longer the one staged, and kept while it is", () => {
  const { announcements } = countedUpdateAnnouncements();
  announcements.announceTheDownloadedVersionIsReady("0.69.0");

  announcements.withdrawTheReadyAnnouncementUnlessStaged("0.69.0");
  expect(announcements.shownAnnouncement()).toEqual({ kind: "update_ready", version: "0.69.0" });
  announcements.withdrawTheReadyAnnouncementUnlessStaged(null);
  expect(announcements.shownAnnouncement()).toBeNull();
});

test("an announcement waiting behind the shown one changes nothing the windows show", () => {
  const { announcements, shownAnnouncementChanges } = countedUpdateAnnouncements();
  announcements.announceTheUpdateLanded("0.69.0");
  announcements.announceTheDownloadedVersionIsReady("0.69.1");

  expect(shownAnnouncementChanges.count).toBe(1);
});

test("the first launch announces nothing and remembers its version, and a later launch of the same version announces nothing", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  const { announcements } = countedUpdateAnnouncements();

  await announceWhenAnUpdateLanded("0.68.56", lastOpenedVersionFileIn(appConfigDirectory), announcements);
  await announceWhenAnUpdateLanded("0.68.56", lastOpenedVersionFileIn(appConfigDirectory), announcements);

  expect(announcements.shownAnnouncement()).toBeNull();
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "utf8"))).toEqual({ app_version: "0.68.56" });
});

test("the first launch after an update announces the new version with its release notes, once", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  await writeFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), JSON.stringify({ app_version: "0.68.47" }));
  const { announcements, shownAnnouncementChanges } = countedUpdateAnnouncements();

  await announceWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), announcements);
  await announceWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), announcements);

  expect(announcements.shownAnnouncement()).toEqual({
    kind: "update_landed",
    version: "0.69.0",
    release_notes_url: "https://github.com/tatolab/tatolab-app/releases/tag/v0.69.0",
  });
  expect(shownAnnouncementChanges.count).toBe(1);
});

test("a remembered version that is malformed reads as none, so the launch announces nothing and remembers its own", async () => {
  const appConfigDirectory = await anEmptyAppConfigDirectory();
  await writeFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "{ not json");
  const { announcements } = countedUpdateAnnouncements();

  await announceWhenAnUpdateLanded("0.69.0", lastOpenedVersionFileIn(appConfigDirectory), announcements);

  expect(announcements.shownAnnouncement()).toBeNull();
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, LAST_OPENED_APP_VERSION_FILE_NAME), "utf8"))).toEqual({ app_version: "0.69.0" });
});
