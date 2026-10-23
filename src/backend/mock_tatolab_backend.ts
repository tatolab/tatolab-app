// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  createMockStreamFixtures,
  type MockLiveLogWriter,
  type MockLogRecordDraft,
  type MockMachine,
  type MockStreamFixture,
  stampMockLogRecord,
} from "./mock_stream_fixtures";
import type { TatolabBackend } from "./tatolab_backend";
import type {
  ListedStream,
  StreamGraphSummary,
  StreamLogRecord,
  StreamLogRecordsPage,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
} from "./tatolab_backend_contract";

/**
 * Browser-only stand-ins for the app backend, picked with `?state=`. `approval`, `missing` and `not-registered` exist
 * only on macOS.
 */
export type MockTatolabScenario =
  | "running"
  | "empty"
  | "loading"
  | "node-error"
  | "not-listed"
  | "starting"
  | "stopped"
  | "approval"
  | "missing"
  | "not-registered"
  | "setup"
  | "unreachable";

const MOCK_TATOLAB_SCENARIOS: readonly MockTatolabScenario[] = [
  "running",
  "empty",
  "loading",
  "node-error",
  "not-listed",
  "starting",
  "stopped",
  "approval",
  "missing",
  "not-registered",
  "setup",
  "unreachable",
];

const MACOS_ONLY_SCENARIOS: readonly MockTatolabScenario[] = ["approval", "missing", "not-registered"];

const MOCK_COMMAND_LATENCY_MILLISECONDS = 30;
const MOCK_RUNTIME_STARTUP_MILLISECONDS = 2400;
const MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS = 1600;
/** How long the mock administrator takes to answer the prompt an uninstall shows, long enough to see the sheet wait. */
const MOCK_UNINSTALL_ADMINISTRATOR_PROMPT_MILLISECONDS = 4000;
const MOCK_LIVE_TICK_MILLISECONDS = 700;
const MOCK_STREAM_SETTLE_MILLISECONDS = 1600;
/** How long `main` stays listed but not loaded in the `loading` scenario. */
const MOCK_MAIN_LOADING_MILLISECONDS = 9000;
const MOCK_ATTACHED_DEMO_ATTACHED_MILLISECONDS = 66_000;
const MOCK_ATTACHED_DEMO_DETACHED_MILLISECONDS = 12_000;
const MOCK_RECORDS_PAGE_SIZE = 500;
const MOST_MOCK_RECORDS_HELD = 4000;

/**
 * What a check for updates finds in the mock, picked with `?update=`: nothing newer (the default), a newer
 * version installed in place (`available`), one whose download opens (`download`), or a check that fails.
 */
export type MockTatolabAppUpdateScenario = "up-to-date" | "available" | "download" | "failed";

const MOCK_TATOLAB_APP_UPDATE_SCENARIOS: readonly MockTatolabAppUpdateScenario[] = ["up-to-date", "available", "download", "failed"];

/** The newer version the mock's feed offers. */
const MOCK_NEWER_TATOLAB_VERSION = "0.46.0";
const MOCK_UPDATE_CHECK_MILLISECONDS = 900;
const MOCK_UPDATE_DOWNLOAD_STEP_MILLISECONDS = 250;
const MOCK_UPDATE_DOWNLOAD_STEP_PERCENT = 7;

/** What the page's query asks of the mock. */
export interface MockTatolabOptions {
  scenario: MockTatolabScenario;
  platform: TatolabPlatform;
  /** `?uninstall=cancel`: the administrator cancels the prompt an uninstall shows, so the uninstall is refused. */
  isUninstallPromptCancelled: boolean;
  appUpdateScenario: MockTatolabAppUpdateScenario;
  /** `?stop_not_recorded=<stream>`: stopping that kept stream unloads it but cannot write its record, as when the runtime's state directory refuses the write. */
  streamWhoseStopIsNotRecorded: string | null;
}

/**
 * `?platform=` (`macos` unless it names `linux`), the scenario `?state=` names (`running` when it names none this
 * mock knows on that platform), `?uninstall=`, and `?update=` (`up-to-date` when it names none this mock knows).
 */
