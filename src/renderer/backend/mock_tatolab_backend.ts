import {
  createMockStreamFixtures,
  createMockStreamRunFromAProjectFolder,
  type MockLiveLogWriter,
  type MockLogRecordDraft,
  type MockMachine,
  type MockStreamFixture,
  stampMockLogRecord,
} from "./mock_stream_fixtures";
import { createMockRelays, mockRelaysScenarioNamed, type MockRelaysScenario } from "./mock_relays";
import { mockStreamGraphSummary } from "./mock_stream_graph_document";
import type { TatolabBackend } from "./tatolab_backend";
import {
  STREAM_LOG_FOLDER_IN_THE_PROJECT,
  type ListedStream,
  type PythonForNewEnvironments,
  type RuntimeDescription,
  type TatolabAppBuild,
  type TatolabAppOpenAtLogin,
  type TatolabCommandLineToolVersion,
  type StreamGraphSummary,
  type StreamLogRecord,
  type StreamLogRecordsPage,
  type StreamProjectFolderReport,
  type StreamProjectPythonEnvironment,
  type StreamProjectRunOutcome,
  type StreamRunAnswer,
  type TatolabAppUpdateState,
  type TatolabPlatform,
  type TatolabStatus,
} from "../../shared/tatolab_backend_contract";

/**
 * Browser-only stand-ins for the app backend, picked with `?state=`. `approval`, `missing` and `not-registered` exist
 * only on macOS. `setup` is first run on macOS, its runtime starting as the app opens, and Linux's missing installer.
 */
export type MockTatolabScenario =
  | "running"
  | "empty"
  | "loading"
  | "node-error"
  | "dropping"
  | "not-listed"
  | "starting"
  | "stopped"
  | "approval"
  | "missing"
  | "not-registered"
  | "setup"
  | "unreachable"
  | "never-answered"
  | "blocked";

const MOCK_TATOLAB_SCENARIOS: readonly MockTatolabScenario[] = [
  "running",
  "empty",
  "loading",
  "node-error",
  "dropping",
  "not-listed",
  "starting",
  "stopped",
  "approval",
  "missing",
  "not-registered",
  "setup",
  "unreachable",
  "never-answered",
  "blocked",
];

const MACOS_ONLY_SCENARIOS: readonly MockTatolabScenario[] = ["approval", "missing", "not-registered"];

/** Where the mock links the `tatolab` command behind the administrator prompt. */
const MOCK_USR_LOCAL_BIN_LINK = "/usr/local/bin/tatolab";

/** Why the mock refuses a `/usr/local/bin` link on Linux, as the app does. */
const MOCK_LINUX_INSTALLER_LINKS_THE_COMMAND = "On Linux the installer links tatolab into ~/.local/bin with the runtime.";

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
/** How many of a stream's newest records the runtime holds in memory. */
const MOST_RECORDS_THE_RUNTIME_HOLDS = 4096;

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
 * `.venv` yet, which a run makes first, one with several `@stream` functions, one whose function's name a listed stream holds,
 * one with no `stream.py`, or none, the person cancelling.
 */
export type MockChosenProjectFolder = "ready" | "no-venv" | "several" | "taken" | "no-stream-file" | "cancel";

const MOCK_CHOSEN_PROJECT_FOLDERS: readonly MockChosenProjectFolder[] = ["ready", "no-venv", "several", "taken", "no-stream-file", "cancel"];

/** The runtime the mock describes: the streamlib release the app bundles, and its build. */
const MOCK_RUNTIME_VERSION = "0.55.2";
const MOCK_RUNTIME_BUILD_ID = "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60";

/** How long the mock runtime has been up as the page opens: 3 days, 2 hours and 14 minutes. */
const MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS = ((3 * 24 + 2) * 60 + 14) * 60_000;

/** How long the mock service manager takes to answer a restart. */
const MOCK_RUNTIME_RESTART_MILLISECONDS = 700;

/** How long the mock runtime takes to compile, load and start a project. */
const MOCK_RUN_STREAM_MILLISECONDS = 2600;
/** How long the mock `tatolab new` takes. */
const MOCK_TATOLAB_NEW_MILLISECONDS = 400;
/** How long the app's uv takes to make a project's `.venv` in the mock, before the runtime compiles it. */
const MOCK_PYTHON_ENVIRONMENT_MILLISECONDS = 3200;

