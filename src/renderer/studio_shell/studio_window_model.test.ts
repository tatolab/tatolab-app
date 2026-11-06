import { describe, expect, it } from "vitest";
import type { ListedStream, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { StudioLayoutsKeptInStorage } from "./studio_layouts";
import { StudioWindowModel } from "./studio_window_model";

const SHEET_CHECK_FOLDER = "/Users/someone/Documents/Tato Studio/Sheet Check";
const LOBBY_FOLDER = "/Users/someone/Documents/Tato Studio/Lobby";

function listedStream(stream: string, projectDirectory: string, streamFunction: string, state: string, displayName = "Sheet Check"): ListedStream {
  return {
    stream,
    display_name: displayName,
    location: { project_directory: projectDirectory, stream_function: streamFunction },
    state,
    node_count: state === "running" ? 4 : null,
    failed_because: state === "failed" ? "`uv sync` did not make …/Sheet Check/.venv" : null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

function runningRuntimeListing(streams: ListedStream[]): TatolabStatus {
  return {
    app_version: "0.68.27",
    app_build: null,
    platform: "macos",
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: "studio-mac",
    streams,
    command_line_tool_link: { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" },
    app_update: { kind: "not_checked" },
    local_api_socket: "/tmp/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    open_at_login: { kind: "not_offered", reason: "a test" },
    command_line_tool_version: { kind: "not_offered", reason: "a test" },
  };
}

function studioWindowModelOpenOnSheetCheck(): StudioWindowModel {
  const studioWindowModel = new StudioWindowModel(new StudioLayoutsKeptInStorage(null));
  studioWindowModel.showOpenProject({
    kind: "read",
    open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, requirements: [] }, imports: [] },
  });
  return studioWindowModel;
}

const FAILED_FIRST_LOAD = listedStream("sheet-check-ff588e", SHEET_CHECK_FOLDER, "", "failed");
const MAIN_RUNNING = listedStream("sheet-check-main-14aec5", SHEET_CHECK_FOLDER, "stream:main", "running");
const PREVIEW_RUNNING = listedStream("sheet-check-preview-0b19d2", SHEET_CHECK_FOLDER, "stream:preview", "running", "preview");

describe("a stream tab opened on a failed first load", () => {
  it("follows the project's first stream once a load replaces the stream.py record, and selects it in place of the record", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-ff588e");
    studioWindowModel.selection.publish({ kind: "stream", stream: "sheet-check-ff588e", project_folder: SHEET_CHECK_FOLDER });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));

    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [{ stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" }],
      active_stream: "sheet-check-main-14aec5",
    });
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-main-14aec5");
    expect(studioWindowModel.selection.readLatest()).toEqual({ kind: "stream", stream: "sheet-check-main-14aec5", project_folder: SHEET_CHECK_FOLDER });
  });

  it("follows when it was opened from the outliner after the last listing, before any other listing arrived", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD, listedStream("lobby-main-3e01aa", LOBBY_FOLDER, "stream:main", "running", "Lobby")]));
    studioWindowModel.openStreamTab({ stream: "lobby-main-3e01aa", project_name: "lobby", display_name: "Lobby" });
    studioWindowModel.closeStreamTab("sheet-check-ff588e");
    studioWindowModel.openStreamTab({ stream: "sheet-check-ff588e", project_name: "sheet-check", display_name: "Sheet Check" });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, listedStream("lobby-main-3e01aa", LOBBY_FOLDER, "stream:main", "running", "Lobby")]));

    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [
        { stream: "lobby-main-3e01aa", project_name: "lobby", display_name: "Lobby" },
        { stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" },
      ],
      active_stream: "sheet-check-main-14aec5",
    });
  });

  it("closes into the project's stream when that stream's tab is already open, keeping the open tab shown", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    studioWindowModel.openStreamTab({ stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));

    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [{ stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" }],
      active_stream: "sheet-check-main-14aec5",
    });
  });

  it("stays on the record while the runtime lists nothing of its project, and while it lists the record still failed", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));

    studioWindowModel.showStatus(runningRuntimeListing([]));
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-ff588e");

    studioWindowModel.showStatus(runningRuntimeListing([{ ...FAILED_FIRST_LOAD, failed_because: "`uv sync` did not make it again" }]));
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-ff588e");
  });

  it("follows across a listing the runtime could not give, as when it restarted between the loads", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    studioWindowModel.showStatus({ ...runningRuntimeListing([]), runtime_state: "starting", streams: null });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));

    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-main-14aec5");
  });
});

describe("the stream tab a new project opens on", () => {
  it("follows the project's stream.py record when its first load fails, then the project's stream once a load lists it", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([]));
    studioWindowModel.openTheNewProjectsStream(SHEET_CHECK_FOLDER, "sheet-check-main-14aec5");
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-main-14aec5");

    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [{ stream: "sheet-check-ff588e", project_name: "sheet-check", display_name: "Sheet Check" }],
      active_stream: "sheet-check-ff588e",
    });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-main-14aec5");
  });
});

describe("a stream tab on a stream the runtime no longer lists", () => {
  it("stays open on its last address when its stream named a function", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([PREVIEW_RUNNING]));
    studioWindowModel.openStreamTab({ stream: "sheet-check-preview-0b19d2", project_name: "sheet-check", display_name: "preview" });

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));

    expect(studioWindowModel.openStreamTabs.readLatest().tabs.map((tab) => tab.stream)).toEqual(["sheet-check-preview-0b19d2"]);
  });
});

describe("a failure of the open project's streams", () => {
  it("is raised once, in the runtime's words, as the load fails and when the project opens on it already failed", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([{ ...FAILED_FIRST_LOAD, state: "preparing", failed_because: null }]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();

    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toEqual({
      stream: "sheet-check-ff588e",
      display_name: "Sheet Check",
      failed_because: FAILED_FIRST_LOAD.failed_because,
    });

    studioWindowModel.openProjectStreamFailureRaised.publish(null);
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD, MAIN_RUNNING]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();

    const reopened = new StudioWindowModel(new StudioLayoutsKeptInStorage(null));
    reopened.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    reopened.showOpenProject({ kind: "read", open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, requirements: [] }, imports: [] } });
    expect(reopened.openProjectStreamFailureRaised.readLatest()?.stream).toBe("sheet-check-ff588e");
  });

  it("is raised again when the stream fails anew, and taken down once it leaves failed", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([FAILED_FIRST_LOAD]));
    studioWindowModel.openProjectStreamFailureRaised.publish(null);

    studioWindowModel.showStatus(runningRuntimeListing([{ ...FAILED_FIRST_LOAD, failed_because: "a second sync failed" }]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()?.failed_because).toBe("a second sync failed");

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();
  });

  it("is never raised for a stream of another project", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([listedStream("lobby-ab12cd", LOBBY_FOLDER, "", "failed", "Lobby")]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();
  });
});
