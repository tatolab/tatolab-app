import { MOCK_NODE_CATALOG_ENTRIES } from "./mock_node_catalog";
import { mockPackageCatalogReading } from "./mock_package_catalog";
import {
  createMockStreamFixtures,
  createMockStreamRunFromAProjectFolder,
  MOCK_RUNTIME_ID,
  mockNodeIdOf,
  mockStreamIdOf,
  type MockLiveLogWriter,
  type MockLogRecordDraft,
  type MockMachine,
  type MockStreamFixture,
  stampMockLogRecord,
} from "./mock_stream_fixtures";
import { createMockRelays, mockRelaysScenarioNamed, type MockRelaysScenario } from "./mock_relays";
import { mockStreamGraphSummary } from "./mock_stream_graph_document";
import {
  mockFoldersInDocumentsTatoStudio,
  mockNewProjectDefaults,
  mockNewProjectLocationTheDialogAnswers,
  mockNewProjectReading,
  mockOpenProjectReading,
  mockOpenProjectScenarioNamed,
  mockRecentProjectReading,
  mockRecentProjects,
  type MockOpenProjectScenario,
} from "./mock_open_project";
import { MockPythonLanguageServer } from "./mock_python_language_server";
import { MockPortViewers } from "./mock_port_viewers";
import { MockProjectFiles } from "./mock_project_files";
import { newProjectFolderNameRefusal } from "../../shared/new_project_folder_name";
import type { TatolabBackend } from "./tatolab_backend";
import {
  PROJECT_LOG_FOLDER_IN_THE_PROJECT,
  type ListedStream,
  type OpenProjectReading,
  type PoppedOutViewerTarget,
  type ProjectLogRecord,
  type ProjectLogRecordsPage,
  type RuntimeDescription,
  type TatolabAppBuild,
  type TatolabAppOpenAtLogin,
  type TatolabCommandLineToolVersion,
  type StreamGraphSummary,
  type StreamActionDescription,
  type StreamActionCancelAnswer,
  type StreamActionFollowed,
  type StreamProjectFolderChosenFor,
  type TatolabAppUpdateState,
  type TatolabPlatform,
  type TatolabStatus,
  type PythonLanguageServerEvent,
} from "../../shared/tatolab_backend_contract";

/** Browser-only stand-ins for the app backend, picked with `?state=`: `starting` is the app's runtime coming up, `not-running` one that exited. */
export type MockTatolabScenario =
  | "running"
  | "empty"
  | "loading"
  | "node-error"
  | "camera-access"
  | "dropping"
  | "not-listed"
  | "starting"
  | "not-running";

const MOCK_TATOLAB_SCENARIOS: readonly MockTatolabScenario[] = [
  "running",
  "empty",
  "loading",
  "node-error",
  "camera-access",
  "dropping",
  "not-listed",
  "starting",
  "not-running",
];

/** Why the mock's runtime is not running in `not-running`, as the app says of one that exited. */
const MOCK_RUNTIME_NOT_RUNNING_BECAUSE = "The runtime stopped: it exited with status 1. Tato Studio starts it again shortly.";

const MOCK_COMMAND_LATENCY_MILLISECONDS = 30;
const MOCK_RUNTIME_STARTUP_MILLISECONDS = 2400;
/** How long the mock takes to link the `tatolab` command. */
const MOCK_COMMAND_LINE_TOOL_LINK_MILLISECONDS = 400;
const MOCK_LIVE_TICK_MILLISECONDS = 700;
const MOCK_STREAM_SETTLE_MILLISECONDS = 1600;
/** How long `main` stays listed but not loaded in the `loading` scenario. */
const MOCK_MAIN_LOADING_MILLISECONDS = 9000;
const MOCK_RECORDS_PAGE_SIZE = 500;
/** How many of a project's newest log records the mock keeps unless `?held_records=` asks for fewer. */
const MOST_PROJECT_LOG_RECORDS_KEPT = 100_000;
/** How long each step of a queued stream action takes in the mock. */
const MOCK_STREAM_ACTION_STEP_MILLISECONDS = 700;

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

/**
 * The project folder the mock's folder dialog chooses, picked with `?add_folder=`: one ready to run (the default), one with no
 * `.venv` yet, which the runtime makes first, one with two streams, one of which fails, the project `main` is already
 * imported from, one with no `stream.py`, or none, the person cancelling.
 */
export type MockChosenProjectFolder = "ready" | "no-venv" | "several" | "recorded" | "no-stream-file" | "cancel";

const MOCK_CHOSEN_PROJECT_FOLDERS: readonly MockChosenProjectFolder[] = ["ready", "no-venv", "several", "recorded", "no-stream-file", "cancel"];

/** The runtime the mock describes: the streamlib release the app bundles, and its build. */
const MOCK_RUNTIME_VERSION = "0.55.2";
const MOCK_RUNTIME_BUILD_ID = "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60";

/** How long the mock runtime has been up as the page opens: 3 days, 2 hours and 14 minutes. */
const MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS = ((3 * 24 + 2) * 60 + 14) * 60_000;

/** How long the mock takes to stop its runtime for a restart. */
const MOCK_RUNTIME_RESTART_MILLISECONDS = 700;

/** How long the mock runtime's uv takes to make a project's `.venv`, before it compiles it. */
const MOCK_PYTHON_ENVIRONMENT_MILLISECONDS = 3200;
/** The folders the mock runtime draws a new project in under `~/streams`, the first one free. */
const MOCK_NEW_PROJECT_FOLDER_NAMES = ["kind-butte", "quiet-harbor", "amber-delta"];
/** The `@stream` of the mock's doorways project that fails to load, as a stream whose camera is missing does. */
const MOCK_FAILING_STREAM_FUNCTION = "back_door";

/** What the runtime's uv says in the mock when `?add_venv=refused` has it fail to make a project's `.venv`: the package index out of reach. */
const MOCK_UV_SYNC_REFUSAL = [
  "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`",
  "  Caused by: Request failed after 3 retries",
  "  Caused by: error sending request for url (https://pypi.org/simple/tatolab-stream/)",
  "  Caused by: dns error: failed to lookup address information: nodename nor servname provided, or not known",
].join("\n");

