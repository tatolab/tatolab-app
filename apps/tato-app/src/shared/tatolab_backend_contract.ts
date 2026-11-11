// The window's contract with the main process. What a view reads too is the view SDK's, and is
// re-exported here so both sides name it the same way.

export type {
  JsonValue,
  StreamLocation,
  ListedStream,
  StreamGraphDeclaredPort,
  ImageStreamFrameRate,
  ImageStreamContentLightLevel,
  ImageStreamMasteringDisplayColourVolume,
  PortStreamFacts,
  StudioCanvasPair,
  StreamGraphNodeStudioFields,
  StreamGraphGroup,
  StreamGraphNote,
  StreamGraphNode,
  StreamGraphLink,
  StreamGraphSummary,
  NodeCatalogPort,
  NodeCatalogEntry,
  NodeCatalog,
  ProjectNodeTypePort,
  ProjectNodeType,
  ProjectGraphGeneratorPromotedSetting,
  ProjectGraphGenerator,
  ProjectNodeModuleNotReadable,
  ProjectNodeTypeSourceOrigin,
  ProjectNodeTypeSource,
  ProjectNodeTypeListing,
  ProjectAsset,
  ProjectAssetListing,
  ProjectTheRuntimeNames,
  ImportedProjectSource,
  ImportedProject,
  OpenProject,
  OpenProjectReading,
  ProjectFileRead,
  ProjectFiles,
  ProjectLogRecord,
  ProjectTransaction,
  ProjectTransactions,
  ProjectTransactionsReading,
  ProjectTransactionAuthor,
  ProjectActionRefusal,
  RefusedProjectAction,
  StreamGraphActionLinkEnd,
  StreamGraphAction,
  GraphEditMode,
  GraphLinkEnd,
  ProjectGraphTransaction,
  ProjectGraphTransactionApplying,
  ProjectGraphTransactionTheRuntimeAnswered,
  ThePersonEditingReading,
  PortViewerTarget,
  PortViewerChannelWaveform,
  PortViewerArrayAttributeReading,
  PortViewerMessageReading,
} from "@tatolab/tato-app-view-sdk/studio_readings";
export { PORT_FAMILIES, type PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
export { TATO_STUDIO_MCP_CLIENT_NAME, graphEditModeSchema, streamGraphActionSchema } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { JsonValue, ListedStream, PortViewerMessageReading, ProjectLogRecord } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The platform the app runs on, which decides the window's chrome. */
export type TatolabPlatform = "macos" | "linux";

/**
 * Whether the runtime answers its local API. `starting` is the runtime the app started not answering yet; `not_running`
 * is no runtime answering, with why in `TatolabStatus.runtime_not_running_because`: the app's own runtime exited and is
 * started again shortly, or an app that carries none (an unpackaged one) finding none running.
 */
export type RuntimeState = "running" | "starting" | "not_running";

/** How a newer Tatolab found by a check reaches the person: downloaded in the background and installed in place as the app restarts; or its download opened, for a `.deb`, which only apt replaces. */
export type TatolabAppUpdateDelivery = "install_and_relaunch" | "open_the_download";

/**
 * Where checking for a newer Tatolab stands. `not_offered` is an app that cannot update itself (an
 * unpackaged one), with why; `available` is a newer version a check found that has not downloaded (a
 * `.deb`'s, or one whose background download failed); `ready_to_restart` is a newer version downloaded
 * and staged, which installs only when the person restarts to update; `failed` carries the updater's own words, and
 * the installed app keeps working.
 */
export type TatolabAppUpdateState =
  | { kind: "not_offered"; reason: string }
  | { kind: "not_checked" }
  | { kind: "checking" }
  | { kind: "up_to_date" }
  | { kind: "available"; version: string; delivery: TatolabAppUpdateDelivery }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready_to_restart"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "failed"; refusal: string };

/**
 * What a studio window's update dialog says, until the person answers it: `update_ready` is a downloaded version ready to
 * install, offered once per version each time the app runs; `update_landed` is the version the app opened as for the first
 * time since an update, with its release notes.
 */
export type TatolabAppUpdateAnnouncement = { kind: "update_ready"; version: string } | { kind: "update_landed"; version: string; release_notes_url: string };

/** Which update dialog an announcement is. */
export type TatolabAppUpdateAnnouncementKind = TatolabAppUpdateAnnouncement["kind"];

/** How the person answered the update dialog: its action (Install Update, or Release Notes), or closing it. */
export type TatolabAppUpdateAnnouncementAnswer = "take_its_action" | "dismiss";

/**
 * Whether the app opens at login, as the OS reports it: on, off, registered but waiting for the person's approval in
 * Login Items (macOS only), or not offered, with why, in a build that cannot open at login.
 */
export type TatolabAppOpenAtLogin =
  | { kind: "on" }
  | { kind: "off" }
  | { kind: "needs_approval_in_login_items" }
  | { kind: "not_offered"; reason: string };

/**
 * The `tatolab` CLI's version, from the first line `tatolab --version` prints: read; still being read as the app opens;
 * unreadable, with why; or not offered by a build that carries no CLI, with why.
 */
export type TatolabCommandLineToolVersion =
  | { kind: "read"; version: string }
  | { kind: "reading" }
  | { kind: "unreadable"; reason: string }
  | { kind: "not_offered"; reason: string };

/**
 * `~/.local/bin/tatolab`, which the app links to the CLI it carries only when the person asks: linked there; not
 * linked; taken by a file that is not Tatolab's, which the app leaves alone; or not offered, with why, by a build that
 * carries no CLI or has no home folder to link in.
 */
export type CommandLineToolLink =
  | { kind: "linked"; path: string }
  | { kind: "not_linked"; path: string }
  | { kind: "taken_by_something_else"; path: string }
  | { kind: "not_offered"; reason: string };

/** Notifications when a stream fails: whether the person wants them, and whether this desktop shows notifications at all. */
export interface StreamFailureNotificationsState {
  enabled: boolean;
  shown_by_this_desktop: boolean;
}

/** Which build of the app is running, as its build features recorded it when it was built. */
export interface TatolabAppBuild {
  /** The full 40-hex tatolab-app commit the build was built at. */
  tatolab_app_commit: string;
  /** `release` for a build the release workflow made; every other build, a local proof build included, is `dev`. */
  build_kind: "dev" | "release";
  /** Whether the checkout it was built from had changes, untracked files included, that the commit does not hold. */
  built_with_uncommitted_changes: boolean;
}

/** What `get_tatolab_status` answers and `tatolab-status-changed` carries. */
export interface TatolabStatus {
  app_version: string;
  /** `null` for a build that recorded none, which only `electron-vite dev` runs. */
  app_build: TatolabAppBuild | null;
  platform: TatolabPlatform;
  runtime_state: RuntimeState;
  /** Why no runtime answers while `runtime_state` is `not_running`, in words the window shows; `null` otherwise. */
  runtime_not_running_because: string | null;
  machine_name: string | null;
  /** `null` when the streams were not listed: the runtime is down or listing them failed. */
  streams: ListedStream[] | null;
  /** Each project's `.venv` sync under way, for each action a listed stream names on its `making_the_venv` step whose sync uv has started; empty otherwise. */
  project_venv_syncs_under_way: ProjectVenvSyncUnderWay[];
  /** Why listing the streams failed while the runtime answers, in the failure's own words; `null` when they were listed or the runtime is down. */
  streams_not_listed_because: string | null;
  command_line_tool_link: CommandLineToolLink;
  app_update: TatolabAppUpdateState;
  /** The update dialog every studio window shows; `null` while there is nothing to say. */
  app_update_announcement: TatolabAppUpdateAnnouncement | null;
  /** The socket this build reads the runtime's local API at. */
  local_api_socket: string;
  stream_failure_notifications: StreamFailureNotificationsState;
  /** Whether Developer mode is on, which offers the Transactions view in every area's view menu. */
  developer_mode: boolean;
  open_at_login: TatolabAppOpenAtLogin;
  command_line_tool_version: TatolabCommandLineToolVersion;
}

/** What `describe_runtime` answers: the running runtime's version and build, how long it has been up, and the folder of its own log. */
export interface RuntimeDescription {
  version: string;
  /** `<version>+<git sha>.<per-build nonce>`, which tells two builds of one version apart. */
  build_id: string;
  /** Monotonic milliseconds since this runtime's engine started; a restart starts it again from 0. */
  up_for_ms: number;
  /** The folder the runtime writes its own log to, absolute for `tatolabd`; `null` when it keeps none. */
  runtime_log_directory: string | null;
}

/** The folder under a project directory that the runtime writes the project's log segments into. */
export const PROJECT_LOG_FOLDER_IN_THE_PROJECT = ".streamlib/logs";

/** Which of a project's log records a read asks for: all of them, one stream's, one stream action's, or both narrowings at once. */
export interface ProjectLogNarrowing {
  stream: string | null;
  action: string | null;
}

/** What `read_project_log_records` answers: a page of one project's log records after the cursor asked for. */
export interface ProjectLogRecordsPage {
  project_directory: string;
  records: ProjectLogRecord[];
  /** The opaque cursor the next page starts after. */
  next_after: string;
  /** Whether the log's retention deleted records between the cursor asked for and this page. */
  records_no_longer_held: boolean;
}

/** What a project folder is chosen for in the app's folder dialog: a project to import, or the folder a new project is created in, which may not exist yet. */
export type StreamProjectFolderChosenFor = "project_to_run" | "new_project_directory";

/** What `create_project` answers at once: the action it queued, the stream id the new project's `main` runs under, and the project's folder resolved. */
export interface ProjectCreationQueued {
  action: string;
  stream: string;
  project_directory: string;
}

/** What `start_project` and `reload_project` answer at once: the action each queued, and the project's folder. */
export interface ProjectRunQueued {
  action: string;
  project_directory: string;
}

/** A stream a stream action took in, as `describe_stream_action` lists it: `running` or `failed`, or a state newer than this app. */
export interface StreamTakenInByAnAction {
  stream: string;
  display_name: string;
  /** The stream's state in the runtime's listing; `null` while the action has not yet started it. */
  state: string | null;
}

/** What `describe_stream_action` answers, field for field. */
export interface StreamActionDescription {
  action: string;
  project_directory: string;
  /** `load`, or a kind newer than this app. */
  kind: string;
  /** `queued`, `in_progress`, `done`, `failed`, `cancelled`, or a state newer than this app. */
  state: string;
  /** `reading_the_graph_documents`, `making_the_venv` or `starting` while `in_progress`; `null` otherwise. */
  step: string | null;
  streams: StreamTakenInByAnAction[];
  /** Why a `failed` action failed, in the runtime's words; `null` otherwise. */
  failed_because: string | null;
  /** What the action's latest uv sync of the project's `.venv` has done, kept once it ends; `null` for an action that has not synced. */
  venv_sync: StreamActionVenvSync | null;
}

/** The stream action step in which the runtime runs uv to make the project's `.venv`. */
export const STREAM_ACTION_STEP_MAKING_THE_VENV = "making_the_venv";

/** One package uv named in a stream action's sync, as the runtime's `venv_sync.packages[]` spells it. */
export interface StreamActionVenvSyncPackage {
  name: string;
  /** Named once uv installs or uninstalls it; `null` before. */
  version: string | null;
  /** `distribution`, `python_interpreter`, or a kind newer than this app. */
  kind: string;
  /** `downloading`, `downloaded`, `building`, `built`, `installed`, `uninstalled`, or a state newer than this app. */
  state: string;
  /** The size uv states as the download starts; uv names only downloads over about a MiB, and no byte as it arrives. */
  download_size_bytes: number | null;
}

/** A stream action's uv sync of its project's `.venv`, read from uv's own lines, as the runtime's `venv_sync` spells it. */
export interface StreamActionVenvSync {
  /** `resolving`, `downloading`, `building`, `installing`, `installed`, or a phase newer than this app. */
  phase: string;
  /** Each count is uv's own, `null` until uv states it. */
  packages_resolved: number | null;
  packages_prepared: number | null;
  packages_installed: number | null;
  downloads_started: number;
  downloads_done: number;
  /** Each package uv named, first named first. */
  packages: StreamActionVenvSyncPackage[];
}

/** A project's sync under way, read from the stream action making its `.venv`. */
export interface ProjectVenvSyncUnderWay {
  action: string;
  project_directory: string;
  venv_sync: StreamActionVenvSync;
}

/** What `cancel_stream_action` answers: the action, `cancelled` for one dropped from its queue, or `in_progress` for one stopping at the step it is on, or a state newer than this app. */
export interface StreamActionCancelAnswer {
  action: string;
  state: string;
}

/** What following a stream action read: its description, or the runtime's words that it no longer holds the action. */
export type StreamActionFollowed = { kind: "described"; description: StreamActionDescription } | { kind: "not_held"; words: string };

/** A view popped out of a studio window into a window of its own: its view type, the words that window is titled with, and what it is pinned to. */
export interface PoppedOutView {
  view_type_id: string;
  window_title: string;
  /** The stream tab, selection and area settings the view popped out with; the main process keeps it as given and only the window reads it. */
  pinned_to: JsonValue;
}

/** A `@node` or `@stream` a catalog entry brings: its name, where it is imported from, and one line on what it does. */
export interface PackageCatalogMember {
  name: string;
  import_path: string;
  summary: string;
}

/** Where a catalog entry's project is downloaded from, as a `.zip`, and the SHA-256 the download must have. */
export interface PackageCatalogDownload {
  url: string;
  sha256: string;
}

/** One package or sample project the catalog at get.tatolab.com lists, as its version 1 serves it. */
export interface PackageCatalogEntry {
  kind: "package" | "sample";
  /** The project's name, as a requirement names it. */
  name: string;
  title: string;
  summary: string;
  version: string;
  /** The `.zip` of the project Import downloads and its SHA-256, or `null` where the catalog names none. */
  download: PackageCatalogDownload | null;
  nodes: PackageCatalogMember[];
  streams: PackageCatalogMember[];
  homepage_url: string | null;
}

/** What `read_package_catalog` answers: the catalog's entries and how many it served that the app could not read, or why it was not read, in the words of what refused. */
export type PackageCatalogReading =
  | { kind: "read"; entries: PackageCatalogEntry[]; unreadable_entry_count: number }
  | { kind: "not_read"; because: string };

/** A project the workspace imports, as the runtime's dependency tools answer it: a copy of `source` in `imports/<folder>/`. */
export interface ProjectDependency {
  /** The imported project's UUID. */
  project: string;
  folder: string;
  /** The folder or `.zip` it was copied from, as it was given. */
  source: string;
  /** The SHA-256 naming the version its copy carried. */
  version: string;
}

/** One of the workspace's imports as Module manager lists it: what the runtime says of it, and its name from `imports/<folder>/tatolab-project.json`. */
export interface WorkspaceDependency extends ProjectDependency {
  /** `imports/<folder>/` inside the workspace, absolute. */
  folder_path: string;
  /** The name the runtime reads from its copy, or `null` where it could not read it. */
  name: string | null;
  /** Each file of its folder edited since its copy, by its path inside the folder. */
  edited_files: string[];
  /** Whether its source holds another version than its copy; `null` when not checked or the check was refused. */
  newer_version_exists: boolean | null;
  /** Why its source could not be read for the check, in the runtime's words. */
  check_refused_because: string | null;
}

/** What `update_workspace_dependency` answers: the copy updated, or, with the overwrite not confirmed, each file edited since its copy and nothing changed. */
export type WorkspaceDependencyUpdate = { kind: "updated"; dependency: ProjectDependency } | { kind: "edited_since_its_copy"; edited_files: string[] };

/** What a dependency source is chosen as in the dialog: a project's folder, or a `.zip` of one. */
export type DependencySourceKind = "folder" | "zip";

/** What the project folder dialog is opened for from the window: an existing project to open. */
export type ProjectFolderChosenFor = "project_to_open";

/** What the New project sheet starts from: the folder new projects go in, and a name no folder there holds yet. */
export interface NewProjectDefaults {
  /** `<Documents>/Tato Studio`, absolute; made the first time a project is created in it. */
  location: string;
  /** `Untitled project`, or `Untitled project 2`, `3`, … where that is taken in `location`. */
  name: string;
}

/** A folder now the open project, and for a new project the `create_project` the runtime queued in it. */
export interface ChosenProjectFolder {
  folder: string;
  project_creation: ProjectCreationQueued | null;
}

/** One project opened before, as `read_recent_projects` answers it for the Projects window, recent first. */
export interface RecentProject {
  folder: string;
  /** The project's name as the runtime reads it now, or `null` when the runtime names no project there. */
  project_name: string | null;
  /** What the project is, as the runtime reads it now; `null` when nobody has described it or the runtime names no project there. */
  project_description: string | null;
  /** When the project's history last changed, in milliseconds since the epoch on the wall clock, for display only; `null` before its first edit or where the runtime names no project. */
  last_edited_at_wall_clock_ms: number | null;
  /** Whether the project is shown by an image chosen for it, which `read_recent_project_cover` reads; otherwise its card wears a plain cover. */
  has_a_chosen_cover: boolean;
  /** When it was last opened, in milliseconds since the epoch on the wall clock: for display only. */
  last_opened_at_wall_clock_ms: number;
}

/** A project `.zip` chosen to import, and where the Import project sheet starts: the folder new projects go in, and the zip's own name where nothing there holds it yet. */
export interface ProjectArchiveChosenToImport {
  /** The `.zip`, absolute. */
  archive: string;
  location: string;
  /** The zip's name without `.zip`, or that name numbered (`pattern 2`, …) where it is taken in `location`. */
  name: string;
}

/** What `save_project_file` answers: the version the file now has on disk. */
export interface ProjectFileSaved {
  version: string;
}

/** What `create_node_file` answers: the new file, absolute, and the node type it declares, `<module>:<class>`, as a graph adds it. */
export interface NodeFileCreated {
  file: string;
  node_type: string;
}

/** What `tatolab-python-language-server-message` carries: one JSON-RPC message a session's language server sent, or its end, with why. */
export type PythonLanguageServerEvent =
  | { session: string; kind: "message"; message: JsonValue }
  | { session: string; kind: "ended"; because: string };

/** A view the open project or one of its imports brings, as the runtime's `list_project_views` lists it from a `views/<folder>/`, and the URL its folder is served under, which its entry and every file it loads resolve against. */
export type ListedStudioView = ListedStudioViewFacts & StudioViewOpening;

/** Whether the runtime opens a listed view, and when it does not, why in its own words. */
export type StudioViewOpening = { opens: true; not_opened_because: null } | { opens: false; not_opened_because: string };

/** What the window draws a listed view from, beside whether it opens. */
export interface ListedStudioViewFacts {
  /** `<project name>:<view folder>`, the node type a node of the view is. */
  view_type_id: string;
  /** The name of the project bringing it. */
  project_name: string;
  /** That project's folder under `imports/`; `null` for the open project's own view. */
  import_folder: string | null;
  /** Its `tatolab_view.json` as written, `null` when it is not JSON. */
  manifest_json: JsonValue | null;
  /** The URL its folder is served under. */
  folder_url: string;
}

/** The facts beside an Image frame a port viewer hands the window as a shared texture. */
export interface PortViewerImageFrameFacts {
  port_viewer: string;
  /** The runtime's wire name of the frame's pixel format (`bgra32`, `rgba32`, `nv12`, …). */
  format_wire_name: string;
  /** Messages the viewer skipped before this one, because a viewer reads only the latest. */
  skipped_since_last_read: number;
}

/**
 * What `tatolab-port-viewer-event` carries about one port viewer: Image frames a shared texture cannot carry, as their pixels (a GPU
 * whose memory crosses only as CPU-readable bytes); any other family's latest message, read by its family; the viewer reopening after
 * its connection to the runtime closed; or its end, with why in the runtime's words.
 */
export type PortViewerEvent =
  | {
      port_viewer: string;
      kind: "image_pixels";
      width: number;
      height: number;
      format_wire_name: string;
      bytes_per_row: number;
      pixels: Uint8Array;
      skipped_since_last_read: number;
    }
  | { port_viewer: string; kind: "message"; reading: PortViewerMessageReading; skipped_since_last_read: number }
  | { port_viewer: string; kind: "reopening"; because: string }
  | { port_viewer: string; kind: "ended"; because: string };

/** The items of the system menu bar only the desktop draws, which a studio menu places among its own entries: macOS's Services, Hide and Quit; Undo through Select All; Close Window; Minimize and Zoom; Bring All to Front; and Enter Full Screen. */
export type SystemMenuBarItems = "app_services_hide_and_quit" | "text_editing" | "close_window" | "window_arrangement" | "bring_all_to_front" | "full_screen";

/** The menus macOS treats as its own: the app menu, named for the app whatever its label; the Window menu, which lists the open windows; and the Help menu, which holds the menu search. */
export type SystemMenuOfTheDesktop = "app" | "window" | "help";

/** One entry of a studio menu as the window sends it to the system menu bar: a command (dim, saying why, while `unavailable_because` is set), one of a set of choices, a submenu, a hairline, or items the desktop draws. `entry_id` is what `tatolab-system-menu-bar-entry-chosen` names when the person chooses it; `shortcut_hint` is the key cap the window shows, as `⌘O`, `F5` or `Shift F5`. */
export type SystemMenuBarEntry =
  | { kind: "command"; entry_id: string; label: string; shortcut_hint: string | null; unavailable_because: string | null }
  | { kind: "choice"; entry_id: string; label: string; shortcut_hint: string | null; is_chosen: boolean }
  | { kind: "submenu"; label: string; entries: SystemMenuBarEntry[] }
  | { kind: "separator" }
  | { kind: "system_items"; system_items: SystemMenuBarItems };

/** One menu of the system menu bar as the window sends it: its name on the bar, which of the desktop's own menus it is, if any, and its entries. */
export interface SystemMenuBarMenu {
  label: string;
  system_menu: SystemMenuOfTheDesktop | null;
  entries: SystemMenuBarEntry[];
}
