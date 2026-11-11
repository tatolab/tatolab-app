import { jsonValueSchema } from "@tatolab/tato-app-view-sdk/studio_readings";
import { MOCK_NODE_CATALOG_ENTRIES } from "./mock_node_catalog";
import { mockPackageCatalogReading } from "./mock_package_catalog";
import { MockWorkspaceDependencies, mockWorkspaceDependenciesScenarioNamed, type MockWorkspaceDependenciesScenario } from "./mock_workspace_dependencies";
import {
  createMockStreamFixtures,
  createMockStreamRunFromAProjectFolder,
  MOCK_RUNTIME_ID,
  mockGraphNodeIdOf,
  mockStreamIdOf,
  type MockStreamGraph,
  type MockLiveLogWriter,
  type MockLogRecordDraft,
  type MockMachine,
  type MockStreamFixture,
  stampMockLogRecord,
} from "./mock_stream_fixtures";
import { isAGraphInputAClientWrites, mockStreamGraphSummary } from "./mock_stream_graph_document";
import {
  mockFoldersInDocumentsTatoStudio,
  mockNewProjectDefaults,
  mockFirstNameNothingHolds,
  mockNewProjectLocationTheDialogAnswers,
  mockProjectArchiveTheDialogAnswers,
  mockNewProjectReading,
  mockOpenProjectReading,
  mockOpenProjectScenarioNamed,
  mockRecentProjectReading,
  mockProjectCoverImageUrl,
  mockRecentProjects,
  type MockOpenProjectScenario,
} from "./mock_open_project";
import { MockPythonLanguageServer } from "./mock_python_language_server";
import { MockPortViewers } from "./mock_port_viewers";
import { mockStudioViewListing, mockStudioViewListingThatDoesNotOpen } from "./mock_studio_view/mock_studio_view_listing";
import { MockProjectFiles } from "./mock_project_files";
import { MOCK_PERSON_EDITING_IN_STUDIO, MockProjectTransactions, mockProjectHistoryScenarioNamed, type MockProjectHistoryScenario } from "./mock_project_transactions";
import { mockProjectNodeTypeListing } from "./mock_project_node_types";
import { mockDeleteTheAsset, mockImportTheFilesChosen, mockProjectAssetListing, mockProjectAssetsUnchanged, mockRelocateTheAsset, type MockAssetImportScenario } from "./mock_project_assets";
import { newProjectFolderNameRefusal } from "../src/shared/new_project_folder_name";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import { isModulesShown, type ModulesShown } from "../src/shared/tatolab_electron_bridge_contract";
import type { JsonValue, ProjectGraphTransaction, ProjectTransaction, StreamAssetCreated, StreamGraphAction } from "../src/shared/tatolab_backend_contract";
import { streamDocumentNameNumberedPast, streamDocumentNameOfTheDisplayName } from "../src/shared/stream_document_name";
import { applyMockGraphTransaction, isAJsonObject, graphActionApplyingTheHistoryOperation, type MockStreamGraphTarget } from "./mock_graph_transactions";
import {
  PROJECT_LOG_FOLDER_IN_THE_PROJECT,
  type ListedStream,
  type OpenProjectReading,
  type PoppedOutView,
  type ProjectLogRecord,
  type ProjectLogRecordsPage,
  type RuntimeDescription,
  type TatolabAppBuild,
  type TatolabAppOpenAtLogin,
  type TatolabCommandLineToolVersion,
  type StreamGraphSummary,
  type ProjectVenvSyncOfAStreamAction,
  type StreamActionDescription,
  type StreamActionVenvSync,
  STREAM_ACTION_STEP_MAKING_THE_VENV,
  type StreamActionCancelAnswer,
  type StreamActionFollowed,
  type StreamProjectFolderChosenFor,
  type TatolabAppUpdateAnnouncement,
  type TatolabAppUpdateState,
  type TatolabPlatform,
  type TatolabStatus,
  type StudioWarning,
  type PythonLanguageServerEvent,
  type SystemMenuBarEntry,
  type SystemMenuBarMenu,
} from "../src/shared/tatolab_backend_contract";

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
 * version installed in place not yet downloaded (`available`), one already downloaded and staged (`ready`),
 * one whose download opens (`download`), a check that fails, or the first launch since an update landed (`landed`).
 */
export type MockTatolabAppUpdateScenario = "up-to-date" | "available" | "ready" | "download" | "failed" | "landed";

const MOCK_TATOLAB_APP_UPDATE_SCENARIOS: readonly MockTatolabAppUpdateScenario[] = ["up-to-date", "available", "ready", "download", "failed", "landed"];

/** The version the mock app runs as. */
const MOCK_APP_VERSION = "0.45.0";

/** The newer version the mock's feed offers. */
const MOCK_NEWER_TATOLAB_VERSION = "0.46.0";
const MOCK_UPDATE_CHECK_MILLISECONDS = 900;
const MOCK_UPDATE_DOWNLOAD_STEP_MILLISECONDS = 250;
const MOCK_UPDATE_DOWNLOAD_STEP_PERCENT = 7;

/**
 * The project folder the mock's folder dialog chooses, picked with `?add_folder=`: one ready to run (the default), one with no
 * `.venv` yet, which the runtime makes first, one with two streams, one of which fails, the project `main` is already
 * imported from, one with no `tatolab-project.json`, or none, the person cancelling.
 */
export type MockChosenProjectFolder = "ready" | "no-venv" | "several" | "recorded" | "no-project-file" | "cancel";

const MOCK_CHOSEN_PROJECT_FOLDERS: readonly MockChosenProjectFolder[] = ["ready", "no-venv", "several", "recorded", "no-project-file", "cancel"];

/** The runtime the mock describes: the streamlib release the app bundles, and its build. */
const MOCK_RUNTIME_VERSION = "0.55.2";
const MOCK_RUNTIME_BUILD_ID = "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60";

/** How long the mock runtime has been up as the page opens: 3 days, 2 hours and 14 minutes. */
const MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS = ((3 * 24 + 2) * 60 + 14) * 60_000;

/** How long the mock takes to stop its runtime for a restart. */
const MOCK_RUNTIME_RESTART_MILLISECONDS = 700;