/** Tatolab's built-in Python in the mock, as python-build-standalone names its version. */
const MOCK_BUILT_IN_PYTHON_VERSION = "3.12.12";
/** The interpreter the mock's file dialog picks in Settings. */
const MOCK_PICKED_PYTHON_INTERPRETER = "/opt/homebrew/bin/python3.12";
/** The version MOCK_PICKED_PYTHON_INTERPRETER answers to `--version`, which a `.venv` made from it names. */
const MOCK_PICKED_PYTHON_VERSION = "3.12.7";

/** What uv says in the mock when `?add_venv=refused` has it fail to make a project's `.venv`: the package index out of reach. */
const MOCK_UV_SYNC_REFUSAL = [
  "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`",
  "  Caused by: Request failed after 3 retries",
  "  Caused by: error sending request for url (https://pypi.org/simple/tatolab-stream/)",
  "  Caused by: dns error: failed to lookup address information: nodename nor servname provided, or not known",
].join("\n");

/** What the mock's file dialog does when Settings asks for a Python, picked with `?python_pick=`: picks an interpreter (the default), is cancelled, or picks a file that is no Python. */
export type MockPythonInterpreterPick = "picked" | "cancel" | "not_python";

/** What `?python=` names: Tatolab's built-in Python (the default), an interpreter already chosen, or a build that carries no Python. */
function mockPythonForNewEnvironments(pythonInTheQuery: string | null): PythonForNewEnvironments {
  switch (pythonInTheQuery) {
    case "chosen":
      return { kind: "chosen", interpreter: MOCK_PICKED_PYTHON_INTERPRETER };
    case "not_offered":
      return {
        kind: "built_in_not_offered",
        reason: "This build of Tatolab carries no uv or Python of its own, so it cannot set up a project's Python. Run uv sync in the project's folder instead.",
      };
    default:
      return { kind: "built_in", python_version: MOCK_BUILT_IN_PYTHON_VERSION };
  }
}

/** The lines the mock compile writes to its standard error with `?add_run=warning`, as StreamLib's cross-floor check words them. */
const MOCK_COMPILE_WARNINGS = ["tatolab: the cross-floor check found 1 thing binding this app to one floor.", "  nodes/heat_render.py:4: imports `cupy`"];

