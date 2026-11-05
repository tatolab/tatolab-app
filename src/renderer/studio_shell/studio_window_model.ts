// What the studio window holds between renders: the open project and the runtime's streams it
// serves its views, the selection, the open stream tabs, and the open project's layouts.

import type { NewProjectDefaults, OpenProjectReading, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import type { SettingsSection } from "../presentation/settings_presentation";
import { WatchedStudioValue, type InWindowStudioViewHostSources } from "../view_host/in_window_view_host";
import type { CodeFileAsked, JsonValue, ListedStreamsReading, StreamTabAddress, StudioSelection } from "../view_host/studio_view_contract";
import { layoutShowsTheViewType, layoutWithAreaSettings, layoutWithAreaShowing, layoutWithSplitSizes, type StudioAreaLayoutNode } from "./studio_area_layout";
import type { StudioLayoutName, StudioLayoutsKeptInStorage, StudioLayoutsOfAFolder } from "./studio_layouts";

/** The view type id of the code pane, which Stream › Open stream.py shows a file in. */
export const CODE_VIEW_TYPE_ID = "code";

/** The streams the runtime lists in `status`, or why it lists none now. */
export function listedStreamsReadingOf(status: TatolabStatus): ListedStreamsReading {
  const runtimeStatus = presentRuntimeStatus(status);
  if (runtimeStatus.runtimeState === "running" && status.streams !== null) return { kind: "listed", streams: status.streams };
  return { kind: "not_listed", because: runtimeStatus.banner?.title ?? runtimeStatus.shortLabel };
}

/** The streams of the project in `projectFolder` that Run › Stop stops: each one running or on its way to running. */
export function streamsOfTheProjectToStop(listedStreams: ListedStreamsReading, projectFolder: string): string[] {
  if (listedStreams.kind !== "listed") return [];
  return listedStreams.streams
    .filter((listing) => listing.location?.project_directory === projectFolder && (listing.state === "running" || listing.state === "preparing"))
    .map((listing) => listing.stream);
}

/** The open stream tabs, in the strip's order, and the one shown. */
export interface OpenStreamTabs {
  tabs: StreamTabAddress[];
  active_stream: string | null;
}

/** The open project's folder, when one is read or unreadable; `null` while none is open. */
function openProjectFolderOf(reading: OpenProjectReading): string | null {
  switch (reading.kind) {
    case "none_open":
      return null;
    case "unreadable":
      return reading.folder;
    case "read":
      return reading.open_project.project.folder;
  }
}

/** The studio window's state, each part watched by the shell and served to the views through the in-window host. */
export class StudioWindowModel {
  readonly openProject = new WatchedStudioValue<OpenProjectReading>({ kind: "none_open" });
  readonly listedStreams = new WatchedStudioValue<ListedStreamsReading>({ kind: "not_listed", because: "" });
  readonly selection = new WatchedStudioValue<StudioSelection>({ kind: "nothing" });
  readonly openStreamTabs = new WatchedStudioValue<OpenStreamTabs>({ tabs: [], active_stream: null });
  readonly activeStreamTab = new WatchedStudioValue<StreamTabAddress | null>(null);
  /** Whether the Projects window shows over the open project, as File › Projects shows it; it shows anyway while none is open. */
  readonly isProjectsShown = new WatchedStudioValue<boolean>(false);
  /** The section Preferences shows while it is open; `null` while it is closed. */
  readonly preferencesSection = new WatchedStudioValue<SettingsSection | null>(null);
  /** The name and location the New project sheet opened with while it shows; `null` while it is closed. */
  readonly newProjectSheetOpenedWith = new WatchedStudioValue<NewProjectDefaults | null>(null);
  /** Why the last project asked for did not open, until it is dismissed or another opens. */
  readonly projectOpeningRefusal = new WatchedStudioValue<string | null>(null);
  /** The open project's layouts; `null` while none is open. */
  readonly studioLayouts = new WatchedStudioValue<StudioLayoutsOfAFolder | null>(null);
  /** The file a code view was last asked to show. */
  readonly codeFileAsked = new WatchedStudioValue<CodeFileAsked | null>(null);
  /** Why the last run or stop of the open project was refused, until it is dismissed or another is asked for. */
  readonly projectRunRefusal = new WatchedStudioValue<{ asked_to: "run" | "stop"; because: string } | null>(null);

  constructor(private readonly layoutsKept: StudioLayoutsKeptInStorage) {}

  /** What the views are served from this model. */
  viewHostSources(): InWindowStudioViewHostSources {
    return {
      openProject: this.openProject,
      listedStreams: this.listedStreams,
      selection: this.selection,
      activeStreamTab: this.activeStreamTab,
      openStreamTab: (streamTab) => this.openStreamTab(streamTab),
      codeFileAsked: this.codeFileAsked,
      openCodeFile: (file) => this.openCodeFile(file),
    };
  }

  /** Ask the code view to show `file`; a layout with no code area switches to Code, which has one. */
  openCodeFile(file: string): void {
    const layouts = this.studioLayouts.readLatest();
    if (layouts !== null && !layoutShowsTheViewType(layouts.layouts[layouts.chosen_layout], CODE_VIEW_TYPE_ID)) this.chooseLayout("code");
    this.codeFileAsked.publish({ file, ask: (this.codeFileAsked.readLatest()?.ask ?? 0) + 1 });
  }

  /** Show `reading`; a project in another folder brings its own layouts and starts with no tabs and nothing selected. */
  showOpenProject(reading: OpenProjectReading): void {
    const folderBefore = openProjectFolderOf(this.openProject.readLatest());
    const folderNow = openProjectFolderOf(reading);
    this.openProject.publish(reading);
    if (folderNow === folderBefore && this.studioLayouts.readLatest() !== null) return;
    if (folderNow !== folderBefore) this.isProjectsShown.publish(false);
    this.selection.publish({ kind: "nothing" });
    this.publishStreamTabs({ tabs: [], active_stream: null });
    this.studioLayouts.publish(folderNow === null ? null : this.layoutsKept.readLayoutsOf(folderNow));
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

  /** Open the tab of `streamId` as the runtime lists it, named by its project when that is the open project or one of its imports, or else by its folder; as asked from the tray. */
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

  /** Show `layoutName`, as it was last left in this project. */
  chooseLayout(layoutName: StudioLayoutName): void {
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
    const reading = this.openProject.readLatest();
    if (reading.kind !== "read") return null;
    if (reading.open_project.project.folder === projectFolder) return reading.open_project.project.name;
    for (const importedProject of reading.open_project.imports) {
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

  private changeLayouts(change: (layouts: StudioLayoutsOfAFolder) => StudioLayoutsOfAFolder): void {
    const layouts = this.studioLayouts.readLatest();
    const folder = openProjectFolderOf(this.openProject.readLatest());
    if (layouts === null || folder === null) return;
    const changedLayouts = change(layouts);
    this.studioLayouts.publish(changedLayouts);
    this.layoutsKept.keepLayoutsOf(folder, changedLayouts);
  }
}