/** How long the mock runtime's uv takes to make a project's `.venv`, before it compiles it. */
const MOCK_PYTHON_ENVIRONMENT_MILLISECONDS = 3200;

/** What the mock's uv has done at each stage of making a project's `.venv`, shaped as uv 0.13's lines for a numpy and pillow sync make the runtime's `venv_sync`. */
const MOCK_VENV_SYNC_STAGES: readonly StreamActionVenvSync[] = [
  { phase: "resolving", packages_resolved: null, packages_prepared: null, packages_installed: null, downloads_started: 0, downloads_done: 0, packages: [] },
  {
    phase: "downloading",
    packages_resolved: 8,
    packages_prepared: null,
    packages_installed: null,
    downloads_started: 2,
    downloads_done: 1,
    packages: [
      { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 16_672_358 },
      { name: "pillow", version: null, kind: "distribution", state: "downloading", download_size_bytes: 7_130_317 },
    ],
  },
  {
    phase: "installing",
    packages_resolved: 8,
    packages_prepared: 8,
    packages_installed: null,
    downloads_started: 2,
    downloads_done: 2,
    packages: [
      { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 16_672_358 },
      { name: "pillow", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 7_130_317 },
    ],
  },
  {
    phase: "installed",
    packages_resolved: 8,
    packages_prepared: 8,
    packages_installed: 8,
    downloads_started: 2,
    downloads_done: 2,
    packages: [
      { name: "numpy", version: "2.3.4", kind: "distribution", state: "installed", download_size_bytes: 16_672_358 },
      { name: "pillow", version: "12.0.0", kind: "distribution", state: "installed", download_size_bytes: 7_130_317 },
    ],
  },
];
/** The folders the mock runtime draws a new project in under `~/streams`, the first one free. */
const MOCK_NEW_PROJECT_FOLDER_NAMES = ["kind-butte", "quiet-harbor", "amber-delta"];
/** The stream asset of the mock's doorways project that fails to load, as a stream whose camera is missing does. */
const MOCK_FAILING_STREAM_NAME = "back_door";

/** Why the app could not list the streams in the mock's `?state=not-listed`, as the app words a `list_streams` result it cannot read. */
const MOCK_STREAMS_NOT_LISTED_BECAUSE = "the runtime's list_streams result could not be read: missing field `stream_asset`";

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
  /** `?developer_mode=on`: Developer mode is on, so every area's view menu offers Transactions; off by default. */
  isDeveloperModeOn: boolean;
  /** `?x11_warning=due|shown`: the session is X11, so viewers copy their frames, with the warning's dialog still to be shown or shown already; Wayland by default. */
  studioWarnings: StudioWarning[];
  /** `?cli_version=reading|unreadable`: the CLI's version still being read, or unreadable; read by default. */
  commandLineToolVersion: TatolabCommandLineToolVersion;
  /** `?stream_page_requested=<stream id>`: a click on that stream's failure notification, a moment after the window listens. */
  streamPageRequestedByANotification: string | null;
  /** `?system_menu_entry=<entry id>`: the person choosing that entry of the system menu bar, as `Stream › New stream…`, once the window offers it. */
  systemMenuBarEntryChosenByThePerson: string | null;
  /** `?cli_link=not_linked|taken`: `~/.local/bin/tatolab` not linked yet, or held by a file that is not Tatolab's; linked by default. */
  commandLineToolLinkScenario: "linked" | "not_linked" | "taken";
  /** `?app_build=release|modified|none`: a release build, a dev build with uncommitted changes, or one that recorded none; a dev build by default. */
  appBuild: TatolabAppBuild | null;
  /** `?add_venv=refused`: the runtime's uv fails to make a project's `.venv`, as with the package index out of reach, so its load fails: every stream of the project lists failed in uv's words. */
  isMakingThePythonEnvironmentRefused: boolean;
  /** `?streams=earlier_record`: the runtime also lists a record an earlier runtime wrote, failed and naming no location. */
  doesTheRuntimeListAnEarlierRuntimesRecord: boolean;
  /** `?project=none|unreadable`: no project open, or one the runtime names no project in; the pattern project by default. */
  openProjectScenario: MockOpenProjectScenario;
  /** `?history=empty`: the open project has no transactions yet; a few by the person, an agent and the runtime by default. */
  projectHistoryScenario: MockProjectHistoryScenario;
  /** `?recent=none`: no project opened before, as on first run; six recent ones by default. */
  recentProjectsInTheQuery: string | null;
  /** Each port's family is served in the graph and the node catalog, as the runtime serves it; `?port_families=unserved` serves none, as a runtime from before strict-port-families. */
  arePortFamiliesServed: boolean;
  /** `?node_types=unreadable_project`: every module of the open project's own node code does not parse; one of them does not by default. */
  isEveryOwnNodeModuleUnreadable: boolean;
  /** `?asset_import=refuses_one`: Import asset… also refuses a graph document chosen beside the file it imports. */
  assetImportScenario: MockAssetImportScenario;
  /** `?popped_out_view=<popped-out view as JSON>`: the page is a view popped out of the studio, as Pop out into a window opens it in a new tab; the studio by default. */
  poppedOutView: PoppedOutView | null;
  /** `?module_manager=open|edited_files|newer`: the page is the open project's Modules and Marketplace window, as File › Marketplace… or Modules… opens it in a new tab, its import as copied, edited since, or with a newer version on its source; `null` for any other page. */
  moduleManagerWorkspaceDependencies: MockWorkspaceDependenciesScenario | null;
  /** `?module_manager_section=added_to_this_project|marketplace`: the section a Modules and Marketplace window's page opens on, Marketplace when the query names none. */
  moduleManagerSectionOpenedOn: ModulesShown;
  /** `?catalog=unserved`: get.tatolab.com serves no catalog yet; the mock catalog by default. */
  isTheCatalogUnserved: boolean;
  /** `?studio_views=fixture`: the open project brings the fixture view, and `main` holds its node; its import brings one that does not open. */
  isTheFixtureViewListed: boolean;
  /** `?compositor=layered`: `main` holds an alpha-over compositor of two layers on the effect's output. */
  isTheCompositorInMain: boolean;
  /** Whether the open project's main stream declares Graph Inputs, which the Controls view shows. */
  doesTheMainStreamDeclareGraphInputs: boolean;
  /** `?subgraphs=generated`: `main` holds a graph generator's frozen output. */
  doesTheMainStreamHoldAGeneratedSubgraph: boolean;
  /** `?node_states=stopped`: every node of `main` that has a state reads `Stopped` once the stream settles, so none of its ports writes. */
  areTheMainStreamsNodesStopped: boolean;
}

