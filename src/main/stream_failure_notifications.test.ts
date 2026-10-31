import { chmod, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ListedStream, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { RememberedSwitchFile } from "./remembered_switch_file.js";
import { STREAM_FAILURE_NOTIFICATION_TITLE, streamFailureNotificationBody, StreamFailureNotifications } from "./stream_failure_notifications.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});
const temporaryConfigDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryConfigDirectories.splice(0).map((configDirectory) => rm(configDirectory, { recursive: true, force: true })));
});

/** A stream from `/Users/u/streams/<displayName>` whose id is `<displayName>-main-<hash>`. */
function listedStream(displayName: string, state: string, failedBecause: string | null = null): ListedStream {
  return {
    stream: `${displayName}-main-0c4e2a`,
    display_name: displayName,
    location: { project_directory: `/Users/u/streams/${displayName}`, stream_function: "stream:main" },
    state,
    node_count: state === "failed" ? null : 3,
    failed_because: failedBecause, action: null, step: null,
  };
}

function statusListing(streams: ListedStream[] | null): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: streams === null ? "starting" : "running",
    machine_name: streams === null ? null : "jonathanf-macbook",
    streams,
    first_run_finished: true,
    command_line_tool_linked_at: "/Users/ada/.local/bin/tatolab",
    command_line_tool_usr_local_bin_link: { kind: "not_linked" },
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
  };
}

async function notificationsOverFakes() {
  const appConfigDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-config-"));
  temporaryConfigDirectories.push(appConfigDirectory);
  const systemNotifications = new FakeSystemNotifications();
  const streamPagesShown: string[] = [];
  const rememberedSwitch = RememberedSwitchFile.streamFailureNotificationsInAppConfigDirectory(appConfigDirectory, quietTatolabAppLog);
  const streamFailureNotifications = await StreamFailureNotifications.load(
    rememberedSwitch,
    systemNotifications,
    (streamId) => streamPagesShown.push(streamId),
    quietTatolabAppLog,
  );
  return { streamFailureNotifications, systemNotifications, streamPagesShown, appConfigDirectory, rememberedSwitch };
}

test("a_stream_failing_while_the_app_runs_notifies_by_its_display_name_and_a_click_shows_its_page_by_its_id", async () => {
  const { streamFailureNotifications, systemNotifications, streamPagesShown } = await notificationsOverFakes();

  streamFailureNotifications.noticeStatus(statusListing([listedStream("camera", "running")]));
  streamFailureNotifications.noticeStatus(statusListing([listedStream("camera", "failed", "camera access is denied for Tatolab")]));

  expect(systemNotifications.notificationsShown).toEqual([
    {
      title: "A stream couldn't start",
      body: "The stream named “camera” couldn't be started. An error occurred while launching it. Click to see why.",
    },
  ]);
  systemNotifications.clickTheLastNotification();
  expect(streamPagesShown).toEqual(["camera-main-0c4e2a"]);
});

test("streams_already_failed_at_launch_or_still_failed_notify_nothing_and_a_stream_failing_again_notifies_again", async () => {
  const { streamFailureNotifications, systemNotifications } = await notificationsOverFakes();

  streamFailureNotifications.noticeStatus(statusListing(null));
  streamFailureNotifications.noticeStatus(statusListing([listedStream("lobby-recorder", "failed", "no camera"), listedStream("main", "running")]));
  streamFailureNotifications.noticeStatus(statusListing([listedStream("lobby-recorder", "failed", "no camera"), listedStream("main", "running")]));
  expect(systemNotifications.notificationsShown).toEqual([]);

  streamFailureNotifications.noticeStatus(statusListing([listedStream("lobby-recorder", "running"), listedStream("main", "running")]));
  streamFailureNotifications.noticeStatus(statusListing(null));
  streamFailureNotifications.noticeStatus(statusListing([listedStream("lobby-recorder", "failed"), listedStream("main", "running")]));
  expect(systemNotifications.notificationsShown).toEqual([{ title: STREAM_FAILURE_NOTIFICATION_TITLE, body: streamFailureNotificationBody("lobby-recorder") }]);
});

test("two_streams_shown_under_one_display_name_are_told_apart_by_id_so_the_second_failing_notifies_and_opens_its_own_page", async () => {
  const { streamFailureNotifications, systemNotifications, streamPagesShown } = await notificationsOverFakes();
  const helloMain = { ...listedStream("main", "running"), stream: "hello-main-8d60ef" };
  const warnedMain = { ...listedStream("main", "running"), stream: "warned-main-6c2608" };

  streamFailureNotifications.noticeStatus(statusListing([{ ...helloMain, state: "failed", node_count: null }, warnedMain]));
  streamFailureNotifications.noticeStatus(statusListing([{ ...helloMain, state: "failed", node_count: null }, { ...warnedMain, state: "failed", node_count: null }]));

  expect(systemNotifications.notificationsShown).toEqual([{ title: STREAM_FAILURE_NOTIFICATION_TITLE, body: streamFailureNotificationBody("main") }]);
  systemNotifications.clickTheLastNotification();
  expect(streamPagesShown).toEqual(["warned-main-6c2608"]);
});

test("with_the_switch_off_nothing_notifies_and_the_switch_is_remembered_across_launches", async () => {
  const { streamFailureNotifications, systemNotifications, rememberedSwitch } = await notificationsOverFakes();

  expect(await streamFailureNotifications.setNotifyWhenAStreamFails(false)).toEqual({ ok: true, value: undefined });
  streamFailureNotifications.noticeStatus(statusListing([listedStream("camera", "running")]));
  streamFailureNotifications.noticeStatus(statusListing([listedStream("camera", "failed", "no camera")]));

  expect(systemNotifications.notificationsShown).toEqual([]);
  expect(streamFailureNotifications.stateNow()).toEqual({ enabled: false, shown_by_this_desktop: true });
  const nextLaunch = await StreamFailureNotifications.load(rememberedSwitch, systemNotifications, () => {}, quietTatolabAppLog);
  expect(nextLaunch.stateNow().enabled).toBe(false);
});

test("a_desktop_that_shows_no_notifications_says_so_in_the_state", async () => {
  const { streamFailureNotifications, systemNotifications } = await notificationsOverFakes();
  systemNotifications.desktopShowsNotifications = false;

  expect(streamFailureNotifications.stateNow()).toEqual({ enabled: true, shown_by_this_desktop: false });
});

test.skipIf(process.getuid?.() === 0)("a_switch_that_cannot_be_remembered_holds_until_the_app_quits_and_says_why", async () => {
  const { streamFailureNotifications, appConfigDirectory } = await notificationsOverFakes();
  await chmod(appConfigDirectory, 0o500);

  const set = await streamFailureNotifications.setNotifyWhenAStreamFails(false);
  await chmod(appConfigDirectory, 0o700);

  expect(!set.ok && set.failure.startsWith("Tatolab couldn't remember this, so it holds only until Tatolab quits: ")).toBe(true);
  expect(streamFailureNotifications.stateNow().enabled).toBe(false);
});
