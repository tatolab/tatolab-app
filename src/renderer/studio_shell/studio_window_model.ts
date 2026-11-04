// What the studio window holds between renders: the open workspace and the runtime's streams it
// serves its views, the selection, the open stream tabs, and the open workspace's layouts.

import type { OpenWorkspaceReading, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import type { SettingsSection } from "../presentation/settings_presentation";
import { WatchedStudioValue, type InWindowStudioViewHostSources } from "../view_host/in_window_view_host";
import type { JsonValue, ListedStreamsReading, StreamTabAddress, StudioSelection } from "../view_host/studio_view_contract";
import { layoutWithAreaSettings, layoutWithAreaShowing, layoutWithSplitSizes, type StudioAreaLayoutNode } from "./studio_area_layout";
import type { WorkspaceLayoutName, WorkspaceLayoutsKeptInStorage, WorkspaceLayoutsOfAFolder } from "./workspace_layouts";

/** The streams the runtime lists in `status`, or why it lists none now. */
export function listedStreamsReadingOf(status: TatolabStatus): ListedStreamsReading {
  const runtimeStatus = presentRuntimeStatus(status);
  if (runtimeStatus.displayState === "running" && status.streams !== null) return { kind: "listed", streams: status.streams };
  return { kind: "not_listed", because: runtimeStatus.banner?.title ?? runtimeStatus.shortLabel };
}

/** The open stream tabs, in the strip's order, and the one shown. */
export interface OpenStreamTabs {
  tabs: StreamTabAddress[];
  active_stream: string | null;
}

/** The open workspace's folder, when one is read or unreadable; `null` while none is open. */
function openWorkspaceFolderOf(reading: OpenWorkspaceReading): string | null {
  switch (reading.kind) {
    case "none_open":
      return null;
    case "unreadable":
      return reading.folder;
    case "read":
      return reading.workspace.workspace_project.folder;
  }
}

/** The studio window's state, each part watched by the shell and served to the views through the in-window host. */
export class StudioWindowModel {
  readonly openWorkspace = new WatchedStudioValue<OpenWorkspaceReading>({ kind: "none_open" });
  readonly listedStreams = new WatchedStudioValue<ListedStreamsReading>({ kind: "not_listed", because: "" });
  readonly selection = new WatchedStudioValue<StudioSelection>({ kind: "nothing" });
  readonly openStreamTabs = new WatchedStudioValue<OpenStreamTabs>({ tabs: [], active_stream: null });
  readonly activeStreamTab = new WatchedStudioValue<StreamTabAddress | null>(null);
  /** The section Preferences shows while it is open; `null` while it is closed. */
  readonly preferencesSection = new WatchedStudioValue<SettingsSection | null>(null);
  /** Why the last workspace asked for did not open, until it is dismissed or another opens. */
  readonly workspaceOpeningRefusal = new WatchedStudioValue<string | null>(null);
  /** The open workspace's layouts; `null` while none is open. */
  readonly workspaceLayouts = new WatchedStudioValue<WorkspaceLayoutsOfAFolder | null>(null);

  constructor(private readonly layoutsKept: WorkspaceLayoutsKeptInStorage) {}

  /** What the views are served from this model. */
  viewHostSources(): InWindowStudioViewHostSources {
    return {
      openWorkspace: this.openWorkspace,
      listedStreams: this.listedStreams,
      selection: this.selection,
      activeStreamTab: this.activeStreamTab,
      openStreamTab: (streamTab) => this.openStreamTab(streamTab),
    };
  }

  /** Show `reading`; a workspace in another folder brings its own layouts and starts with no tabs and nothing selected. */
  showOpenWorkspace(reading: OpenWorkspaceReading): void {
    const folderBefore = openWorkspaceFolderOf(this.openWorkspace.readLatest());
    const folderNow = openWorkspaceFolderOf(reading);
    this.openWorkspace.publish(reading);
    if (folderNow === folderBefore && this.workspaceLayouts.readLatest() !== null) return;
    this.selection.publish({ kind: "nothing" });
    this.publishStreamTabs({ tabs: [], active_stream: null });
    this.workspaceLayouts.publish(folderNow === null ? null : this.layoutsKept.readLayoutsOf(folderNow));
  }

  /** Show the streams `status` lists; a tab whose stream the runtime no longer lists stays open on its last address. */
  showStatus(status: TatolabStatus): void {
    this.listedStreams.publish(listedStreamsReadingOf(status));
  }

  /** Open `streamTab`, or show it where it is already open. */
  openStreamTab(streamTab: StreamTabAddress): void {
    const { tabs } = this.openStreamTabs.readLatest();
    const isOpen = tabs.some((tab) => tab.stream === streamTab.stream);
    this.publishStreamTabs({ tabs: isOpen ? tabs : [...tabs, streamTab], active_stream: streamTab.stream });
  }

  /** Open the tab of `streamId` as the runtime lists it, named by its project in the open workspace or by its project's folder; as asked from the tray. */
  openStreamTabOfAListedStream(streamId: string): void {
    const listedStreams = this.listedStreams.readLatest();
    const listedStream = listedStreams.kind === "listed" ? listedStreams.streams.find((stream) => stream.stream === streamId) : undefined;
    const projectFolder = listedStream?.location?.project_directory ?? null;
    this.openStreamTab({
      stream: streamId,
      project_name: projectFolder === null ? "" : (this.projectNameOfTheFolder(projectFolder) ?? projectFolder.split(/[\\/]/).filter((pathPart) => pathPart !== "").at(-1) ?? projectFolder),
      display_name: listedStream?.display_name ?? streamId,
    });
  }

  /** Show the tab open on `stream`. */
  chooseStreamTab(stream: string): void {
    this.publishStreamTabs({ ...this.openStreamTabs.readLatest(), active_stream: stream });
  }

  /** Close the tab open on `stream`; closing the shown one shows the tab after it, or before it when it was last. */
  closeStreamTab(stream: string): void {
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const closedIndex = tabs.findIndex((tab) => tab.stream === stream);
    if (closedIndex === -1) return;
    const tabsLeft = tabs.filter((tab) => tab.stream !== stream);
    const nextActive = active_stream !== stream ? active_stream : (tabsLeft[Math.min(closedIndex, tabsLeft.length - 1)]?.stream ?? null);
    this.publishStreamTabs({ tabs: tabsLeft, active_stream: nextActive });
  }

  /** Show `layoutName`, as it was last left in this workspace. */
  chooseLayout(layoutName: WorkspaceLayoutName): void {
    this.changeLayouts((layouts) => ({ ...layouts, chosen_layout: layoutName }));
  }

  /** Show `viewTypeId` in area `areaId` of the chosen layout. */
  showViewTypeInArea(areaId: string, viewTypeId: string): void {
    this.changeChosenLayoutTree((tree) => layoutWithAreaShowing(tree, areaId, viewTypeId));
  }

  /** Keep `settings` with area `areaId` of the chosen layout. */
  keepAreaSettings(areaId: string, settings: JsonValue): void {
    this.changeChosenLayoutTree((tree) => layoutWithAreaSettings(tree, areaId, settings));
  }

  /** Keep the sizes a drag left split `splitId` of the chosen layout at. */
  keepSplitSizes(splitId: string, sizePercentByPartId: Readonly<Record<string, number>>): void {
    this.changeChosenLayoutTree((tree) => layoutWithSplitSizes(tree, splitId, sizePercentByPartId));
  }

  private projectNameOfTheFolder(projectFolder: string): string | null {
    const reading = this.openWorkspace.readLatest();
    if (reading.kind !== "read") return null;
    if (reading.workspace.workspace_project.folder === projectFolder) return reading.workspace.workspace_project.name;
    for (const importedProject of reading.workspace.imports) {
      if (importedProject.source.kind === "folder" && importedProject.source.project.folder === projectFolder) return importedProject.name;
    }
    return null;
  }

  private publishStreamTabs(openStreamTabs: OpenStreamTabs): void {
    this.openStreamTabs.publish(openStreamTabs);
    this.activeStreamTab.publish(openStreamTabs.tabs.find((tab) => tab.stream === openStreamTabs.active_stream) ?? null);
  }

  private changeChosenLayoutTree(change: (tree: StudioAreaLayoutNode) => StudioAreaLayoutNode): void {
    this.changeLayouts((layouts) => ({ ...layouts, layouts: { ...layouts.layouts, [layouts.chosen_layout]: change(layouts.layouts[layouts.chosen_layout]) } }));
  }

  private changeLayouts(change: (layouts: WorkspaceLayoutsOfAFolder) => WorkspaceLayoutsOfAFolder): void {
    const layouts = this.workspaceLayouts.readLatest();
    const folder = openWorkspaceFolderOf(this.openWorkspace.readLatest());
    if (layouts === null || folder === null) return;
    const changedLayouts = change(layouts);
    this.workspaceLayouts.publish(changedLayouts);
    this.layoutsKept.keepLayoutsOf(folder, changedLayouts);
  }
}
