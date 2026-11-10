import { describe, expect, it } from "vitest";
import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  EMPTY_STUDIO_ACTIVITY_LOG,
  ENDED_STUDIO_ACTIVITIES_KEPT,
  nextStudioActivityLog,
  studioActivityButtonWordsOf,
  studioActivityLogWithTheEndedCleared,
  type StudioActivitySources,
} from "./studio_activity_presentation";

const NIGHT_SHOW_MAIN: ListedStream = {
  stream: "night-show-main-ba4886",
  display_name: "main",
  location: { project_directory: "/Users/jonathanf/Documents/Tato Studio/Night Show", project: "ab4b415c-debc-454f-8514-c9b6993459d7", stream_asset: "666895f1-e258-4587-8c62-ed07c0cc70db" },
  state: "preparing",
  node_count: null,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: "Riioiuiuj7n1z3ghkm7s9n1xi-6",
  step: "making_the_venv",
};
const NIGHT_SHOW_LIGHTS: ListedStream = { ...NIGHT_SHOW_MAIN, stream: "night-show-lights-91be20", display_name: "lights" };
const LOBBY_MAIN: ListedStream = {
  ...NIGHT_SHOW_MAIN,
  stream: "lobby-main-0c1f77",
  location: { project_directory: "/Users/jonathanf/streams/lobby/", project: "f9b6ea1b-77f8-4c8b-9f4f-8c2b0e3c6a10", stream_asset: "5a1bfe8f-0f37-4d2d-a6a4-26c4f0a5f6e3" },
};
const UV_REFUSAL = "`uv sync` failed for /Users/jonathanf/Documents/Tato Studio/Night Show/.venv: it exited with exit status: 1.";

const NOTHING_UNDER_WAY: StudioActivitySources = { listedStreams: [], appUpdate: { kind: "up_to_date" } };

describe("the studio's Activity panel", () => {
  it("lists one Python packages install per project the runtime makes an environment for, with no known share, and the app update's download by its percent", () => {
    const log = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, {
      listedStreams: [NIGHT_SHOW_MAIN, NIGHT_SHOW_LIGHTS, LOBBY_MAIN, { ...NIGHT_SHOW_MAIN, stream: "pattern-main-1", location: null }],
      appUpdate: { kind: "downloading", version: "0.68.69", percent: 41.6 },
    });
    expect(log.in_progress).toEqual([
      {
        activity_id: "python_packages:/Users/jonathanf/Documents/Tato Studio/Night Show",
        title: "Night Show's Python packages",
        kind: "in_progress",
        detail: "Downloading and installing…",
        progress: { kind: "share_unknown" },
      },
      { activity_id: "python_packages:/Users/jonathanf/streams/lobby/", title: "lobby's Python packages", kind: "in_progress", detail: "Downloading and installing…", progress: { kind: "share_unknown" } },
      { activity_id: "app_update:0.68.69", title: "Tato Studio 0.68.69", kind: "in_progress", detail: "Downloading · 42%", progress: { kind: "share_known", percent: 41.6 } },
    ]);
    expect(log.ended).toEqual([]);
  });

  it("leaves out a stream on any other step", () => {
    expect(nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, step: "starting" }] })).toBe(EMPTY_STUDIO_ACTIVITY_LOG);
  });

  it("ends an install as installed once its project's streams move on, or failed in the runtime's words when one fails, newest first", () => {
    const installing = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN, LOBBY_MAIN] });
    const lobbyDone = nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN, { ...LOBBY_MAIN, step: "starting" }] });
    expect(lobbyDone.ended).toEqual([{ activity_id: "python_packages:/Users/jonathanf/streams/lobby/", title: "lobby's Python packages", kind: "done", detail: "Installed" }]);
    const nightShowFailed = nextStudioActivityLog(lobbyDone, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, state: "failed", action: null, step: null, failed_because: UV_REFUSAL }] });
    expect(nightShowFailed.in_progress).toEqual([]);
    expect(nightShowFailed.ended.map((activity) => activity.kind)).toEqual(["failed", "done"]);
    expect(nightShowFailed.ended[0]).toEqual({ activity_id: "python_packages:/Users/jonathanf/Documents/Tato Studio/Night Show", title: "Night Show's Python packages", kind: "failed", refusal: UV_REFUSAL });
  });

  it("ends the app update's download as ready to restart, or failed in the updater's words", () => {
    const downloading = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, { ...NOTHING_UNDER_WAY, appUpdate: { kind: "downloading", version: "0.68.69", percent: 90 } });
    expect(nextStudioActivityLog(downloading, { ...NOTHING_UNDER_WAY, appUpdate: { kind: "ready_to_restart", version: "0.68.69" } }).ended).toEqual([
      { activity_id: "app_update:0.68.69", title: "Tato Studio 0.68.69", kind: "done", detail: "Downloaded · ready to restart" },
    ]);
    expect(nextStudioActivityLog(downloading, { ...NOTHING_UNDER_WAY, appUpdate: { kind: "failed", refusal: "net::ERR_INTERNET_DISCONNECTED" } }).ended).toEqual([
      { activity_id: "app_update:0.68.69", title: "Tato Studio 0.68.69", kind: "failed", refusal: "net::ERR_INTERNET_DISCONNECTED" },
    ]);
  });

  it("answers the same log while nothing changes, keeps only the newest ended activities, and clears the ended ones", () => {
    const installing = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN] });
    expect(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN] })).toBe(installing);
    let log = EMPTY_STUDIO_ACTIVITY_LOG;
    for (let downloadNumber = 0; downloadNumber < ENDED_STUDIO_ACTIVITIES_KEPT + 3; downloadNumber += 1) {
      log = nextStudioActivityLog(log, { ...NOTHING_UNDER_WAY, appUpdate: { kind: "downloading", version: `0.68.${downloadNumber}`, percent: 50 } });
    }
    log = nextStudioActivityLog(log, NOTHING_UNDER_WAY);
    expect(log.ended).toHaveLength(ENDED_STUDIO_ACTIVITIES_KEPT);
    expect(log.ended[0]?.title).toBe(`Tato Studio 0.68.${ENDED_STUDIO_ACTIVITIES_KEPT + 2}`);
    expect(studioActivityLogWithTheEndedCleared(log)).toEqual(EMPTY_STUDIO_ACTIVITY_LOG);
  });

  it("words the status bar's button by what is under way, then by how many failed, and shows none for an empty log", () => {
    const installing = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN] });
    expect(studioActivityButtonWordsOf(installing)).toBe("Night Show's Python packages · Downloading and installing…");
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { listedStreams: [NIGHT_SHOW_MAIN, LOBBY_MAIN], appUpdate: { kind: "up_to_date" } }))).toBe("2 downloads and installs…");
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, step: "starting" }] }))).toBe("Activity");
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, state: "failed", step: null, failed_because: UV_REFUSAL }] }))).toBe(
      "Activity · 1 failed",
    );
    expect(studioActivityButtonWordsOf(EMPTY_STUDIO_ACTIVITY_LOG)).toBeNull();
  });
});
