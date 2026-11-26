import { describe, expect, it } from "vitest";
import type { ListedStream, ListedStudioView, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { StudioViewTypeRegistry, studioViewTypeTitlesOf } from "../view_host/studio_view_type_registry";
import { tatolabFrameViewType } from "../view_host/tatolab_frame_view_type";
import type { StudioAreaLayoutNode } from "./studio_area_layout";
import { codeStudioLayout, StudioLayoutKeptInStorage } from "./studio_layout";
import { StudioWindowModel, type StudioViewTypeTitles } from "./studio_window_model";

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
    capture_devices_whose_access_was_never_asked_for: [], condition: null,
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
    runtime_of_another_age: null,
    machine_name: "studio-mac",
    streams,
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    project_stream_action_failures: [],
    app_update: { kind: "not_checked" },
    app_update_announcement: null,
    local_api_socket: "/tmp/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "not_offered", reason: "a test" },
    command_line_tool_version: { kind: "not_offered", reason: "a test" },
    studio_warnings: [],
  };
}

function studioWindowModelOpenOnSheetCheck(): StudioWindowModel {
  const studioWindowModel = new StudioWindowModel(new StudioLayoutKeptInStorage(null));
  studioWindowModel.showOpenProject({
    kind: "read",
    open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null },
  });
  return studioWindowModel;
}

function areaViewTypesOf(layout: StudioAreaLayoutNode): (string | null)[] {
  return layout.kind === "area" ? [layout.view_type_id] : layout.parts.flatMap(({ part }) => areaViewTypesOf(part));
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

  it("names a runtime of another age that refuses the listing by its notice, not by the refusal", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus({
      ...runningRuntimeListing([]),
      streams: null,
      streams_not_listed_because: "this client is older than the runtime: …",
      runtime_of_another_age: { older_side: "studio", runtime_version: "0.80.0", runtime_contract: { version: 4, revision: 0 }, studio_contract: { version: 3, revision: 1 }, remedy: "update_studio" },
    });
    expect(studioWindowModel.listedStreams.readLatest()).toEqual({ kind: "not_listed", because: "This Studio is older than the runtime" });
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

describe("selecting a stream or one of its nodes", () => {
  it("opens the stream's tab, or shows it where it is open, tells nothing anew for the stream already shown, and leaves the tabs alone for a project or nothing", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.select({ kind: "stream", stream: "sheet-check-preview-0b19d2", project_folder: SHEET_CHECK_FOLDER });
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [
        { stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" },
        { stream: "sheet-check-preview-0b19d2", project_name: "sheet-check", display_name: "preview" },
      ],
      active_stream: "sheet-check-preview-0b19d2",
    });

    studioWindowModel.select({ kind: "node", stream: "sheet-check-main-14aec5", node: "camera" });
    expect(studioWindowModel.openStreamTabs.readLatest().active_stream).toBe("sheet-check-main-14aec5");
    expect(studioWindowModel.openStreamTabs.readLatest().tabs).toHaveLength(2);
    expect(studioWindowModel.selection.readLatest()).toEqual({ kind: "node", stream: "sheet-check-main-14aec5", node: "camera" });

    const activeTabsTold: (string | undefined)[] = [];
    studioWindowModel.activeStreamTab.watch((streamTab) => activeTabsTold.push(streamTab?.stream));
    studioWindowModel.select({ kind: "node", stream: "sheet-check-main-14aec5", node: "preview_window" });
    expect(activeTabsTold).toEqual(["sheet-check-main-14aec5"]);

    studioWindowModel.select({ kind: "project", project_name: "sheet-check", project_folder: SHEET_CHECK_FOLDER });
    studioWindowModel.select({ kind: "nothing" });
    expect(studioWindowModel.openStreamTabs.readLatest().active_stream).toBe("sheet-check-main-14aec5");
  });

  it("moves no tab in a popped-out view's window, which stays on the stream it popped out with", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.showAsPoppedOutView({ view_type_id: "viewer", window_title: "main · Viewer", pinned_to: { stream_tab: null, selection: { kind: "nothing" }, settings: null } });
    const tabsBefore = studioWindowModel.openStreamTabs.readLatest();
    studioWindowModel.select({ kind: "stream", stream: "sheet-check-preview-0b19d2", project_folder: SHEET_CHECK_FOLDER });
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual(tabsBefore);
    expect(studioWindowModel.selection.readLatest().kind).toBe("stream");
  });
});