export function readMockTatolabOptions(pageQuery: URLSearchParams): MockTatolabOptions {
  const platform: TatolabPlatform = pageQuery.get("platform") === "linux" ? "linux" : "macos";
  const requestedScenario = pageQuery.get("state");
  const scenario = MOCK_TATOLAB_SCENARIOS.find(
    (knownScenario) =>
      knownScenario === requestedScenario && !(platform === "linux" && MACOS_ONLY_SCENARIOS.includes(knownScenario)),
  );
  const requestedAppUpdateScenario = pageQuery.get("update");
  const appUpdateScenario = MOCK_TATOLAB_APP_UPDATE_SCENARIOS.find((knownScenario) => knownScenario === requestedAppUpdateScenario);
  return {
    scenario: scenario ?? "running",
    platform,
    isUninstallPromptCancelled: pageQuery.get("uninstall") === "cancel",
    appUpdateScenario: appUpdateScenario ?? "up-to-date",
    streamWhoseStopIsNotRecorded: pageQuery.get("stop_not_recorded"),
  };
}

const LINUX_INSTALL_COMMAND = "curl -fsSL https://get.tatolab.com/install.sh | sh";
const LINUX_UNINSTALL_COMMAND = "curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --uninstall";

interface MockLoadedStream {
  fixture: MockStreamFixture;
  streamInstance: string;
  loadedAtMilliseconds: number;
  unreleasedStartupDrafts: MockLogRecordDraft[];
  writeLiveLog: MockLiveLogWriter;
  heldRecords: StreamLogRecord[];
  nextSequence: number;
}

/** Where the mock's updates stand as the page opens: a newer version already found by the launch check in `available` and `download`. */
function initialMockAppUpdateState(appUpdateScenario: MockTatolabAppUpdateScenario): TatolabAppUpdateState {
  switch (appUpdateScenario) {
    case "available":
      return { kind: "available", version: MOCK_NEWER_TATOLAB_VERSION, delivery: "install_and_relaunch" };
    case "download":
      return { kind: "available", version: MOCK_NEWER_TATOLAB_VERSION, delivery: "open_the_download" };
    case "up-to-date":
    case "failed":
      return { kind: "not_checked" };
  }
}

