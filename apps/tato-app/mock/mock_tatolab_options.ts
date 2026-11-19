import { jsonValueSchema } from "@tatolab/tato-app-view-sdk/studio_host";
import { Result, Schema } from "effect";
import { mockWorkspaceDependenciesScenarioNamed, type MockWorkspaceDependenciesScenario } from "./mock_workspace_dependencies";
import { mockMainGraphNamed, type MockMachine, type MockMainGraph } from "./mock_stream_fixtures";
import { mockReplayedRefusalNamed, type MockReplayedRefusal } from "./mock_replayed_refusals";
import { mockOpenProjectScenarioNamed, type MockOpenProjectScenario } from "./mock_open_project";
import { mockProjectHistoryScenarioNamed, type MockProjectHistoryScenario } from "./mock_project_transactions";
import type { MockAssetImportScenario } from "./mock_project_assets";
import { isModulesShown, type ModuleManagerSectionAsked } from "../src/shared/tatolab_electron_bridge_contract";
import type {
  PoppedOutView,
  TatolabAppBuild,
  TatolabAppOpenAtLogin,
  TatolabCommandLineToolVersion,
  TatolabAppUpdateAnnouncement,
  TatolabAppUpdateState,
  TatolabPlatform,
  TatolabStatus,
  RuntimeOfAnotherAge,
  StudioWarning,
} from "../src/shared/tatolab_backend_contract";

/**
 * Browser-only stand-ins for the app backend, picked with `?state=`: `starting` is the app's runtime coming up, `not-running`
 * one that exited, `refused-at-play` the runtime holding `main` failed, its graph stopped, after it refused to play a link.
 */
export type MockTatolabScenario =
  | "running"
  | "empty"
  | "loading"
  | "node-error"
  | "node-not-ready"
  | "refused-at-play"
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
  "node-not-ready",
  "refused-at-play",
  "camera-access",
  "dropping",
  "not-listed",
  "starting",
  "not-running",
];

/** Why the mock's runtime is not running in `not-running`, as the app says of one that exited. */
const MOCK_RUNTIME_NOT_RUNNING_BECAUSE = "The runtime stopped: it exited with status 1. Tato Studio starts it again shortly.";

/** How many of a project's newest log records the mock keeps unless `?held_records=` asks for fewer. */
const MOST_PROJECT_LOG_RECORDS_KEPT = 100_000;

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
export const MOCK_NEWER_TATOLAB_VERSION = "0.46.0";

/**
 * The project folder the mock's folder dialog chooses, picked with `?add_folder=`: one ready to run (the default), one with no
 * `.venv` yet, which the runtime makes first, one with two streams, one of which fails, the project `main` is already
 * imported from, one with no `tatolab-project.json`, or none, the person cancelling.
 */
export type MockChosenProjectFolder = "ready" | "no-venv" | "several" | "recorded" | "no-project-file" | "cancel";

const MOCK_CHOSEN_PROJECT_FOLDERS: readonly MockChosenProjectFolder[] = ["ready", "no-venv", "several", "recorded", "no-project-file", "cancel"];

/** The runtime the mock describes: the streamlib release the app bundles, and its build. */
export const MOCK_RUNTIME_VERSION = "0.55.2";

/** Why the app could not list the streams in the mock's `?state=not-listed`, as the app words a `list_streams` result it cannot read. */
const MOCK_STREAMS_NOT_LISTED_BECAUSE = "the runtime's list_streams result could not be read: missing field `stream_asset`";

/** How the mock lists the Studio's own elements: served, listed with scripts nothing serves, or refused. */
export type MockNodeUiElementsListing = "served" | "unserved" | "refused";