/** What the page's query asks of the mock. */
export interface MockTatolabOptions {
  scenario: MockTatolabScenario;
  platform: TatolabPlatform;
  /** `?uninstall=cancel`: the administrator cancels the prompt an uninstall shows, so the uninstall is refused. */
  isUninstallPromptCancelled: boolean;
  appUpdateScenario: MockTatolabAppUpdateScenario;
  /** `?stop_not_recorded=<stream>`: stopping that kept stream unloads it but cannot write its record, as when the runtime's state directory refuses the write. */
  streamWhoseStopIsNotRecorded: string | null;
  /** `?terminal=missing`: the desktop has no terminal to open, as a Linux desktop without `x-terminal-emulator`. */
  isTheTerminalMissing: boolean;
  /** `?log_folder=missing`: no stream has a log folder on disk yet, so opening one is refused as the app refuses it. */
  isTheLogFolderMissing: boolean;
  /** `?held_records=<n>`: the runtime holds only each stream's newest `n` records, as it holds its newest 4096, so a stream's earlier records are no longer held. */
  mostRecordsHeldPerStream: number;
  /** `?add_folder=`: the project folder the folder dialog chooses. */
  chosenProjectFolder: MockChosenProjectFolder;
  /** `?add_run=warning`: a project's compile writes a cross-floor warning. */
  doesTheCompileWriteAWarning: boolean;
  /** `?add_cli=missing`: this build has no `tatolab` CLI, so creating a project is refused. */
  isTheTatolabCommandMissing: boolean;
  /** `?runtime_log=none`: the runtime keeps no log of its own, so `describe_runtime` names no folder. */
  doesTheRuntimeKeepNoOwnLog: boolean;
  /** `?restart=refused`: the service manager refuses to restart the runtime. */
  isTheRuntimeRestartRefused: boolean;
  /** `?open_at_login=on|approval|not_offered`: what the desktop reports of opening the app at login; off by default. */
  openAtLogin: TatolabAppOpenAtLogin;
  /** `?notifications=unsupported`: this desktop shows no notifications. */
  doesTheDesktopShowNoNotifications: boolean;
  /** `?cli_version=reading|unreadable`: the CLI's version still being read, or unreadable; read by default. */
  commandLineToolVersion: TatolabCommandLineToolVersion;
  /** `?stream_page_requested=<stream>`: a click on that stream's failure notification, a moment after the window listens. */
  streamPageRequestedByANotification: string | null;
  /** `?first_run=unfinished`: Get Started has not ended first run, so macOS shows Welcome over whatever state the runtime is in. */
  isFirstRunUnfinished: boolean;
  /** `?usr_local_bin=linked|cancel`: the `tatolab` command already linked in `/usr/local/bin`, or the prompt that links it cancelled. */
  usrLocalBinLinkScenario: "not_linked" | "linked" | "cancel";
  /** `?first_run_remember=refused`: Get Started ends first run but its file cannot be written, as when the app's config folder refuses it. */
  isRememberingFirstRunRefused: boolean;
  /** `?app_build=release|modified|none`: a release build, a dev build with uncommitted changes, or one that recorded none; a dev build by default. */
  appBuild: TatolabAppBuild | null;
  /** `?python=chosen|not_offered`: the Python new environments are made from; Tatolab's built-in by default. */
  pythonForNewEnvironments: PythonForNewEnvironments;
  /** `?python_pick=cancel|not_python`: what the file dialog Settings opens for a Python does. */
  pythonInterpreterPick: MockPythonInterpreterPick;
  /** `?add_venv=refused`: the app's uv fails to make a project's `.venv`, as with the package index out of reach. */
  isMakingThePythonEnvironmentRefused: boolean;
  /** `?relays=local`: the runtime holds only the local relay's two listeners; a joined Cloudflare relay and a lost moq.pro one beside them by default. */
  relaysScenario: MockRelaysScenario;
  /** `?relay_add=refused`: every relay added is refused as one that could not be joined. */
  isEveryRelayAddRefused: boolean;
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
      return { kind: "not_offered", reason: "Only a packaged Tatolab opens at login." };
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
    isTheTerminalMissing: pageQuery.get("terminal") === "missing",
    isTheLogFolderMissing: pageQuery.get("log_folder") === "missing",
    mostRecordsHeldPerStream: positiveWholeNumberOrNull(pageQuery.get("held_records")) ?? MOST_RECORDS_THE_RUNTIME_HOLDS,
    chosenProjectFolder: MOCK_CHOSEN_PROJECT_FOLDERS.find((knownFolder) => knownFolder === pageQuery.get("add_folder")) ?? "ready",
    doesTheCompileWriteAWarning: pageQuery.get("add_run") === "warning",
    isTheTatolabCommandMissing: pageQuery.get("add_cli") === "missing",
    doesTheRuntimeKeepNoOwnLog: pageQuery.get("runtime_log") === "none",
    isTheRuntimeRestartRefused: pageQuery.get("restart") === "refused",
    openAtLogin: mockOpenAtLogin(pageQuery.get("open_at_login")),
    doesTheDesktopShowNoNotifications: pageQuery.get("notifications") === "unsupported",
    commandLineToolVersion: mockCommandLineToolVersion(pageQuery.get("cli_version")),
    streamPageRequestedByANotification: pageQuery.get("stream_page_requested"),
    isFirstRunUnfinished: pageQuery.get("first_run") === "unfinished",
    usrLocalBinLinkScenario: pageQuery.get("usr_local_bin") === "linked" ? "linked" : pageQuery.get("usr_local_bin") === "cancel" ? "cancel" : "not_linked",
    isRememberingFirstRunRefused: pageQuery.get("first_run_remember") === "refused",
    appBuild: mockAppBuild(pageQuery.get("app_build")),
    pythonForNewEnvironments: mockPythonForNewEnvironments(pageQuery.get("python")),
    pythonInterpreterPick: pageQuery.get("python_pick") === "cancel" ? "cancel" : pageQuery.get("python_pick") === "not_python" ? "not_python" : "picked",
    isMakingThePythonEnvironmentRefused: pageQuery.get("add_venv") === "refused",
    relaysScenario: mockRelaysScenarioNamed(pageQuery.get("relays")),
    isEveryRelayAddRefused: pageQuery.get("relay_add") === "refused",
  };
}