/** What the page's query asks of the mock. */
export interface MockTatolabOptions {
  scenario: MockTatolabScenario;
  platform: TatolabPlatform;
  appUpdateScenario: MockTatolabAppUpdateScenario;
  /** `?terminal=missing`: the desktop has no terminal to open, as a Linux desktop without `x-terminal-emulator`. */
  isTheTerminalMissing: boolean;
  /** `?log_folder=missing`: no stream has a log folder on disk yet, so opening one is refused as the app refuses it. */
  isTheLogFolderMissing: boolean;
  /** `?held_records=<n>`: each project's log keeps only its newest `n` records, as the runtime's retention deletes a log's oldest segments. */
  mostProjectLogRecordsKept: number;
  /** `?add_folder=`: the project folder the folder dialog chooses to import. */
  chosenProjectFolder: MockChosenProjectFolder;
  /** `?add_new_folder=existing`: the folder dialog chooses a folder that already holds a project for a new one, so the creation fails. */
  isTheNewProjectFolderChosenAnExistingProject: boolean;
  /** `?add_action=not_held`: the runtime answers every followed load as no longer held. */
  isNoProjectLoadHeld: boolean;
  /** `?runtime_log=none`: the runtime keeps no log of its own, so `describe_runtime` names no folder. */
  doesTheRuntimeKeepNoOwnLog: boolean;
  /** `?restart=refused`: the runtime running was not started by the app, so a restart is refused. */
  isTheRuntimeRestartRefused: boolean;
  /** `?open_at_login=on|approval|not_offered`: what the desktop reports of opening the app at login; off by default. */
  openAtLogin: TatolabAppOpenAtLogin;
  /** `?notifications=unsupported`: this desktop shows no notifications. */
  doesTheDesktopShowNoNotifications: boolean;
  /** `?cli_version=reading|unreadable`: the CLI's version still being read, or unreadable; read by default. */
  commandLineToolVersion: TatolabCommandLineToolVersion;
  /** `?stream_page_requested=<stream id>`: a click on that stream's failure notification, a moment after the window listens. */
  streamPageRequestedByANotification: string | null;
  /** `?cli_link=not_linked|taken`: `~/.local/bin/tatolab` not linked yet, or held by a file that is not Tatolab's; linked by default. */
  commandLineToolLinkScenario: "linked" | "not_linked" | "taken";
  /** `?app_build=release|modified|none`: a release build, a dev build with uncommitted changes, or one that recorded none; a dev build by default. */
  appBuild: TatolabAppBuild | null;
  /** `?add_venv=refused`: the runtime's uv fails to make a project's `.venv`, as with the package index out of reach, so its load fails: its recorded streams, or for a new project its one `stream.py` record, list failed in uv's words. */
  isMakingThePythonEnvironmentRefused: boolean;
  /**
   * `?relays=local`: the runtime holds only the local relay's two listeners; a joined Cloudflare relay and a lost moq.pro one beside them by default;
   * `?relays=every-field-type` adds a mock-only adapter declaring a setting of each field type, and one relay of it.
   */
  relaysScenario: MockRelaysScenario;
  /** `?streams=earlier_record`: the runtime also lists a record an earlier runtime wrote, failed and naming no location. */
  doesTheRuntimeListAnEarlierRuntimesRecord: boolean;
  /** `?adapter_names=none`: the relay-adapter catalog of a runtime older than adapter names and logos, which serves neither. */
  doesTheRelayAdapterCatalogServeNoNamesOrLogos: boolean;
  /** `?project=none|unreadable`: no project open, or one whose `pyproject.toml` does not parse; the pattern project by default. */
  openProjectScenario: MockOpenProjectScenario;
  /** `?recent=none`: no project opened before, as on first run; six recent ones by default. */
  recentProjectsInTheQuery: string | null;
  /** `?port_families=served`: each port's family is served in the graph and the node catalog, as streamlib's strict-port-families will serve it; none by default, as the runtime serves today. */
  arePortFamiliesServed: boolean;
  /** `?popped_out_viewer=<target as JSON>`: the page is a Viewer popped out of the studio, as Pop out opens it in a new tab; the studio by default. */
  poppedOutViewer: PoppedOutViewerTarget | null;
  /** `?get_more=open`: the page is the open project's Get more window, as File › Get more… opens it in a new tab. */
  isAGetMoreWindow: boolean;
  /** `?catalog=unserved`: get.tatolab.com serves no catalog yet; the mock catalog by default. */
  isTheCatalogUnserved: boolean;
}

/** The query parameter a Get more window's page is told by. */
const GET_MORE_QUERY_PARAMETER = "get_more";

/** The mock page's address with every query parameter kept and `parameterName` set to `parameterValue`, so a new tab opens on the same scenario. */
function mockPageUrlWith(pageUrl: string, parameterName: string, parameterValue: string): string {
  const pageUrlWithTheParameter = new URL(pageUrl);
  pageUrlWithTheParameter.searchParams.set(parameterName, parameterValue);
  return pageUrlWithTheParameter.toString();
}

/** A `pyproject.toml` as the mock writes one for `project`, its requirements one per line. */
function mockPyprojectTextOf(project: { name: string; requirements: readonly string[] }): string {
  return `[project]\nname = "${project.name}"\ndependencies = [\n${project.requirements.map((requirement) => `    ${JSON.stringify(requirement)},\n`).join("")}]\n`;
}

/** A requirement's leading name as PEP 503 normalizes it. */
function mockRequirementsName(requirement: string): string {
  return (/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(requirement)?.[1] ?? requirement).toLowerCase().replace(/[-_.]+/g, "-");
}

/** The query parameter a popped-out Viewer's page carries its pin in. */
const POPPED_OUT_VIEWER_QUERY_PARAMETER = "popped_out_viewer";