/** The query parameter a Module manager window's page is told by. */
const MODULE_MANAGER_QUERY_PARAMETER = "module_manager";

/** The query parameter naming the section a Module manager window's page opens on. */
const MODULE_MANAGER_SECTION_QUERY_PARAMETER = "module_manager_section";

/** The Modules and Marketplace section `sectionName` names; Marketplace for none or an unknown one. */
function moduleManagerSectionNamed(sectionName: string | null): ModulesShown {
  return isModulesShown(sectionName) ? sectionName : "marketplace";
}

/** The mock page's address with every query parameter kept and `parameterName` set to `parameterValue`, so a new tab opens on the same scenario. */
function mockPageUrlWith(pageUrl: string, parameterName: string, parameterValue: string): string {
  const pageUrlWithTheParameter = new URL(pageUrl);
  pageUrlWithTheParameter.searchParams.set(parameterName, parameterValue);
  return pageUrlWithTheParameter.toString();
}

/** The query parameter a popped-out view's page carries what it is in, as JSON. */
const POPPED_OUT_VIEW_QUERY_PARAMETER = "popped_out_view";

/** What `?popped_out_view=` names: a popped-out view as JSON, or `null` when it holds none that parses. */
function mockPoppedOutViewFrom(poppedOutViewInTheQuery: string | null): PoppedOutView | null {
  if (poppedOutViewInTheQuery === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(poppedOutViewInTheQuery);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const field = (fieldName: string): unknown => Object.entries(parsed).find(([parsedFieldName]) => parsedFieldName === fieldName)?.[1];
  const viewTypeId = field("view_type_id");
  const windowTitle = field("window_title");
  const pinnedTo = jsonValueSchema.safeParse(field("pinned_to"));
  if (typeof viewTypeId !== "string" || typeof windowTitle !== "string" || !pinnedTo.success) return null;
  return { view_type_id: viewTypeId, window_title: windowTitle, pinned_to: pinnedTo.data };
}

/** The mock page's address with `target` as the view it pops out, every other query parameter kept, so the tab opens with the same scenario. */
export function mockPoppedOutViewPageUrl(pageUrl: string, target: PoppedOutView): string {
  return mockPageUrlWith(pageUrl, POPPED_OUT_VIEW_QUERY_PARAMETER, JSON.stringify(target));
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
    isDeveloperModeOn: pageQuery.get("developer_mode") === "on",
    studioWarnings: mockStudioWarnings(pageQuery.get("x11_warning")),
    commandLineToolVersion: mockCommandLineToolVersion(pageQuery.get("cli_version")),
    streamPageRequestedByANotification: pageQuery.get("stream_page_requested"),
    systemMenuBarEntryChosenByThePerson: pageQuery.get("system_menu_entry"),
    commandLineToolLinkScenario: pageQuery.get("cli_link") === "not_linked" ? "not_linked" : pageQuery.get("cli_link") === "taken" ? "taken" : "linked",
    appBuild: mockAppBuild(pageQuery.get("app_build")),
    isMakingThePythonEnvironmentRefused: pageQuery.get("add_venv") === "refused",
    doesTheRuntimeListAnEarlierRuntimesRecord: pageQuery.get("streams") === "earlier_record",
    openProjectScenario: mockOpenProjectScenarioNamed(pageQuery.get("project")),
    projectHistoryScenario: mockProjectHistoryScenarioNamed(pageQuery.get("history")),
    recentProjectsInTheQuery: pageQuery.get("recent"),
    arePortFamiliesServed: pageQuery.get("port_families") !== "unserved",
    isEveryOwnNodeModuleUnreadable: pageQuery.get("node_types") === "unreadable_project",
    assetImportScenario: pageQuery.get("asset_import") === "refuses_one" ? "refuses_one" : "imports_one",
    poppedOutView: mockPoppedOutViewFrom(pageQuery.get(POPPED_OUT_VIEW_QUERY_PARAMETER)),
    moduleManagerWorkspaceDependencies: mockWorkspaceDependenciesScenarioNamed(pageQuery.get(MODULE_MANAGER_QUERY_PARAMETER)),
    moduleManagerSectionOpenedOn: moduleManagerSectionNamed(pageQuery.get(MODULE_MANAGER_SECTION_QUERY_PARAMETER)),
    isTheCatalogUnserved: pageQuery.get("catalog") === "unserved",
    isTheFixtureViewListed: pageQuery.get("studio_views") === "fixture",
    isTheCompositorInMain: pageQuery.get("compositor") === "layered",
    doesTheMainStreamDeclareGraphInputs: pageQuery.get("graph_inputs") === "declared",
    doesTheMainStreamHoldAGeneratedSubgraph: pageQuery.get("subgraphs") === "generated",
    areTheMainStreamsNodesStopped: pageQuery.get("node_states") === "stopped",
  };
}

function positiveWholeNumberOrNull(text: string | null): number | null {
  const number = Number(text);
  return text !== null && Number.isInteger(number) && number > 0 ? number : null;
}