function positiveWholeNumberOrNull(text: string | null): number | null {
  const number = Number(text);
  return text !== null && Number.isInteger(number) && number > 0 ? number : null;
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
  {
    appUpdateScenario,
    openAtLogin,
    doesTheDesktopShowNoNotifications,
    commandLineToolVersion,
    isFirstRunUnfinished,
    usrLocalBinLinkScenario,
    appBuild,
    pythonForNewEnvironments,
  }: MockTatolabOptions,
): TatolabStatus {
  const runningStatus: TatolabStatus = {
    app_version: "0.45.0",
    app_build: appBuild,
    platform,
    run_tatolab: true,
    runtime_agent: "enabled",
    runtime_state: "running",
    machine_name: machine.name,
    streams: [],
    first_run_finished: !isFirstRunUnfinished,
    command_line_tool_linked_at: machine.commandLineToolLinkedAt,
    command_line_tool_usr_local_bin_link:
      platform === "linux"
        ? { kind: "not_offered", reason: MOCK_LINUX_INSTALLER_LINKS_THE_COMMAND }
        : usrLocalBinLinkScenario === "linked"
          ? { kind: "linked", path: MOCK_USR_LOCAL_BIN_LINK }
          : { kind: "not_linked" },
    app_update: initialMockAppUpdateState(appUpdateScenario),
    local_api_socket: machine.localApiSocket,
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: !doesTheDesktopShowNoNotifications },
    open_at_login: openAtLogin,
    command_line_tool_version: commandLineToolVersion,
    python_for_new_environments: pythonForNewEnvironments,
  };
  switch (scenario) {
    case "running":
    case "empty":
    case "loading":
    case "node-error":
    case "dropping":
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
    case "never-answered":
      return { ...runningStatus, runtime_state: "never_answered", machine_name: null, streams: null };
    case "blocked":
      return { ...runningStatus, runtime_state: "blocked_by_the_service_manager", machine_name: null, streams: null };
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
      return { ...runningStatus, runtime_state: "starting", machine_name: null, streams: null, first_run_finished: false };
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
    isUninstallPromptCancelled,
    appUpdateScenario,
    streamWhoseStopIsNotRecorded,
    isTheTerminalMissing,
    isTheLogFolderMissing,
    mostRecordsHeldPerStream,
    chosenProjectFolder,
    doesTheCompileWriteAWarning,
    isTheTatolabCommandMissing,
    doesTheRuntimeKeepNoOwnLog,
    isTheRuntimeRestartRefused,
    streamPageRequestedByANotification,
    usrLocalBinLinkScenario,
    isRememberingFirstRunRefused,
    pythonInterpreterPick,
    isMakingThePythonEnvironmentRefused,
    relaysScenario,
    isEveryRelayAddRefused,
  } = mockTatolabOptions;
  const fixtures = createMockStreamFixtures(platform);
  const mainStream =
    scenario === "node-error"
      ? fixtures.mainStreamWithDisplayWindowInError
      : scenario === "dropping"
        ? fixtures.mainStreamWithItsMeterFallingBehind
        : fixtures.mainStream;
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
  let mockStatus = initialMockStatus(scenario, platform, fixtures.machine, mockTatolabOptions);
  /** Tatolab's own Python as this build has it, which choosing it again goes back to. */
  const initialPythonForNewEnvironmentsBuiltIn: PythonForNewEnvironments =
    mockTatolabOptions.pythonForNewEnvironments.kind === "chosen"
      ? { kind: "built_in", python_version: MOCK_BUILT_IN_PYTHON_VERSION }
      : mockTatolabOptions.pythonForNewEnvironments;
  let isLoginItemsApproved = scenario !== "approval";
  let runtimeUpSinceMilliseconds: number | null = null;
  /** When the mock runtime's engine started, which its uptime counts from: long before the page opened, until a restart. */
  let runtimeEngineStartedAtMilliseconds = Date.now() - MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS;
  let loadedStreamInstanceCount = 3;
  let liveTickTimer: number | undefined;

  const publishStatus = (statusChanges: Partial<TatolabStatus>): void => {
    mockStatus = { ...mockStatus, ...statusChanges };
    for (const statusListener of statusListeners) statusListener(structuredClone(mockStatus));
  };

  /** The streams run from the window's Add stream, listed after the fixtures', in the order they were run. */
  const streamNamesRunFromTheWindow: string[] = [];
  const listStreams = (): ListedStream[] | null => {
    if (scenario === "not-listed") return null;
    return [...(scenario === "empty" ? [] : fixtures.listingOrder), ...streamNamesRunFromTheWindow]
      .map((streamName) => loadedStreams.get(streamName)?.fixture.listing ?? listedStreamsNotLoaded.get(streamName) ?? null)
      .filter((listing): listing is ListedStream => listing !== null);
  };

  /** Each project folder the mock knows, by path, as the window would be told it holds it; a folder not here does not exist. */
  const projectFolders = new Map<string, StreamProjectFolderReport>();
  const foldersHandedToTheWindow = new Set<string>();
  const projectsFolder = `${fixtures.machine.homeDirectory}/code`;
  const syncedPythonEnvironment = { kind: "present", python_version: "3.12.10", tatolab_stream_version: "0.55.0" } as const;
  /** A `.venv` as the app's uv makes it from the Python for new environments, or uv's words when it cannot. */
  const pythonEnvironmentTheAppMakes = (): { made: StreamProjectPythonEnvironment } | { refusal: string } => {
    const pythonForNewEnvironments = mockStatus.python_for_new_environments;
    if (pythonForNewEnvironments.kind === "built_in_not_offered") return { refusal: pythonForNewEnvironments.reason };
    if (isMakingThePythonEnvironmentRefused) return { refusal: MOCK_UV_SYNC_REFUSAL };
    const pythonVersion = pythonForNewEnvironments.kind === "built_in" ? pythonForNewEnvironments.python_version : MOCK_PICKED_PYTHON_VERSION;
    return { made: { kind: "present", python_version: pythonVersion, tatolab_stream_version: "0.55.0" } };
  };
  const projectFolderReport = (folder: string, streamFunctions: string[], isSynced: boolean): StreamProjectFolderReport => ({
    folder,
    folder_exists: true,
    stream_file_present: streamFunctions.length > 0,
    stream_functions: streamFunctions,
    python_environment: isSynced ? syncedPythonEnvironment : { kind: "missing" },
  });
  const projectFolderTheDialogChooses = (): StreamProjectFolderReport | null => {
    switch (chosenProjectFolder) {
      case "ready":
        return projectFolderReport(`${projectsFolder}/heat-map`, ["heat_map"], true);
      case "no-venv":
        return projectFolderReport(`${projectsFolder}/heat-map`, ["heat_map"], false);
      case "several":
        return projectFolderReport(`${projectsFolder}/doorways`, ["front_door", "back_door"], true);
      case "taken":
        return projectFolderReport(`${projectsFolder}/main-v2`, [fixtures.mainStream.listing.name], true);
      case "no-stream-file":
        return projectFolderReport(`${projectsFolder}/notes`, [], true);
      case "cancel":
        return null;
    }
  };
  const handToTheWindow = (report: StreamProjectFolderReport): StreamProjectFolderReport => {
    foldersHandedToTheWindow.add(report.folder);
    if (report.folder_exists) projectFolders.set(report.folder, report);
    return structuredClone(report);
  };
  const refuseAFolderNotHandedToTheWindow = (folder: string): void => {
    if (!foldersHandedToTheWindow.has(folder)) throw `Tatolab acts only on a folder chosen in its window. Choose ${folder} again.`;
  };
  const firstFreeNewStreamProjectFolder = (): string => {
    const newProjectsFolder = `${fixtures.machine.homeDirectory}/streams`;
    let candidate = `${newProjectsFolder}/hello`;
    for (let suffix = 2; projectFolders.has(candidate); suffix += 1) candidate = `${newProjectsFolder}/hello-${suffix}`;
    return candidate;
  };
  const newProjectFolderReport = (folder: string): StreamProjectFolderReport => ({
    folder,
    folder_exists: false,
    stream_file_present: false,
    stream_functions: [],
    python_environment: { kind: "missing" },
  });
  /** `run_stream` as the runtime does it: refused for a project with no `.venv` and for a name a listed stream holds, else loaded kept. */
  const runMockStreamProject = (folder: string, streamFunction: string | null, streamName: string | null): StreamProjectRunOutcome => {
    const project = projectFolders.get(folder);
    if (project === undefined || project.python_environment.kind === "missing") {
      throw `Invalid configuration: ${folder} has no .venv/bin/python; run \`uv sync\` in ${folder}`;
    }
    const functionName = streamFunction?.split(":").at(-1) ?? project.stream_functions[0] ?? "main";
    const loadedName = streamName ?? functionName;
    const listedNames = (listStreams() ?? []).map((listing) => listing.name);
    const listedHolder = (listStreams() ?? []).find((listing) => listing.name === loadedName);
    const isAReplacement = listedHolder?.project_directory === folder;
    const holder = isAReplacement ? undefined : listedHolder;
    const takenRefusal = `Stream graph error: the stream name \`${loadedName}\` is held by a kept stream from ${holder?.project_directory ?? ""}; load this one under another name with \`--name\``;
    if (holder !== undefined && streamName === null) throw takenRefusal;
    if (holder !== undefined) {
      let suffix = 2;
      while (listedNames.includes(`${loadedName}-${suffix}`)) suffix += 1;
      return { kind: "name_taken", refusal: takenRefusal, free_name: `${loadedName}-${suffix}` };
    }
    const fixture = createMockStreamRunFromAProjectFolder(fixtures.machine, loadedName, folder);
    if (!isAReplacement) streamNamesRunFromTheWindow.push(loadedName);
    loadStream(fixture, Date.now());
    publishStatus({ streams: listStreams() });
    const answer: StreamRunAnswer = {
      stream: loadedName,
      stream_instance: loadedStreams.get(loadedName)?.streamInstance ?? "",
      kept: true,
      project_directory: folder,
      node_count: fixture.listing.node_count ?? 0,
      replaced_the_kept_record: isAReplacement,
      compile_warnings: doesTheCompileWriteAWarning ? [...MOCK_COMPILE_WARNINGS] : [],
    };
    return { kind: "running", answer };
  };

  const holdRecords = (loadedStream: MockLoadedStream, drafts: MockLogRecordDraft[]): void => {
    for (const draft of drafts) {
      loadedStream.heldRecords.push(stampMockLogRecord(draft, loadedStream.nextSequence, loadedStream.loadedAtMilliseconds, loadedStream.fixture.listing.name));
      loadedStream.nextSequence += 1;
    }
    if (loadedStream.heldRecords.length > mostRecordsHeldPerStream) {
      loadedStream.heldRecords.splice(0, loadedStream.heldRecords.length - mostRecordsHeldPerStream);
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
    keptFixturesNotLoaded.delete(fixture.listing.name);
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
    if ((scenario === "running" || scenario === "node-error" || scenario === "dropping" || scenario === "loading") && !hasTheAttachedDemoSessionEnded) {
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
      if (!mockStatus.run_tatolab || mockStatus.runtime_state !== "starting") return;
      runtimeEngineStartedAtMilliseconds = Date.now();
      bringRuntimeUp();
    }, MOCK_RUNTIME_STARTUP_MILLISECONDS);
  };

  const noRuntimeAnswersRefusal = (): string => `no runtime answers at ${mockStatus.local_api_socket}: connect ENOENT ${mockStatus.local_api_socket}`;
  const mockRelays = createMockRelays({
    scenario: relaysScenario,
    isEveryAddRefused: isEveryRelayAddRefused,
    isTheRuntimeRunning: () => mockStatus.runtime_state === "running",
    noRuntimeAnswersRefusal,
  });

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
    const millisecondsSinceSettled = Date.now() - loadedStream.loadedAtMilliseconds - MOCK_STREAM_SETTLE_MILLISECONDS;
    return mockStreamGraphSummary(loadedStream.fixture.listing.name, fixtures.machine.name, loadedStream.fixture.graph, {
      hasSettled: millisecondsSinceSettled >= 0,
      secondsSinceSettled: Math.max(0, millisecondsSinceSettled) / 1000,
    });
  };

  /** The project folder the mock runtime lists for `streamName`, as the main process looks it up before opening it. */
  const listedProjectFolderOf = (streamName: string): string => {
    const listedStream = listStreams()?.find((stream) => stream.name === streamName) ?? null;
    if (listedStream === null) throw `The runtime does not list ${streamName}, so Tatolab has no project folder to open.`;
    return listedStream.project_directory;
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
  // Opening the app registers the runtime's agent, so first run's runtime comes up as the real one does.
  if (scenario === "setup" && platform === "macos") startRuntime();

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
    rememberFirstRunFinished: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ first_run_finished: true });
      if (isRememberingFirstRunRefused) {
        throw "EACCES: permission denied, open '/Users/jonathanf/Library/Application Support/com.tatolab.tatolab/first-run-finished.json'";
      }
    },
    linkCommandLineToolInUsrLocalBin: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (platform === "linux") throw MOCK_LINUX_INSTALLER_LINKS_THE_COMMAND;
      await sleep(MOCK_ADMINISTRATOR_PROMPT_MILLISECONDS);
      if (usrLocalBinLinkScenario === "cancel") throw "The password prompt was cancelled, so nothing changed.";
      publishStatus({ command_line_tool_usr_local_bin_link: { kind: "linked", path: MOCK_USR_LOCAL_BIN_LINK } });
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
      publishStatus({ command_line_tool_linked_at: null, command_line_tool_usr_local_bin_link: { kind: "not_linked" } });
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
    openStreamProjectFolder: async (streamName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamName);
    },
    openTerminalAtStreamProject: async (streamName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamName);
      if (isTheTerminalMissing) {
        throw "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.";
      }
    },
    openStreamLogFolder: async (streamName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const projectFolder = listedProjectFolderOf(streamName);
      if (isTheLogFolderMissing) throw `${streamName} has no log folder yet: ${projectFolder}/${STREAM_LOG_FOLDER_IN_THE_PROJECT} is not on this machine.`;
    },
    chooseStreamProjectFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const chosen = projectFolderTheDialogChooses();
      return chosen === null ? null : handToTheWindow(chosen);
    },
    proposeNewStreamProjectFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return handToTheWindow(newProjectFolderReport(firstFreeNewStreamProjectFolder()));
    },
    createStreamProject: async (folder) => {
      await sleep(MOCK_TATOLAB_NEW_MILLISECONDS);
      refuseAFolderNotHandedToTheWindow(folder);
      if (isTheTatolabCommandMissing) throw "This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead.";
      if (projectFolders.has(folder)) throw `\`${folder}\` already has stream.py, pyproject.toml — scaffolding would overwrite it. Pick an empty directory.`;
      return handToTheWindow(projectFolderReport(folder, ["main"], false));
    },
    runStreamProject: async (folder, streamFunction, streamName) => {
      refuseAFolderNotHandedToTheWindow(folder);
      const project = projectFolders.get(folder);
      if (project !== undefined && project.python_environment.kind === "missing") {
        await sleep(MOCK_PYTHON_ENVIRONMENT_MILLISECONDS);
        const pythonEnvironment = pythonEnvironmentTheAppMakes();
        if ("refusal" in pythonEnvironment) return { kind: "python_environment_not_made", words: pythonEnvironment.refusal };
        projectFolders.set(folder, { ...project, python_environment: pythonEnvironment.made });
      }
      await sleep(MOCK_RUN_STREAM_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer run_stream`;
      return runMockStreamProject(folder, streamFunction, streamName);
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
      if (!mockStatus.run_tatolab) throw "Run Tatolab is off, so there is no runtime to restart. Turn Run Tatolab on to start it.";
      if (isTheRuntimeRestartRefused) {
        throw platform === "linux"
          ? "systemctl --user restart tatolabd.service failed (exit 1): Job for tatolabd.service failed because the control process exited with error code."
          : "launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error";
      }
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
    choosePythonForNewEnvironments: async (python) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      switch (python) {
        case "built_in":
          publishStatus({ python_for_new_environments: initialPythonForNewEnvironmentsBuiltIn });
          return;
        case "chosen_in_a_file_dialog":
          if (pythonInterpreterPick === "cancel") return;
          if (pythonInterpreterPick === "not_python") throw "/usr/bin/ruby is not a Python interpreter: ruby 3.3.0";
          publishStatus({ python_for_new_environments: { kind: "chosen", interpreter: MOCK_PICKED_PYTHON_INTERPRETER } });
          return;
      }
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
    onTatolabStatusChanged: async (statusListener) => {
      statusListeners.add(statusListener);
      return () => statusListeners.delete(statusListener);
    },
  };
}