function initialMockStatus(
  scenario: MockTatolabScenario,
  platform: TatolabPlatform,
  machine: MockMachine,
  appUpdateScenario: MockTatolabAppUpdateScenario,
): TatolabStatus {
  const runningStatus: TatolabStatus = {
    app_version: "0.45.0",
    platform,
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: machine.name,
    streams: [],
    machine_setup_state: "complete",
    command_line_tool_linked_at: machine.commandLineToolLinkedAt,
    app_update: initialMockAppUpdateState(appUpdateScenario),
  };
  switch (scenario) {
    case "running":
    case "empty":
    case "loading":
    case "node-error":
    case "not-listed":
      return runningStatus;
    case "starting":
      return { ...runningStatus, runtime_state: "starting", machine_name: null, streams: null };
    case "stopped":
      return {
        ...runningStatus,
        run_tatolab: false,
        runtime_agent: "not_registered",
        runtime_state: "stopped",
        machine_name: null,
        streams: null,
      };
    case "approval":
      return { ...runningStatus, runtime_agent: "requires_approval", runtime_state: "stopped", machine_name: null, streams: null };
    case "missing":
      return { ...runningStatus, runtime_agent: "not_found", runtime_state: "stopped", machine_name: null, streams: null };
    case "not-registered":
      return { ...runningStatus, runtime_agent: "not_registered", runtime_state: "stopped", machine_name: null, streams: null };
    case "unreachable":
      return { ...runningStatus, runtime_state: "unreachable", streams: null };
    case "setup":
      if (platform === "linux") {
        return {
          ...runningStatus,
          run_tatolab: false,
          runtime_agent: "not_found",
          runtime_state: "stopped",
          machine_name: null,
          streams: null,
          command_line_tool_linked_at: null,
        };
      }
      return {
        ...runningStatus,
        runtime_agent: "not_registered",
        runtime_state: "stopped",
        machine_name: null,
        streams: null,
        machine_setup_state: "needs_administrator",
        command_line_tool_linked_at: null,
      };
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** A backend whose commands change its own state and whose streams log on their own, so the window works in a browser. */
export function createMockTatolabBackend({
  scenario,
  platform,
  isUninstallPromptCancelled,
  appUpdateScenario,
  streamWhoseStopIsNotRecorded,
}: MockTatolabOptions): TatolabBackend {
  const fixtures = createMockStreamFixtures(platform);
  const mainStream = scenario === "node-error" ? fixtures.mainStreamWithDisplayWindowInError : fixtures.mainStream;
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const loadedStreams = new Map<string, MockLoadedStream>();
  const listedStreamsNotLoaded = new Map<string, ListedStream>([
    [fixtures.stoppedPatternTwo.name, fixtures.stoppedPatternTwo],
    [fixtures.failedLobbyRecorder.name, fixtures.failedLobbyRecorder],
  ]);
  /** Kept streams not loaded that `start_stream` can load: `pattern-two`, and each one stopped from the window. */
  const keptFixturesNotLoaded = new Map<string, MockStreamFixture>([[fixtures.patternTwoStream.listing.name, fixtures.patternTwoStream]]);
  const forgottenStreamNames = new Set<string>();
  /** Kept streams unloaded by a stop the mock could not record: not loaded now, loaded again when the mock runtime restarts. */
  const streamNamesUnloadedButNotRecordedStopped = new Set<string>();
  /** Whether the attached demo was stopped or removed, which ends its `tatolab dev` session for good. */
  let hasTheAttachedDemoSessionEnded = false;
  let mockStatus = initialMockStatus(scenario, platform, fixtures.machine, appUpdateScenario);
  let isLoginItemsApproved = scenario !== "approval";
  let runtimeUpSinceMilliseconds: number | null = null;
  let loadedStreamInstanceCount = 3;
  let liveTickTimer: number | undefined;

  const publishStatus = (statusChanges: Partial<TatolabStatus>): void => {
    mockStatus = { ...mockStatus, ...statusChanges };
    for (const statusListener of statusListeners) statusListener(structuredClone(mockStatus));
  };

  const listStreams = (): ListedStream[] | null => {
    if (scenario === "not-listed") return null;
    if (scenario === "empty") return [];
    return fixtures.listingOrder
      .map((streamName) => loadedStreams.get(streamName)?.fixture.listing ?? listedStreamsNotLoaded.get(streamName) ?? null)
      .filter((listing): listing is ListedStream => listing !== null);
  };

  const holdRecords = (loadedStream: MockLoadedStream, drafts: MockLogRecordDraft[]): void => {
    for (const draft of drafts) {
      loadedStream.heldRecords.push(stampMockLogRecord(draft, loadedStream.nextSequence, loadedStream.loadedAtMilliseconds));
      loadedStream.nextSequence += 1;
    }
    if (loadedStream.heldRecords.length > MOST_MOCK_RECORDS_HELD) {
      loadedStream.heldRecords.splice(0, loadedStream.heldRecords.length - MOST_MOCK_RECORDS_HELD);
    }
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

  const loadStream = (fixture: MockStreamFixture, loadedAtMilliseconds: number): void => {
    loadedStreamInstanceCount += 1;
    streamNamesUnloadedButNotRecordedStopped.delete(fixture.listing.name);
    const loadedStream: MockLoadedStream = {
      fixture,
      streamInstance: String(loadedStreamInstanceCount),
      loadedAtMilliseconds,
      unreleasedStartupDrafts: [...fixture.startupLog],
      writeLiveLog: fixture.createLiveLogWriter(),
      heldRecords: [],
      nextSequence: 1,
    };
    loadedStreams.set(fixture.listing.name, loadedStream);
    listedStreamsNotLoaded.delete(fixture.listing.name);
    const alreadyRunningMilliseconds = Date.now() - loadedAtMilliseconds;
    for (let replayedMilliseconds = 0; replayedMilliseconds <= alreadyRunningMilliseconds; replayedMilliseconds += MOCK_LIVE_TICK_MILLISECONDS) {
      advanceStreamLog(loadedStream, replayedMilliseconds);
    }
    advanceStreamLog(loadedStream, alreadyRunningMilliseconds);
  };

  const isAttachedDemoAttachedAt = (millisecondsSinceRuntimeUp: number): boolean => {
    const cycleMilliseconds = MOCK_ATTACHED_DEMO_ATTACHED_MILLISECONDS + MOCK_ATTACHED_DEMO_DETACHED_MILLISECONDS;
    return millisecondsSinceRuntimeUp % cycleMilliseconds < MOCK_ATTACHED_DEMO_ATTACHED_MILLISECONDS;
  };

  const runLiveTick = (): void => {
    if (runtimeUpSinceMilliseconds === null) return;
    const now = Date.now();
    let listingChanged = false;
    if ((scenario === "running" || scenario === "node-error" || scenario === "loading") && !hasTheAttachedDemoSessionEnded) {
      const attachedDemoName = fixtures.attachedDemoStream.listing.name;
      const shouldBeAttached = isAttachedDemoAttachedAt(now - runtimeUpSinceMilliseconds);
      const isAttached = loadedStreams.has(attachedDemoName);
      if (shouldBeAttached && !isAttached) loadStream(fixtures.attachedDemoStream, now);
      if (!shouldBeAttached && isAttached) loadedStreams.delete(attachedDemoName);
      listingChanged = shouldBeAttached !== isAttached;
    }
    if (scenario === "loading" && !loadedStreams.has(mainStream.listing.name) && now - runtimeUpSinceMilliseconds >= MOCK_MAIN_LOADING_MILLISECONDS) {
      loadStream(mainStream, now);
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
        !forgottenStreamNames.has(fixture.listing.name) &&
        (!keptFixturesNotLoaded.has(fixture.listing.name) || streamNamesUnloadedButNotRecordedStopped.has(fixture.listing.name));
      if (scenario === "loading") {
        listedStreamsNotLoaded.set(mainStream.listing.name, { ...mainStream.listing, node_count: null });
      } else if (loadsAtTheRuntimesStart(mainStream)) {
        loadStream(mainStream, now - mainStream.loadedForMillisecondsAtOpen);
      }
      if (loadsAtTheRuntimesStart(fixtures.cameraStream)) loadStream(fixtures.cameraStream, now - fixtures.cameraStream.loadedForMillisecondsAtOpen);
      if (!hasTheAttachedDemoSessionEnded) {
        loadStream(fixtures.attachedDemoStream, now - fixtures.attachedDemoStream.loadedForMillisecondsAtOpen);
      }
    }
    window.clearInterval(liveTickTimer);
    liveTickTimer = window.setInterval(runLiveTick, MOCK_LIVE_TICK_MILLISECONDS);
    publishStatus({ runtime_state: "running", machine_name: fixtures.machine.name, streams: listStreams() });
  };

  const takeRuntimeDown = (statusChanges: Partial<TatolabStatus>): void => {
    runtimeUpSinceMilliseconds = null;
    loadedStreams.clear();
    window.clearInterval(liveTickTimer);
    publishStatus({ ...statusChanges, machine_name: null, streams: null });
  };

  const startRuntime = (): void => {
    publishStatus({ run_tatolab: true, runtime_agent: "enabled", runtime_state: "starting", machine_name: null, streams: null });
    window.setTimeout(() => {
      if (mockStatus.run_tatolab && mockStatus.runtime_state === "starting") bringRuntimeUp();
    }, MOCK_RUNTIME_STARTUP_MILLISECONDS);
  };

  const loadedStreamNamed = (streamName: string): MockLoadedStream => {
    const loadedStream = loadedStreams.get(streamName);
    if (!loadedStream || mockStatus.runtime_state !== "running") {
      const loadedNames = [...loadedStreams.keys()].sort().join(", ") || "none";
      throw `no stream named \`${streamName}\` is loaded in this runtime. Loaded: ${loadedNames}`;
    }
    return loadedStream;
  };

  const streamNamesListedForARefusal = (streamNames: Iterable<string>): string => [...streamNames].sort().join(", ") || "none";

  const aStreamThisRuntimeDoesNotHoldRefusal = (streamName: string): string =>
    `Resource not found: no stream named \`${streamName}\` is loaded or kept in this runtime. Loaded: ${streamNamesListedForARefusal(loadedStreams.keys())}. Kept: ${streamNamesListedForARefusal(listedStreamsNotLoaded.keys())}`;

  /** `stop_stream` as the runtime does it: a loaded stream unloads, a kept one is recorded stopped, an attached one's session ends. */
  const stopMockStream = (streamName: string): string | null => {
    const loadedStream = loadedStreams.get(streamName);
    const listingNotLoaded = listedStreamsNotLoaded.get(streamName);
    if (loadedStream && loadedStream.fixture.listing.state === "kept" && streamName === streamWhoseStopIsNotRecorded) {
      loadedStreams.delete(streamName);
      keptFixturesNotLoaded.set(streamName, loadedStream.fixture);
      streamNamesUnloadedButNotRecordedStopped.add(streamName);
      listedStreamsNotLoaded.set(streamName, { ...loadedStream.fixture.listing, node_count: null });
      publishStatus({ streams: listStreams() });
      return `Runtime error: the kept record of \`${streamName}\` could not be written: Permission denied (os error 13)`;
    }
    if (loadedStream) {
      loadedStreams.delete(streamName);
      if (loadedStream.fixture.listing.state === "attached") {
        hasTheAttachedDemoSessionEnded = true;
      } else {
        keptFixturesNotLoaded.set(streamName, loadedStream.fixture);
        listedStreamsNotLoaded.set(streamName, { ...loadedStream.fixture.listing, state: "stopped", node_count: null, failed_because: null });
      }
    } else if (listingNotLoaded?.state === "failed") {
      throw `Runtime error: the kept stream \`${streamName}\` is failed, so it is not loaded to stop: ${listingNotLoaded.failed_because ?? ""}. \`start\` retries it, \`rm\` forgets it`;
    } else if (listingNotLoaded?.state === "stopped") {
      throw `Runtime error: the kept stream \`${streamName}\` is already stopped; \`start\` loads it again`;
    } else if (listingNotLoaded) {
      listedStreamsNotLoaded.set(streamName, { ...listingNotLoaded, state: "stopped", node_count: null });
    } else {
      throw aStreamThisRuntimeDoesNotHoldRefusal(streamName);
    }
    publishStatus({ streams: listStreams() });
    return null;
  };

  /** `start_stream` as the runtime does it: a stopped kept stream loads; a failed one is retried, and the lobby recorder's camera is still missing. */
  const startMockStream = (streamName: string): null => {
    const loadedStream = loadedStreams.get(streamName);
    if (loadedStream) {
      throw `Runtime error: the stream \`${streamName}\` is already loaded in this runtime, ${loadedStream.fixture.listing.state}; only a kept stream that is not loaded starts`;
    }
    const listingNotLoaded = listedStreamsNotLoaded.get(streamName);
    if (!listingNotLoaded) {
      throw `Resource not found: no kept stream named \`${streamName}\` is in this runtime, so there is none to start; an attached stream is loaded again with \`run\`. Kept: ${streamNamesListedForARefusal(listedStreamsNotLoaded.keys())}`;
    }
    const fixture = keptFixturesNotLoaded.get(streamName);
    if (!fixture) {
      const retryRefusal = fixtures.machine.cameraFailure;
      listedStreamsNotLoaded.set(streamName, { ...listingNotLoaded, state: "failed", failed_because: `\`start\` retried it, and it did not load: ${retryRefusal}` });
      publishStatus({ streams: listStreams() });
      throw retryRefusal;
    }
    keptFixturesNotLoaded.delete(streamName);
    loadStream(fixture, Date.now());
    publishStatus({ streams: listStreams() });
    return null;
  };

  /** `remove_stream` as the runtime does it: unloaded if loaded, and forgotten. */
  const removeMockStream = (streamName: string): null => {
    const wasLoaded = loadedStreams.delete(streamName);
    const wasListedNotLoaded = listedStreamsNotLoaded.delete(streamName);
    if (!wasLoaded && !wasListedNotLoaded) throw aStreamThisRuntimeDoesNotHoldRefusal(streamName);
    keptFixturesNotLoaded.delete(streamName);
    forgottenStreamNames.add(streamName);
    if (streamName === fixtures.attachedDemoStream.listing.name) hasTheAttachedDemoSessionEnded = true;
    publishStatus({ streams: listStreams() });
    return null;
  };

  const graphOfLoadedStream = (loadedStream: MockLoadedStream): StreamGraphSummary => {
    const fixtureGraph = loadedStream.fixture.graph;
    const hasSettled = Date.now() - loadedStream.loadedAtMilliseconds >= MOCK_STREAM_SETTLE_MILLISECONDS;
    if (hasSettled) return structuredClone(fixtureGraph);
    return {
      ...structuredClone(fixtureGraph),
      nodes: fixtureGraph.nodes.map((node) => ({ ...node, state: "Pending" })),
      links: fixtureGraph.links.map((link) => ({ ...link, state: "pending" })),
    };
  };

  const downloadTheNewerVersion = (percent: number): void => {
    if (percent >= 100) {
      publishStatus({ app_update: { kind: "installing", version: MOCK_NEWER_TATOLAB_VERSION } });
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
        downloadTheNewerVersion(0);
        return;
    }
  };

  if (mockStatus.runtime_state === "running") bringRuntimeUp();

  return {
    getTatolabStatus: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(mockStatus);
    },
    setRunTatolab: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (platform === "linux" && mockStatus.runtime_agent === "not_found") {
        throw `tatolabd.service is not installed; install the runtime with \`${LINUX_INSTALL_COMMAND}\``;
      }
      if (!enabled) {
        takeRuntimeDown({ run_tatolab: false, runtime_agent: "not_registered", runtime_state: "stopped" });
      } else if (!isLoginItemsApproved) {
        publishStatus({ run_tatolab: true, runtime_agent: "requires_approval", runtime_state: "stopped" });
      } else {
        startRuntime();
      }
    },
    openLoginItemsSettings: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (platform === "linux") throw "Login Items are a macOS setting";
      if (isLoginItemsApproved) return;
      isLoginItemsApproved = true;
      window.setTimeout(startRuntime, MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS);
    },
    setUpTatolab: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (platform === "linux") throw "Linux needs no administrator setup";
      publishStatus({ machine_setup_state: "waiting_for_administrator" });
      window.setTimeout(() => {
        publishStatus({ machine_setup_state: "complete", command_line_tool_linked_at: fixtures.machine.commandLineToolLinkedAt });
        startRuntime();
      }, MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS);
    },
    quitTatolabApp: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
    },
    uninstallTatolab: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (platform === "linux") {
        throw `remove the runtime with \`${LINUX_UNINSTALL_COMMAND}\`, then this app with your package manager`;
      }
      await sleep(MOCK_UNINSTALL_ADMINISTRATOR_PROMPT_MILLISECONDS);
      if (isUninstallPromptCancelled) throw "the administrator prompt was cancelled, so nothing was removed";
      publishStatus({ machine_setup_state: "needs_administrator", command_line_tool_linked_at: null });
      takeRuntimeDown({ run_tatolab: false, runtime_agent: "not_registered", runtime_state: "stopped" });
    },
    readStreamLogRecords: async (streamName, afterSequence): Promise<StreamLogRecordsPage> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const loadedStream = loadedStreamNamed(streamName);
      const firstHeldSequence = loadedStream.heldRecords[0]?.sequence ?? loadedStream.nextSequence;
      const records = loadedStream.heldRecords
        .filter((record) => record.sequence > afterSequence)
        .slice(0, MOCK_RECORDS_PAGE_SIZE);
      return {
        stream: streamName,
        stream_instance: loadedStream.streamInstance,
        records: structuredClone(records),
        next_after: records.at(-1)?.sequence ?? afterSequence,
        records_no_longer_held: Math.max(0, firstHeldSequence - 1 - afterSequence),
      };
    },
    describeStreamGraph: async (streamName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return graphOfLoadedStream(loadedStreamNamed(streamName));
    },
    checkForTatolabAppUpdates: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const updateUnderWay = mockStatus.app_update.kind;
      if (updateUnderWay === "checking" || updateUnderWay === "downloading" || updateUnderWay === "installing") return;
      publishStatus({ app_update: { kind: "checking" } });
      window.setTimeout(finishTheUpdateCheck, MOCK_UPDATE_CHECK_MILLISECONDS);
    },
    runStreamAction: async (streamAction, streamName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer ${streamAction}`;
      switch (streamAction) {
        case "stop_stream":
          return stopMockStream(streamName);
        case "start_stream":
          return startMockStream(streamName);
        case "remove_stream":
          return removeMockStream(streamName);
      }
    },
    onTatolabStatusChanged: async (statusListener) => {
      statusListeners.add(statusListener);
      return () => statusListeners.delete(statusListener);
    },
  };
}