describe("the Stream menu's tab commands", () => {
  const PREVIEW_TAB = { stream: "sheet-check-preview-0b19d2", project_name: "sheet-check", display_name: "preview" };
  const MAIN_TAB = { stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" };

  it("move to the next and the previous tab, round from the last to the first", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.openStreamTab(PREVIEW_TAB);

    studioWindowModel.showTheStreamTabBeside("next");
    expect(studioWindowModel.openStreamTabs.readLatest().active_stream).toBe(MAIN_TAB.stream);
    studioWindowModel.showTheStreamTabBeside("previous");
    expect(studioWindowModel.openStreamTabs.readLatest().active_stream).toBe(PREVIEW_TAB.stream);
    studioWindowModel.showTheStreamTabBeside("previous");
    expect(studioWindowModel.openStreamTabs.readLatest().active_stream).toBe(MAIN_TAB.stream);
  });

  it("reopen the tabs closed, the last closed first, where they were", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.openStreamTab(PREVIEW_TAB);
    studioWindowModel.closeStreamTab(MAIN_TAB.stream);
    studioWindowModel.closeStreamTab(PREVIEW_TAB.stream);
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({ tabs: [], active_stream: null });

    studioWindowModel.reopenTheLastClosedStreamTab();
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({ tabs: [PREVIEW_TAB], active_stream: PREVIEW_TAB.stream });
    studioWindowModel.reopenTheLastClosedStreamTab();
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({ tabs: [PREVIEW_TAB, MAIN_TAB], active_stream: MAIN_TAB.stream });
    expect(studioWindowModel.closedStreamTabs.readLatest()).toEqual([]);
  });

  it("forget a closed tab once its stream's tab opens again another way", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.openStreamTab(PREVIEW_TAB);
    studioWindowModel.closeStreamTab(PREVIEW_TAB.stream);

    studioWindowModel.openStreamTab(PREVIEW_TAB);

    expect(studioWindowModel.closedStreamTabs.readLatest()).toEqual([]);
  });

  it("never reopen the tab of a deleted stream", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    studioWindowModel.openStreamTab(PREVIEW_TAB);
    studioWindowModel.closeStreamTab(PREVIEW_TAB.stream);
    studioWindowModel.openStreamTab(PREVIEW_TAB);

    studioWindowModel.forgetTheTabsOfADeletedStream(PREVIEW_TAB.stream);

    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({ tabs: [MAIN_TAB], active_stream: MAIN_TAB.stream });
    expect(studioWindowModel.closedStreamTabs.readLatest()).toEqual([]);
  });
});

describe("a new stream's tab", () => {
  it("opens once the runtime lists a stream of its stream asset", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING]));
    studioWindowModel.openTheTabOfTheNewStreamAsset(PREVIEW_RUNNING.location?.stream_asset ?? "");
    expect(studioWindowModel.openStreamTabs.readLatest().tabs.map((tab) => tab.stream)).toEqual(["sheet-check-main-14aec5"]);

    studioWindowModel.showStatus(runningRuntimeListing([MAIN_RUNNING, PREVIEW_RUNNING]));
    expect(studioWindowModel.openStreamTabs.readLatest()).toEqual({
      tabs: [
        { stream: "sheet-check-main-14aec5", project_name: "sheet-check", display_name: "Sheet Check" },
        { stream: "sheet-check-preview-0b19d2", project_name: "sheet-check", display_name: "preview" },
      ],
      active_stream: "sheet-check-preview-0b19d2",
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

    const reopened = new StudioWindowModel(new StudioLayoutKeptInStorage(null));
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

describe("a failure of the open project's latest stream action", () => {
  const OPEN_THAT_FAILED = {
    action: "Rvxjb0uiacgp6c3o13o9qvzj1-2",
    project_directory: SHEET_CHECK_FOLDER,
    kind: "open",
    failed_because: "stream sheet-check-main-14aec5 is held by a record an earlier runtime wrote",
  };
  const withTheFailures = (failures: TatolabStatus["project_stream_action_failures"]): TatolabStatus => ({ ...runningRuntimeListing([]), project_stream_action_failures: failures });

  it("is raised in the runtime's words while the status holds it, and taken down once another action of the project begins", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();

    studioWindowModel.showStatus(withTheFailures([OPEN_THAT_FAILED]));
    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()).toEqual(OPEN_THAT_FAILED);

    studioWindowModel.showStatus(withTheFailures([]));
    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()).toBeNull();
  });

  it("is raised when the project's window opens after the action failed, and never for another project", () => {
    const studioWindowModel = new StudioWindowModel(new StudioLayoutKeptInStorage(null));
    studioWindowModel.showStatus(withTheFailures([{ ...OPEN_THAT_FAILED, project_directory: LOBBY_FOLDER }, OPEN_THAT_FAILED]));
    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()).toBeNull();

    studioWindowModel.showOpenProject({
      kind: "read",
      open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null },
    });

    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()?.project_directory).toBe(SHEET_CHECK_FOLDER);
  });

  it("stays down once dismissed, until another action of the project fails", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showStatus(withTheFailures([OPEN_THAT_FAILED]));

    studioWindowModel.dismissTheOpenProjectStreamActionFailure();
    studioWindowModel.showStatus(withTheFailures([OPEN_THAT_FAILED]));
    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()).toBeNull();

    const reloadThatFailed = { ...OPEN_THAT_FAILED, action: "Rvxjb0uiacgp6c3o13o9qvzj1-3", kind: "load" };
    studioWindowModel.showStatus(withTheFailures([reloadThatFailed]));
    expect(studioWindowModel.openProjectStreamActionFailureRaised.readLatest()).toEqual(reloadThatFailed);
  });
});