/** The listing `?node_ui=` asks for, served by default. */
export function mockNodeUiElementsListingOf(asked: string | null): MockNodeUiElementsListing {
  return asked === "unserved" || asked === "refused" ? asked : "served";
}

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
  /** `?runtime_age=older|older_started|older_uncarried|newer`: the runtime refused this Studio's contract, older than it (one it did not start, one it started, or one in a build that carries none) or newer; the same age by default. */
  runtimeOfAnotherAge: RuntimeOfAnotherAge | null;
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
  /** `?project_open=refused`: the runtime fails the open project's `open_project`, as it does while a record an earlier runtime wrote elsewhere holds its stream id. */
  isTheOpenProjectsOpenRefused: boolean;
  /** `?project=none|unreadable`: no project open, or one the runtime names no project in; the pattern project by default. */
  openProjectScenario: MockOpenProjectScenario;
  /** `?history=empty`: the open project has no transactions yet; a few by the person, an agent and the runtime by default. */
  projectHistoryScenario: MockProjectHistoryScenario;
  /** `?recent=none`: no project opened before, as on first run; six recent ones by default. */
  recentProjectsInTheQuery: string | null;
  /** Each port's family is served in the graph and in each node type described, as the runtime serves it; `?port_families=unserved` serves none, as a runtime from before strict-port-families. */
  arePortFamiliesServed: boolean;
  /** `?asset_import=refuses_one`: Import asset… also refuses a graph document chosen beside the file it imports. */
  assetImportScenario: MockAssetImportScenario;
  /** `?popped_out_view=<popped-out view as JSON>`: the page is a view popped out of the studio, as Pop out into a window opens it in a new tab; the studio by default. */
  poppedOutView: PoppedOutView | null;
  /** `?module_manager=open|edited_files|newer|marketplace_newer`: the page is the open project's Modules and Marketplace window, as File › Marketplace… or Modules… opens it in a new tab, its import as copied, edited since, or with a newer version on its source, or beside Camera added from the Marketplace before the catalog's version; `null` for any other page. */
  moduleManagerWorkspaceDependencies: MockWorkspaceDependenciesScenario | null;
  /** `?module_manager_section=added_to_this_project|marketplace`: the section a Modules and Marketplace window's page opens on, Marketplace when the query names none; with `?module_manager_entry=<catalog name>`, the page of that Marketplace entry, as the node search's See it asks. */
  moduleManagerSectionOpenedOn: ModuleManagerSectionAsked;
  /** `?catalog=unserved`: get.tatolab.com answers the catalog with a 404; the mock catalog by default. */
  isTheCatalogUnserved: boolean;
  /** `?marketplace_add=refused|never_ends`: adding a Marketplace package, or cloning a sample, is refused with a download whose SHA-256 is not the catalog's, or reads 31% of its download and no more, so its progress stays until an add's Cancel stops it (a clone has none and never ends); it succeeds by default. */
  marketplaceAddScenario: "succeeds" | "refused" | "never_ends";
  /** `?module_remove=refused`: removing a module is refused as the runtime refuses one a stream's node still references; it succeeds by default. */
  isRemovingAModuleRefused: boolean;
  /** `?studio_views=fixture`: the open project brings the fixture view, and `main` holds its node; its import brings one that does not open. */
  isTheFixtureViewListed: boolean;
  /** `?node_ui=unserved`: the Studio's own controls are listed with scripts nothing serves, so each ends at the read-only line with why; `?node_ui=refused`: listing them is refused, so each input draws its own field. They are listed and served by default. */
  nodeUiElementsListing: MockNodeUiElementsListing;
  /** `?refusal=link_of_another_type|value_of_another_type`: the runtime's recorded refusal the mock replays for the first link made, or the first value set; none by default. */
  replayedRefusal: MockReplayedRefusal | null;
  /** `?shell_sets_live=<number>`: a few seconds after the page opens, a shell sets the inverting effect's `amount` in `main` live to the number, as an agent's `transact` would; nothing is set by default. */
  valueAShellSetsLive: number | null;
  /** `?compositor=layered`: `main` holds an alpha-over compositor of two layers on the effect's output. */
  isTheCompositorInMain: boolean;
  /** Whether the open project's main stream declares Graph Inputs, which Perform shows. */
  doesTheMainStreamDeclareGraphInputs: boolean;
  /** `?subgraphs=generated`: `main` holds a graph generator's frozen output. */
  doesTheMainStreamHoldAGeneratedSubgraph: boolean;
  /** `?node_states=stopped`: every node of `main` that has a state reads `Stopped` once the stream settles, so none of its ports writes. */
  areTheMainStreamsNodesStopped: boolean;
  /** `?main_graph=every_pin_kind|large`: `main` holds the graph recorded from streamlib's sample project that declares each kind of pin, or 300 nodes of four inputs each and 450 links for the canvas measurements; either takes precedence over every other choice of `main`. */
  mainGraph: MockMainGraph | null;
}

