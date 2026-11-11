// What the studio window holds between renders: the open project and the runtime's streams it
// serves its views, the selection, the open stream tabs, and the open project's layout.

import type { ListedStream, NewProjectDefaults, OpenProjectReading, PoppedOutView, ProjectArchiveChosenToImport, TatolabStatus } from "../../shared/tatolab_backend_contract";
import type { ModulesShown } from "../../shared/tatolab_electron_bridge_contract";
import type { RecentProjectChangeRefusal } from "../presentation/projects_presentation";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import type { SettingsSection } from "../presentation/settings_presentation";
import type { StudioWindowValuesServedToViews } from "../view_host/studio_view_host_services";
import { WatchedStudioValue } from "../view_host/watched_studio_value";
import { PortPickHeldInTheWindow } from "../view_host/port_pick_held_in_the_window";
import type { JsonValue, ListedStreamsReading, StopWatching, StreamTabAddress, StudioSelection, ViewOpenedOnAsked, ViewOpening, ViewOpeningTarget } from "../view_host/studio_view_contract";
import { layoutShowsTheViewType, layoutWithAreaSettings, layoutWithAreaShowing, type StudioAreaLayoutNode } from "./studio_area_layout";
import type { StudioLayoutKeptInStorage, StudioLayoutOfAFolder } from "./studio_layout";
import { poppedOutViewPinOf } from "./popped_out_view_pin";
import { NO_STUDIO_LAYOUT_EDGE_HIDDEN, studioLayoutShapedAs, studioLayoutWithEdgesHidden, studioLayoutWithShownSplitSizes, type StudioLayoutEdge, type StudioLayoutShape } from "./studio_layout_shapes";
import { showViewTypeInAreaOf, watchAreasForTheViewType, type StudioViewTypeAreaSources } from "./studio_view_type_areas";

/** What the window's view types are named by, and when the ones it holds change. */
export interface StudioViewTypeTitles {
  viewTitleOf(viewTypeId: string): string | null;
  watchChanges(onChanged: () => void): StopWatching;
}

/** A section the Module manager window is asked to show, and which ask of the window it is. */
export interface ModuleManagerSectionAskNumbered {
  shows: ModulesShown;
  ask_number: number;
}