/** What the window's view types are named by in a studio whose only titled views are Code and the Node visualizer, and whose views never change. */
const STUDIO_VIEW_TYPE_TITLES: StudioViewTypeTitles = {
  viewTitleOf: (viewTypeId) => ({ code: "Code", viewer: "Node visualizer" })[viewTypeId] ?? null,
  viewTypeIdOf: (viewTypeId) => viewTypeId,
  watchChanges: () => () => {},
};

describe("opening a view on a file", () => {
  const nodeFile = { kind: "file" as const, file: `${SHEET_CHECK_FOLDER}/nodes/paint_ball.py`, line: 12 };
  const viewTypesShown = (studioWindowModel: StudioWindowModel) => {
    const studioLayout = studioWindowModel.studioLayout.readLatest();
    return studioLayout === null ? [] : areaViewTypesOf(studioLayout.layout);
  };

  it("switches a layout that shows no Code area to the Code layout Studio ships, and opens Code on the file at its line", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    expect(viewTypesShown(studioWindowModel)).not.toContain("code");
    expect(studioWindowModel.openView("code", nodeFile, STUDIO_VIEW_TYPE_TITLES)).toEqual({ kind: "opened" });
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(codeStudioLayout());
    expect(viewTypesShown(studioWindowModel)).toEqual(["files", "code", "stream_graph", "viewer"]);
    expect(studioWindowModel.viewsOpenedOn.readLatest().code?.on).toEqual(nodeFile);
  });

  it("keeps a layout that shows a Code area as it is", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showViewTypeInArea("properties", "code");
    const layoutShowingCode = studioWindowModel.studioLayout.readLatest()?.layout;
    expect(studioWindowModel.openView("code", nodeFile, STUDIO_VIEW_TYPE_TITLES)).toEqual({ kind: "opened" });
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(layoutShowingCode);
  });

  it("switches a layout whose Code area is hidden at an edge, which shows no Code", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showViewTypeInArea("properties", "code");
    studioWindowModel.toggleTheLayoutsEdge("right");
    expect(studioWindowModel.openView("code", nodeFile, STUDIO_VIEW_TYPE_TITLES)).toEqual({ kind: "opened" });
    expect(studioWindowModel.studioLayout.readLatest()).toMatchObject({ layout: codeStudioLayout(), edges_hidden: { left: false, bottom: false, right: false } });
  });

  it("refuses a view the Code layout shows only to work beside Code, and leaves the layout as it was", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    studioWindowModel.showViewTypeInArea("viewer", "properties");
    const layoutShowingNoViewer = studioWindowModel.studioLayout.readLatest()?.layout;
    expect(studioWindowModel.openView("viewer", { kind: "port", target: { stream: "main", node_id: "glow", port: "video_out" } }, STUDIO_VIEW_TYPE_TITLES)).toEqual({
      kind: "not_opened",
      because: "No area shows Node visualizer. Choose it in an area's view menu, then open it again.",
    });
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(layoutShowingNoViewer);
    expect(studioWindowModel.viewsOpenedOn.readLatest().viewer).toBeUndefined();
  });

  it("refuses a view type no layout Studio ships is home to, naming how to show it", () => {
    const studioWindowModel = studioWindowModelOpenOnSheetCheck();
    expect(studioWindowModel.openView("acme-dj:deck", nodeFile, STUDIO_VIEW_TYPE_TITLES)).toEqual({ kind: "not_opened", because: "No area shows that view. Choose it in an area's view menu, then open it again." });
    expect(studioWindowModel.viewsOpenedOn.readLatest()["acme-dj:deck"]).toBeUndefined();
  });
});

