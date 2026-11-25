import { MockWorkspaceDependencies } from "./mock_workspace_dependencies";
import {
  createMockStreamFixtures,
  createMockStreamRunFromAProjectFolder,
  MOCK_RUNTIME_ID,
  mockMainStreamAsTheRuntimeHoldsIt,
  mockStreamIdOf,
  type MockStreamGraph,
  type MockLogRecordDraft,
  type MockStreamFixture,
  stampMockLogRecord,
} from "./mock_stream_fixtures";
import { mockStreamGraphOf } from "./mock_stream_graph_document";
import { mockConditionOf } from "./mock_stream_conditions";
import type { MockInputValueChanged } from "./mock_input_value_changes";
import { mockFoldersInDocumentsTatoStudio, mockOpenProjectReading, mockRecentProjects } from "./mock_open_project";
import { MockPythonLanguageServer } from "./mock_python_language_server";
import { nodeTypesDescribedWhileMainHolds, recordedNodeTypesOfTheMainGraph } from "./mock_main_graphs";
import { MockPortViewers } from "./mock_port_viewers";
import { mockStudioViewListing, mockStudioViewListingThatDoesNotOpen } from "./mock_studio_view/mock_studio_view_listing";
import { MockProjectFiles } from "./mock_project_files";
import { MockProjectTransactions } from "./mock_project_transactions";
import { mockProjectAssetsUnchanged } from "./mock_project_assets";
import type { JsonValue, ProjectGraphTransaction, ProjectTransaction, StreamAssetCreated, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import { streamDocumentNameNumberedPast, streamDocumentNameOfTheDisplayName } from "../src/shared/stream_document_name";
import { MockNodeTypesTheProjectGains } from "./mock_node_types";
import { applyMockGraphTransaction, isAJsonObject, isAHistoryOperationTheMockMakesAgainFromTheEditInside, graphActionApplyingTheHistoryOperation, thePlacementsOfTheStream, type MockGraphEditGrounds, type MockStreamGraphTarget } from "./mock_graph_transactions";
import {
  type ListedStream,
  type OpenProjectReading,
  type ProjectLogRecord,
  type ProjectLogRecordsPage,
  type ProjectLogRecordsPushed,
  type StreamGraph,
  type StreamGraphInputValueChange,
  type ProjectVenvSyncOfAStreamAction,
  type FailedProjectStreamAction,
  type StreamActionDescription,
  STREAM_ACTION_STEP_MAKING_THE_VENV,
  type StreamActionCancelAnswer,
  type StreamProjectFolderChosenFor,
  type TatolabStatus,
  type PythonLanguageServerEvent,
  type SystemMenuBarEntry,
  type SystemMenuBarMenu,
} from "../src/shared/tatolab_backend_contract";
import { MOCK_NEWER_TATOLAB_VERSION, type MockTatolabOptions, initialMockStatus } from "./mock_tatolab_options";
import { MOCK_FAILING_STREAM_NAME, MOCK_LIVE_TICK_MILLISECONDS, MOCK_MAIN_LOADING_MILLISECONDS, MOCK_NEW_PROJECT_FOLDER_NAMES, MOCK_PYTHON_ENVIRONMENT_MILLISECONDS, MOCK_RECORDS_PAGE_SIZE, MOCK_RUNTIME_STARTUP_MILLISECONDS, MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS, MOCK_STREAM_ACTION_STEP_MILLISECONDS, MOCK_STREAM_SETTLE_MILLISECONDS, MOCK_UPDATE_DOWNLOAD_STEP_MILLISECONDS, MOCK_UPDATE_DOWNLOAD_STEP_PERCENT, MOCK_UV_SYNC_REFUSAL, MOCK_VENV_SYNC_STAGES, type MockLoadedStream, mockOpenRefusedForAnEarlierRuntimesRecord, type MockProjectLoadKind, type MockProjectLog, type MockProjectPlaybackAfterItsLoad } from "./mock_tatolab_simulation_constants";

/** The mock page's address with every query parameter kept and `parameterName` set to `parameterValue`, so a new tab opens on the same scenario. */
export function mockPageUrlWith(pageUrl: string, parameterName: string, parameterValue: string): string {
  const pageUrlWithTheParameter = new URL(pageUrl);
  pageUrlWithTheParameter.searchParams.set(parameterName, parameterValue);
  return pageUrlWithTheParameter.toString();
}

/** Whether `menus` hold `entryId` as a command or a choice the person can choose. */
function isAnAvailableSystemMenuBarCommand(menus: readonly SystemMenuBarMenu[], entryId: string): boolean {
  const isAvailableAmong = (entries: readonly SystemMenuBarEntry[]): boolean =>
    entries.some((entry) => {
      if (entry.kind === "submenu") return isAvailableAmong(entry.entries);
      if (entry.kind === "command") return entry.entry_id === entryId && entry.unavailable_because === null;
      return entry.kind === "choice" && entry.entry_id === entryId;
    });
  return menus.some((menu) => isAvailableAmong(menu.entries));
}

/** Resolves after `milliseconds`, on the window's timer. */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** The runtime, projects and app the mock backend's areas share: their state, and the helpers more than one area calls. */
export function createMockTatolabSimulation(mockTatolabOptions: MockTatolabOptions) {
  const {
    scenario,
    platform,
    appUpdateScenario,
    isTheTerminalMissing,
    isTheLogFolderMissing,
    mostProjectLogRecordsKept,
    chosenProjectFolder,
    isTheNewProjectFolderChosenAnExistingProject,
    isNoProjectLoadHeld,
    doesTheRuntimeKeepNoOwnLog,
    isTheRuntimeRestartRefused,
    streamPageRequestedByANotification,
    isMakingThePythonEnvironmentRefused,
    doesTheRuntimeListAnEarlierRuntimesRecord,
    isTheOpenProjectsOpenRefused,
    openProjectScenario,
    projectHistoryScenario,
    recentProjectsInTheQuery,
  } = mockTatolabOptions;
  const fixtures = createMockStreamFixtures(platform);
  const assetsChangedWhileTheMockRuns = mockProjectAssetsUnchanged();
  const mainStreamAsChosen = mockTatolabOptions.mainGraph !== null
    ? fixtures.mainStreamHoldingTheGraph[mockTatolabOptions.mainGraph]
    : scenario === "node-error"
      ? fixtures.mainStreamWithTheSpeakerInError
      : scenario === "node-not-ready"
        ? fixtures.mainStreamWithAnImageFileNotReady
        : scenario === "dropping"
          ? fixtures.mainStreamWithItsGlowFallingBehind
          : mockTatolabOptions.isTheFixtureViewListed
            ? fixtures.mainStreamWithTheFixtureViewsNode
            : mockTatolabOptions.isTheCompositorInMain
              ? fixtures.mainStreamWithTheCompositorNode
              : mockTatolabOptions.doesTheMainStreamDeclareGraphInputs
                ? fixtures.mainStreamDeclaringExtraGraphInputs
                : fixtures.mainStream;
  const mainStream = mockMainStreamAsTheRuntimeHoldsIt(mainStreamAsChosen, scenario === "refused-at-play" ? "refused_at_play" : mockTatolabOptions.areTheMainStreamsNodesStopped ? "nodes_stopped" : "as_chosen");
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const openProjectListeners = new Set<(reading: OpenProjectReading) => void>();
  const menusKeptForTheSystemMenuBar: SystemMenuBarMenu[] = [];
  let systemMenuBarEntryStillToChoose = mockTatolabOptions.systemMenuBarEntryChosenByThePerson;
  let systemMenuBarEntryChosenListener: ((entryId: string) => void) | null = null;
  const chooseTheSystemMenuBarEntryOnceOffered = () => {
    const entryToChoose = systemMenuBarEntryStillToChoose;
    if (entryToChoose === null || systemMenuBarEntryChosenListener === null || !isAnAvailableSystemMenuBarCommand(menusKeptForTheSystemMenuBar, entryToChoose)) return;
    systemMenuBarEntryStillToChoose = null;
    const chooseTheEntry = systemMenuBarEntryChosenListener;
    window.setTimeout(() => chooseTheEntry(entryToChoose), 0);
  };
  let openProjectReading = mockOpenProjectReading(openProjectScenario, fixtures.machine.homeDirectory);
  const mockStudioViewsListedInTheProject = () => (mockTatolabOptions.isTheFixtureViewListed ? [mockStudioViewListing(), mockStudioViewListingThatDoesNotOpen()] : []);
  const workspaceDependencies = new MockWorkspaceDependencies(
    openProjectReading.kind === "read" ? openProjectReading.open_project.project.folder : fixtures.pulseStageProjectDirectory,
    mockTatolabOptions.moduleManagerWorkspaceDependencies ?? "copied",
    () => mockStudioViewsListedInTheProject(),
  );
  let recentProjects = mockRecentProjects(recentProjectsInTheQuery, fixtures.machine.homeDirectory, Date.now());
  const coverImageUrlsByFolder = new Map<string, string>();
  const mockFoldersOnDisk = () => [...mockFoldersInDocumentsTatoStudio(fixtures.machine.homeDirectory), ...recentProjects.map((recent) => recent.folder)];
  const rememberTheProjectAsOpenedLast = (folder: string, projectName: string | null) => {
    const recentBefore = recentProjects.find((recent) => recent.folder === folder);
    recentProjects = [
      {
        folder,
        project_name: projectName,
        project_description: recentBefore?.project_description ?? null,
        last_edited_at_wall_clock_ms: recentBefore?.last_edited_at_wall_clock_ms ?? null,
        has_a_chosen_cover: recentBefore?.has_a_chosen_cover ?? false,
        last_opened_at_wall_clock_ms: Date.now(),
      },
      ...recentProjects.filter((recent) => recent.folder !== folder),
    ];
  };
  const openTheProjectInTheMock = (reading: OpenProjectReading, folder: string, projectName: string | null) => {
    openProjectReading = reading;
    rememberTheProjectAsOpenedLast(folder, projectName);
    for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(openProjectReading));
  };
  const mockProjectFiles = new MockProjectFiles(`${fixtures.machine.homeDirectory}/streams`);
  const languageServerEventListeners = new Set<(event: PythonLanguageServerEvent) => void>();
  const mockLanguageServersBySession = new Map<string, MockPythonLanguageServer>();
  const mockPortViewers = new MockPortViewers();
  let languageServerSessionCount = 0;
  /** Each committed graph transaction by its gesture's key; a live edit's key is never kept, as the runtime keeps none. */
  const graphTransactionsCommittedByIdempotencyKey = new Map<string, ProjectGraphTransaction>();
  const mockProjectTransactions =
    openProjectReading.kind === "read" ? new MockProjectTransactions(openProjectReading.open_project.project.project, openProjectReading.open_project.project.folder, projectHistoryScenario) : null;
  const refuseWithoutAnOpenProject = (): void => {
    if (openProjectReading.kind !== "read") throw "No project is open, so its files cannot be read.";
  };
  const loadedStreams = new Map<string, MockLoadedStream>();
  /** The graph of each loaded stream of the open project, by its stream asset, which a graph action names it by. */
  const graphTargetsOfTheOpenProject = (): Map<string, MockStreamGraphTarget> => {
    const openProjectFolder = openProjectReading.kind === "read" ? openProjectReading.open_project.project.folder : null;
    return new Map(
      [...loadedStreams.values()].flatMap((loadedStream) => {
        const location = loadedStream.fixture.listing.location;
        return location === null || location.project_directory !== openProjectFolder ? [] : [[location.stream_asset, { stream_id: loadedStream.fixture.listing.stream, graph: loadedStream.fixture.graph }] as const];
      }),
    );
  };
  /** Each graph as last committed, by stream asset, which a commit's `from` reads as the runtime's does; a live edit changes only the running graph. */
  const savedGraphsByStreamAsset = new Map<string, MockStreamGraph>();
  const savedGraphTargetsOfTheOpenProject = (): Map<string, MockStreamGraphTarget> =>
    new Map(
      [...graphTargetsOfTheOpenProject()].map(([streamAsset, runningTarget]) => {
        const savedGraph = savedGraphsByStreamAsset.get(streamAsset) ?? structuredClone(runningTarget.graph);
        savedGraphsByStreamAsset.set(streamAsset, savedGraph);
        return [streamAsset, { stream_id: runningTarget.stream_id, graph: savedGraph }] as const;
      }),
    );
  /** Commit `operations`: applied to the saved graphs, which answer, then to the running ones. */
  const recordedNodeTypes = recordedNodeTypesOfTheMainGraph(mockTatolabOptions.mainGraph);
  const graphEditGrounds: MockGraphEditGrounds = { nodeTypesDescribed: nodeTypesDescribedWhileMainHolds(mockTatolabOptions.mainGraph), whatTheNodesRemovedHeld: new Map() };
  const nodeTypesTheProjectGains = new MockNodeTypesTheProjectGains(graphEditGrounds);
  const commitGraphActions = (operations: readonly StreamGraphAction[], applying: "a_transaction" | "undo_or_redo", historyOperationsReplayed: readonly JsonValue[] = []) => {
    const applied = applyMockGraphTransaction(savedGraphTargetsOfTheOpenProject(), graphEditGrounds, operations, applying, historyOperationsReplayed);
    applyMockGraphTransaction(graphTargetsOfTheOpenProject(), graphEditGrounds, operations, applying, applied.history_operations);
    return applied;
  };
  /** Why undoing `undone` is refused, in the runtime's words: the stream it saved is edited since, or placed by another node still; `null` when nothing refuses it. */
  const whyTheUndoIsRefused = (undone: ProjectTransaction): string | null => {
    for (const inverseOperation of undone.inverse_operations) {
      if (!isAJsonObject(inverseOperation) || inverseOperation["operation"] !== "delete_stream_document") continue;
      const { stream: placedStream, path, document } = inverseOperation;
      if (typeof placedStream !== "string" || typeof path !== "string") continue;
      const placements = thePlacementsOfTheStream(placedStream, savedGraphTargetsOfTheOpenProject());
      if (placements === null) continue;
      if (JSON.stringify(placements.document) !== JSON.stringify(document)) return `the graph document ${path} was edited after the transaction being reversed wrote it; taking it out would lose those edits`;
      const streamsStillPlacingIt = placements.holdingStreams.slice(1);
      if (streamsStillPlacingIt.length === 0) continue;
      const documentPathOf = (streamAsset: string) => {
        const holdingStream = [...loadedStreams.values()].find((loadedStream) => loadedStream.fixture.listing.location?.stream_asset === streamAsset);
        return `streams/${holdingStream?.fixture.listing.display_name ?? streamAsset}.graph.json`;
      };
      return `the asset ${placedStream} cannot be deleted while [${[...new Set(streamsStillPlacingIt.map(documentPathOf))].map((documentPath) => JSON.stringify(documentPath)).join(", ")}] reference it`;
    }
    return null;
  };
  /** `undoOrRedo`, its graph operations applied to the mock graphs as the runtime applies them; a transaction naming no graph changes none. */
  const applyingItsGraphOperations = (undoOrRedo: ProjectTransaction): ProjectTransaction => {
    const graphActions = nodeTypesTheProjectGains.fileTheGroupsOf(undoOrRedo.operations).filter((operation) => !isAHistoryOperationTheMockMakesAgainFromTheEditInside(operation)).map(graphActionApplyingTheHistoryOperation);
    const everyOneNamesAGraph = graphActions.every((graphAction): graphAction is StreamGraphAction => graphAction !== null);
    if (everyOneNamesAGraph && graphActions.length > 0) commitGraphActions(graphActions, "undo_or_redo", undoOrRedo.operations);
    pushEveryFollowedStreamGraphChanged();
    return undoOrRedo;
  };
  const listedStreamsNotLoaded = new Map<string, ListedStream>([
    [fixtures.stoppedRehearsal.stream, fixtures.stoppedRehearsal],
    [fixtures.failedLobbyRecorder.stream, fixtures.failedLobbyRecorder],
    ...(doesTheRuntimeListAnEarlierRuntimesRecord ? [[fixtures.earlierRuntimesRecord.stream, fixtures.earlierRuntimesRecord] as const] : []),
  ]);
  /** The display names `set_stream_display_name` gave, by stream id, over the ones the fixtures load with. */
  const displayNamesRenamedTo = new Map<string, string>();
  /** Recorded streams not loaded that a run of their project loads again, by id: `rehearsal`, and each one stopped from the window. */
  const recordedFixturesNotLoaded = new Map<string, MockStreamFixture>([[fixtures.rehearsalStream.listing.stream, fixtures.rehearsalStream]]);
  const forgottenStreamIds = new Set<string>();
  /** The stream action queued or under way on each stream, by id; a step of an action that is no longer its stream's does nothing. */
  const streamActionOfEachStream = new Map<string, string>();
  const projectLogs = new Map<string, MockProjectLog>();
  let streamActionCount = 0;
  const nextStreamActionId = (): string => {
    streamActionCount += 1;
    return `${MOCK_RUNTIME_ID}-${streamActionCount}`;
  };
  let mockStatus = initialMockStatus(scenario, platform, fixtures.machine, mockTatolabOptions);
  let runtimeUpSinceMilliseconds: number | null = null;
  /** When the mock runtime's engine started, which its uptime counts from: long before the page opened, until a restart. */
  let runtimeEngineStartedAtMilliseconds = Date.now() - MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS;
  let liveTickTimer: number | undefined;

  /** The streams the window follows the graphs of, and who is told when one changes. */
  const streamsWhoseGraphsAreFollowed = new Set<string>();
  const streamGraphChangedListeners = new Set<(streamId: string, inputValueChange: StreamGraphInputValueChange | null) => void>();
  /** Tell the window each followed stream's graph changed after the command that changed it answers, as the runtime pushes `stream_graph_changed`. */
  const pushEveryFollowedStreamGraphChanged = (): void => {
    window.setTimeout(() => {
      for (const streamId of streamsWhoseGraphsAreFollowed) for (const listener of streamGraphChangedListeners) listener(streamId, null);
    }, 0);
  };
  /** Tell the window each of `changes` after the command that made it answers, as the runtime pushes `input_value_changed` to a connection subscribed to both graph and value changes. */
  const pushEachInputValueChanged = (changes: readonly MockInputValueChanged[]): void => {
    window.setTimeout(() => {
      for (const { stream_id, change } of changes) for (const listener of streamGraphChangedListeners) listener(stream_id, change);
    }, 0);
  };

  /** The projects the window follows the logs of, and who is told when one is written. */
  const projectsWhoseLogsAreFollowed = new Set<string>();
  const projectLogRecordsWrittenListeners = new Set<(projectDirectory: string, pushed: ProjectLogRecordsPushed | null) => void>();

  const publishStatus = (statusChanges: Partial<TatolabStatus>): void => {
    mockStatus = { ...mockStatus, project_venv_syncs_just_ended: [], ...statusChanges };
    for (const statusListener of statusListeners) statusListener(structuredClone(mockStatus));
    pushEveryFollowedStreamGraphChanged();
  };

  /** The ids of the streams run from the window's Add stream, listed after the fixtures', in the order they were run. */
  const streamIdsRunFromTheWindow: string[] = [];
  const listStreams = (): ListedStream[] | null => {
    if (scenario === "not-listed") return null;
    const listingOrder = [...(scenario === "empty" ? [] : fixtures.listingOrder), ...(doesTheRuntimeListAnEarlierRuntimesRecord ? [fixtures.earlierRuntimesRecord.stream] : [])];
    return [...listingOrder, ...streamIdsRunFromTheWindow]
      .map((streamId) => loadedStreams.get(streamId)?.fixture.listing ?? listedStreamsNotLoaded.get(streamId) ?? null)
      .filter((listing): listing is ListedStream => listing !== null)
      .map((listing) => ({ ...listing, display_name: displayNamesRenamedTo.get(listing.stream) ?? listing.display_name, condition: listing.condition ?? mockConditionOf(listing, loadedStreams.has(listing.stream)) }));
  };

  /** Each project folder the mock knows, by path: its stream assets' names, none for a folder that is no project, and whether it has a `.venv`; a folder not here does not exist. */
  const projectFolders = new Map<string, { streamNames: readonly string[]; hasAPythonEnvironment: boolean }>([
    [`${fixtures.machine.homeDirectory}/code/heat-map`, { streamNames: ["heat_map"], hasAPythonEnvironment: chosenProjectFolder !== "no-venv" }],
    [`${fixtures.machine.homeDirectory}/code/doorways`, { streamNames: ["front_door", MOCK_FAILING_STREAM_NAME], hasAPythonEnvironment: true }],
    [fixtures.pulseStageProjectDirectory, { streamNames: ["main", "recorder", "rehearsal"], hasAPythonEnvironment: true }],
    [`${fixtures.machine.homeDirectory}/code/notes`, { streamNames: [], hasAPythonEnvironment: true }],
  ]);
  const foldersHandedToTheWindow = new Set<string>();
  const projectFolderTheDialogChooses = (chosenFor: StreamProjectFolderChosenFor): string | null => {
    const projectsFolder = `${fixtures.machine.homeDirectory}/code`;
    if (chosenProjectFolder === "cancel") return null;
    if (chosenFor === "new_project_directory") return isTheNewProjectFolderChosenAnExistingProject ? `${projectsFolder}/heat-map` : `${fixtures.machine.homeDirectory}/streams/lobby`;
    switch (chosenProjectFolder) {
      case "ready":
      case "no-venv":
        return `${projectsFolder}/heat-map`;
      case "several":
        return `${projectsFolder}/doorways`;
      case "recorded":
        return fixtures.pulseStageProjectDirectory;
      case "no-project-file":
        return `${projectsFolder}/notes`;
    }
  };
  const refuseAFolderNotHandedToTheWindow = (folder: string): void => {
    if (!foldersHandedToTheWindow.has(folder)) throw `Tato Studio acts only on a folder chosen in its window. Choose ${folder} again.`;
  };
  const newProjectFolderTheRuntimeDraws = (): string => {
    const newProjectsFolder = `${fixtures.machine.homeDirectory}/streams`;
    const freeName = MOCK_NEW_PROJECT_FOLDER_NAMES.find((name) => !projectFolders.has(`${newProjectsFolder}/${name}`));
    return `${newProjectsFolder}/${freeName ?? `project-${projectFolders.size}`}`;
  };

  /** Each load `create_project`, `open_project`, `start_playback` or `reload_project` queued, by action, as `describe_stream_action` reads it. */
  const projectLoadsQueued = new Map<string, StreamActionDescription>();
  /** Whether each queued load leaves its streams playing or held stopped, by action. */
  const playbackAfterEachProjectLoad = new Map<string, MockProjectPlaybackAfterItsLoad>();
  /** Each project whose latest queued load failed, as the main process holds it from the actions it follows. */
  const projectStreamActionFailures = (): FailedProjectStreamAction[] => {
    const latestLoadOfEachProject = new Map<string, StreamActionDescription>();
    for (const description of projectLoadsQueued.values()) latestLoadOfEachProject.set(description.project_directory, description);
    return [...latestLoadOfEachProject.values()].flatMap(({ action, project_directory, kind, state, failed_because }) =>
      state === "failed" && failed_because !== null ? [{ action, project_directory, kind, failed_because }] : [],
    );
  };
  const notHeldWords = (action: string): string =>
    `the stream action \`${action}\` is not held: this runtime never queued it, or it is older than the last 64 finished actions of its project; its records stay in the project's log`;

  /** Each running action `cancel_stream_action` asked to stop, which the work on it ends at its next step. */
  const streamActionsAskedToCancel = new Set<string>();
  /** Each stop and removal under way, which is past cancelling once it runs. */
  const unloadingStreamActions = new Map<string, "stop" | "remove">();
  /** How each stop, start and removal ended, which a cancel of it is refused with. */
  const endedStreamActions = new Map<string, "done" | "cancelled">();
  const streamNotLoadedForTheCancelWords = (streamId: string): string => `Runtime error: the stream \`${streamId}\` was not loaded: its stream action was cancelled`;

  /** `cancel_stream_action` as the runtime does it: a queued load dropped, a running load or start stopped at its next step; refused for a running stop or removal, an ended action and one never queued. */
  const cancelMockStreamAction = (action: string): StreamActionCancelAnswer => {
    const projectLoad = projectLoadsQueued.get(action);
    if (projectLoad !== undefined) {
      if (projectLoad.state === "queued") {
        writeProjectRecord(projectLoad.project_directory, action, "info", `the stream action ${action} was cancelled before it began`);
        Object.assign(projectLoad, { state: "cancelled", step: null });
        return { action, state: "cancelled" };
      }
      if (projectLoad.state !== "in_progress") throw `Invalid configuration: the stream action \`${action}\` is already ${projectLoad.state}, so there is nothing to cancel`;
      streamActionsAskedToCancel.add(action);
      return { action, state: "in_progress" };
    }
    const ending = endedStreamActions.get(action);
    if (ending !== undefined) throw `Invalid configuration: the stream action \`${action}\` is already ${ending}, so there is nothing to cancel`;
    const unloadingKind = unloadingStreamActions.get(action);
    if (unloadingKind !== undefined) {
      throw `Invalid configuration: the stream action \`${action}\` is a running ${unloadingKind}, which has begun unloading its streams and cannot be cut short; it ends done`;
    }
    if (![...streamActionOfEachStream.values()].includes(action)) throw `Invalid configuration: ${notHeldWords(action)}`;
    streamActionsAskedToCancel.add(action);
    return { action, state: "in_progress" };
  };

  /** Lists each stream `action` was loading failed for its cancel, and ends it; `false` when no cancel was asked. */
  const endTheLoadAtItsCancel = (description: StreamActionDescription): boolean => {
    if (!streamActionsAskedToCancel.delete(description.action)) return false;
    for (const [streamId, streamAction] of streamActionOfEachStream) {
      if (streamAction !== description.action) continue;
      streamActionOfEachStream.delete(streamId);
      const listing = listedStreamsNotLoaded.get(streamId);
      if (listing !== undefined) listedStreamsNotLoaded.set(streamId, { ...listing, state: "failed", failed_because: streamNotLoadedForTheCancelWords(streamId), action: null, step: null });
    }
    writeProjectRecord(description.project_directory, description.action, "info", `the stream action ${description.action} was cancelled at the step it was on`);
    Object.assign(description, { state: "cancelled", step: null });
    publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
    return true;
  };

  /** Queues a load of `projectDirectory` that fails after a beat with `failedBecause`, as the runtime fails a load it cannot begin. */
  const queueAMockProjectLoadThatFails = (projectDirectory: string, kind: MockProjectLoadKind, failedBecause: string): string => {
    const action = nextStreamActionId();
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind, state: "queued", step: null, streams: [], failed_because: null, venv_sync: null };
    projectLoadsQueued.set(action, description);
    publishStatus({ project_stream_action_failures: projectStreamActionFailures() });
    window.setTimeout(() => {
      Object.assign(description, { state: "failed", failed_because: failedBecause });
      publishStatus({ project_stream_action_failures: projectStreamActionFailures() });
    }, MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    return action;
  };

  /**
   * `create_project`'s, `open_project`'s, `start_playback`'s and `reload_project`'s load as the runtime does it: queued, then every stream asset's graph document
   * read, the `.venv` made where it has none, and every stream starting, each listed `preparing` under the action, then
   * playing or held stopped as `playbackAfterTheLoad` says, or failed for the doorways project's `back_door`.
   */
  const queueAMockProjectLoad = (projectDirectory: string, kind: MockProjectLoadKind, playbackAfterTheLoad: MockProjectPlaybackAfterItsLoad): string => {
    const action = nextStreamActionId();
    playbackAfterEachProjectLoad.set(action, playbackAfterTheLoad);
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind, state: "queued", step: null, streams: [], failed_because: null, venv_sync: null };
    projectLoadsQueued.set(action, description);
    publishStatus({ project_stream_action_failures: projectStreamActionFailures() });
    void workOnTheMockProjectLoad(description);
    return action;
  };

  /** Every stream of the project listed failed in uv's words, as the runtime lists each of its stream assets when its `.venv` is not made. */
  const listEveryStreamOfTheProjectFailedOnItsSync = (projectDirectory: string, streamFixtures: readonly MockStreamFixture[]): ListedStream[] => {
    const recordedStreams = (listStreams() ?? []).filter((listing) => listing.location?.project_directory === projectDirectory);
    const failedStreams: ListedStream[] = streamFixtures.map((fixture) => ({
      ...fixture.listing,
      display_name: displayNamesRenamedTo.get(fixture.listing.stream) ?? fixture.listing.display_name,
      state: "failed",
      node_count: null,
      failed_because: MOCK_UV_SYNC_REFUSAL,
      action: null,
      step: null,
    }));
    for (const listing of failedStreams) {
      loadedStreams.delete(listing.stream);
      streamActionOfEachStream.delete(listing.stream);
      if (!streamIdsRunFromTheWindow.includes(listing.stream) && !recordedStreams.some((recorded) => recorded.stream === listing.stream)) streamIdsRunFromTheWindow.push(listing.stream);
      listedStreamsNotLoaded.set(listing.stream, listing);
    }
    return failedStreams;
  };

  /** Each load's sync under way, as the main process reads it from the actions its listed streams name on `making_the_venv`. */
  const projectVenvSyncsUnderWay = (): ProjectVenvSyncOfAStreamAction[] =>
    [...projectLoadsQueued.values()].flatMap((description) =>
      description.state === "in_progress" && description.step === STREAM_ACTION_STEP_MAKING_THE_VENV && description.venv_sync !== null
        ? [{ action: description.action, project_directory: description.project_directory, venv_sync: structuredClone(description.venv_sync) }]
        : [],
    );

  const workOnTheMockProjectLoad = async (description: StreamActionDescription): Promise<void> => {
    const projectDirectory = description.project_directory;
    const project = projectFolders.get(projectDirectory);
    if (project === undefined) return;
    const isTheRuntimeStillUp = (): boolean => runtimeUpSinceMilliseconds !== null;
    const streamFixtures = project.streamNames.map((streamName) => createMockStreamRunFromAProjectFolder(fixtures.machine, projectDirectory, streamName, streamName));
    const listEveryStreamPreparingAt = (step: string, projectVenvSyncsJustEnded: ProjectVenvSyncOfAStreamAction[] = []): void => {
      for (const fixture of streamFixtures) {
        const streamId = fixture.listing.stream;
        if (!(listStreams() ?? []).some((listing) => listing.stream === streamId)) streamIdsRunFromTheWindow.push(streamId);
        loadedStreams.delete(streamId);
        forgottenStreamIds.delete(streamId);
        streamActionOfEachStream.set(streamId, description.action);
        listedStreamsNotLoaded.set(streamId, { ...fixture.listing, display_name: displayNamesRenamedTo.get(streamId) ?? fixture.listing.display_name, state: "preparing", node_count: null, action: description.action, step });
      }
      publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay(), project_venv_syncs_just_ended: projectVenvSyncsJustEnded });
    };
    await sleep(MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    if (description.state === "cancelled") return;
    Object.assign(description, { state: "in_progress", step: "reading_the_graph_documents" });
    listEveryStreamPreparingAt("reading_the_graph_documents");
    await sleep(MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    if (endTheLoadAtItsCancel(description)) return;
    if (!project.hasAPythonEnvironment) {
      Object.assign(description, { state: "in_progress", step: "making_the_venv" });
      listEveryStreamPreparingAt("making_the_venv");
      writeProjectRecord(projectDirectory, description.action, "info", `${projectDirectory}/.venv/bin/python does not start, so ${projectDirectory}/.venv is made again`);
      for (const venvSyncStage of MOCK_VENV_SYNC_STAGES) {
        description.venv_sync = structuredClone(venvSyncStage);
        publishStatus({ project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
        await sleep(MOCK_PYTHON_ENVIRONMENT_MILLISECONDS / MOCK_VENV_SYNC_STAGES.length);
        if (description.state === "cancelled" || streamActionsAskedToCancel.has(description.action)) break;
      }
      if (endTheLoadAtItsCancel(description)) return;
      if (isMakingThePythonEnvironmentRefused) {
        writeProjectRecord(projectDirectory, description.action, "error", MOCK_UV_SYNC_REFUSAL);
        description.streams = listEveryStreamOfTheProjectFailedOnItsSync(projectDirectory, streamFixtures).map((listing) => ({ stream: listing.stream, display_name: listing.display_name, state: "failed" }));
        Object.assign(description, { state: "failed", step: null, failed_because: MOCK_UV_SYNC_REFUSAL });
        publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
        return;
      }
      writeProjectRecord(projectDirectory, description.action, "info", `\`uv sync\` made ${projectDirectory}/.venv`);
      project.hasAPythonEnvironment = true;
    }
    const venvSyncJustEnded = description.venv_sync;
    for (const step of ["starting"]) {
      if (!isTheRuntimeStillUp()) {
        streamActionsAskedToCancel.delete(description.action);
        Object.assign(description, { state: "cancelled", step: null });
        return;
      }
      if (endTheLoadAtItsCancel(description)) return;
      Object.assign(description, { state: "in_progress", step });
      listEveryStreamPreparingAt(
        step,
        venvSyncJustEnded === null ? [] : [{ action: description.action, project_directory: projectDirectory, venv_sync: structuredClone(venvSyncJustEnded) }],
      );
      if (step === "starting") {
        description.streams = streamFixtures.map((fixture) => ({ stream: fixture.listing.stream, display_name: fixture.listing.display_name, state: null }));
      }
      await sleep(MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    }
    if (endTheLoadAtItsCancel(description)) return;
    const now = Date.now();
    description.streams = streamFixtures.map((fixture) => {
      const listing = fixture.listing;
      streamActionOfEachStream.delete(listing.stream);
      writeRuntimeRecord(listing, description.action, "info", `Loading the stream \`${listing.stream}\` from ${projectDirectory}`);
      if (listing.stream === mockStreamIdOf({ project_directory: projectDirectory, stream_name: MOCK_FAILING_STREAM_NAME })) {
        writeRuntimeRecord(listing, description.action, "error", fixtures.machine.cameraFailure);
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "failed", node_count: null, failed_because: fixtures.machine.cameraFailure, action: null, step: null });
        return { stream: listing.stream, display_name: listing.display_name, state: "failed" };
      }
      if (playbackAfterEachProjectLoad.get(description.action) === "held_stopped") {
        recordedFixturesNotLoaded.set(listing.stream, fixture);
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "stopped", failed_because: null, action: null, step: null });
        return { stream: listing.stream, display_name: listing.display_name, state: "stopped" };
      }
      loadStream(fixture, now, description.action);
      return { stream: listing.stream, display_name: listing.display_name, state: "running" };
    });
    Object.assign(description, { state: "done", step: null });
    publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
  };

  /** Writes `records` to the log of the project `projectDirectory`, its retention deleting the oldest past what it keeps, and pushes them to a follower. */
  const writeToTheProjectLog = (projectDirectory: string | null, records: ProjectLogRecord[]): void => {
    if (projectDirectory === null || records.length === 0) return;
    const projectLog = projectLogs.get(projectDirectory) ?? { records: [], recordsDeletedCount: 0 };
    const indexTheRecordsFollow = projectLog.recordsDeletedCount + projectLog.records.length;
    projectLog.records.push(...records);
    const recordsPastWhatItKeeps = projectLog.records.length - mostProjectLogRecordsKept;
    if (recordsPastWhatItKeeps > 0) {
      projectLog.records.splice(0, recordsPastWhatItKeeps);
      projectLog.recordsDeletedCount += recordsPastWhatItKeeps;
    }
    projectLogs.set(projectDirectory, projectLog);
    if (!projectsWhoseLogsAreFollowed.has(projectDirectory)) return;
    const pushed: ProjectLogRecordsPushed = {
      records: structuredClone(records),
      after: `1:${indexTheRecordsFollow}`,
      next_after: `1:${indexTheRecordsFollow + records.length}`,
      records_no_longer_held: false,
    };
    window.setTimeout(() => {
      for (const listener of projectLogRecordsWrittenListeners) listener(projectDirectory, pushed);
    }, 0);
  };

  /** Writes one record the runtime writes for `listing` outside any step, now, under `action`. */
  const writeRuntimeRecord = (listing: ListedStream, action: string, level: MockLogRecordDraft["level"], message: string): void => {
    const draft: MockLogRecordDraft = { millisecondsAfterLoad: 0, source: "rust", level, target: "streamlib_engine::core::runtime::stream_actions", message };
    writeToTheProjectLog(listing.location?.project_directory ?? null, [stampMockLogRecord(draft, action, Date.now(), listing.stream)]);
  };

  /** Writes one record of the project's own, such as the `.venv`'s making, now, under `action`. */
  const writeProjectRecord = (projectDirectory: string, action: string, level: MockLogRecordDraft["level"], message: string): void => {
    const draft: MockLogRecordDraft = { millisecondsAfterLoad: 0, source: "rust", level, target: "streamlib_engine::core::runtime::project_venv_made_with_the_runtime_unit_uv", message };
    writeToTheProjectLog(projectDirectory, [stampMockLogRecord(draft, action, Date.now(), null)]);
  };

  const holdRecords = (loadedStream: MockLoadedStream, drafts: MockLogRecordDraft[]): void => {
    const { listing } = loadedStream.fixture;
    writeToTheProjectLog(
      listing.location?.project_directory ?? null,
      drafts.map((draft) => stampMockLogRecord(draft, loadedStream.loadAction, loadedStream.loadedAtMilliseconds, listing.stream)),
    );
  };

  const advanceStreamLog = (loadedStream: MockLoadedStream, millisecondsSinceLoad: number): void => {
    const dueStartupDraftCount = loadedStream.unreleasedStartupDrafts.findIndex(
      (draft) => draft.millisecondsAfterLoad > millisecondsSinceLoad,
    );
    const releasedStartupDrafts = loadedStream.unreleasedStartupDrafts.splice(
      0,
      dueStartupDraftCount === -1 ? loadedStream.unreleasedStartupDrafts.length : dueStartupDraftCount,
    );
    const dueDrafts = [...releasedStartupDrafts, ...loadedStream.writeLiveLog(millisecondsSinceLoad)];
    holdRecords(
      loadedStream,
      dueDrafts.sort((first, second) => first.millisecondsAfterLoad - second.millisecondsAfterLoad),
    );
  };

  const loadStream = (fixture: MockStreamFixture, loadedAtMilliseconds: number, loadAction: string = nextStreamActionId()): void => {
    recordedFixturesNotLoaded.delete(fixture.listing.stream);
    streamActionOfEachStream.delete(fixture.listing.stream);
    const loadedStream: MockLoadedStream = {
      fixture,
      loadAction,
      loadedAtMilliseconds,
      unreleasedStartupDrafts: [...fixture.startupLog],
      writeLiveLog: fixture.createLiveLogWriter(),
    };
    loadedStreams.set(fixture.listing.stream, loadedStream);
    listedStreamsNotLoaded.delete(fixture.listing.stream);
    const alreadyRunningMilliseconds = Date.now() - loadedAtMilliseconds;
    for (let replayedMilliseconds = 0; replayedMilliseconds <= alreadyRunningMilliseconds; replayedMilliseconds += MOCK_LIVE_TICK_MILLISECONDS) {
      advanceStreamLog(loadedStream, replayedMilliseconds);
    }
    advanceStreamLog(loadedStream, alreadyRunningMilliseconds);
  };

  const runLiveTick = (): void => {
    if (runtimeUpSinceMilliseconds === null) return;
    const now = Date.now();
    let listingChanged = false;
    if (scenario === "loading" && !loadedStreams.has(mainStream.listing.stream) && now - runtimeUpSinceMilliseconds >= MOCK_MAIN_LOADING_MILLISECONDS) {
      loadStream(mainStream, now, listedStreamsNotLoaded.get(mainStream.listing.stream)?.action ?? undefined);
      listingChanged = true;
    }
    for (const loadedStream of loadedStreams.values()) advanceStreamLog(loadedStream, now - loadedStream.loadedAtMilliseconds);
    if (listingChanged) publishStatus({ streams: listStreams() });
  };

  const bringRuntimeUp = (): void => {
    const now = Date.now();
    runtimeUpSinceMilliseconds = now;
    loadedStreams.clear();
    if (scenario !== "empty" && scenario !== "not-listed") {
      const loadsAtTheRuntimesStart = (fixture: MockStreamFixture): boolean =>
        !forgottenStreamIds.has(fixture.listing.stream) && !recordedFixturesNotLoaded.has(fixture.listing.stream);
      const failedLobbyRecorder = listedStreamsNotLoaded.get(fixtures.failedLobbyRecorder.stream);
      if (failedLobbyRecorder?.state === "failed") {
        const loadAction = nextStreamActionId();
        writeRuntimeRecord(failedLobbyRecorder, loadAction, "info", `Loading the stream \`${failedLobbyRecorder.stream}\` from ${failedLobbyRecorder.location?.project_directory ?? ""}`);
        writeRuntimeRecord(failedLobbyRecorder, loadAction, "error", failedLobbyRecorder.failed_because ?? "");
      }
      if (scenario === "loading") {
        listedStreamsNotLoaded.set(mainStream.listing.stream, { ...mainStream.listing, state: "preparing", node_count: null, action: nextStreamActionId(), step: "reading_the_graph_documents" });
      } else if (loadsAtTheRuntimesStart(mainStream)) {
        loadStream(mainStream, now - mainStream.loadedForMillisecondsAtOpen);
      }
      const cameraStreamAtTheRuntimesStart = scenario === "camera-access" ? fixtures.cameraStreamWaitingForCameraAccess : fixtures.cameraStream;
      for (const fixture of [cameraStreamAtTheRuntimesStart, fixtures.recorderOfMainStream]) {
        if (loadsAtTheRuntimesStart(fixture)) loadStream(fixture, now - fixture.loadedForMillisecondsAtOpen);
      }
    }
    window.clearInterval(liveTickTimer);
    liveTickTimer = window.setInterval(runLiveTick, MOCK_LIVE_TICK_MILLISECONDS);
    publishStatus({ runtime_state: "running", runtime_of_another_age: mockTatolabOptions.runtimeOfAnotherAge, machine_name: fixtures.machine.name, streams: listStreams() });
  };

  const takeRuntimeDown = (statusChanges: Partial<TatolabStatus>): void => {
    runtimeUpSinceMilliseconds = null;
    loadedStreams.clear();
    window.clearInterval(liveTickTimer);
    publishStatus({ ...statusChanges, runtime_of_another_age: null, machine_name: null, streams: null });
  };

  const startRuntime = (): void => {
    publishStatus({ runtime_state: "starting", runtime_not_running_because: null, machine_name: null, streams: null });
    window.setTimeout(() => {
      if (mockStatus.runtime_state !== "starting") return;
      runtimeEngineStartedAtMilliseconds = Date.now();
      bringRuntimeUp();
    }, MOCK_RUNTIME_STARTUP_MILLISECONDS);
  };

  const noRuntimeAnswersRefusal = (): string => `no runtime answers at ${mockStatus.local_api_socket}: connect ENOENT ${mockStatus.local_api_socket}`;

  const loadedStreamOfTheId = (streamId: string): MockLoadedStream => {
    const loadedStream = loadedStreams.get(streamId);
    if (!loadedStream || mockStatus.runtime_state !== "running") {
      throw `no stream with the id \`${streamId}\` is loaded in this runtime. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}`;
    }
    return loadedStream;
  };

  const streamIdsListedForARefusal = (streamIds: Iterable<string>): string => [...streamIds].sort().join(", ") || "none";

  const recordedStreamIds = (): string[] => (listStreams() ?? []).map((listing) => listing.stream);

  const aStreamThisRuntimeDoesNotHoldRefusal = (streamId: string): string =>
    `Resource not found: no stream with the id \`${streamId}\` is loaded or recorded in this runtime. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}. Recorded: ${streamIdsListedForARefusal(recordedStreamIds())}`;

  /**
   * Shows `listing` under `state` at each of `steps` in turn, a beat each, as the runtime works on a queued stream
   * action, then calls `finish`; it stops at any step once another action is its stream's.
   */
  const workOnTheStreamAction = (listing: ListedStream, state: "preparing" | "stopping", action: string, steps: readonly string[], finish: () => void): void => {
    streamActionOfEachStream.set(listing.stream, action);
    const isStillTheStreamsAction = () => streamActionOfEachStream.get(listing.stream) === action && runtimeUpSinceMilliseconds !== null;
    const endTheStartAtItsCancel = (): boolean => {
      if (!streamActionsAskedToCancel.delete(action)) return false;
      streamActionOfEachStream.delete(listing.stream);
      endedStreamActions.set(action, "cancelled");
      writeRuntimeRecord(listing, action, "error", streamNotLoadedForTheCancelWords(listing.stream));
      listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "failed", node_count: null, failed_because: streamNotLoadedForTheCancelWords(listing.stream), action: null, step: null });
      publishStatus({ streams: listStreams() });
      return true;
    };
    steps.forEach((step, stepIndex) =>
      window.setTimeout(() => {
        if (!isStillTheStreamsAction() || endTheStartAtItsCancel()) return;
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state, node_count: null, failed_because: null, action, step });
        publishStatus({ streams: listStreams() });
      }, stepIndex * MOCK_STREAM_ACTION_STEP_MILLISECONDS),
    );
    window.setTimeout(() => {
      if (!isStillTheStreamsAction() || endTheStartAtItsCancel()) return;
      streamActionOfEachStream.delete(listing.stream);
      if (![...streamActionOfEachStream.values()].includes(action)) {
        unloadingStreamActions.delete(action);
        endedStreamActions.set(action, "done");
      }
      finish();
      publishStatus({ streams: listStreams() });
    }, steps.length * MOCK_STREAM_ACTION_STEP_MILLISECONDS);
  };

  /** The streams of the project in `projectDirectory` the mock holds loaded, playing or paused. */
  const loadedStreamsOfTheMockProjectIn = (projectDirectory: string): MockLoadedStream[] => [...loadedStreams.values()].filter((loadedStream) => loadedStream.fixture.listing.location?.project_directory === projectDirectory);

  /** The playback a `reload_project` of `projectDirectory` keeps: playing while a stream of it plays, held stopped otherwise. */
  const mockPlaybackAReloadOfTheProjectKeeps = (projectDirectory: string): MockProjectPlaybackAfterItsLoad =>
    loadedStreamsOfTheMockProjectIn(projectDirectory).length > 0 ? "playing" : "held_stopped";

  /** Lists `listing` under `state` with `action` queued and no step yet, as the runtime lists an action waiting its turn. */
  const queueTheStreamAction = (listing: ListedStream, state: "preparing" | "stopping", action: string): void => {
    listedStreamsNotLoaded.set(listing.stream, { ...listing, state, node_count: null, failed_because: null, action, step: null });
    publishStatus({ streams: listStreams() });
  };

  /** `pause_playback` or `resume_playback` as the runtime does it: every loaded stream of the project listed `state` at once, with no action queued. */
  const setTheMockPlaybackOfTheStreams = (loadedStreamsOfTheProject: readonly MockLoadedStream[], state: "paused" | "running"): void => {
    for (const loadedStream of loadedStreamsOfTheProject) loadedStream.fixture = { ...loadedStream.fixture, listing: { ...loadedStream.fixture.listing, state } };
    publishStatus({ streams: listStreams() });
  };

  /** `stop_playback` as the runtime does it: one action queued that stops every playing stream of the project, each recorded stopped; refused when none of them plays. */
  const stopMockProject = (projectDirectory: string): void => {
    const loadedStreamsOfTheProject = loadedStreamsOfTheMockProjectIn(projectDirectory).filter(({ fixture }) => fixture.listing.state !== "failed");
    if (loadedStreamsOfTheProject.length === 0) {
      throw `Runtime error: no stream of the project in ${projectDirectory} plays, so there is none to stop; \`start_playback\` plays it. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}. Recorded: ${streamIdsListedForARefusal(recordedStreamIds())}`;
    }
    const action = nextStreamActionId();
    unloadingStreamActions.set(action, "stop");
    for (const loadedStream of loadedStreamsOfTheProject) {
      const listing = loadedStream.fixture.listing;
      loadedStreams.delete(listing.stream);
      recordedFixturesNotLoaded.set(listing.stream, loadedStream.fixture);
      queueTheStreamAction(listing, "stopping", action);
      workOnTheStreamAction(listing, "stopping", action, ["stopping"], () => {
        writeRuntimeRecord(listing, action, "info", `Stopped the stream \`${listing.stream}\``);
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "stopped", failed_because: null, action: null, step: null });
      });
    }
  };

  /** `remove_project` as the runtime does it: every stream of the project stops if loaded and is forgotten; refused for a folder the runtime holds no stream of. */
  const removeMockProject = (projectDirectory: string): void => {
    const streamsOfTheProject = (listStreams() ?? []).filter((listing) => listing.location?.project_directory === projectDirectory);
    if (streamsOfTheProject.length === 0) {
      throw `Resource not found: this runtime holds no stream of the project in ${projectDirectory}, so there is none to remove. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}. Recorded: ${streamIdsListedForARefusal(recordedStreamIds())}`;
    }
    const action = nextStreamActionId();
    unloadingStreamActions.set(action, "remove");
    for (const listing of streamsOfTheProject) {
      loadedStreams.delete(listing.stream);
      queueTheStreamAction(listing, "stopping", action);
      workOnTheStreamAction(listing, "stopping", action, ["stopping"], () => {
        writeRuntimeRecord(listing, action, "info", `Removed the stream \`${listing.stream}\``);
        listedStreamsNotLoaded.delete(listing.stream);
        recordedFixturesNotLoaded.delete(listing.stream);
        forgottenStreamIds.add(listing.stream);
      });
    }
  };

  /** `logs` as the runtime answers it: the project's records after the cursor `after`, from its first record kept when `null`, and before the cursor `until`, narrowed as asked. */
  const readMockProjectLog = (projectDirectory: string, narrowing: { stream: string | null; action: string | null }, after: string | null, until: string | null): ProjectLogRecordsPage => {
    const projectLog = projectLogs.get(projectDirectory);
    if (projectLog === undefined && !(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) {
      throw `Resource not found: this runtime holds no stream of the project in ${projectDirectory}`;
    }
    const { records, recordsDeletedCount } = projectLog ?? { records: [], recordsDeletedCount: 0 };
    const askedAfterIndex = after === null ? 0 : Number(after.split(":")[1] ?? "0");
    const firstIndexRead = Math.max(askedAfterIndex, recordsDeletedCount);
    const indexReadUntil = until === null ? Infinity : Number(until.split(":")[1] ?? "0");
    const recordsOfThePage: ProjectLogRecord[] = [];
    let nextIndex = firstIndexRead;
    for (; nextIndex < recordsDeletedCount + records.length && nextIndex < indexReadUntil && recordsOfThePage.length < MOCK_RECORDS_PAGE_SIZE; nextIndex++) {
      const record = records[nextIndex - recordsDeletedCount];
      if (record === undefined) continue;
      if ((narrowing.stream === null || record.stream === narrowing.stream) && (narrowing.action === null || record.action === narrowing.action)) recordsOfThePage.push(record);
    }
    return {
      project_directory: projectDirectory,
      records: structuredClone(recordsOfThePage),
      next_after: `1:${nextIndex}`,
      records_no_longer_held: askedAfterIndex < recordsDeletedCount,
    };
  };

  /** `set_stream_display_name` as the runtime does it: refused for a name that shows nothing or a stream it does not hold, else shown under the new name. */
  const renameMockStream = (streamId: string, displayName: string): void => {
    if (displayName.trim() === "") {
      throw `set_stream_display_name failed: ${JSON.stringify(displayName)} cannot be a stream's display name: it shows nothing`;
    }
    if (!(listStreams() ?? []).some((listing) => listing.stream === streamId)) throw aStreamThisRuntimeDoesNotHoldRefusal(streamId);
    displayNamesRenamedTo.set(streamId, displayName);
    publishStatus({ streams: listStreams() });
  };

  /** `create_stream` as the runtime does it in the open project: refused for a name that shows nothing, else a new stream asset loaded as a stream of the project, answered by its UUID. */
  const createMockStreamInTheOpenProject = (displayName: string): StreamAssetCreated => {
    if (openProjectReading.kind !== "read") throw "No project is open in this window.";
    if (displayName.trim() === "") throw `create_stream failed: ${JSON.stringify(displayName)} cannot be a stream's display name: it shows nothing`;
    const projectDirectory = openProjectReading.open_project.project.folder;
    const streamNamesHeld = projectFolders.get(projectDirectory)?.streamNames ?? [];
    const streamName = streamDocumentNameNumberedPast(streamDocumentNameOfTheDisplayName(displayName), (candidateName) => streamNamesHeld.includes(candidateName));
    const fixture = createMockStreamRunFromAProjectFolder(fixtures.machine, projectDirectory, streamName, displayName);
    projectFolders.set(projectDirectory, { ...(projectFolders.get(projectDirectory) ?? { hasAPythonEnvironment: true }), streamNames: [...(projectFolders.get(projectDirectory)?.streamNames ?? []), streamName] });
    streamIdsRunFromTheWindow.push(fixture.listing.stream);
    forgottenStreamIds.delete(fixture.listing.stream);
    loadStream(fixture, Date.now());
    publishStatus({ streams: listStreams() });
    if (fixture.listing.location === null) throw `create_stream failed: the mock lists ${displayName} under no project`;
    return { stream_asset: fixture.listing.location.stream_asset };
  };

  /** `delete_stream` as the runtime does it: refused for a stream it does not hold, else the stream unloaded and forgotten. */
  const deleteMockStream = (streamId: string): void => {
    const listing = (listStreams() ?? []).find((candidate) => candidate.stream === streamId);
    if (listing === undefined) throw aStreamThisRuntimeDoesNotHoldRefusal(streamId);
    const projectDirectory = listing.location?.project_directory;
    const project = projectDirectory === undefined ? undefined : projectFolders.get(projectDirectory);
    if (projectDirectory !== undefined && project !== undefined) {
      projectFolders.set(projectDirectory, { ...project, streamNames: project.streamNames.filter((streamName) => mockStreamIdOf({ project_directory: projectDirectory, stream_name: streamName }) !== streamId) });
    }
    loadedStreams.delete(streamId);
    listedStreamsNotLoaded.delete(streamId);
    recordedFixturesNotLoaded.delete(streamId);
    forgottenStreamIds.add(streamId);
    publishStatus({ streams: listStreams() });
  };

  /** `fixture`'s graph as the runtime renders it `millisecondsSinceSettled` after its nodes settled, or with its nodes not started while that is `null`. */
  const graphOfTheFixture = (fixture: MockStreamFixture, millisecondsSinceSettled: number | null): StreamGraph =>
    mockStreamGraphOf(fixture.listing, fixtures.machine.name, fixture.graph, { hasSettled: (millisecondsSinceSettled ?? -1) >= 0, secondsSinceSettled: Math.max(0, millisecondsSinceSettled ?? 0) / 1000 });
  const graphOfLoadedStream = (loadedStream: MockLoadedStream): StreamGraph => graphOfTheFixture(loadedStream.fixture, Date.now() - loadedStream.loadedAtMilliseconds - MOCK_STREAM_SETTLE_MILLISECONDS);
  /** The graph of the stream `streamId` as the runtime answers it: a loaded one's running graph, or the saved graph of one it holds not loaded. */
  const graphOfTheStream = (streamId: string): StreamGraph => {
    const fixtureNotLoaded = loadedStreams.has(streamId) || mockStatus.runtime_state !== "running" ? undefined : recordedFixturesNotLoaded.get(streamId);
    return fixtureNotLoaded === undefined ? graphOfLoadedStream(loadedStreamOfTheId(streamId)) : graphOfTheFixture(fixtureNotLoaded, null);
  };

  /** The project folder the mock runtime lists for the stream `streamId`, as the main process looks it up before opening it. */
  const listedProjectFolderOf = (streamId: string): string => {
    const listedStream = listStreams()?.find((listing) => listing.stream === streamId) ?? null;
    if (listedStream === null) throw `The runtime does not list ${streamId}, so Tato Studio has no project folder to open.`;
    if (listedStream.location === null) throw `The runtime lists no project folder for ${listedStream.display_name}.`;
    return listedStream.location.project_directory;
  };

  const downloadTheNewerVersion = (percent: number): void => {
    if (percent >= 100) {
      publishStatus({ app_update: { kind: "ready_to_restart", version: MOCK_NEWER_TATOLAB_VERSION }, app_update_announcement: { kind: "update_ready", version: MOCK_NEWER_TATOLAB_VERSION } });
      return;
    }
    publishStatus({ app_update: { kind: "downloading", version: MOCK_NEWER_TATOLAB_VERSION, percent } });
    window.setTimeout(() => downloadTheNewerVersion(Math.min(100, percent + MOCK_UPDATE_DOWNLOAD_STEP_PERCENT)), MOCK_UPDATE_DOWNLOAD_STEP_MILLISECONDS);
  };

  const finishTheUpdateCheck = (): void => {
    switch (appUpdateScenario) {
      case "up-to-date":
        publishStatus({ app_update: { kind: "up_to_date" } });
        return;
      case "failed":
        publishStatus({ app_update: { kind: "failed", refusal: "net::ERR_NAME_NOT_RESOLVED" } });
        return;
      case "download":
        publishStatus({ app_update: { kind: "available", version: MOCK_NEWER_TATOLAB_VERSION, delivery: "open_the_download" } });
        return;
      case "available":
      case "ready":
        downloadTheNewerVersion(0);
        return;
    }
  };

  if (mockStatus.runtime_state === "running") bringRuntimeUp();
  // The app starts its runtime as it opens, so a starting runtime comes up as the real one does.
  if (scenario === "starting") startRuntime();
  if (isTheOpenProjectsOpenRefused && openProjectReading.kind === "read") {
    const projectDirectory = openProjectReading.open_project.project.folder;
    queueAMockProjectLoadThatFails(projectDirectory, "open", mockOpenRefusedForAnEarlierRuntimesRecord(projectDirectory));
  }

  return {
    fixtures,
    assetsChangedWhileTheMockRuns,
    statusListeners,
    openProjectListeners,
    menusKeptForTheSystemMenuBar,
    chooseTheSystemMenuBarEntryOnceOffered,
    mockStudioViewsListedInTheProject,
    workspaceDependencies,
    coverImageUrlsByFolder,
    mockFoldersOnDisk,
    rememberTheProjectAsOpenedLast,
    openTheProjectInTheMock,
    mockProjectFiles,
    languageServerEventListeners,
    mockLanguageServersBySession,
    mockPortViewers,
    graphTransactionsCommittedByIdempotencyKey,
    mockProjectTransactions,
    refuseWithoutAnOpenProject,
    loadedStreams,
    graphTargetsOfTheOpenProject,
    savedGraphTargetsOfTheOpenProject,
    commitGraphActions,
    graphEditGrounds,
    nodeTypesTheProjectGains,
    recordedNodeTypes,
    whyTheUndoIsRefused,
    applyingItsGraphOperations,
    streamsWhoseGraphsAreFollowed,
    streamGraphChangedListeners,
    pushEveryFollowedStreamGraphChanged,
    pushEachInputValueChanged,
    projectsWhoseLogsAreFollowed,
    projectLogRecordsWrittenListeners,
    publishStatus,
    listStreams,
    projectFolders,
    foldersHandedToTheWindow,
    projectFolderTheDialogChooses,
    refuseAFolderNotHandedToTheWindow,
    newProjectFolderTheRuntimeDraws,
    projectLoadsQueued,
    notHeldWords,
    cancelMockStreamAction,
    queueAMockProjectLoadThatFails,
    queueAMockProjectLoad,
    takeRuntimeDown,
    startRuntime,
    noRuntimeAnswersRefusal,
    loadedStreamOfTheId,
    streamIdsListedForARefusal,
    loadedStreamsOfTheMockProjectIn,
    mockPlaybackAReloadOfTheProjectKeeps,
    setTheMockPlaybackOfTheStreams,
    stopMockProject,
    removeMockProject,
    readMockProjectLog,
    renameMockStream,
    createMockStreamInTheOpenProject,
    deleteMockStream,
    graphOfLoadedStream,
    graphOfTheStream,
    listedProjectFolderOf,
    downloadTheNewerVersion,
    finishTheUpdateCheck,
    isTheTerminalMissing,
    isTheLogFolderMissing,
    isNoProjectLoadHeld,
    doesTheRuntimeKeepNoOwnLog,
    isTheRuntimeRestartRefused,
    streamPageRequestedByANotification,
    mockTatolabOptions,
    get systemMenuBarEntryChosenListener() {
      return systemMenuBarEntryChosenListener;
    },
    set systemMenuBarEntryChosenListener(systemMenuBarEntryChosenListenerNow) {
      systemMenuBarEntryChosenListener = systemMenuBarEntryChosenListenerNow;
    },
    get openProjectReading() {
      return openProjectReading;
    },
    set openProjectReading(openProjectReadingNow) {
      openProjectReading = openProjectReadingNow;
    },
    get recentProjects() {
      return recentProjects;
    },
    set recentProjects(recentProjectsNow) {
      recentProjects = recentProjectsNow;
    },
    get languageServerSessionCount() {
      return languageServerSessionCount;
    },
    set languageServerSessionCount(languageServerSessionCountNow) {
      languageServerSessionCount = languageServerSessionCountNow;
    },
    get mockStatus() {
      return mockStatus;
    },
    set mockStatus(mockStatusNow) {
      mockStatus = mockStatusNow;
    },
    get runtimeEngineStartedAtMilliseconds() {
      return runtimeEngineStartedAtMilliseconds;
    },
    set runtimeEngineStartedAtMilliseconds(runtimeEngineStartedAtMillisecondsNow) {
      runtimeEngineStartedAtMilliseconds = runtimeEngineStartedAtMillisecondsNow;
    },
  };
}

/** What each area of the mock backend reads and changes; a field that was a variable of the mock is read and written live. */
export type MockTatolabSimulation = ReturnType<typeof createMockTatolabSimulation>;
