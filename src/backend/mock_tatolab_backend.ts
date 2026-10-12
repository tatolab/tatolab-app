import {
  FAILED_DEPTH_OVERLAY_STREAM,
  LOBBY_RECORDER_STREAM,
  MOCK_MACHINE_NAME,
  type MockLiveLogWriter,
  type MockLogRecordDraft,
  type MockStreamFixture,
  stampMockLogRecord,
  STOPPED_STUDIO_MIC_STREAM,
  TEST_PATTERN_STREAM,
} from "./mock_stream_fixtures";
import type { TatolabBackend } from "./tatolab_backend";
import type {
  ListedStream,
  StreamGraphSummary,
  StreamLogRecord,
  StreamLogRecordsPage,
  TatolabStatus,
} from "./tatolab_backend_contract";

/** Browser-only stand-ins for the app backend, picked with `?state=`. */
export type MockTatolabScenario =
  | "running"
  | "empty"
  | "starting"
  | "stopped"
  | "approval"
  | "setup"
  | "unreachable"
  | "failed";

const MOCK_TATOLAB_SCENARIOS: readonly MockTatolabScenario[] = [
  "running",
  "empty",
  "starting",
  "stopped",
  "approval",
  "setup",
  "unreachable",
  "failed",
];

const MOCK_COMMAND_LATENCY_MILLISECONDS = 30;
const MOCK_RUNTIME_STARTUP_MILLISECONDS = 2400;
const MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS = 1600;
const MOCK_LIVE_TICK_MILLISECONDS = 700;
const MOCK_STREAM_SETTLE_MILLISECONDS = 1600;
/** How long the test pattern stream has been running when the window opens. */
const MOCK_TEST_PATTERN_UPTIME_MILLISECONDS = 46_000;
const MOCK_LOBBY_RECORDER_FIRST_ARRIVAL_MILLISECONDS = 4200;
const MOCK_LOBBY_RECORDER_ATTACHED_MILLISECONDS = 66_000;
const MOCK_LOBBY_RECORDER_DETACHED_MILLISECONDS = 12_000;
const MOCK_RECORDS_PAGE_SIZE = 500;
const MOST_MOCK_RECORDS_HELD = 4000;

/** The scenario `?state=` names; `running` when it names none this mock knows. */
export function readMockTatolabScenario(pageQuery: URLSearchParams): MockTatolabScenario {
  const requestedScenario = pageQuery.get("state");
  return MOCK_TATOLAB_SCENARIOS.find((scenario) => scenario === requestedScenario) ?? "running";
}

interface MockLoadedStream {
  fixture: MockStreamFixture;
  streamInstance: string;
  loadedAtMilliseconds: number;
  unreleasedStartupDrafts: MockLogRecordDraft[];
  writeLiveLog: MockLiveLogWriter;
  heldRecords: StreamLogRecord[];
  nextSequence: number;
}