describe("a project's view, found by its project's UUID and folder", () => {
  const CORE_NODES = "ba5fc2b1-df25-4e86-bec3-aba1564d6233";
  const PAINT_PULSE = "4f8a2d61-9c3e-4b75-a0d8-6e1f3b9c2a74";
  const listedView = (viewTypeId: string, project: string, projectName: string, viewFolder: string, title: string): ListedStudioView => ({
    view_type_id: viewTypeId,
    project,
    project_name: projectName,
    view_folder: viewFolder,
    import_folder: null,
    opens: true,
    not_opened_because: null,
    manifest_json: { contract: "1.0", title, entry: "index.html", placement: "node" },
    folder_url: `https://views.example/${viewFolder}/`,
    newer_version_blocked_because: null,
  });
  const registryListing = (...studioViews: ListedStudioView[]) => {
    const registry = new StudioViewTypeRegistry([], (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }));
    registry.projectStudioViews.publish({ kind: "listed", studio_views: studioViews });
    return registry;
  };

  it("opens the Audio Video Preview in the area showing it under whatever type the runtime lists it as, the layout left as it was", () => {
    for (const listedType of ["Core Nodes:audio_video_preview", `${CORE_NODES}:audio_video_preview`, "e7b2c940-1d6a-4f35-8c09-3a5e7f1b2d68"]) {
      const registry = registryListing(listedView(listedType, CORE_NODES, "Core Nodes", "audio_video_preview", "Audio Video Preview"));
      const studioWindowModel = studioWindowModelOpenOnSheetCheck();
      studioWindowModel.showViewTypeInArea("preview", `${CORE_NODES}:audio_video_preview`);
      const layoutShown = studioWindowModel.studioLayout.readLatest()?.layout;

      expect(studioWindowModel.openView(listedType, { kind: "port", target: { stream: "main", node_id: "preview", port: "video_out" } }, studioViewTypeTitlesOf(registry))).toEqual({ kind: "opened" });
      expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(layoutShown);
      expect(Object.keys(studioWindowModel.viewsOpenedOn.readLatest())).toEqual([listedType]);
    }
  });

  it("keeps an area saved under its view's project's name or UUID and folder under the type the runtime lists the view as, a preset too, and keeps it there once a rename leaves the type as it was", () => {
    const stageView = "a4f1d8c2-6e39-4b07-9d5a-2c8e0b7f3a16";
    const storage = new Map<string, string>();
    const layoutKept = new StudioLayoutKeptInStorage({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value) });
    const studioWindowModel = new StudioWindowModel(layoutKept);
    studioWindowModel.showOpenProject({ kind: "read", open_project: { project: { name: "sheet-check", folder: SHEET_CHECK_FOLDER, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null } });
    studioWindowModel.showViewTypeInArea("properties", "Paint Pulse:stage");
    studioWindowModel.showViewTypeInArea("outliner", `${PAINT_PULSE}:stage`);

    const listed = registryListing(listedView(stageView, PAINT_PULSE, "Paint Pulse", "stage", "Stage"));
    studioWindowModel.keepEachAreaUnderTheIdOfItsView((viewTypeId) => listed.viewTypeIdOf(viewTypeId));
    const layoutAfter = studioWindowModel.studioLayout.readLatest()?.layout;
    const areaViewTypesAfter = layoutAfter === undefined ? [] : areaViewTypesOf(layoutAfter);
    expect(areaViewTypesAfter.filter((viewTypeId) => viewTypeId === stageView)).toHaveLength(2);
    expect(areaViewTypesAfter).not.toContain("Paint Pulse:stage");
    expect(areaViewTypesAfter).not.toContain(`${PAINT_PULSE}:stage`);
    expect(layoutKept.readLayoutOf(SHEET_CHECK_FOLDER).layout).toEqual(layoutAfter);

    const presetSavedBefore = { title: "Pulse", layout: { kind: "area" as const, area_id: "stage", view_type_id: "Paint Pulse:stage" } };
    studioWindowModel.studioLayout.publish({ ...(studioWindowModel.studioLayout.readLatest() ?? expect.unreachable("no layout")), presets_saved: [presetSavedBefore] });
    studioWindowModel.keepEachAreaUnderTheIdOfItsView((viewTypeId) => listed.viewTypeIdOf(viewTypeId));
    expect(layoutKept.readLayoutOf(SHEET_CHECK_FOLDER).presets_saved).toEqual([{ title: "Pulse", layout: { kind: "area", area_id: "stage", view_type_id: stageView } }]);
    const layoutKeptOnce = studioWindowModel.studioLayout.readLatest();
    const listedAfterARename = registryListing(listedView(stageView, PAINT_PULSE, "Paint Pulse renamed", "stage renamed", "Stage"));
    studioWindowModel.keepEachAreaUnderTheIdOfItsView((viewTypeId) => listedAfterARename.viewTypeIdOf(viewTypeId));
    expect(studioWindowModel.studioLayout.readLatest()).toBe(layoutKeptOnce);
    expect(listedAfterARename.viewTypeWithId(stageView)?.title).toBe("Stage");
  });
});
