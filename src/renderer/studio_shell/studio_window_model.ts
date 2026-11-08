// What the studio window holds between renders: the open project and the runtime's streams it
// serves its views, the selection, the open stream tabs, and the open project's layouts.

import type { ListedStream, NewProjectDefaults, OpenProjectReading, PoppedOutViewerTarget, TatolabStatus } from "../../shared/tatolab_backend_contract";
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

/** A stream of the open project the runtime lists failed, and why in its own words; `null` when it gives no reason. */
export interface OpenProjectStreamFailure {
  stream: string;
  display_name: string;
  failed_because: string | null;
}

/** The failures `listedStreams` lists for streams of the project in `projectFolder`, each in the runtime's words. */
export function streamFailuresOfTheProject(listedStreams: readonly ListedStream[], projectFolder: string): OpenProjectStreamFailure[] {
  return listedStreams
    .filter((listing) => listing.location?.project_directory === projectFolder && listing.state === "failed")
    .map((listing) => ({ stream: listing.stream, display_name: listing.display_name, failed_because: listing.failed_because }));
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
  /** Why the last update choice from the menus did not reach the app, until it is dismissed or another is made. */
  readonly appUpdateChoiceRefusal = new WatchedStudioValue<string | null>(null);
  /** The open project's stream whose failure the window raises over the studio, until it is dismissed, the stream leaves `failed`, or another project opens. */
  readonly openProjectStreamFailureRaised = new WatchedStudioValue<OpenProjectStreamFailure | null>(null);
  /** The workspace when the window is a studio window's Get more window, as last read from disk; `null` in any other window. */
  readonly getMoreWorkspace = new WatchedStudioValue<OpenProjectReading | null>(null);
  /** What the window is pinned to when it is a Viewer popped out of a studio window; `null` in the Projects and studio windows. */
  readonly poppedOutViewer = new WatchedStudioValue<PoppedOutViewerTarget | null>(null);

  /** The tab a project opens on once it is open and the runtime lists the stream: the stream New project just made, or with `stream` `null` the first the runtime lists from the folder; cleared when any tab is opened. */
  private streamTabAwaitedByTheOpeningProject: { project_folder: string; stream: string | null } | null = null;

  /** Each failure of the open project's streams already raised, as its stream id and its words, so the window raises a failure once until the stream leaves `failed`. */
  private readonly openProjectStreamFailuresRaised = new Set<string>();

  /** The project folder of each open tab's stream, by the tab's stream id, as the runtime last listed it or New project made it, and whether it was the project's `stream.py` record. */
  private readonly projectOfEachTabsStream = new Map<string, { project_folder: string; is_the_stream_py_record: boolean }>();

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

  /** Show the window as a Viewer pinned to `target`: its stream's tab shown and its node selected, which nothing in the window changes after. */
  showAsPoppedOutViewer(target: PoppedOutViewerTarget): void {
    this.poppedOutViewer.publish(target);
    this.openStreamTab({ stream: target.stream, project_name: target.project_name, display_name: target.display_name });
    this.selection.publish(target.node === null ? { kind: "nothing" } : { kind: "node", stream: target.stream, node: target.node });
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
    if (folderNow !== folderBefore) {
      this.openProjectStreamFailuresRaised.clear();
      this.openProjectStreamFailureRaised.publish(null);
    }
    this.selection.publish({ kind: "nothing" });
    this.publishStreamTabs({ tabs: [], active_stream: null });
    this.studioLayouts.publish(folderNow === null ? null : this.layoutsKept.readLayoutsOf(folderNow));
    if (folderNow !== null && this.streamTabAwaitedByTheOpeningProject?.project_folder !== folderNow) {
      this.streamTabAwaitedByTheOpeningProject = { project_folder: folderNow, stream: null };
    }
    this.openTheStreamTabTheOpeningProjectAwaits();
    const listedStreams = this.listedStreams.readLatest();
    if (listedStreams.kind === "listed") this.raiseEachNewFailureOfTheOpenProjectsStreams(listedStreams.streams);
  }

  /** Open the tab of `stream`, the stream of the project New project just made in `projectFolder`, as that project opens, or now when it is already open. */
  openTheNewProjectsStream(projectFolder: string, stream: string): void {
    this.streamTabAwaitedByTheOpeningProject = { project_folder: projectFolder, stream };
    this.openTheStreamTabTheOpeningProjectAwaits();
  }

  /**
   * Show the streams `status` lists. A tab follows its project's `stream.py` record or, from the record, the project's first
   * stream when a load lists one in place of the other; any other tab whose stream the runtime no longer lists stays open on
   * its last address, and a tab named by its stream's id until the runtime listed it takes the name the runtime lists it under.
   */
  showStatus(status: TatolabStatus): void {
    const listedStreams = listedStreamsReadingOf(status);
    this.listedStreams.publish(listedStreams);
    if (listedStreams.kind !== "listed") return;
    this.openTheStreamTabTheOpeningProjectAwaits();
    this.raiseEachNewFailureOfTheOpenProjectsStreams(listedStreams.streams);
    this.rememberTheProjectOfEachTabsStream(listedStreams.streams);
    this.followEachTabWhoseStreamALoadReplaced(listedStreams.streams);
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const displayNameListedFor = (tab: StreamTabAddress) => listedStreams.streams.find((listing) => listing.stream === tab.stream)?.display_name ?? tab.display_name;
    if (tabs.every((tab) => tab.display_name !== tab.stream || displayNameListedFor(tab) === tab.display_name)) return;
    this.publishStreamTabs({ tabs: tabs.map((tab) => (tab.display_name === tab.stream ? { ...tab, display_name: displayNameListedFor(tab) } : tab)), active_stream });
  }

  /** Open `streamTab`, or show it where it is already open. */
  openStreamTab(streamTab: StreamTabAddress): void {
    this.streamTabAwaitedByTheOpeningProject = null;
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

  private raiseEachNewFailureOfTheOpenProjectsStreams(listedStreams: readonly ListedStream[]): void {
    const projectFolder = openProjectFolderOf(this.openProject.readLatest());
    const failures = projectFolder === null ? [] : streamFailuresOfTheProject(listedStreams, projectFolder);
    const failureKey = (failure: OpenProjectStreamFailure) => `${failure.stream}\n${failure.failed_because ?? ""}`;
    const failureKeysListed = new Set(failures.map(failureKey));
    for (const raisedKey of this.openProjectStreamFailuresRaised) if (!failureKeysListed.has(raisedKey)) this.openProjectStreamFailuresRaised.delete(raisedKey);
    const failuresNotRaisedYet = failures.filter((failure) => !this.openProjectStreamFailuresRaised.has(failureKey(failure)));
    for (const failure of failuresNotRaisedYet) this.openProjectStreamFailuresRaised.add(failureKey(failure));
    const failureShown = this.openProjectStreamFailureRaised.readLatest();
    const failureToShow = failuresNotRaisedYet.at(-1) ?? (failureShown !== null && failureKeysListed.has(failureKey(failureShown)) ? failureShown : null);
    if (failureToShow !== failureShown) this.openProjectStreamFailureRaised.publish(failureToShow);
  }

  private rememberTheProjectOfEachTabsStream(listedStreams: readonly ListedStream[]): void {
    const tabStreams = new Set(this.openStreamTabs.readLatest().tabs.map((tab) => tab.stream));
    for (const tabStream of this.projectOfEachTabsStream.keys()) {
      if (!tabStreams.has(tabStream)) this.projectOfEachTabsStream.delete(tabStream);
    }
    for (const listing of listedStreams) {
      if (!tabStreams.has(listing.stream) || listing.location === null) continue;
      this.projectOfEachTabsStream.set(listing.stream, { project_folder: listing.location.project_directory, is_the_stream_py_record: listing.location.stream_function === "" });
    }
  }

  /**
   * A tab whose stream the runtime does not list follows its project's `stream.py` record when the runtime lists that in its
   * place, as for a new project whose first load failed; a tab on the record follows the project's first stream once a load
   * replaces the record.
   */
  private followEachTabWhoseStreamALoadReplaced(listedStreams: readonly ListedStream[]): void {
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const replacementByReplacedStream = new Map<string, ListedStream>();
    for (const tab of tabs) {
      const projectOfTheTab = this.projectOfEachTabsStream.get(tab.stream);
      if (projectOfTheTab === undefined || listedStreams.some((listing) => listing.stream === tab.stream)) continue;
      const listedStreamsOfTheProject = listedStreams.filter((listing) => listing.location?.project_directory === projectOfTheTab.project_folder);
      const replacement = projectOfTheTab.is_the_stream_py_record ? listedStreamsOfTheProject[0] : listedStreamsOfTheProject.find((listing) => listing.location?.stream_function === "");
      if (replacement !== undefined) replacementByReplacedStream.set(tab.stream, replacement);
    }
    if (replacementByReplacedStream.size === 0) return;
    const tabsFollowed: StreamTabAddress[] = [];
    for (const tab of tabs) {
      const replacement = replacementByReplacedStream.get(tab.stream);
      const tabFollowed = replacement === undefined ? tab : { stream: replacement.stream, project_name: tab.project_name, display_name: replacement.display_name };
      if (!tabsFollowed.some((tabKept) => tabKept.stream === tabFollowed.stream)) tabsFollowed.push(tabFollowed);
    }
    for (const replacedStream of replacementByReplacedStream.keys()) this.projectOfEachTabsStream.delete(replacedStream);
    const activeReplacement = active_stream === null ? undefined : replacementByReplacedStream.get(active_stream);
    this.publishStreamTabs({ tabs: tabsFollowed, active_stream: activeReplacement?.stream ?? active_stream });
    const selection = this.selection.readLatest();
    const selectionReplacement = selection.kind === "stream" || selection.kind === "node" ? replacementByReplacedStream.get(selection.stream) : undefined;
    if (selectionReplacement !== undefined && selectionReplacement.location !== null) {
      this.selection.publish({ kind: "stream", stream: selectionReplacement.stream, project_folder: selectionReplacement.location.project_directory });
    }
  }

  private openTheStreamTabTheOpeningProjectAwaits(): void {
    const awaited = this.streamTabAwaitedByTheOpeningProject;
    if (awaited === null || openProjectFolderOf(this.openProject.readLatest()) !== awaited.project_folder) return;
    const listedStreams = this.listedStreams.readLatest();
    const listedStreamsOfTheProject = listedStreams.kind === "listed" ? listedStreams.streams.filter((listing) => listing.location?.project_directory === awaited.project_folder) : [];
    const stream = awaited.stream ?? listedStreamsOfTheProject[0]?.stream ?? null;
    if (stream === null) return;
    this.openStreamTab({
      stream,
      project_name: this.projectNameOfTheFolder(awaited.project_folder) ?? awaited.project_folder.split(/[\\/]/).filter((pathPart) => pathPart !== "").at(-1) ?? awaited.project_folder,
      display_name: listedStreamsOfTheProject.find((listing) => listing.stream === stream)?.display_name ?? stream,
    });
    if (!this.projectOfEachTabsStream.has(stream)) this.projectOfEachTabsStream.set(stream, { project_folder: awaited.project_folder, is_the_stream_py_record: false });
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
    const listedStreams = this.listedStreams.readLatest();
    if (listedStreams.kind === "listed") this.rememberTheProjectOfEachTabsStream(listedStreams.streams);
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