/** Why the runtime's `write_graph_input` refuses `value` for the Input `input` of `loadedStream`, listed as `streamState`, in its words; `null` where it takes it. */
function refusalOfAGraphInputWrite(loadedStream: MockLoadedStream, streamState: string | null, input: string, value: JsonValue): string | null {
  const { listing, graph } = loadedStream.fixture;
  if (streamState !== "running") {
    return `Runtime error: the project of the stream \`${listing.stream}\` in ${listing.location?.project_directory ?? "its folder"} is stopped, so no node of it runs to publish on \`value\`; \`start_playback\` plays it`;
  }
  const writableInputs = graph.nodes.filter((node) => isAGraphInputAClientWrites(node) && node.state === "Running");
  const graphInput = writableInputs.find((node) => node.config["port"] === input);
  if (graphInput === undefined) {
    const declared = writableInputs.map((node) => `\`${String(node.config["port"])}\``).join(", ");
    return `Processor not found: no \`GraphInput\` on the top level of the stream \`${listing.stream}\` declares the Input \`${input}\` and runs; a client writes the Inputs of family array, channels or records, and the stream's are: ${declared}`;
  }
  const family = String(graphInput.config["family"]);
  if (family === "channels" && typeof value !== "number" && typeof value !== "boolean" && !(isAJsonObject(value) && "samples" in value && "sample_rate" in value)) {
    return `Port error: output \`value\` of node \`${graphInput.name}\` carries Channels, and a Channels value is a number, a bool or \`{"samples": [[...], ...], "sample_rate"}\``;
  }
  const arrayValueRefusal = family === "array" ? whyAnArrayValueIsNotANumberOrAListOfOneShape(value) : null;
  if (arrayValueRefusal !== null) {
    return `Port error: output \`value\` of node \`${graphInput.name}\` carries Array, and attribute \`values\` is a number or a list of numbers of one shape: ${arrayValueRefusal}`;
  }
  if (family === "records" && !isAJsonObject(value)) return `Port error: output \`value\` of node \`${graphInput.name}\` carries Records, and a Records value is a JSON object`;
  return null;
}

/** Why `value` is not a number or a list of numbers of one shape, in the runtime's words; `null` where it is. */
function whyAnArrayValueIsNotANumberOrAListOfOneShape(value: JsonValue): string | null {
  if (typeof value === "number") return null;
  if (!Array.isArray(value)) return `\`${JSON.stringify(value)}\` is not a number at that depth`;
  for (const element of value) {
    const elementRefusal = whyAnArrayValueIsNotANumberOrAListOfOneShape(element);
    if (elementRefusal !== null) return elementRefusal;
  }
  const shapes = new Set(value.map((element) => (Array.isArray(element) ? element.length : -1)));
  return shapes.size > 1 ? "its lists differ in length" : null;
}

interface MockLoadedStream {
  fixture: MockStreamFixture;
  /** The stream action that loaded it, which every record its load writes carries. */
  loadAction: string;
  loadedAtMilliseconds: number;
  unreleasedStartupDrafts: MockLogRecordDraft[];
  writeLiveLog: MockLiveLogWriter;
  /** The value a client last wrote to each of its top-level Inputs, by name; gone on the next load, as the runtime keeps none. */
  valueWrittenToEachGraphInput: Map<string, JsonValue>;
}

/** A project's log as the mock keeps it: its records oldest first, after the ones its retention deleted. */
interface MockProjectLog {
  records: ProjectLogRecord[];
  recordsDeletedCount: number;
}

/** Where the mock's updates stand as the page opens: a newer version already found by the launch check in `available` and `download`, and staged in `ready`. */
function initialMockAppUpdateState(appUpdateScenario: MockTatolabAppUpdateScenario): TatolabAppUpdateState {
  switch (appUpdateScenario) {
    case "available":
      return { kind: "available", version: MOCK_NEWER_TATOLAB_VERSION, delivery: "install_and_relaunch" };
    case "ready":
      return { kind: "ready_to_restart", version: MOCK_NEWER_TATOLAB_VERSION };
    case "download":
      return { kind: "available", version: MOCK_NEWER_TATOLAB_VERSION, delivery: "open_the_download" };
    case "up-to-date":
    case "failed":
    case "landed":
      return { kind: "not_checked" };
  }
}

/** The update dialog the mock shows as the page opens: the staged version's in `ready`, and the version the app is now in `landed`. */
function mockStudioWarnings(x11WarningScenario: string | null): StudioWarning[] {
  if (x11WarningScenario === "due") return [{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: true }];
  if (x11WarningScenario === "shown") return [{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }];
  return [];
}

function initialMockAppUpdateAnnouncement(appUpdateScenario: MockTatolabAppUpdateScenario, appVersion: string): TatolabAppUpdateAnnouncement | null {
  if (appUpdateScenario === "ready") return { kind: "update_ready", version: MOCK_NEWER_TATOLAB_VERSION };
  if (appUpdateScenario === "landed") return { kind: "update_landed", version: appVersion, release_notes_url: `https://github.com/tatolab/tatolab-app/releases/tag/v${appVersion}` };
  return null;
}