/** What `?popped_out_viewer=` names: a pin as JSON, or `null` when it holds none that parses. */
function mockPoppedOutViewerTargetFrom(poppedOutViewerInTheQuery: string | null): PoppedOutViewerTarget | null {
  if (poppedOutViewerInTheQuery === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(poppedOutViewerInTheQuery);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const field = (fieldName: string): unknown => Object.entries(parsed).find(([parsedFieldName]) => parsedFieldName === fieldName)?.[1];
  const stream = field("stream");
  const projectName = field("project_name");
  const displayName = field("display_name");
  const node = field("node");
  if (typeof stream !== "string" || typeof projectName !== "string" || typeof displayName !== "string" || (typeof node !== "string" && node !== null)) return null;
  return { stream, project_name: projectName, display_name: displayName, node };
}

/** The mock page's address with `target` as its popped-out Viewer's pin, every other query parameter kept, so the tab opens with the same scenario. */
export function mockPoppedOutViewerPageUrl(pageUrl: string, target: PoppedOutViewerTarget): string {
  return mockPageUrlWith(pageUrl, POPPED_OUT_VIEWER_QUERY_PARAMETER, JSON.stringify(target));
}

/** How long after the window listens the mock's notification click arrives. */
const MOCK_NOTIFICATION_CLICK_MILLISECONDS = 1200;

/** What `?open_at_login=` names. */
function mockOpenAtLogin(openAtLoginInTheQuery: string | null): TatolabAppOpenAtLogin {
  switch (openAtLoginInTheQuery) {
    case "on":
      return { kind: "on" };
    case "approval":
      return { kind: "needs_approval_in_login_items" };
    case "not_offered":
      return { kind: "not_offered", reason: "Only a packaged Tato Studio opens at login." };
    default:
      return { kind: "off" };
  }
}

/** What `?app_build=` names. */
function mockAppBuild(appBuildInTheQuery: string | null): TatolabAppBuild | null {
  const mockDevBuild: TatolabAppBuild = { tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "dev", built_with_uncommitted_changes: false };
  switch (appBuildInTheQuery) {
    case "release":
      return { ...mockDevBuild, build_kind: "release" };
    case "modified":
      return { ...mockDevBuild, built_with_uncommitted_changes: true };
    case "none":
      return null;
    default:
      return mockDevBuild;
  }
}

/** What `?cli_version=` names. */
function mockCommandLineToolVersion(commandLineToolVersionInTheQuery: string | null): TatolabCommandLineToolVersion {
  switch (commandLineToolVersionInTheQuery) {
    case "reading":
      return { kind: "reading" };
    case "unreadable":
      return { kind: "unreadable", reason: "/usr/local/bin/tatolab --version failed (exit status: 1): error: the runtime's socket is held by another user" };
    default:
      return { kind: "read", version: MOCK_RUNTIME_VERSION };
  }
}

/**
 * `?platform=` (`macos` unless it names `linux`), the scenario `?state=` names (`running` when it names none this
 * mock knows), and `?update=` (`up-to-date` when it names none this mock knows).
 */
export function readMockTatolabOptions(pageQuery: URLSearchParams): MockTatolabOptions {
  const platform: TatolabPlatform = pageQuery.get("platform") === "linux" ? "linux" : "macos";
  const requestedScenario = pageQuery.get("state");
  const scenario = MOCK_TATOLAB_SCENARIOS.find((knownScenario) => knownScenario === requestedScenario);
  const requestedAppUpdateScenario = pageQuery.get("update");
  const appUpdateScenario = MOCK_TATOLAB_APP_UPDATE_SCENARIOS.find((knownScenario) => knownScenario === requestedAppUpdateScenario);
  return {
    scenario: scenario ?? "running",
    platform,
    appUpdateScenario: appUpdateScenario ?? "up-to-date",
    isTheTerminalMissing: pageQuery.get("terminal") === "missing",
    isTheLogFolderMissing: pageQuery.get("log_folder") === "missing",
    mostProjectLogRecordsKept: positiveWholeNumberOrNull(pageQuery.get("held_records")) ?? MOST_PROJECT_LOG_RECORDS_KEPT,
    chosenProjectFolder: MOCK_CHOSEN_PROJECT_FOLDERS.find((knownFolder) => knownFolder === pageQuery.get("add_folder")) ?? "ready",
    isTheNewProjectFolderChosenAnExistingProject: pageQuery.get("add_new_folder") === "existing",
    isNoProjectLoadHeld: pageQuery.get("add_action") === "not_held",
    doesTheRuntimeKeepNoOwnLog: pageQuery.get("runtime_log") === "none",
    isTheRuntimeRestartRefused: pageQuery.get("restart") === "refused",
    openAtLogin: mockOpenAtLogin(pageQuery.get("open_at_login")),
    doesTheDesktopShowNoNotifications: pageQuery.get("notifications") === "unsupported",
    commandLineToolVersion: mockCommandLineToolVersion(pageQuery.get("cli_version")),
    streamPageRequestedByANotification: pageQuery.get("stream_page_requested"),
    commandLineToolLinkScenario: pageQuery.get("cli_link") === "not_linked" ? "not_linked" : pageQuery.get("cli_link") === "taken" ? "taken" : "linked",
    appBuild: mockAppBuild(pageQuery.get("app_build")),
    isMakingThePythonEnvironmentRefused: pageQuery.get("add_venv") === "refused",
    relaysScenario: mockRelaysScenarioNamed(pageQuery.get("relays")),
    doesTheRuntimeListAnEarlierRuntimesRecord: pageQuery.get("streams") === "earlier_record",
    doesTheRelayAdapterCatalogServeNoNamesOrLogos: pageQuery.get("adapter_names") === "none",
    openProjectScenario: mockOpenProjectScenarioNamed(pageQuery.get("project")),
    recentProjectsInTheQuery: pageQuery.get("recent"),
    arePortFamiliesServed: pageQuery.get("port_families") === "served",
    poppedOutViewer: mockPoppedOutViewerTargetFrom(pageQuery.get(POPPED_OUT_VIEWER_QUERY_PARAMETER)),
    isAGetMoreWindow: pageQuery.get(GET_MORE_QUERY_PARAMETER) === "open",
    isTheCatalogUnserved: pageQuery.get("catalog") === "unserved",
  };
}

function positiveWholeNumberOrNull(text: string | null): number | null {
  const number = Number(text);
  return text !== null && Number.isInteger(number) && number > 0 ? number : null;
}

interface MockLoadedStream {
  fixture: MockStreamFixture;
  /** The stream action that loaded it, which every record its load writes carries. */
  loadAction: string;
  loadedAtMilliseconds: number;
  unreleasedStartupDrafts: MockLogRecordDraft[];
  writeLiveLog: MockLiveLogWriter;
}

/** A project's log as the mock keeps it: its records oldest first, after the ones its retention deleted. */
interface MockProjectLog {
  records: ProjectLogRecord[];
  recordsDeletedCount: number;
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
  {
    appUpdateScenario,
    openAtLogin,
    doesTheDesktopShowNoNotifications,
    commandLineToolVersion,
    commandLineToolLinkScenario,
    appBuild,
  }: MockTatolabOptions,
): TatolabStatus {
  const runningStatus: TatolabStatus = {
    app_version: "0.45.0",
    app_build: appBuild,
    platform,
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: machine.name,
    streams: [],
    command_line_tool_link:
      commandLineToolLinkScenario === "linked"
        ? { kind: "linked", path: machine.commandLineToolLinkedAt }
        : commandLineToolLinkScenario === "taken"
          ? { kind: "taken_by_something_else", path: machine.commandLineToolLinkedAt }
          : { kind: "not_linked", path: machine.commandLineToolLinkedAt },
    app_update: initialMockAppUpdateState(appUpdateScenario),
    local_api_socket: machine.localApiSocket,
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: !doesTheDesktopShowNoNotifications },
    open_at_login: openAtLogin,
    command_line_tool_version: commandLineToolVersion,
  };
  switch (scenario) {
    case "running":
    case "empty":
    case "loading":
    case "node-error":
    case "camera-access":
    case "dropping":
    case "not-listed":
      return runningStatus;
    case "starting":
      return { ...runningStatus, runtime_state: "starting", machine_name: null, streams: null };
    case "not-running":
      return { ...runningStatus, runtime_state: "not_running", runtime_not_running_because: MOCK_RUNTIME_NOT_RUNNING_BECAUSE, machine_name: null, streams: null };
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** A backend whose commands change its own state and whose streams log on their own, so the window works in a browser. */
export function createMockTatolabBackend(mockTatolabOptions: MockTatolabOptions): TatolabBackend {
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
    relaysScenario,
    doesTheRuntimeListAnEarlierRuntimesRecord,
    doesTheRelayAdapterCatalogServeNoNamesOrLogos,
    openProjectScenario,
    recentProjectsInTheQuery,
  } = mockTatolabOptions;
  const fixtures = createMockStreamFixtures(platform);
  const mainStream =
    scenario === "node-error"
      ? fixtures.mainStreamWithDisplayWindowInError
      : scenario === "dropping"
        ? fixtures.mainStreamWithItsMeterFallingBehind
        : fixtures.mainStream;
  const statusListeners = new Set<(status: TatolabStatus) => void>();
  const openProjectListeners = new Set<(reading: OpenProjectReading) => void>();
  let openProjectReading = mockOpenProjectReading(openProjectScenario, fixtures.machine.homeDirectory);
  let recentProjects = mockRecentProjects(recentProjectsInTheQuery, fixtures.machine.homeDirectory, Date.now());
  const mockFoldersOnDisk = () => [...mockFoldersInDocumentsTatoStudio(fixtures.machine.homeDirectory), ...recentProjects.map((recent) => recent.folder)];
  const openTheProjectInTheMock = (reading: OpenProjectReading, folder: string, projectName: string | null) => {
    openProjectReading = reading;
    recentProjects = [{ folder, project_name: projectName, last_opened_at_wall_clock_ms: Date.now() }, ...recentProjects.filter((recent) => recent.folder !== folder)];
    for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(openProjectReading));
  };
  const mockProjectFiles = new MockProjectFiles(`${fixtures.machine.homeDirectory}/streams`);
  const languageServerEventListeners = new Set<(event: PythonLanguageServerEvent) => void>();
  const mockLanguageServersBySession = new Map<string, MockPythonLanguageServer>();
  const mockPortViewers = new MockPortViewers();
  let languageServerSessionCount = 0;
  const refuseWithoutAnOpenProject = (): void => {
    if (openProjectReading.kind !== "read") throw "No project is open, so its files cannot be read.";
  };
  const loadedStreams = new Map<string, MockLoadedStream>();
  const listedStreamsNotLoaded = new Map<string, ListedStream>([
    [fixtures.stoppedPatternTwo.stream, fixtures.stoppedPatternTwo],
    [fixtures.failedLobbyRecorder.stream, fixtures.failedLobbyRecorder],
    ...(doesTheRuntimeListAnEarlierRuntimesRecord ? [[fixtures.earlierRuntimesRecord.stream, fixtures.earlierRuntimesRecord] as const] : []),
  ]);
  /** The display names `rename_stream` gave, by stream id, over the ones the fixtures load with. */
  const displayNamesRenamedTo = new Map<string, string>();
  /** Recorded streams not loaded that `start_stream` can load, by id: `pattern-two`, and each one stopped from the window. */
  const recordedFixturesNotLoaded = new Map<string, MockStreamFixture>([[fixtures.patternTwoStream.listing.stream, fixtures.patternTwoStream]]);
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

  const publishStatus = (statusChanges: Partial<TatolabStatus>): void => {
    mockStatus = { ...mockStatus, ...statusChanges };
    for (const statusListener of statusListeners) statusListener(structuredClone(mockStatus));
  };

  /** The ids of the streams run from the window's Add stream, listed after the fixtures', in the order they were run. */
  const streamIdsRunFromTheWindow: string[] = [];
  const listStreams = (): ListedStream[] | null => {
    if (scenario === "not-listed") return null;
    const listingOrder = [...(scenario === "empty" ? [] : fixtures.listingOrder), ...(doesTheRuntimeListAnEarlierRuntimesRecord ? [fixtures.earlierRuntimesRecord.stream] : [])];
    return [...listingOrder, ...streamIdsRunFromTheWindow]
      .map((streamId) => loadedStreams.get(streamId)?.fixture.listing ?? listedStreamsNotLoaded.get(streamId) ?? null)
      .filter((listing): listing is ListedStream => listing !== null)
      .map((listing) => {
        const renamedTo = displayNamesRenamedTo.get(listing.stream);
        return renamedTo === undefined ? listing : { ...listing, display_name: renamedTo };
      });
  };

  /** Each project folder the mock knows, by path: its `@stream`s, none without a `stream.py`, and whether it has a `.venv`; a folder not here does not exist. */
  const projectFolders = new Map<string, { streamFunctions: readonly string[]; hasAPythonEnvironment: boolean }>([
    [`${fixtures.machine.homeDirectory}/code/heat-map`, { streamFunctions: ["heat_map"], hasAPythonEnvironment: chosenProjectFolder !== "no-venv" }],
    [`${fixtures.machine.homeDirectory}/code/doorways`, { streamFunctions: ["front_door", MOCK_FAILING_STREAM_FUNCTION], hasAPythonEnvironment: true }],
    [fixtures.patternProjectDirectory, { streamFunctions: ["main", "recorder", "pattern_two"], hasAPythonEnvironment: true }],
    [`${fixtures.machine.homeDirectory}/code/notes`, { streamFunctions: [], hasAPythonEnvironment: true }],
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
        return fixtures.patternProjectDirectory;
      case "no-stream-file":
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

  /** Each load `create_project` or `run_project` queued, by action, as `describe_stream_action` reads it. */
  const projectLoadsQueued = new Map<string, StreamActionDescription>();
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
    publishStatus({ streams: listStreams() });
    return true;
  };

  /** Queues a load of `projectDirectory` that fails after a beat with `failedBecause`, as the runtime fails a load it cannot begin. */
  const queueAMockProjectLoadThatFails = (projectDirectory: string, failedBecause: string): string => {
    const action = nextStreamActionId();
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind: "load", state: "queued", step: null, streams: [], failed_because: null };
    projectLoadsQueued.set(action, description);
    window.setTimeout(() => Object.assign(description, { state: "failed", failed_because: failedBecause }), MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    return action;
  };

  /**
   * `create_project`'s and `run_project`'s load as the runtime does it: queued, then the `.venv` made where it has none,
   * then every `@stream` compiling and starting, each listed `preparing` under the action, then loaded, or failed for
   * the doorways project's `back_door`.
   */
  const queueAMockProjectLoad = (projectDirectory: string): string => {
    const action = nextStreamActionId();
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind: "load", state: "queued", step: null, streams: [], failed_because: null };
    projectLoadsQueued.set(action, description);
    void workOnTheMockProjectLoad(description);
    return action;
  };

  /** The project's recorded streams listed failed in uv's words, or, for a project with none, its one `stream.py` record, whose location names no function. */
  const listEveryStreamOfTheProjectFailedOnItsSync = (projectDirectory: string): ListedStream[] => {
    const recordedStreams = (listStreams() ?? []).filter((listing) => listing.location?.project_directory === projectDirectory);
    const streamPyRecordLocation = { project_directory: projectDirectory, stream_function: "" };
    const failedStreams: ListedStream[] =
      recordedStreams.length > 0
        ? recordedStreams.map((listing) => ({ ...listing, state: "failed", node_count: null, failed_because: MOCK_UV_SYNC_REFUSAL, action: null, step: null }))
        : [
            {
              stream: mockStreamIdOf(streamPyRecordLocation),
              display_name: projectDirectory.split("/").filter((segment) => segment !== "").at(-1) ?? projectDirectory,
              location: streamPyRecordLocation,
              state: "failed",
              node_count: null,
              failed_because: MOCK_UV_SYNC_REFUSAL,
              capture_devices_whose_access_was_never_asked_for: [],
              action: null,
              step: null,
            },
          ];
    for (const listing of failedStreams) {
      loadedStreams.delete(listing.stream);
      streamActionOfEachStream.delete(listing.stream);
      if (!streamIdsRunFromTheWindow.includes(listing.stream) && !recordedStreams.some((recorded) => recorded.stream === listing.stream)) streamIdsRunFromTheWindow.push(listing.stream);
      listedStreamsNotLoaded.set(listing.stream, listing);
    }
    return failedStreams;
  };

  const workOnTheMockProjectLoad = async (description: StreamActionDescription): Promise<void> => {
    const projectDirectory = description.project_directory;
    const project = projectFolders.get(projectDirectory);
    if (project === undefined) return;
    const isTheRuntimeStillUp = (): boolean => runtimeUpSinceMilliseconds !== null;
    const streamFixtures = project.streamFunctions.map((streamFunction) =>
      createMockStreamRunFromAProjectFolder(fixtures.machine, projectDirectory, `stream:${streamFunction}`, streamFunction),
    );
    const listEveryStreamPreparingAt = (step: string): void => {
      const streamPyRecord = mockStreamIdOf({ project_directory: projectDirectory, stream_function: "" });
      listedStreamsNotLoaded.delete(streamPyRecord);
      streamIdsRunFromTheWindow.splice(0, streamIdsRunFromTheWindow.length, ...streamIdsRunFromTheWindow.filter((streamId) => streamId !== streamPyRecord));
      for (const fixture of streamFixtures) {
        const streamId = fixture.listing.stream;
        if (!(listStreams() ?? []).some((listing) => listing.stream === streamId)) streamIdsRunFromTheWindow.push(streamId);
        loadedStreams.delete(streamId);
        forgottenStreamIds.delete(streamId);
        streamActionOfEachStream.set(streamId, description.action);
        listedStreamsNotLoaded.set(streamId, { ...fixture.listing, display_name: displayNamesRenamedTo.get(streamId) ?? fixture.listing.display_name, state: "preparing", node_count: null, action: description.action, step });
      }
      publishStatus({ streams: listStreams() });
    };
    await sleep(MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    if (description.state === "cancelled") return;
    if (!project.hasAPythonEnvironment) {
      Object.assign(description, { state: "in_progress", step: "making_the_venv" });
      writeProjectRecord(projectDirectory, description.action, "info", `${projectDirectory}/.venv/bin/python does not start, so ${projectDirectory}/.venv is made again`);
      await sleep(MOCK_PYTHON_ENVIRONMENT_MILLISECONDS);
      if (endTheLoadAtItsCancel(description)) return;
      if (isMakingThePythonEnvironmentRefused) {
        writeProjectRecord(projectDirectory, description.action, "error", MOCK_UV_SYNC_REFUSAL);
        description.streams = listEveryStreamOfTheProjectFailedOnItsSync(projectDirectory).map((listing) => ({ stream: listing.stream, display_name: listing.display_name, state: "failed" }));
        Object.assign(description, { state: "failed", step: null, failed_because: MOCK_UV_SYNC_REFUSAL });
        publishStatus({ streams: listStreams() });
        return;
      }
      writeProjectRecord(projectDirectory, description.action, "info", `\`uv sync\` made ${projectDirectory}/.venv`);
      project.hasAPythonEnvironment = true;
    }
    for (const step of ["compiling", "starting"]) {
      if (!isTheRuntimeStillUp()) {
        streamActionsAskedToCancel.delete(description.action);
        Object.assign(description, { state: "cancelled", step: null });
        return;
      }
      if (endTheLoadAtItsCancel(description)) return;
      Object.assign(description, { state: "in_progress", step });
      listEveryStreamPreparingAt(step);
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
      if (listing.location?.stream_function === `stream:${MOCK_FAILING_STREAM_FUNCTION}`) {
        writeRuntimeRecord(listing, description.action, "error", fixtures.machine.cameraFailure);
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "failed", node_count: null, failed_because: fixtures.machine.cameraFailure, action: null, step: null });
        return { stream: listing.stream, display_name: listing.display_name, state: "failed" };
      }
      loadStream(fixture, now, description.action);
      return { stream: listing.stream, display_name: listing.display_name, state: "running" };
    });
    Object.assign(description, { state: "done", step: null });
    publishStatus({ streams: listStreams() });
  };

  /** Writes `records` to the log of the project `projectDirectory`, its retention deleting the oldest past what it keeps. */
  const writeToTheProjectLog = (projectDirectory: string | null, records: ProjectLogRecord[]): void => {
    if (projectDirectory === null || records.length === 0) return;
    const projectLog = projectLogs.get(projectDirectory) ?? { records: [], recordsDeletedCount: 0 };
    projectLog.records.push(...records);
    const recordsPastWhatItKeeps = projectLog.records.length - mostProjectLogRecordsKept;
    if (recordsPastWhatItKeeps > 0) {
      projectLog.records.splice(0, recordsPastWhatItKeeps);
      projectLog.recordsDeletedCount += recordsPastWhatItKeeps;
    }
    projectLogs.set(projectDirectory, projectLog);
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
        listedStreamsNotLoaded.set(mainStream.listing.stream, { ...mainStream.listing, state: "preparing", node_count: null, action: nextStreamActionId(), step: "compiling" });
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
    publishStatus({ runtime_state: "running", machine_name: fixtures.machine.name, streams: listStreams() });
  };

  const takeRuntimeDown = (statusChanges: Partial<TatolabStatus>): void => {
    runtimeUpSinceMilliseconds = null;
    loadedStreams.clear();
    window.clearInterval(liveTickTimer);
    publishStatus({ ...statusChanges, machine_name: null, streams: null });
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
  const mockRelays = createMockRelays({
    scenario: relaysScenario,
    doesTheCatalogServeNoNamesOrLogos: doesTheRelayAdapterCatalogServeNoNamesOrLogos,
    isTheRuntimeRunning: () => mockStatus.runtime_state === "running",
    noRuntimeAnswersRefusal,
  });

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

  /** Lists `listing` under `state` with `action` queued and no step yet, as the runtime lists an action waiting its turn. */
  const queueTheStreamAction = (listing: ListedStream, state: "preparing" | "stopping", action: string): void => {
    listedStreamsNotLoaded.set(listing.stream, { ...listing, state, node_count: null, failed_because: null, action, step: null });
    publishStatus({ streams: listStreams() });
  };

  /** `stop_stream` as the runtime does it: queued for a loaded stream, which stops and is recorded stopped; refused for one not loaded. */
  const stopMockStream = (streamId: string): void => {
    const loadedStream = loadedStreams.get(streamId);
    const listingNotLoaded = listedStreamsNotLoaded.get(streamId);
    if (loadedStream === undefined) {
      if (listingNotLoaded?.state === "stopped") throw `Runtime error: the stream \`${streamId}\` is already stopped; \`start\` loads it again`;
      if (listingNotLoaded?.state === "failed") {
        throw `Runtime error: the stream \`${streamId}\` is failed, so it is not loaded to stop: ${listingNotLoaded.failed_because ?? ""}. \`start\` retries it, \`rm\` forgets it`;
      }
      if (listingNotLoaded === undefined) throw aStreamThisRuntimeDoesNotHoldRefusal(streamId);
    }
    const listing = loadedStream?.fixture.listing ?? listingNotLoaded;
    if (listing === undefined) return;
    const action = nextStreamActionId();
    loadedStreams.delete(streamId);
    if (loadedStream !== undefined) recordedFixturesNotLoaded.set(streamId, loadedStream.fixture);
    unloadingStreamActions.set(action, "stop");
    queueTheStreamAction(listing, "stopping", action);
    workOnTheStreamAction(listing, "stopping", action, ["stopping"], () => {
      writeRuntimeRecord(listing, action, "info", `Stopped the stream \`${streamId}\``);
      listedStreamsNotLoaded.set(streamId, { ...listing, state: "stopped", node_count: null, failed_because: null, action: null, step: null });
    });
  };

  /** `start_stream` as the runtime does it: queued for a stopped or failed stream, which loads, asking for any capture device it waits on, or for the lobby recorder fails again as its camera is still missing; refused for one loaded. */
  const startMockStream = (streamId: string): void => {
    if (loadedStreams.has(streamId)) {
      throw `Runtime error: the stream \`${streamId}\` is already loaded in this runtime, recorded by the runtime; only a stopped or failed stream starts`;
    }
    const listingNotLoaded = listedStreamsNotLoaded.get(streamId);
    if (!listingNotLoaded) {
      throw `Resource not found: no stream with the id \`${streamId}\` is recorded in this runtime, so there is none to start. Recorded: ${streamIdsListedForARefusal(recordedStreamIds())}`;
    }
    const action = nextStreamActionId();
    queueTheStreamAction(listingNotLoaded, "preparing", action);
    workOnTheStreamAction(listingNotLoaded, "preparing", action, ["compiling", "starting"], () => {
      writeRuntimeRecord(listingNotLoaded, action, "info", `Loading the stream \`${streamId}\` from ${listingNotLoaded.location?.project_directory ?? ""}`);
      const fixture = recordedFixturesNotLoaded.get(streamId);
      if (fixture !== undefined) {
        loadStream({ ...fixture, listing: { ...fixture.listing, capture_devices_whose_access_was_never_asked_for: [] } }, Date.now(), action);
        return;
      }
      const retryFailure = `\`start\` retried it, and it did not load: ${fixtures.machine.cameraFailure}`;
      writeRuntimeRecord(listingNotLoaded, action, "error", retryFailure);
      listedStreamsNotLoaded.set(streamId, { ...listingNotLoaded, state: "failed", node_count: null, failed_because: retryFailure, action: null, step: null });
    });
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

  /** `logs` as the runtime answers it: the project's records after the cursor `after`, from its first record kept when `null`, narrowed as asked. */
  const readMockProjectLog = (projectDirectory: string, narrowing: { stream: string | null; action: string | null }, after: string | null): ProjectLogRecordsPage => {
    const projectLog = projectLogs.get(projectDirectory);
    if (projectLog === undefined && !(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) {
      throw `Resource not found: this runtime holds no stream of the project in ${projectDirectory}`;
    }
    const { records, recordsDeletedCount } = projectLog ?? { records: [], recordsDeletedCount: 0 };
    const askedAfterIndex = after === null ? 0 : Number(after.split(":")[1] ?? "0");
    const firstIndexRead = Math.max(askedAfterIndex, recordsDeletedCount);
    const recordsOfThePage: ProjectLogRecord[] = [];
    let nextIndex = firstIndexRead;
    for (; nextIndex < recordsDeletedCount + records.length && recordsOfThePage.length < MOCK_RECORDS_PAGE_SIZE; nextIndex++) {
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

  /** `rename_stream` as the runtime does it: refused for a name that shows nothing or a stream it does not hold, else shown under the new name. */
  const renameMockStream = (streamId: string, displayName: string): void => {
    if (displayName.trim() === "") {
      throw `Invalid configuration: ${JSON.stringify(displayName)} cannot be a stream's display name: it shows nothing; a display name is any text with something to show`;
    }
    if (!(listStreams() ?? []).some((listing) => listing.stream === streamId)) throw aStreamThisRuntimeDoesNotHoldRefusal(streamId);
    displayNamesRenamedTo.set(streamId, displayName);
    publishStatus({ streams: listStreams() });
  };

  const graphOfLoadedStream = (loadedStream: MockLoadedStream): StreamGraphSummary => {
    const millisecondsSinceSettled = Date.now() - loadedStream.loadedAtMilliseconds - MOCK_STREAM_SETTLE_MILLISECONDS;
    return mockStreamGraphSummary(loadedStream.fixture.listing.stream, fixtures.machine.name, loadedStream.fixture.graph, {
      hasSettled: millisecondsSinceSettled >= 0,
      secondsSinceSettled: Math.max(0, millisecondsSinceSettled) / 1000,
    }, mockTatolabOptions.arePortFamiliesServed);
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
  // The app starts its runtime as it opens, so a starting runtime comes up as the real one does.
  if (scenario === "starting") startRuntime();

  return {
    getTatolabStatus: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(mockStatus);
    },
    linkCommandLineTool: async () => {
      await sleep(MOCK_COMMAND_LINE_TOOL_LINK_MILLISECONDS);
      const commandLineToolLink = mockStatus.command_line_tool_link;
      if (commandLineToolLink.kind === "not_offered") throw commandLineToolLink.reason;
      if (commandLineToolLink.kind === "taken_by_something_else") throw `${commandLineToolLink.path} is not a link to Tatolab, so Tato Studio left it alone.`;
      publishStatus({ command_line_tool_link: { kind: "linked", path: commandLineToolLink.path } });
    },
    quitTatolabApp: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
    },
    readProjectLogRecords: async (projectDirectory, narrowing, after) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const isTheOpenProject = openProjectReading.kind === "read" && openProjectReading.open_project.project.folder === projectDirectory;
      if (!isTheOpenProject && !(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) throw `The runtime lists no stream from ${projectDirectory}.`;
      return readMockProjectLog(projectDirectory, narrowing, after);
    },
    describeStreamGraph: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return graphOfLoadedStream(loadedStreamOfTheId(streamId));
    },
    describeNodeCatalog: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      loadedStreamOfTheId(streamId);
      const nodeTypes = mockTatolabOptions.arePortFamiliesServed
        ? [...MOCK_NODE_CATALOG_ENTRIES]
        : MOCK_NODE_CATALOG_ENTRIES.map((entry) => ({ ...entry, inputs: entry.inputs.map((port) => ({ ...port, family: null })), outputs: entry.outputs.map((port) => ({ ...port, family: null })) }));
      return { stream: streamId, node_types: nodeTypes };
    },
    checkForTatolabAppUpdates: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const updateUnderWay = mockStatus.app_update.kind;
      if (updateUnderWay === "checking" || updateUnderWay === "downloading" || updateUnderWay === "installing") return;
      publishStatus({ app_update: { kind: "checking" } });
      window.setTimeout(finishTheUpdateCheck, MOCK_UPDATE_CHECK_MILLISECONDS);
    },
    runStreamAction: async (streamAction, streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer ${streamAction}`;
      switch (streamAction) {
        case "stop_stream":
          return stopMockStream(streamId);
        case "start_stream":
          return startMockStream(streamId);
      }
    },
    removeProject: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer remove_project`;
      removeMockProject(projectDirectory);
    },
    renameStream: async (streamId, displayName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer rename_stream`;
      renameMockStream(streamId, displayName);
    },
    openStreamProjectFolder: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamId);
    },
    openTerminalAtStreamProject: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamId);
      if (isTheTerminalMissing) {
        throw "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.";
      }
    },
    openStreamLogFolder: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const projectFolder = listedProjectFolderOf(streamId);
      const displayName = listStreams()?.find((listing) => listing.stream === streamId)?.display_name ?? streamId;
      if (isTheLogFolderMissing) throw `${displayName} has no log folder yet: ${projectFolder}/${PROJECT_LOG_FOLDER_IN_THE_PROJECT} is not on this machine.`;
    },
    chooseStreamProjectFolder: async (chosenFor) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const chosen = projectFolderTheDialogChooses(chosenFor);
      if (chosen !== null) foldersHandedToTheWindow.add(chosen);
      return chosen;
    },
    createStreamProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (folder !== null) refuseAFolderNotHandedToTheWindow(folder);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const projectDirectory = folder ?? newProjectFolderTheRuntimeDraws();
      const stream = mockStreamIdOf({ project_directory: projectDirectory, stream_function: "stream:main" });
      if (projectFolders.has(projectDirectory)) {
        const failedBecause = `Invalid configuration: \`${projectDirectory}\` already has pyproject.toml, stream.py, and a new project's files would overwrite it; create the project in an empty directory`;
        return { action: queueAMockProjectLoadThatFails(projectDirectory, failedBecause), stream, project_directory: projectDirectory };
      }
      projectFolders.set(projectDirectory, { streamFunctions: ["main"], hasAPythonEnvironment: false });
      return { action: queueAMockProjectLoad(projectDirectory), stream, project_directory: projectDirectory };
    },
    runStreamProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseAFolderNotHandedToTheWindow(folder);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const project = projectFolders.get(folder);
      if (project === undefined) return { action: queueAMockProjectLoadThatFails(folder, `the project directory ${folder} does not exist`), project_directory: folder };
      if (project.streamFunctions.length === 0) {
        return { action: queueAMockProjectLoadThatFails(folder, `Invalid configuration: ${folder} has no stream.py, so it is not a Tatolab project`), project_directory: folder };
      }
      return { action: queueAMockProjectLoad(folder), project_directory: folder };
    },
    reloadProject: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      if (!(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) throw `The runtime lists no stream from ${projectDirectory}.`;
      if (!projectFolders.has(projectDirectory)) {
        return { action: queueAMockProjectLoadThatFails(projectDirectory, `the project directory ${projectDirectory} does not exist`), project_directory: projectDirectory };
      }
      return { action: queueAMockProjectLoad(projectDirectory), project_directory: projectDirectory };
    },
    describeStreamAction: async (action): Promise<StreamActionFollowed> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const description = projectLoadsQueued.get(action);
      if (description === undefined || isNoProjectLoadHeld) return { kind: "not_held", words: `Invalid configuration: ${notHeldWords(action)}` };
      return { kind: "described", description: structuredClone(description) };
    },
    cancelStreamAction: async (action): Promise<StreamActionCancelAnswer> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return cancelMockStreamAction(action);
    },
    describeRuntime: async (): Promise<RuntimeDescription> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return {
        version: MOCK_RUNTIME_VERSION,
        build_id: MOCK_RUNTIME_BUILD_ID,
        up_for_ms: Date.now() - runtimeEngineStartedAtMilliseconds,
        runtime_log_directory: doesTheRuntimeKeepNoOwnLog ? null : fixtures.machine.runtimeLogDirectory,
      };
    },
    restartRuntime: async () => {
      await sleep(MOCK_RUNTIME_RESTART_MILLISECONDS);
      if (isTheRuntimeRestartRefused) throw "The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.";
      takeRuntimeDown({ runtime_state: "starting" });
      startRuntime();
    },
    openRuntimeLogFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      if (doesTheRuntimeKeepNoOwnLog) throw "The runtime keeps no log of its own, so there is no folder to open.";
    },
    setStreamFailureNotifications: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ stream_failure_notifications: { ...mockStatus.stream_failure_notifications, enabled } });
    },
    setOpenTatolabAtLogin: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ open_at_login: enabled ? { kind: "on" } : { kind: "off" } });
    },
    describeRelays: () => mockRelays.describeRelays(),
    addRelay: (adapter, settings) => mockRelays.addRelay(adapter, settings),
    configureRelay: (relayId, settings) => mockRelays.configureRelay(relayId, settings),
    removeRelay: (relayId) => mockRelays.removeRelay(relayId),
    onStreamPageRequested: (streamPageRequestListener) => {
      if (streamPageRequestedByANotification === null) return () => {};
      const notificationClickTimer = window.setTimeout(() => streamPageRequestListener(streamPageRequestedByANotification), MOCK_NOTIFICATION_CLICK_MILLISECONDS);
      return () => window.clearTimeout(notificationClickTimer);
    },
    showTheProjectsWindow: async () => {
      openProjectReading = { kind: "none_open" };
      for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(openProjectReading));
    },
    chooseProjectFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const chosenReading = mockOpenProjectReading("read", fixtures.machine.homeDirectory);
      const folder = chosenReading.kind === "read" ? chosenReading.open_project.project.folder : fixtures.machine.homeDirectory;
      openTheProjectInTheMock(chosenReading, folder, chosenReading.kind === "read" ? chosenReading.open_project.project.name : null);
      return { folder, project_creation: null };
    },
    readNewProjectDefaults: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockNewProjectDefaults(fixtures.machine.homeDirectory, mockFoldersOnDisk());
    },
    chooseNewProjectLocation: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockNewProjectLocationTheDialogAnswers(fixtures.machine.homeDirectory);
    },
    createNewProject: async (name, location) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const nameRefusal = newProjectFolderNameRefusal(name);
      if (nameRefusal !== null) throw nameRefusal;
      const folder = `${location}/${name.trim()}`;
      if (mockFoldersOnDisk().includes(folder)) throw `${folder} already exists. Choose another name or location.`;
      projectFolders.set(folder, { streamFunctions: ["main"], hasAPythonEnvironment: false });
      const action = queueAMockProjectLoad(folder);
      const newReading = mockNewProjectReading(folder, name.trim());
      openTheProjectInTheMock(newReading, folder, newReading.kind === "read" ? newReading.open_project.project.name : null);
      return { folder, project_creation: { action, stream: mockStreamIdOf({ project_directory: folder, stream_function: "stream:main" }), project_directory: folder } };
    },
    readOpenProject: async () => structuredClone(openProjectReading),
    popOutViewer: async (target) => {
      window.open(mockPoppedOutViewerPageUrl(window.location.href, target), "_blank");
    },
    readPoppedOutViewer: async () => structuredClone(mockTatolabOptions.poppedOutViewer),
    openGetMoreWindow: async () => {
      window.open(mockPageUrlWith(window.location.href, GET_MORE_QUERY_PARAMETER, "open"), "_blank");
    },
    readGetMoreWorkspace: async () => (mockTatolabOptions.isAGetMoreWindow ? structuredClone(openProjectReading) : null),
    readPackageCatalog: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockPackageCatalogReading(mockTatolabOptions.isTheCatalogUnserved);
    },
    previewImport: async (requirement) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open to import into.";
      const { project } = openProjectReading.open_project;
      const importedName = mockRequirementsName(requirement);
      if (project.requirements.some((existing) => mockRequirementsName(existing) === importedName)) throw `The project already imports ${importedName}.`;
      return {
        file: `${project.folder}/pyproject.toml`,
        text_before: mockPyprojectTextOf(project),
        text_after: mockPyprojectTextOf({ ...project, requirements: [...project.requirements, requirement] }),
        based_on_version: `mock-pyproject-${project.requirements.length}`,
      };
    },
    importIntoWorkspace: async (requirement, basedOnVersion) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open to import into.";
      const { project, imports } = openProjectReading.open_project;
      if (basedOnVersion !== `mock-pyproject-${project.requirements.length}`) throw "pyproject.toml changed since the import was shown; nothing was written. Look at the change again before importing.";
      openProjectReading = {
        kind: "read",
        open_project: {
          project: { ...project, requirements: [...project.requirements, requirement] },
          imports: [...imports, { name: mockRequirementsName(requirement), requirement, source: { kind: "package_index" } }],
        },
      };
      for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(openProjectReading));
    },
    openImportToEdit: async (name) => {
      const importedProject = openProjectReading.kind === "read" ? openProjectReading.open_project.imports.find((imported) => imported.name === name) : undefined;
      if (importedProject === undefined) throw `The project imports nothing named ${name}.`;
      if (importedProject.source.kind !== "folder") throw `${name} comes from a package index, so it has no folder of its own to open; only an import from a folder opens to edit.`;
      const studioPageUrl = new URL(window.location.href);
      studioPageUrl.searchParams.delete(GET_MORE_QUERY_PARAMETER);
      window.open(studioPageUrl.toString(), "_blank");
    },
    readRecentProjects: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(recentProjects);
    },
    openRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      openTheProjectInTheMock(mockRecentProjectReading(recentProject, fixtures.machine.homeDirectory), folder, recentProject.project_name);
    },
    onOpenProjectChanged: (openProjectListener) => {
      openProjectListeners.add(openProjectListener);
      return () => openProjectListeners.delete(openProjectListener);
    },
    onTatolabStatusChanged: async (statusListener) => {
      statusListeners.add(statusListener);
      return () => statusListeners.delete(statusListener);
    },
    readProjectFile: async (file) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.read(file);
    },
    saveProjectFile: async (file, text, basedOnVersion) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.save(file, text, basedOnVersion);
    },
    listProjectFiles: async (projectFolder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.list(projectFolder);
    },
    runOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind === "none_open") throw "No project is open to run.";
      if (openProjectReading.kind === "unreadable") throw openProjectReading.refusal;
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const folder = openProjectReading.open_project.project.folder;
      return { action: queueAMockProjectLoad(folder), project_directory: folder };
    },
    startPythonLanguageServer: async (projectFolder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      mockProjectFiles.list(projectFolder);
      languageServerSessionCount += 1;
      const session = `python-language-server-${languageServerSessionCount}`;
      mockLanguageServersBySession.set(
        session,
        new MockPythonLanguageServer((message) => {
          window.setTimeout(() => {
            if (!mockLanguageServersBySession.has(session)) return;
            for (const listener of languageServerEventListeners) listener({ session, kind: "message", message });
          }, MOCK_COMMAND_LATENCY_MILLISECONDS);
        }),
      );
      return session;
    },
    sendToPythonLanguageServer: async (session, message) => {
      const mockLanguageServer = mockLanguageServersBySession.get(session);
      if (mockLanguageServer === undefined) throw `The language server ${session} has ended.`;
      mockLanguageServer.receive(message);
    },
    stopPythonLanguageServer: async (session) => {
      mockLanguageServersBySession.delete(session);
    },
    onPythonLanguageServerEvent: (listener) => {
      languageServerEventListeners.add(listener);
      return () => languageServerEventListeners.delete(listener);
    },
    openPortViewer: async (target) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const node = loadedStreamOfTheId(target.stream).fixture.graph.nodes.find((graphNode) => mockNodeIdOf(target.stream, graphNode.name) === target.node_id);
      if (node === undefined) throw `no node with the id \`${target.node_id}\` in stream \`${target.stream}\``;
      const outputPort = node.output_ports.find((port) => port.name === target.port);
      if (outputPort === undefined) throw `\`${node.name}\` has no output port named \`${target.port}\``;
      return mockPortViewers.open(target, node.name, outputPort.family);
    },
    closePortViewer: async (portViewer) => {
      mockPortViewers.close(portViewer);
    },
    onPortViewerEvent: (listener) => mockPortViewers.onEvent(listener),
    onPortViewerImageFrame: (listener) => mockPortViewers.onImageFrame(listener),
  };
}
