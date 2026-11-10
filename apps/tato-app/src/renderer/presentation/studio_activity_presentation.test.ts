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

const NOTHING_UNDER_WAY: StudioActivitySources = { listedStreams: [], projectVenvSyncsUnderWay: [], appUpdate: { kind: "up_to_date" } };

describe("the studio's Activity panel", () => {
  it("lists one Python packages install per project the runtime makes an environment for, with no known share, and the app update's download by its percent", () => {
    const log = nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, {
      ...NOTHING_UNDER_WAY,
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
        package_lines: [],
      },
      {
        activity_id: "python_packages:/Users/jonathanf/streams/lobby/",
        title: "lobby's Python packages",
        kind: "in_progress",
        detail: "Downloading and installing…",
        progress: { kind: "share_unknown" },
        package_lines: [],
      },
      { activity_id: "app_update:0.68.69", title: "Tato Studio 0.68.69", kind: "in_progress", detail: "Downloading · 42%", progress: { kind: "share_known", percent: 41.6 }, package_lines: [] },
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
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [NIGHT_SHOW_MAIN, LOBBY_MAIN] }))).toBe("2 downloads and installs…");
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, step: "starting" }] }))).toBe("Activity");
    expect(studioActivityButtonWordsOf(nextStudioActivityLog(installing, { ...NOTHING_UNDER_WAY, listedStreams: [{ ...NIGHT_SHOW_MAIN, state: "failed", step: null, failed_because: UV_REFUSAL }] }))).toBe(
      "Activity · 1 failed",
    );
    expect(studioActivityButtonWordsOf(EMPTY_STUDIO_ACTIVITY_LOG)).toBeNull();
  });

  it("follows a project's sync phase by phase: resolving with no known share, downloading by the share of sized bytes uv has finished, then installing and installed, naming each package", () => {
    const syncOfNightShow = (venv_sync: StudioActivitySources["projectVenvSyncsUnderWay"][number]["venv_sync"]): StudioActivitySources => ({
      ...NOTHING_UNDER_WAY,
      listedStreams: [NIGHT_SHOW_MAIN],
      projectVenvSyncsUnderWay: [{ action: "Riioiuiuj7n1z3ghkm7s9n1xi-6", project_directory: "/Users/jonathanf/Documents/Tato Studio/Night Show", venv_sync }],
    });
    const resolving = nextStudioActivityLog(
      EMPTY_STUDIO_ACTIVITY_LOG,
      syncOfNightShow({ phase: "resolving", packages_resolved: null, packages_prepared: null, packages_installed: null, downloads_started: 0, downloads_done: 0, packages: [] }),
    );
    expect(resolving.in_progress[0]).toMatchObject({ detail: "Resolving packages…", progress: { kind: "share_unknown" }, package_lines: [] });

    const downloading = nextStudioActivityLog(
      resolving,
      syncOfNightShow({
        phase: "downloading",
        packages_resolved: 8,
        packages_prepared: null,
        packages_installed: null,
        downloads_started: 3,
        downloads_done: 1,
        packages: [
          { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 16_000_000 },
          { name: "pillow", version: null, kind: "distribution", state: "downloading", download_size_bytes: 4_000_000 },
          { name: "cpython-3.12.12-macos-aarch64-none", version: null, kind: "python_interpreter", state: "downloading", download_size_bytes: null },
        ],
      }),
    );
    expect(downloading.in_progress[0]).toMatchObject({
      detail: "Downloading 1 of 3 · 16.0 MB of 20.0 MB",
      progress: { kind: "share_known", percent: 80 },
      package_lines: [
        { name: "numpy", detail: "Downloaded · 16.0 MB" },
        { name: "pillow", detail: "Downloading · 4.0 MB" },
        { name: "Python (cpython-3.12.12-macos-aarch64-none)", detail: "Downloading" },
      ],
    });

    const installing = nextStudioActivityLog(
      downloading,
      syncOfNightShow({ phase: "installing", packages_resolved: 8, packages_prepared: 8, packages_installed: null, downloads_started: 3, downloads_done: 3, packages: [] }),
    );
    expect(installing.in_progress[0]).toMatchObject({ detail: "Installing 8 packages…", progress: { kind: "share_unknown" } });

    const installed = nextStudioActivityLog(
      installing,
      syncOfNightShow({
        phase: "installed",
        packages_resolved: 8,
        packages_prepared: 8,
        packages_installed: 1,
        downloads_started: 3,
        downloads_done: 3,
        packages: [{ name: "numpy", version: "2.3.4", kind: "distribution", state: "installed", download_size_bytes: 16_000_000 }],
      }),
    );
    expect(installed.in_progress[0]).toMatchObject({
      detail: "Installed 1 package",
      progress: { kind: "share_known", percent: 100 },
      package_lines: [{ name: "numpy", detail: "2.3.4 · Installed · 16.0 MB" }],
    });
  });

  it("says downloading with no known share while no download uv names has a size, and a phase newer than this app as downloading and installing", () => {
    const syncOf = (phase: string): StudioActivitySources => ({
      ...NOTHING_UNDER_WAY,
      listedStreams: [NIGHT_SHOW_MAIN],
      projectVenvSyncsUnderWay: [
        {
          action: "Riioiuiuj7n1z3ghkm7s9n1xi-6",
          project_directory: "/Users/jonathanf/Documents/Tato Studio/Night Show",
          venv_sync: { phase, packages_resolved: 2, packages_prepared: null, packages_installed: null, downloads_started: 0, downloads_done: 0, packages: [] },
        },
      ],
    });
    expect(nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, syncOf("downloading")).in_progress[0]).toMatchObject({ detail: "Downloading…", progress: { kind: "share_unknown" } });
    expect(nextStudioActivityLog(EMPTY_STUDIO_ACTIVITY_LOG, syncOf("verifying")).in_progress[0]).toMatchObject({ detail: "Downloading and installing…", progress: { kind: "share_unknown" } });
  });
});