/** The streams the runtime lists in `status`, or why it lists none now. */
export function listedStreamsReadingOf(status: TatolabStatus): ListedStreamsReading {
  const runtimeStatus = presentRuntimeStatus(status);
  if (runtimeStatus.runtimeState === "running" && status.streams !== null) return { kind: "listed", streams: status.streams };
  if (runtimeStatus.runtimeState === "running" && status.streams_not_listed_because !== null) return { kind: "listing_failed", because: status.streams_not_listed_because };
  return { kind: "not_listed", because: runtimeStatus.banner?.title ?? runtimeStatus.shortLabel };
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

/** What the New project sheet opens with: a new project's suggested name and location, or a project `.zip` to import with the name and location it suggests. */
export type NewProjectSheetOpening = { kind: "new_project"; defaults: NewProjectDefaults } | { kind: "project_archive"; chosen: ProjectArchiveChosenToImport };

/** What the Stream menu asks the person while its dialog shows: a new stream's name, the shown stream's new name, or whether to delete it. */
export type StreamMenuQuestion = { kind: "name_a_new_stream" } | { kind: "rename_stream"; stream: string; display_name: string } | { kind: "delete_stream"; stream: string; display_name: string };

/** The studio window's state, each part watched by the shell and served to the views through their bridges. */
export class StudioWindowModel {
  readonly openProject = new WatchedStudioValue<OpenProjectReading>({ kind: "none_open" });
  readonly listedStreams = new WatchedStudioValue<ListedStreamsReading>({ kind: "not_listed", because: "" });
  readonly selection = new WatchedStudioValue<StudioSelection>({ kind: "nothing" });
  readonly openStreamTabs = new WatchedStudioValue<OpenStreamTabs>({ tabs: [], active_stream: null });
  readonly activeStreamTab = new WatchedStudioValue<StreamTabAddress | null>(null);
  /** What the Stream menu's dialog asks while it shows; `null` while none does. */
  readonly streamMenuQuestion = new WatchedStudioValue<StreamMenuQuestion | null>(null);
  /** Why the last stream the person asked to delete was not, in the runtime's words, until it is dismissed or another is asked for. */
  readonly streamDeletionRefusal = new WatchedStudioValue<string | null>(null);
  /** The tabs closed in this window, the last closed last, which Reopen closed tab opens again. */
  readonly closedStreamTabs = new WatchedStudioValue<readonly StreamTabAddress[]>([]);
  /** The section Settings shows while it is open; `null` while it is closed. */
  readonly settingsSection = new WatchedStudioValue<SettingsSection | null>(null);
  /** What the New project sheet opened with while it shows, a new project's name and location or a `.zip` to import; `null` while it is closed. */
  readonly newProjectSheetOpenedWith = new WatchedStudioValue<NewProjectSheetOpening | null>(null);
  /** Why the last rename, duplicate or delete the Projects window asked of a project did not happen, until it is dismissed or another is asked for. */
  readonly recentProjectChangeRefusal = new WatchedStudioValue<RecentProjectChangeRefusal | null>(null);
  /** Why the last project asked for did not open, until it is dismissed or another opens. */
  readonly projectOpeningRefusal = new WatchedStudioValue<string | null>(null);
  /** Why the last view popped out of an area did not, until it is dismissed or another pops out. */
  readonly viewPopOutRefusal = new WatchedStudioValue<string | null>(null);
  /** The open project's layout; `null` while none is open. */
  readonly studioLayout = new WatchedStudioValue<StudioLayoutOfAFolder | null>(null);
  /** The area of the layout that fills the window in place of the layout; `null` while the layout shows. */
  readonly expandedAreaId = new WatchedStudioValue<string | null>(null);
  /** Whether the dialog that names the layout to save as a preset shows. */
  readonly layoutPresetNameAsked = new WatchedStudioValue(false);
  /** What views of each type were last opened on, by view type id. */
  readonly viewsOpenedOn = new WatchedStudioValue<Readonly<Record<string, ViewOpenedOnAsked>>>({});
  /** Why the last run or stop of the open project was refused, until it is dismissed or another is asked for. */
  readonly projectRunRefusal = new WatchedStudioValue<{ asked_to: "run" | "stop"; because: string } | null>(null);
  /** Why the person's last undo or redo was refused, in the runtime's words, until it is dismissed or another is asked for. */
  readonly projectEditRefusal = new WatchedStudioValue<{ asked_to: "undo" | "redo"; because: string } | null>(null);
  /** Why the last update choice from the menus did not reach the app, until it is dismissed or another is made. */
  readonly appUpdateChoiceRefusal = new WatchedStudioValue<string | null>(null);
  /** Why acknowledging a warning's dialog could not be remembered, until it is dismissed. */
  readonly studioWarningDismissRefusal = new WatchedStudioValue<string | null>(null);
  /** The open project's stream whose failure the window raises over the studio, until it is dismissed, the stream leaves `failed`, or another project opens. */
  readonly openProjectStreamFailureRaised = new WatchedStudioValue<OpenProjectStreamFailure | null>(null);
  /** The workspace when the window is a studio window's Module manager window, as last read from disk; `null` in any other window. */
  readonly moduleManagerWorkspace = new WatchedStudioValue<OpenProjectReading | null>(null);
  /** The section the Module manager window was last asked to show, numbered so the same section asked again is shown again; `null` in any other window. */
  readonly moduleManagerSectionAsked = new WatchedStudioValue<ModuleManagerSectionAskNumbered | null>(null);
  /** The view the window shows when it is popped out of a studio window; `null` in the Projects and studio windows. */
  readonly poppedOutView = new WatchedStudioValue<PoppedOutView | null>(null);

  /** The tab a project opens on once it is open and the runtime lists the stream: the stream New project just made, or with `stream` `null` the first the runtime lists from the folder; cleared when any tab is opened. */
  private streamTabAwaitedByTheOpeningProject: { project_folder: string; stream: string | null } | null = null;

  /** The stream asset of a stream New stream just made, whose tab opens once the runtime lists a stream of it; `null` while none is awaited. */
  private streamAssetAwaitedAsATab: string | null = null;

  /** Each failure of the open project's streams already raised, as its stream id and its words, so the window raises a failure once until the stream leaves `failed`. */
  private readonly openProjectStreamFailuresRaised = new Set<string>();


  /** The one port whose other end the person is picking in the Stream graph, ended when its stream's tab stops being the one shown. */
  readonly portPickHeld = new PortPickHeldInTheWindow();

  constructor(private readonly layoutKept: StudioLayoutKeptInStorage) {
    this.openStreamTabs.watch((openStreamTabs) => {
      const pick = this.portPickHeld.portPick.readLatest();
      if (pick !== null && openStreamTabs.active_stream !== pick.stream) this.portPickHeld.end("The stream's tab is no longer the one shown.");
    });
  }

  /** What the views are served from this model, each view type named through `viewTypeTitles`. */
  viewHostSources(viewTypeTitles: StudioViewTypeTitles): StudioWindowValuesServedToViews {
    const viewTypeAreaSources = this.viewTypeAreaSources(viewTypeTitles);
    return {
      watchAreasForTheViewType: (viewTypeId, listener) => watchAreasForTheViewType(viewTypeId, viewTypeAreaSources, listener),
      showViewTypeInArea: (viewTypeId, areaId) => showViewTypeInAreaOf(viewTypeId, areaId, viewTypeAreaSources),
      openProject: this.openProject,
      listedStreams: this.listedStreams,
      selection: this.selection,
      select: (selection) => this.select(selection),
      activeStreamTab: this.activeStreamTab,
      openStreamTab: (streamTab) => this.openStreamTab(streamTab),
      viewsOpenedOn: this.viewsOpenedOn,
      openView: (viewTypeId, on) => this.openView(viewTypeId, on),
      portPick: this.portPickHeld.portPick,
      pickAPortInTheStreamGraph: (pick) => this.portPickHeld.start(pick, this.whyNoPortCanBePickedInTheStreamGraphOf(pick.stream)),
      answerThePortPick: (node, port) => this.portPickHeld.answer(node, port),
      endThePortPick: (because) => this.portPickHeld.end(because),
    };
  }

  /** Why the window cannot show a pick in `stream`'s graph: its tab not the one shown, or no area of its layout showing the Stream graph; `null` when it can. */
  private whyNoPortCanBePickedInTheStreamGraphOf(stream: string): string | null {
    if (this.openStreamTabs.readLatest().active_stream !== stream) return "Open the stream's tab to pick its port in the Stream graph.";
    const studioLayout = this.studioLayout.readLatest();
    if (this.poppedOutView.readLatest() !== null || studioLayout === null || !layoutShowsTheViewType(studioLayoutWithEdgesHidden(studioLayout.layout, studioLayout.edges_hidden), "stream_graph")) {
      return "No area of this window shows the Stream graph. Show it in an area to pick there.";
    }
    return null;
  }

  private viewTypeAreaSources(viewTypeTitles: StudioViewTypeTitles): StudioViewTypeAreaSources {
    return {
      readChosenLayoutTree: () => {
        return this.studioLayout.readLatest()?.layout ?? null;
      },
      isAPoppedOutViewsWindow: () => this.poppedOutView.readLatest() !== null,
      viewTitleOf: (viewTypeId) => viewTypeTitles.viewTitleOf(viewTypeId),
      watchChanges: (onChanged) => {
        const stopWatchingEach = [this.studioLayout.watch(onChanged), this.poppedOutView.watch(onChanged), viewTypeTitles.watchChanges(onChanged)];
        return () => {
          for (const stopWatching of stopWatchingEach) stopWatching();
        };
      },
      showViewTypeInTheArea: (showing) => this.showViewTypeInArea(showing.area_id, showing.view_type_id),
    };
  }

  /** Have the Module manager window show `shows`, the window's next ask. */
  askTheModuleManagerToShow(shows: ModulesShown): void {
    this.moduleManagerSectionAsked.publish({ shows, ask_number: (this.moduleManagerSectionAsked.readLatest()?.ask_number ?? 0) + 1 });
  }

  /** Show the window as the view `target` names, alone. */
  showAsPoppedOutView(target: PoppedOutView): void {
    this.poppedOutView.publish(target);
  }

  /** Show the popped-out view's stream tab and selection as it popped out with them, once its project is shown. */
  pinThePoppedOutView(): void {
    const poppedOutView = this.poppedOutView.readLatest();
    const pin = poppedOutView === null ? null : poppedOutViewPinOf(poppedOutView.pinned_to);
    if (pin === null) return;
    this.streamTabAwaitedByTheOpeningProject = null;
    if (pin.stream_tab !== null) this.openStreamTab(pin.stream_tab);
    this.selection.publish(pin.selection);
  }

  /** Open views of `viewTypeId` on `on`, in each area of the layout that shows that type. */
  openView(viewTypeId: string, on: ViewOpeningTarget): ViewOpening {
    if (this.poppedOutView.readLatest() !== null) return { kind: "not_opened", because: "A popped-out view's window shows that view alone. Open it from the project's studio window." };
    const studioLayout = this.studioLayout.readLatest();
    if (studioLayout !== null && !layoutShowsTheViewType(studioLayoutWithEdgesHidden(studioLayout.layout, studioLayout.edges_hidden), viewTypeId)) {
      return { kind: "not_opened", because: `No area shows ${viewTypeId}. Choose it in an area's view menu, then open it again.` };
    }
    const opening: ViewOpenedOnAsked = { on, opening_id: crypto.randomUUID() };
    this.viewsOpenedOn.publish({ ...this.viewsOpenedOn.readLatest(), [viewTypeId]: opening });
    return { kind: "opened" };
  }

  /** Show `reading`; a project in another folder brings its own layouts and starts with no tabs and nothing selected. */
  showOpenProject(reading: OpenProjectReading): void {
    const folderBefore = openProjectFolderOf(this.openProject.readLatest());
    const folderNow = openProjectFolderOf(reading);
    this.openProject.publish(reading);
    if (folderNow === folderBefore && this.studioLayout.readLatest() !== null) return;
    if (folderNow !== folderBefore) {
      this.openProjectStreamFailuresRaised.clear();
      this.openProjectStreamFailureRaised.publish(null);
    }
    this.selection.publish({ kind: "nothing" });
    this.publishStreamTabs({ tabs: [], active_stream: null });
    this.closedStreamTabs.publish([]);
    this.studioLayout.publish(folderNow === null ? null : this.layoutKept.readLayoutOf(folderNow));
    this.expandedAreaId.publish(null);
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

  /** Show the streams `status` lists. A tab takes the name the runtime lists its stream under, and one whose stream the runtime no longer lists stays open on its last address. */
  showStatus(status: TatolabStatus): void {
    const listedStreams = listedStreamsReadingOf(status);
    this.listedStreams.publish(listedStreams);
    if (listedStreams.kind !== "listed") return;
    this.openTheStreamTabTheOpeningProjectAwaits();
    this.openTheTabOfTheAwaitedStreamAssetOnceListed(listedStreams.streams);
    this.raiseEachNewFailureOfTheOpenProjectsStreams(listedStreams.streams);
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const displayNameListedFor = (tab: StreamTabAddress) => listedStreams.streams.find((listing) => listing.stream === tab.stream)?.display_name ?? tab.display_name;
    if (tabs.every((tab) => displayNameListedFor(tab) === tab.display_name)) return;
    this.publishStreamTabs({ tabs: tabs.map((tab) => ({ ...tab, display_name: displayNameListedFor(tab) })), active_stream });
  }

  /** Select `selection`; in a studio window, a stream or one of its nodes opens the stream's tab, or shows it where it is open. */
  select(selection: StudioSelection): void {
    this.selection.publish(selection);
    if (this.poppedOutView.readLatest() !== null || (selection.kind !== "stream" && selection.kind !== "node")) return;
    if (this.openStreamTabs.readLatest().active_stream !== selection.stream) this.openStreamTabOfAListedStream(selection.stream);
  }

  /** Open `streamTab`, or show it where it is already open. */
  openStreamTab(streamTab: StreamTabAddress): void {
    this.streamTabAwaitedByTheOpeningProject = null;
    const { tabs } = this.openStreamTabs.readLatest();
    const isOpen = tabs.some((tab) => tab.stream === streamTab.stream);
    const closedStreamTabs = this.closedStreamTabs.readLatest();
    if (closedStreamTabs.some((tab) => tab.stream === streamTab.stream)) this.closedStreamTabs.publish(closedStreamTabs.filter((tab) => tab.stream !== streamTab.stream));
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

  /** Close the tab open on `stream`, which Reopen closed tab can open again; closing the shown one shows the tab after it, or before it when it was last. */
  closeStreamTab(stream: string): void {
    const closedTab = this.openStreamTabs.readLatest().tabs.find((tab) => tab.stream === stream);
    if (closedTab === undefined) return;
    this.closedStreamTabs.publish([...this.closedStreamTabs.readLatest(), closedTab]);
    this.takeTheStreamTabAway(stream);
  }

  /** Ask, in the Stream menu's dialog, for a new stream's name. */
  askForANewStreamName(): void {
    this.streamDeletionRefusal.publish(null);
    this.streamMenuQuestion.publish({ kind: "name_a_new_stream" });
  }

  /** Whether the studio window shows a dialog of its own over its stream tabs: the Stream menu's, Save layout as preset's, Settings, or the New project sheet. */
  isADialogShownOverTheStreamTabs(): boolean {
    return (
      this.streamMenuQuestion.readLatest() !== null ||
      this.layoutPresetNameAsked.readLatest() ||
      this.settingsSection.readLatest() !== null ||
      this.newProjectSheetOpenedWith.readLatest() !== null
    );
  }

  /** Ask, in the Stream menu's dialog, about the shown tab's stream: its new name, or whether to delete it. */
  askAboutTheShownStream(asked: "rename_stream" | "delete_stream"): void {
    const shownStreamTab = this.activeStreamTab.readLatest();
    if (shownStreamTab === null) return;
    this.streamDeletionRefusal.publish(null);
    this.streamMenuQuestion.publish({ kind: asked, stream: shownStreamTab.stream, display_name: shownStreamTab.display_name });
  }

  /** Open again the tab closed last, which Reopen closed tab does. */
  reopenTheLastClosedStreamTab(): void {
    const closedStreamTabs = this.closedStreamTabs.readLatest();
    const lastClosedTab = closedStreamTabs.at(-1);
    if (lastClosedTab === undefined) return;
    this.closedStreamTabs.publish(closedStreamTabs.slice(0, -1));
    this.openStreamTab(lastClosedTab);
  }

  /** Show the tab after the shown one, or before it, round from the last to the first. */
  showTheStreamTabBeside(direction: "next" | "previous"): void {
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const shownIndex = tabs.findIndex((tab) => tab.stream === active_stream);
    const besideTab = tabs[(shownIndex + (direction === "next" ? 1 : -1) + tabs.length) % tabs.length];
    if (besideTab !== undefined && besideTab.stream !== active_stream) this.chooseStreamTab(besideTab.stream);
  }

  /** Take away every tab of `stream`, which was deleted, open or left to reopen. */
  forgetTheTabsOfADeletedStream(stream: string): void {
    this.closedStreamTabs.publish(this.closedStreamTabs.readLatest().filter((tab) => tab.stream !== stream));
    this.takeTheStreamTabAway(stream);
  }

  /** Open the tab of the stream the runtime lists of `streamAsset`, which New stream just made, now or once it lists one. */
  openTheTabOfTheNewStreamAsset(streamAsset: string): void {
    this.streamAssetAwaitedAsATab = streamAsset;
    const listedStreams = this.listedStreams.readLatest();
    if (listedStreams.kind === "listed") this.openTheTabOfTheAwaitedStreamAssetOnceListed(listedStreams.streams);
  }

  private openTheTabOfTheAwaitedStreamAssetOnceListed(listedStreams: readonly ListedStream[]): void {
    if (this.streamAssetAwaitedAsATab === null) return;
    const newStream = listedStreams.find((listing) => listing.location?.stream_asset === this.streamAssetAwaitedAsATab);
    if (newStream === undefined) return;
    this.streamAssetAwaitedAsATab = null;
    this.openStreamTabOfAListedStream(newStream.stream);
  }

  private takeTheStreamTabAway(stream: string): void {
    const { tabs, active_stream } = this.openStreamTabs.readLatest();
    const closedIndex = tabs.findIndex((tab) => tab.stream === stream);
    if (closedIndex === -1) return;
    const tabsLeft = tabs.filter((tab) => tab.stream !== stream);
    const nextActive = active_stream !== stream ? active_stream : (tabsLeft[Math.min(closedIndex, tabsLeft.length - 1)]?.stream ?? null);
    this.publishStreamTabs({ tabs: tabsLeft, active_stream: nextActive });
  }

  /** Reshape the layout as `shape`, keeping the views it shows where they fit, every edge shown. */
  shapeTheLayout(shape: StudioLayoutShape): void {
    this.expandedAreaId.publish(null);
    this.changeTheLayout((studioLayout) => ({ ...studioLayout, layout: studioLayoutShapedAs(studioLayout.layout, shape), edges_hidden: NO_STUDIO_LAYOUT_EDGE_HIDDEN }));
  }

  /** Hide the layout's area at `edge`, or show it again. */
  toggleTheLayoutsEdge(edge: StudioLayoutEdge): void {
    this.expandedAreaId.publish(null);
    this.changeTheLayout((studioLayout) => ({ ...studioLayout, edges_hidden: { ...studioLayout.edges_hidden, [edge]: !studioLayout.edges_hidden[edge] } }));
  }

  /** Lay the window out as the preset the person saved at `presetIndex`, every edge shown; false when there is none there. */
  applyTheSavedLayoutPreset(presetIndex: number): boolean {
    const preset = this.studioLayout.readLatest()?.presets_saved[presetIndex];
    if (preset === undefined) return false;
    this.expandedAreaId.publish(null);
    this.changeTheLayout((studioLayout) => ({ ...studioLayout, layout: preset.layout, edges_hidden: NO_STUDIO_LAYOUT_EDGE_HIDDEN }));
    return true;
  }

  /** Save the layout, as it shows, as a preset named `title`, after the ones saved before. */
  saveTheLayoutAsAPreset(title: string): void {
    this.changeTheLayout((studioLayout) => ({
      ...studioLayout,
      presets_saved: [...studioLayout.presets_saved, { title, layout: studioLayoutWithEdgesHidden(studioLayout.layout, studioLayout.edges_hidden) }],
    }));
  }

  /** Grow area `areaId` of the layout to fill the window, or put the layout back. */
  expandArea(areaId: string, isExpanded: boolean): void {
    if (isExpanded) this.expandedAreaId.publish(areaId);
    else if (this.expandedAreaId.readLatest() === areaId) this.expandedAreaId.publish(null);
  }

  /** Show `viewTypeId` in area `areaId` of the layout. */
  showViewTypeInArea(areaId: string, viewTypeId: string): void {
    this.changeTheLayoutTree((tree) => layoutWithAreaShowing(tree, areaId, viewTypeId));
  }

  /** Keep `settings` with area `areaId` of the layout. */
  keepAreaSettings(areaId: string, settings: JsonValue): void {
    this.changeTheLayoutTree((tree) => layoutWithAreaSettings(tree, areaId, settings));
  }

  /** Keep the sizes a drag left split `splitId` of the layout at. */
  keepSplitSizes(splitId: string, sizePercentByPartId: Readonly<Record<string, number>>): void {
    this.changeTheLayoutTree((tree) => studioLayoutWithShownSplitSizes(tree, splitId, sizePercentByPartId));
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

  private changeTheLayoutTree(change: (tree: StudioAreaLayoutNode) => StudioAreaLayoutNode): void {
    this.changeTheLayout((studioLayout) => ({ ...studioLayout, layout: change(studioLayout.layout) }));
  }

  private changeTheLayout(change: (studioLayout: StudioLayoutOfAFolder) => StudioLayoutOfAFolder): void {
    const studioLayout = this.studioLayout.readLatest();
    const folder = openProjectFolderOf(this.openProject.readLatest());
    if (studioLayout === null || folder === null) return;
    const changedLayout = change(studioLayout);
    this.studioLayout.publish(changedLayout);
    this.layoutKept.keepLayoutOf(folder, changedLayout);
  }
}