function initialMockStatus(scenario: MockTatolabScenario): TatolabStatus {
  const runningStatus: TatolabStatus = {
    app_version: "0.45.0",
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: MOCK_MACHINE_NAME,
    streams: [],
    machine_setup_state: "complete",
    command_line_tool_linked_at: "/usr/local/bin/tatolab",
  };
  switch (scenario) {
    case "running":
    case "empty":
    case "failed":
      return runningStatus;
    case "starting":
      return { ...runningStatus, runtime_state: "starting", machine_name: null, streams: null };
    case "stopped":
      return { ...runningStatus, run_tatolab: false, runtime_agent: "not_registered", runtime_state: "stopped", machine_name: null, streams: null };
    case "approval":
      return { ...runningStatus, runtime_agent: "requires_approval", runtime_state: "stopped", machine_name: null, streams: null };
    case "unreachable":
      return { ...runningStatus, runtime_state: "unreachable", streams: null };
    case "setup":
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
export function createMockTatolabBackend(scenario: MockTatolabScenario): TatolabBackend {
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const loadedStreams = new Map<string, MockLoadedStream>();
  const listedStreamsNotLoaded: ListedStream[] =
    scenario === "failed" ? [FAILED_DEPTH_OVERLAY_STREAM.listing, STOPPED_STUDIO_MIC_STREAM.listing] : [];
  let mockStatus = initialMockStatus(scenario);
  let isLoginItemsApproved = scenario !== "approval";
  let runtimeUpSinceMilliseconds: number | null = null;
  let loadedStreamInstanceCount = 3;
  let liveTickTimer: number | undefined;

  const publishStatus = (statusChanges: Partial<TatolabStatus>): void => {
    mockStatus = { ...mockStatus, ...statusChanges };
    for (const statusListener of statusListeners) statusListener(structuredClone(mockStatus));
  };

  const listStreams = (): ListedStream[] =>
    [...[...loadedStreams.values()].map((loadedStream) => loadedStream.fixture.listing), ...listedStreamsNotLoaded].sort(
      (first, second) => first.name.localeCompare(second.name),
    );

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
    const alreadyRunningMilliseconds = Date.now() - loadedAtMilliseconds;
    for (let replayedMilliseconds = 0; replayedMilliseconds <= alreadyRunningMilliseconds; replayedMilliseconds += MOCK_LIVE_TICK_MILLISECONDS) {
      advanceStreamLog(loadedStream, replayedMilliseconds);
    }
  };

  const isLobbyRecorderAttachedAt = (millisecondsSinceRuntimeUp: number): boolean => {
    if (scenario !== "running" || millisecondsSinceRuntimeUp < MOCK_LOBBY_RECORDER_FIRST_ARRIVAL_MILLISECONDS) return false;
    const cycleMilliseconds = MOCK_LOBBY_RECORDER_ATTACHED_MILLISECONDS + MOCK_LOBBY_RECORDER_DETACHED_MILLISECONDS;
    return (millisecondsSinceRuntimeUp - MOCK_LOBBY_RECORDER_FIRST_ARRIVAL_MILLISECONDS) % cycleMilliseconds < MOCK_LOBBY_RECORDER_ATTACHED_MILLISECONDS;
  };

  const runLiveTick = (): void => {
    if (runtimeUpSinceMilliseconds === null) return;
    const now = Date.now();
    const lobbyRecorderShouldBeAttached = isLobbyRecorderAttachedAt(now - runtimeUpSinceMilliseconds);
    const lobbyRecorderIsAttached = loadedStreams.has(LOBBY_RECORDER_STREAM.listing.name);
    if (lobbyRecorderShouldBeAttached && !lobbyRecorderIsAttached) loadStream(LOBBY_RECORDER_STREAM, now);
    if (!lobbyRecorderShouldBeAttached && lobbyRecorderIsAttached) loadedStreams.delete(LOBBY_RECORDER_STREAM.listing.name);
    for (const loadedStream of loadedStreams.values()) advanceStreamLog(loadedStream, now - loadedStream.loadedAtMilliseconds);
    if (lobbyRecorderShouldBeAttached !== lobbyRecorderIsAttached) publishStatus({ streams: listStreams() });
  };

  const bringRuntimeUp = (): void => {
    runtimeUpSinceMilliseconds = Date.now();
    loadedStreams.clear();
    if (scenario !== "empty") loadStream(TEST_PATTERN_STREAM, Date.now() - MOCK_TEST_PATTERN_UPTIME_MILLISECONDS);
    window.clearInterval(liveTickTimer);
    liveTickTimer = window.setInterval(runLiveTick, MOCK_LIVE_TICK_MILLISECONDS);
    publishStatus({ runtime_state: "running", machine_name: MOCK_MACHINE_NAME, streams: listStreams() });
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

  const graphOfLoadedStream = (loadedStream: MockLoadedStream): StreamGraphSummary => {
    const fixtureGraph = loadedStream.fixture.graph;
    if (fixtureGraph === null) return { stream: loadedStream.fixture.listing.name, nodes: [], links: [], exposed: [] };
    const hasSettled = Date.now() - loadedStream.loadedAtMilliseconds >= MOCK_STREAM_SETTLE_MILLISECONDS;
    if (hasSettled) return structuredClone(fixtureGraph);
    return {
      ...structuredClone(fixtureGraph),
      nodes: fixtureGraph.nodes.map((node) => ({ ...node, state: "Pending" })),
      links: fixtureGraph.links.map((link) => ({ ...link, state: "pending" })),
    };
  };

  if (mockStatus.runtime_state === "running") bringRuntimeUp();

  return {
    getTatolabStatus: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(mockStatus);
    },
    setRunTatolab: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
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
      if (isLoginItemsApproved) return;
      isLoginItemsApproved = true;
      window.setTimeout(startRuntime, MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS);
    },
    setUpTatolab: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ machine_setup_state: "waiting_for_administrator" });
      window.setTimeout(() => {
        publishStatus({ machine_setup_state: "complete", command_line_tool_linked_at: "/usr/local/bin/tatolab" });
        startRuntime();
      }, MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS);
    },
    quitTatolabApp: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
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
    onTatolabStatusChanged: async (statusListener) => {
      statusListeners.add(statusListener);
      return () => statusListeners.delete(statusListener);
    },
  };
}