function initialMockStatus(
  scenario: MockTatolabScenario,
  platform: TatolabPlatform,
  machine: MockMachine,
  {
    appUpdateScenario,
    openAtLogin,
    doesTheDesktopShowNoNotifications,
    isDeveloperModeOn,
    studioWarnings,
    commandLineToolVersion,
    commandLineToolLinkScenario,
    appBuild,
  }: MockTatolabOptions,
): TatolabStatus {
  const runningStatus: TatolabStatus = {
    app_version: MOCK_APP_VERSION,
    app_build: appBuild,
    platform,
    runtime_state: "running",
    runtime_not_running_because: null,
    machine_name: machine.name,
    streams: [],
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    streams_not_listed_because: scenario === "not-listed" ? MOCK_STREAMS_NOT_LISTED_BECAUSE : null,
    command_line_tool_link:
      commandLineToolLinkScenario === "linked"
        ? { kind: "linked", path: machine.commandLineToolLinkedAt }
        : commandLineToolLinkScenario === "taken"
          ? { kind: "taken_by_something_else", path: machine.commandLineToolLinkedAt }
          : { kind: "not_linked", path: machine.commandLineToolLinkedAt },
    app_update: initialMockAppUpdateState(appUpdateScenario),
    app_update_announcement: initialMockAppUpdateAnnouncement(appUpdateScenario, MOCK_APP_VERSION),
    local_api_socket: machine.localApiSocket,
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: !doesTheDesktopShowNoNotifications },
    developer_mode: isDeveloperModeOn,
    open_at_login: openAtLogin,
    command_line_tool_version: commandLineToolVersion,
    studio_warnings: studioWarnings,
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
      return { ...runningStatus, runtime_state: "starting", machine_name: null, streams: null, streams_not_listed_because: null };
    case "not-running":
      return { ...runningStatus, runtime_state: "not_running", runtime_not_running_because: MOCK_RUNTIME_NOT_RUNNING_BECAUSE, machine_name: null, streams: null, streams_not_listed_because: null };
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
    doesTheRuntimeListAnEarlierRuntimesRecord,
    openProjectScenario,
    projectHistoryScenario,
    recentProjectsInTheQuery,
  } = mockTatolabOptions;
  const fixtures = createMockStreamFixtures(platform);
  const assetsChangedWhileTheMockRuns = mockProjectAssetsUnchanged();
  const mainStreamAsChosen =
    scenario === "node-error"
      ? fixtures.mainStreamWithDisplayWindowInError
      : scenario === "dropping"
        ? fixtures.mainStreamWithItsMeterFallingBehind
        : mockTatolabOptions.isTheFixtureViewListed
          ? fixtures.mainStreamWithTheFixtureViewsNode
          : mockTatolabOptions.isTheCompositorInMain
            ? fixtures.mainStreamWithTheCompositorNode
            : mockTatolabOptions.doesTheMainStreamDeclareGraphInputs
              ? fixtures.mainStreamDeclaringGraphInputs
              : mockTatolabOptions.doesTheMainStreamHoldAGeneratedSubgraph
                ? fixtures.mainStreamHoldingAGeneratedSubgraph
                : fixtures.mainStream;
  const mainStream: MockStreamFixture = mockTatolabOptions.areTheMainStreamsNodesStopped
    ? { ...mainStreamAsChosen, graph: { ...mainStreamAsChosen.graph, nodes: mainStreamAsChosen.graph.nodes.map((node) => (node.state === null ? node : { ...node, state: "Stopped" })) } }
    : mainStreamAsChosen;
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
    openProjectReading.kind === "read" ? openProjectReading.open_project.project.folder : `${fixtures.machine.homeDirectory}/streams/pattern`,
    mockTatolabOptions.moduleManagerWorkspaceDependencies ?? "copied",
    () => mockStudioViewsListedInTheProject(),
  );
  let recentProjects = mockRecentProjects(recentProjectsInTheQuery, fixtures.machine.homeDirectory, Date.now());
  const coverImageUrlsByFolder = new Map<string, string>();
  const mockFoldersOnDisk = () => [...mockFoldersInDocumentsTatoStudio(fixtures.machine.homeDirectory), ...recentProjects.map((recent) => recent.folder)];
  const openTheProjectInTheMock = (reading: OpenProjectReading, folder: string, projectName: string | null) => {
    openProjectReading = reading;
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
  const commitGraphActions = (operations: readonly StreamGraphAction[], applying: "a_transaction" | "undo_or_redo", historyOperationsReplayed: readonly JsonValue[] = []) => {
    const outcome = applyMockGraphTransaction(savedGraphTargetsOfTheOpenProject(), operations, applying, historyOperationsReplayed);
    if (outcome.kind === "applied") applyMockGraphTransaction(graphTargetsOfTheOpenProject(), operations, applying, outcome.history_operations);
    return outcome;
  };
  /** `undoOrRedo`, its graph operations applied to the mock graphs as the runtime applies them; a transaction naming no graph changes none. */
  const applyingItsGraphOperations = (undoOrRedo: ProjectTransaction): ProjectTransaction => {
    const graphActions = undoOrRedo.operations.map(graphActionApplyingTheHistoryOperation);
    const everyOneNamesAGraph = graphActions.every((graphAction): graphAction is StreamGraphAction => graphAction !== null);
    if (everyOneNamesAGraph && graphActions.length > 0) commitGraphActions(graphActions, "undo_or_redo", undoOrRedo.operations);
    return undoOrRedo;
  };
  const listedStreamsNotLoaded = new Map<string, ListedStream>([
    [fixtures.stoppedPatternTwo.stream, fixtures.stoppedPatternTwo],
    [fixtures.failedLobbyRecorder.stream, fixtures.failedLobbyRecorder],
    ...(doesTheRuntimeListAnEarlierRuntimesRecord ? [[fixtures.earlierRuntimesRecord.stream, fixtures.earlierRuntimesRecord] as const] : []),
  ]);
  /** The display names `set_stream_display_name` gave, by stream id, over the ones the fixtures load with. */
  const displayNamesRenamedTo = new Map<string, string>();
  /** Recorded streams not loaded that a run of their project loads again, by id: `pattern-two`, and each one stopped from the window. */
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
    mockStatus = { ...mockStatus, project_venv_syncs_just_ended: [], ...statusChanges };
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

  /** Each project folder the mock knows, by path: its stream assets' names, none for a folder that is no project, and whether it has a `.venv`; a folder not here does not exist. */
  const projectFolders = new Map<string, { streamNames: readonly string[]; hasAPythonEnvironment: boolean }>([
    [`${fixtures.machine.homeDirectory}/code/heat-map`, { streamNames: ["heat_map"], hasAPythonEnvironment: chosenProjectFolder !== "no-venv" }],
    [`${fixtures.machine.homeDirectory}/code/doorways`, { streamNames: ["front_door", MOCK_FAILING_STREAM_NAME], hasAPythonEnvironment: true }],
    [fixtures.patternProjectDirectory, { streamNames: ["main", "recorder", "pattern_two"], hasAPythonEnvironment: true }],
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
        return fixtures.patternProjectDirectory;
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

  /** Each load `create_project`, `start_project` or `reload_project` queued, by action, as `describe_stream_action` reads it. */
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
    publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
    return true;
  };

  /** Queues a load of `projectDirectory` that fails after a beat with `failedBecause`, as the runtime fails a load it cannot begin. */
  const queueAMockProjectLoadThatFails = (projectDirectory: string, failedBecause: string): string => {
    const action = nextStreamActionId();
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind: "load", state: "queued", step: null, streams: [], failed_because: null, venv_sync: null };
    projectLoadsQueued.set(action, description);
    window.setTimeout(() => Object.assign(description, { state: "failed", failed_because: failedBecause }), MOCK_STREAM_ACTION_STEP_MILLISECONDS);
    return action;
  };

  /**
   * `create_project`'s, `start_project`'s and `reload_project`'s load as the runtime does it: queued, then every stream asset's graph document
   * read, the `.venv` made where it has none, and every stream starting, each listed `preparing` under the action, then
   * loaded, or failed for the doorways project's `back_door`.
   */
  const queueAMockProjectLoad = (projectDirectory: string): string => {
    const action = nextStreamActionId();
    const description: StreamActionDescription = { action, project_directory: projectDirectory, kind: "load", state: "queued", step: null, streams: [], failed_because: null, venv_sync: null };
    projectLoadsQueued.set(action, description);
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
      loadStream(fixture, now, description.action);
      return { stream: listing.stream, display_name: listing.display_name, state: "running" };
    });
    Object.assign(description, { state: "done", step: null });
    publishStatus({ streams: listStreams(), project_venv_syncs_under_way: projectVenvSyncsUnderWay() });
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
      valueWrittenToEachGraphInput: new Map(),
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

  /** `stop_project` as the runtime does it: one action queued that stops every loaded stream of the project, each recorded stopped; refused when none of them runs. */
  const stopMockProject = (projectDirectory: string): void => {
    const loadedStreamsOfTheProject = [...loadedStreams.values()].filter((loadedStream) => loadedStream.fixture.listing.location?.project_directory === projectDirectory);
    if (loadedStreamsOfTheProject.length === 0) {
      throw `Runtime error: no stream of the project in ${projectDirectory} runs, so there is none to stop; \`run\` runs it. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}. Recorded: ${streamIdsListedForARefusal(recordedStreamIds())}`;
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
        listedStreamsNotLoaded.set(listing.stream, { ...listing, state: "stopped", node_count: null, failed_because: null, action: null, step: null });
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

  const graphOfLoadedStream = (loadedStream: MockLoadedStream): StreamGraphSummary => {
    const millisecondsSinceSettled = Date.now() - loadedStream.loadedAtMilliseconds - MOCK_STREAM_SETTLE_MILLISECONDS;
    return mockStreamGraphSummary(loadedStream.fixture.listing, fixtures.machine.name, loadedStream.fixture.graph, {
      hasSettled: millisecondsSinceSettled >= 0,
      secondsSinceSettled: Math.max(0, millisecondsSinceSettled) / 1000,
    }, mockTatolabOptions.arePortFamiliesServed, loadedStream.valueWrittenToEachGraphInput);
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
    listProjectNodeTypes: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const listing = mockProjectNodeTypeListing(projectDirectory, `${fixtures.machine.homeDirectory}/streams`, mockTatolabOptions.isEveryOwnNodeModuleUnreadable);
      if (listing === null) throw `list_project_node_types failed: ${projectDirectory} holds no tatolab-project.json`;
      return listing;
    },
    listProjectAssets: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const listing = mockProjectAssetListing(projectDirectory, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns);
      if (listing === null) throw `list_assets failed: ${projectDirectory} holds no project: it has no tatolab-project.json`;
      return listing;
    },
    importAssetsIntoTheOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const assetsImported = mockImportTheFilesChosen(
        openProjectReading.open_project.project.folder,
        `${fixtures.machine.homeDirectory}/streams`,
        assetsChangedWhileTheMockRuns,
        mockTatolabOptions.assetImportScenario,
      );
      if (typeof assetsImported === "string") throw assetsImported;
      return assetsImported;
    },
    relocateAssetInTheOpenProject: async (asset, toPath) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const refusal = mockRelocateTheAsset(openProjectReading.open_project.project.folder, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns, asset, toPath);
      if (refusal !== null) throw refusal;
    },
    deleteAssetFromTheOpenProject: async (asset) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const refusal = mockDeleteTheAsset(openProjectReading.open_project.project.folder, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns, asset);
      if (refusal !== null) throw refusal;
    },
    checkForTatolabAppUpdates: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const updateUnderWay = mockStatus.app_update.kind;
      if (updateUnderWay === "checking" || updateUnderWay === "downloading" || updateUnderWay === "installing") return;
      publishStatus({ app_update: { kind: "checking" } });
      window.setTimeout(finishTheUpdateCheck, MOCK_UPDATE_CHECK_MILLISECONDS);
    },
    takeTheNewerTatolabAppVersion: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const appUpdate = mockStatus.app_update;
      if (appUpdate.kind === "ready_to_restart") {
        publishStatus({ app_update: { kind: "installing", version: appUpdate.version } });
        return;
      }
      if (appUpdate.kind === "available" && appUpdate.delivery === "install_and_relaunch") downloadTheNewerVersion(0);
    },
    answerTheAppUpdateAnnouncement: async (kind, version, answer) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const answered = mockStatus.app_update_announcement;
      if (answered === null || answered.kind !== kind || answered.version !== version) return;
      publishStatus({ app_update_announcement: null });
      const appUpdate = mockStatus.app_update;
      if (answer === "take_its_action" && answered.kind === "update_ready" && appUpdate.kind === "ready_to_restart") publishStatus({ app_update: { kind: "installing", version: appUpdate.version } });
    },
    removeProject: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer remove_project`;
      removeMockProject(projectDirectory);
    },
    renameStream: async (streamId, displayName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer set_stream_display_name`;
      renameMockStream(streamId, displayName);
    },
    createStreamInTheOpenProject: async (displayName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer create_stream`;
      return createMockStreamInTheOpenProject(displayName);
    },
    deleteStream: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockStatus.runtime_state !== "running") throw `the runtime is ${mockStatus.runtime_state}, so it did not answer delete_stream`;
      deleteMockStream(streamId);
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
      const stream = mockStreamIdOf({ project_directory: projectDirectory, stream_name: "main" });
      if (projectFolders.has(projectDirectory)) {
        const failedBecause = `Invalid configuration: \`${projectDirectory}\` already has pyproject.toml, and a new project's files would overwrite it; create the project in an empty directory`;
        return { action: queueAMockProjectLoadThatFails(projectDirectory, failedBecause), stream, project_directory: projectDirectory };
      }
      projectFolders.set(projectDirectory, { streamNames: ["main"], hasAPythonEnvironment: false });
      return { action: queueAMockProjectLoad(projectDirectory), stream, project_directory: projectDirectory };
    },
    runStreamProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseAFolderNotHandedToTheWindow(folder);
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const project = projectFolders.get(folder);
      if (project === undefined) return { action: queueAMockProjectLoadThatFails(folder, `the project directory ${folder} does not exist`), project_directory: folder };
      if (project.streamNames.length === 0) {
        return { action: queueAMockProjectLoadThatFails(folder, `${folder} is not a project: it holds no tatolab-project.json`), project_directory: folder };
      }
      return { action: queueAMockProjectLoad(folder), project_directory: folder };
    },
    stopOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind === "none_open") throw "No project is open to stop.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      stopMockProject(openProjectReading.kind === "read" ? openProjectReading.open_project.project.folder : openProjectReading.folder);
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
    setDeveloperMode: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ developer_mode: enabled });
    },
    dismissTheStudioWarningDialog: async (kind) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ studio_warnings: mockStatus.studio_warnings.map((studioWarning) => (studioWarning.kind === kind ? { ...studioWarning, first_open_dialog_due: false } : studioWarning)) });
    },
    setOpenTatolabAtLogin: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ open_at_login: enabled ? { kind: "on" } : { kind: "off" } });
    },
    onStreamPageRequested: (streamPageRequestListener) => {
      if (streamPageRequestedByANotification === null) return () => {};
      const notificationClickTimer = window.setTimeout(() => streamPageRequestListener(streamPageRequestedByANotification), MOCK_NOTIFICATION_CLICK_MILLISECONDS);
      return () => window.clearTimeout(notificationClickTimer);
    },
    showTheProjectsWindow: async () => {
      openProjectReading = { kind: "none_open" };
      for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(openProjectReading));
    },
    // A page in a browser has no system menu bar: the mock keeps the menus as the app would, and only `?system_menu_entry=` chooses from them.
    showTheMenusInTheSystemMenuBar: async (menus) => {
      menusKeptForTheSystemMenuBar.splice(0, menusKeptForTheSystemMenuBar.length, ...structuredClone(menus));
      chooseTheSystemMenuBarEntryOnceOffered();
    },
    onSystemMenuBarEntryChosen: (entryChosenListener) => {
      systemMenuBarEntryChosenListener = entryChosenListener;
      chooseTheSystemMenuBarEntryOnceOffered();
      return () => {
        systemMenuBarEntryChosenListener = null;
      };
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
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      const action = queueAMockProjectLoad(folder);
      const newReading = mockNewProjectReading(folder, name.trim());
      openTheProjectInTheMock(newReading, folder, newReading.kind === "read" ? newReading.open_project.project.name : null);
      return { folder, project_creation: { action, stream: mockStreamIdOf({ project_directory: folder, stream_name: "main" }), project_directory: folder } };
    },
    readOpenProject: async () => structuredClone(openProjectReading),
    popOutView: async (target) => {
      window.open(mockPoppedOutViewPageUrl(window.location.href, target), "_blank");
    },
    readPoppedOutView: async () => structuredClone(mockTatolabOptions.poppedOutView),
    openModuleManagerWindow: async (shows) => {
      window.open(mockPageUrlWith(mockPageUrlWith(window.location.href, MODULE_MANAGER_QUERY_PARAMETER, "open"), MODULE_MANAGER_SECTION_QUERY_PARAMETER, shows), "_blank");
    },
    readModuleManagerWorkspace: async () => (mockTatolabOptions.moduleManagerWorkspaceDependencies !== null ? structuredClone(openProjectReading) : null),
    readModuleManagerSectionLastAsked: async () => (mockTatolabOptions.moduleManagerWorkspaceDependencies !== null ? mockTatolabOptions.moduleManagerSectionOpenedOn : null),
    onModuleManagerSectionAsked: () => () => undefined,
    readPackageCatalog: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockPackageCatalogReading(mockTatolabOptions.isTheCatalogUnserved);
    },
    listWorkspaceDependencies: async (checkForNewer) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * (checkForNewer ? 4 : 1));
      return workspaceDependencies.list(checkForNewer);
    },
    chooseDependencySource: async (sourceKind) => workspaceDependencies.sourceTheDialogAnswers(sourceKind),
    addDependencyToTheWorkspace: async (source) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      return workspaceDependencies.add(source);
    },
    updateWorkspaceDependency: async (project, overwriteEditedFiles) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      return workspaceDependencies.update(project, overwriteEditedFiles);
    },
    importFromTheMarketplace: async (name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 6);
      return workspaceDependencies.add(`${fixtures.machine.homeDirectory}/Library/Application Support/Tato Studio/module-downloads/${name}-0.68.29.zip`, name);
    },
    openImportToEdit: async (folder) => {
      if (!workspaceDependencies.holdsTheFolder(folder)) throw `The project imports nothing in imports/${folder}.`;
      const studioPageUrl = new URL(window.location.href);
      studioPageUrl.searchParams.delete(MODULE_MANAGER_QUERY_PARAMETER);
      studioPageUrl.searchParams.delete(MODULE_MANAGER_SECTION_QUERY_PARAMETER);
      window.open(studioPageUrl.toString(), "_blank");
    },
    pathOfADroppedFile: (droppedFile) => `${fixtures.machine.homeDirectory}/streams/${droppedFile.name}`,
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
    renameRecentProject: async (folder, name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (name.trim() === "") throw "Give the project a name.";
      if (recentProject.project_name === null) throw `rename_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      recentProjects = recentProjects.map((recent) => (recent.folder === folder ? { ...recent, project_name: name.trim(), last_edited_at_wall_clock_ms: Date.now() } : recent));
    },
    duplicateRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 3);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `duplicate_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      const parentFolder = folder.slice(0, folder.lastIndexOf("/"));
      const duplicateFolder = `${parentFolder}/${mockFirstNameNothingHolds(parentFolder, `${folder.slice(folder.lastIndexOf("/") + 1)} copy`, mockFoldersOnDisk())}`;
      recentProjects = [{ ...recentProject, folder: duplicateFolder, project_name: `${recentProject.project_name} copy`, last_opened_at_wall_clock_ms: Date.now(), last_edited_at_wall_clock_ms: Date.now() }, ...recentProjects];
      return duplicateFolder;
    },
    deleteRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `delete_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      recentProjects = recentProjects.filter((recent) => recent.folder !== folder);
    },
    readRecentProjectCover: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      return recentProject.has_a_chosen_cover ? (coverImageUrlsByFolder.get(folder) ?? mockProjectCoverImageUrl(folder.endsWith("pattern") ? "arcs" : "stripes")) : null;
    },
    setRecentProjectDescription: async (folder, description) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `set_project_description failed: ${folder} holds no project: it has no tatolab-project.json`;
      const trimmedDescription = description.trim();
      recentProjects = recentProjects.map((recent) =>
        recent.folder === folder ? { ...recent, project_description: trimmedDescription === "" ? null : trimmedDescription, last_edited_at_wall_clock_ms: Date.now() } : recent,
      );
    },
    chooseProjectCoverImage: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return `${fixtures.machine.homeDirectory}/Pictures/night-market-poster.png`;
    },
    setRecentProjectCover: async (folder, image) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 2);
      const recentProject = recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `import_asset failed: ${folder} holds no project: it has no tatolab-project.json`;
      if (image !== null) coverImageUrlsByFolder.set(folder, mockProjectCoverImageUrl("stripes"));
      recentProjects = recentProjects.map((recent) => (recent.folder === folder ? { ...recent, has_a_chosen_cover: image !== null, last_edited_at_wall_clock_ms: Date.now() } : recent));
    },
    chooseProjectArchiveToImport: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockProjectArchiveTheDialogAnswers(fixtures.machine.homeDirectory, mockFoldersOnDisk());
    },
    importProjectArchive: async (archive, name, location) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      const nameRefusal = newProjectFolderNameRefusal(name);
      if (nameRefusal !== null) throw nameRefusal;
      const folder = `${location}/${name.trim()}`;
      if (mockFoldersOnDisk().includes(folder)) throw `${folder} already exists. Choose another name or location.`;
      if (!archive.endsWith(".zip")) throw `import_project failed: ${archive} is not a .zip`;
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      const importedReading = mockNewProjectReading(folder, name.trim());
      openTheProjectInTheMock(importedReading, folder, importedReading.kind === "read" ? importedReading.open_project.project.name : null);
      return { folder, project_creation: null };
    },
    onOpenProjectChanged: (openProjectListener) => {
      openProjectListeners.add(openProjectListener);
      return () => openProjectListeners.delete(openProjectListener);
    },
    readOpenProjectTransactions: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      return mockStatus.runtime_state === "running" ? mockProjectTransactions.read() : { kind: "not_read", because: noRuntimeAnswersRefusal() };
    },
    onProjectTransactionsChanged: (listener) => mockProjectTransactions?.onChanged(listener) ?? (() => undefined),
    undoInTheOpenProject: async (author) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return applyingItsGraphOperations(mockProjectTransactions.undo(author));
    },
    transactInTheOpenProject: async (operations, mode, idempotencyKey) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null || openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const committedBefore = idempotencyKey === null || mode !== "commit" ? undefined : graphTransactionsCommittedByIdempotencyKey.get(idempotencyKey);
      if (committedBefore !== undefined) {
        return { kind: "applied", transaction: { ...structuredClone(committedBefore), added_nodes: committedBefore.added_nodes.map((addedNode) => ({ ...addedNode, as: null })) } };
      }
      savedGraphTargetsOfTheOpenProject();
      const outcome = mode === "commit" ? commitGraphActions(operations, "a_transaction") : applyMockGraphTransaction(graphTargetsOfTheOpenProject(), operations);
      if (outcome.kind === "refused") return outcome;
      const recorded = mode === "commit" ? mockProjectTransactions.record(MOCK_PERSON_EDITING_IN_STUDIO, outcome.history_operations, outcome.inverse_operations) : null;
      const transaction: ProjectGraphTransaction = { mode, transaction: recorded?.transaction ?? null, commit: recorded?.commit ?? null, ...outcome.transaction };
      if (idempotencyKey !== null && mode === "commit") graphTransactionsCommittedByIdempotencyKey.set(idempotencyKey, structuredClone(transaction));
      return { kind: "applied", transaction };
    },
    readThePersonEditingInStudio: async () => structuredClone(MOCK_PERSON_EDITING_IN_STUDIO),
    redoInTheOpenProject: async (author) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      if (mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return applyingItsGraphOperations(mockProjectTransactions.redo(author));
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
    createNodeFile: async (file) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      const created = mockProjectFiles.createNodeFile(file);
      const pathInTheProject = mockProjectFiles.pathInTheOpenProjectOf(file);
      mockProjectTransactions?.record(
        MOCK_PERSON_EDITING_IN_STUDIO,
        [{ operation: "write_project_file", path: pathInTheProject, content: { staged_copy: { staged_at: `.tatolab/staged-file-writes/${crypto.randomUUID()}` } }, replaced_a_file: false }],
        [{ operation: "remove_project_file", path: pathInTheProject }],
      );
      return created;
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
    listStudioViewsOfTheOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (openProjectReading.kind !== "read") throw "No project is open in this window.";
      return mockStudioViewsListedInTheProject();
    },
    writeStudioViewOutput: async (stream, node, port) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const viewNode = loadedStreamOfTheId(stream).fixture.graph.nodes.find((graphNode) => mockGraphNodeIdOf(stream, graphNode) === node);
      if (viewNode === undefined) throw `write_studio_view_output failed: no node with the id \`${node}\` in stream \`${stream}\``;
      if (!viewNode.output_ports.some((outputPort) => outputPort.name === port)) throw `write_studio_view_output failed: \`${viewNode.name}\` has no output port named \`${port}\``;
    },
    writeGraphInput: async (stream, input, value) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const loadedStream = loadedStreamOfTheId(stream);
      const refusal = refusalOfAGraphInputWrite(loadedStream, listStreams()?.find((listing) => listing.stream === stream)?.state ?? null, input, value);
      if (refusal !== null) throw `write_graph_input failed: ${refusal}`;
      loadedStream.valueWrittenToEachGraphInput.set(input, value);
    },
    openPortViewer: async (target) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const node = loadedStreamOfTheId(target.stream).fixture.graph.nodes.find((graphNode) => mockGraphNodeIdOf(target.stream, graphNode) === target.node_id);
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