/** The query parameter a Module manager window's page is told by. */
export const MODULE_MANAGER_QUERY_PARAMETER = "module_manager";

/** The query parameter naming the section a Module manager window's page opens on. */
export const MODULE_MANAGER_SECTION_QUERY_PARAMETER = "module_manager_section";

/** The query parameter naming the Marketplace entry, by the catalog's name for it, whose page a Module manager window's page opens on. */
export const MODULE_MANAGER_ENTRY_QUERY_PARAMETER = "module_manager_entry";

/** The Modules and Marketplace section `sectionName` names, Marketplace for none or an unknown one, on the page of the entry `entryName` names. */
function moduleManagerSectionNamed(sectionName: string | null, entryName: string | null): ModuleManagerSectionAsked {
  return { shows: isModulesShown(sectionName) ? sectionName : "marketplace", page: entryName };
}

/** The query parameter a popped-out view's page carries what it is in, as JSON. */
export const POPPED_OUT_VIEW_QUERY_PARAMETER = "popped_out_view";

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
  const pinnedTo = Schema.decodeUnknownResult(jsonValueSchema)(field("pinned_to"));
  if (typeof viewTypeId !== "string" || typeof windowTitle !== "string" || Result.isFailure(pinnedTo)) return null;
  return { view_type_id: viewTypeId, window_title: windowTitle, pinned_to: pinnedTo.success };
}

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
    isDeveloperModeOn: pageQuery.get("developer_mode") === "on",
    runtimeOfAnotherAge: mockRuntimeOfAnotherAge(pageQuery.get("runtime_age")),
    studioWarnings: mockStudioWarnings(pageQuery.get("x11_warning")),
    commandLineToolVersion: mockCommandLineToolVersion(pageQuery.get("cli_version")),
    streamPageRequestedByANotification: pageQuery.get("stream_page_requested"),
    systemMenuBarEntryChosenByThePerson: pageQuery.get("system_menu_entry"),
    commandLineToolLinkScenario: pageQuery.get("cli_link") === "not_linked" ? "not_linked" : pageQuery.get("cli_link") === "taken" ? "taken" : "linked",
    appBuild: mockAppBuild(pageQuery.get("app_build")),
    isMakingThePythonEnvironmentRefused: pageQuery.get("add_venv") === "refused",
    doesTheRuntimeListAnEarlierRuntimesRecord: pageQuery.get("streams") === "earlier_record",
    isTheOpenProjectsOpenRefused: pageQuery.get("project_open") === "refused",
    openProjectScenario: mockOpenProjectScenarioNamed(pageQuery.get("project")),
    projectHistoryScenario: mockProjectHistoryScenarioNamed(pageQuery.get("history")),
    recentProjectsInTheQuery: pageQuery.get("recent"),
    arePortFamiliesServed: pageQuery.get("port_families") !== "unserved",
    assetImportScenario: pageQuery.get("asset_import") === "refuses_one" ? "refuses_one" : "imports_one",
    poppedOutView: mockPoppedOutViewFrom(pageQuery.get(POPPED_OUT_VIEW_QUERY_PARAMETER)),
    moduleManagerWorkspaceDependencies: mockWorkspaceDependenciesScenarioNamed(pageQuery.get(MODULE_MANAGER_QUERY_PARAMETER)),
    moduleManagerSectionOpenedOn: moduleManagerSectionNamed(pageQuery.get(MODULE_MANAGER_SECTION_QUERY_PARAMETER), pageQuery.get(MODULE_MANAGER_ENTRY_QUERY_PARAMETER)),
    isTheCatalogUnserved: pageQuery.get("catalog") === "unserved",
    marketplaceAddScenario: pageQuery.get("marketplace_add") === "refused" ? "refused" : pageQuery.get("marketplace_add") === "never_ends" ? "never_ends" : "succeeds",
    isRemovingAModuleRefused: pageQuery.get("module_remove") === "refused",
    isTheFixtureViewListed: pageQuery.get("studio_views") === "fixture",
    isTheCompositorInMain: pageQuery.get("compositor") === "layered",
    nodeUiElementsListing: mockNodeUiElementsListingOf(pageQuery.get("node_ui")),
    replayedRefusal: mockReplayedRefusalNamed(pageQuery.get("refusal")),
    valueAShellSetsLive: numberInTheQuery(pageQuery.get("shell_sets_live")),
    doesTheMainStreamDeclareGraphInputs: pageQuery.get("graph_inputs") === "declared",
    doesTheMainStreamHoldAGeneratedSubgraph: pageQuery.get("subgraphs") === "generated",
    mainGraph: mockMainGraphNamed(pageQuery.get("main_graph")),
    areTheMainStreamsNodesStopped: pageQuery.get("node_states") === "stopped",
  };
}

