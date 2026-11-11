import { describe, expect, it } from "vitest";
import type { ListedStream, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { StudioLayoutsKeptInStorage } from "./studio_layouts";
import { StudioWindowModel } from "./studio_window_model";

const SHEET_CHECK_FOLDER = "/Users/someone/Documents/Tato Studio/Sheet Check";
const LOBBY_FOLDER = "/Users/someone/Documents/Tato Studio/Lobby";

function listedStream(stream: string, projectDirectory: string, streamName: string, state: string, displayName = "Sheet Check"): ListedStream {
  return {
    stream,
    display_name: displayName,
    location: { project_directory: projectDirectory, project: `project-of-${projectDirectory}`, stream_asset: `stream-asset-${streamName}` },
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
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    app_update: { kind: "not_checked" },
    app_update_announcement: null,
    local_api_socket: "/tmp/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "not_offered", reason: "a test" },
    command_line_tool_version: { kind: "not_offered", reason: "a test" },
  };
}

function studioWindowModelOpenOnSheetCheck(): StudioWindowModel {
  const studioWindowModel = new StudioWindowModel(new StudioLayoutsKeptInStorage(null));
  studioWindowModel.showOpenProject({
    kind: "read",
    open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null },
  });
  return studioWindowModel;
}

const MAIN_RUNNING = listedStream("sheet-check-main-14aec5", SHEET_CHECK_FOLDER, "main", "running");
const PREVIEW_RUNNING = listedStream("sheet-check-preview-0b19d2", SHEET_CHECK_FOLDER, "preview", "running", "preview");
const PREVIEW_FAILED = listedStream("sheet-check-preview-0b19d2", SHEET_CHECK_FOLDER, "preview", "failed", "preview");

describe("the streams the studio reads from a status", () => {
  it("are why listing them failed, in the failure's own words, while the runtime runs", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    const because = "the runtime's list_streams result could not be read: missing field `stream_asset`";
    studioWindowModel.showStatus({ ...runningRuntimeListing([]), streams: null, streams_not_listed_because: because });
    expect(studioWindowModel.listedStreams.readLatest()).toEqual({ kind: "listing_failed", because });
  });
});

describe("the stream tab a new project opens on", () => {
  it("opens once the runtime lists the project's stream", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([]));
    studioWindowModel.openTheNewProjectsStream(SHEET_CHECK_FOLDER, "sheet-check-main-14aec5");
    expect(studioWindowModel.activeStreamTab.readLatest()?.stream).toBe("sheet-check-main-14aec5");

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [{ stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" }],
      active_stream: "sheet-check-main-14aec5",
    });
  });
});

describe("a stream tab on a stream the runtime no longer lists", () => {
  it("stays open on its last address", () => {
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
    studioWindowModel.showStatus(runningRuntimeListing([{ ...PREVIEW_FAILED, state: "preparing", failed_because: null }]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();

    studioWindowModel.showStatus(runningRuntimeListing([PREVIEW_FAILED]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toEqual({
      stream: "sheet-check-preview-0b19d2",
      display_name: "preview",
      failed_because: PREVIEW_FAILED.failed_because,
    });

    studioWindowModel.openProjectStreamFailureRaised.publish(null);
    studioWindowModel.showStatus(runningRuntimeListing([PREVIEW_FAILED, MAIN_RUNNING]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();

    const reopened = new StudioWindowModel(new StudioLayoutsKeptInStorage(null));
    reopened.showStatus(runningRuntimeListing([PREVIEW_FAILED]));
    reopened.showOpenProject({ kind: "read", open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null } });
    expect(reopened.openProjectStreamFailureRaised.readLatest()?.stream).toBe("sheet-check-preview-0b19d2");
  });

  it("is raised again when the stream fails anew, and taken down once it leaves failed", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([PREVIEW_FAILED]));
    studioWindowModel.openProjectStreamFailureRaised.publish(null);

    studioWindowModel.showStatus(runningRuntimeListing([{ ...PREVIEW_FAILED, failed_because: "a second sync failed" }]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()?.failed_because).toBe("a second sync failed");

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();
  });

  it("is never raised for a stream of another project", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([listedStream("lobby-main-ab12cd", LOBBY_FOLDER, "main", "failed", "Lobby")]));
    expect(studioWindowModel.openProjectStreamFailureRaised.readLatest()).toBeNull();
  });
});