function positiveWholeNumberOrNull(text: string | null): number | null {
  const number = Number(text);
  return text !== null && Number.isInteger(number) && number > 0 ? number : null;
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

/** The runtime's mismatch record for `?runtime_age=`, as a runtime of release `MOCK_RUNTIME_VERSION` states it; `null` for the same age. */
function mockRuntimeOfAnotherAge(runtimeAgeScenario: string | null): RuntimeOfAnotherAge | null {
  const studioContract = { version: 3, revision: 1 };
  switch (runtimeAgeScenario) {
    case "older":
      return { older_side: "runtime", runtime_version: MOCK_RUNTIME_VERSION, runtime_contract: { version: 3, revision: 0 }, studio_contract: studioContract, remedy: "quit_the_running_runtime" };
    case "older_started":
      return { older_side: "runtime", runtime_version: MOCK_RUNTIME_VERSION, runtime_contract: { version: 3, revision: 0 }, studio_contract: studioContract, remedy: "update_studio" };
    case "older_uncarried":
      return { older_side: "runtime", runtime_version: MOCK_RUNTIME_VERSION, runtime_contract: { version: 3, revision: 0 }, studio_contract: studioContract, remedy: "update_the_runtime" };
    case "newer":
      return { older_side: "studio", runtime_version: MOCK_RUNTIME_VERSION, runtime_contract: { version: 4, revision: 0 }, studio_contract: studioContract, remedy: "update_studio" };
    default:
      return null;
  }
}

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

/** The status the mock window opens on, for the scenario and the options the page's query picked. */
export function initialMockStatus(
  scenario: MockTatolabScenario,
  platform: TatolabPlatform,
  machine: MockMachine,
  {
    appUpdateScenario,
    openAtLogin,
    doesTheDesktopShowNoNotifications,
    isDeveloperModeOn,
    studioWarnings,
    runtimeOfAnotherAge,
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
    runtime_of_another_age: runtimeOfAnotherAge,
    machine_name: machine.name,
    streams: [],
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    project_stream_action_failures: [],
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
    case "node-not-ready":
    case "refused-at-play":
    case "camera-access":
    case "dropping":
    case "not-listed":
      return runningStatus;
    case "starting":
      return { ...runningStatus, runtime_state: "starting", runtime_of_another_age: null, machine_name: null, streams: null, streams_not_listed_because: null };
    case "not-running":
      return { ...runningStatus, runtime_state: "not_running", runtime_not_running_because: MOCK_RUNTIME_NOT_RUNNING_BECAUSE, runtime_of_another_age: null, machine_name: null, streams: null, streams_not_listed_because: null };
  }
}

/** The finite number `words` spell, or `null` for none. */
function numberInTheQuery(words: string | null): number | null {
  const number = words === null || words.trim() === "" ? Number.NaN : Number(words);
  return Number.isFinite(number) ? number : null;
}
