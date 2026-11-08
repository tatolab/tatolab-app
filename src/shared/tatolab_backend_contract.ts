/** A value as JSON carries it. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** The platform the app runs on, which decides the window's chrome. */
export type TatolabPlatform = "macos" | "linux";

/**
 * Whether the runtime answers its local API. `starting` is the runtime the app started not answering yet; `not_running`
 * is no runtime answering, with why in `TatolabStatus.runtime_not_running_because`: the app's own runtime exited and is
 * started again shortly, or an app that carries none (an unpackaged one) finding none running.
 */
export type RuntimeState = "running" | "starting" | "not_running";

/** Where a stream's code lives, which its stream id is computed from: its project directory, symlinks resolved, and its stream function as `module:qualname`. */
export interface StreamLocation {
  project_directory: string;
  /** `""` for the one failed record the runtime keeps for a project whose `stream.py` loads no `@stream`, its id `<folder>-<hash>`, until a load replaces it with the project's streams. */
  stream_function: string;
}

/** One stream the runtime lists. `state` is running, stopped, failed, preparing or stopping, or a state newer than this app. */
export interface ListedStream {
  /** Its stream id, `<folder>-<function>-<hash>`, which every tool about one stream names it by. */
  stream: string;
  /** The label the runtime shows it under; free text, and never unique. */
  display_name: string;
  /** `null` for a record an earlier runtime wrote, which is listed failed until it is removed. */
  location: StreamLocation | null;
  state: string;
  /** How many nodes its loaded graph holds; `null` while it is not loaded. */
  node_count: number | null;
  failed_because: string | null;
  /** Each capture device, `camera` or `microphone` or one newer than this app, that a node of the loaded stream refused because nobody has asked the person for its access, as when the runtime brought the stream back on its own at its start; a stop then a start of the stream asks. Empty when it is not loaded. */
  capture_devices_whose_access_was_never_asked_for: string[];
  /** The stream action queued or under way on it while it is `preparing` or `stopping`; `null` otherwise. */
  action: string | null;
  /** That action's step, `making_the_venv`, `compiling`, `starting` or `stopping`, or one newer than this app; `null` while the action waits in its project's queue, and while no action works on it. */
  step: string | null;
}

/** A stream action the window asks the runtime to queue on one stream, named as the runtime's tool and the window's command are. */
export type TatolabStreamActionName = "stop_stream" | "start_stream";

/** How a newer Tatolab found by a check reaches the person: installed in place, then the app reopens; or its download opened, for a `.deb`, which only apt replaces. */
export type TatolabAppUpdateDelivery = "install_and_relaunch" | "open_the_download";

/**
 * Where checking for a newer Tatolab stands. `not_offered` is an app that cannot update itself (an
 * unpackaged one), with why; `available` is a newer version a check found and nobody has taken yet;
 * `failed` carries the updater's own words, and the installed app keeps working.
 */
export type TatolabAppUpdateState =
  | { kind: "not_offered"; reason: string }
  | { kind: "not_checked" }
  | { kind: "checking" }
  | { kind: "up_to_date" }
  | { kind: "available"; version: string; delivery: TatolabAppUpdateDelivery }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "installing"; version: string }
  | { kind: "failed"; refusal: string };

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
  command_line_tool_link: CommandLineToolLink;
  app_update: TatolabAppUpdateState;
  /** The socket this build reads the runtime's local API at. */
  local_api_socket: string;
  stream_failure_notifications: StreamFailureNotificationsState;
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

/** One record of a project's log, flattened by the backend from the runtime's JSONL record. */
export interface ProjectLogRecord {
  /** Nanoseconds since the Unix epoch; past 2^53, so it arrives rounded to a few hundred nanoseconds. */
  host_ts_ns: number | null;
  level: string | null;
  source: string | null;
  target: string | null;
  message: string;
  attrs: Record<string, string>;
  /** The graph `id` of the step that wrote it, which a record names a step by; `null` for a record written outside a step. */
  processor_id: string | null;
  /** Whether a step's own helper process wrote it (it carries `source_seq`, or its `source` is `python`) rather than the runtime's process. */
  sent_by_its_own_process: boolean;
  /** The id of the stream action it was written for; `null` for a record written outside one. */
  action: string | null;
  /** The id of the stream that wrote it; `null` for a record of the project's own, such as the venv's making and the compile. */
  stream: string | null;
  /** The record as JSON text, every number in the digits the runtime wrote, so `host_ts` is exact. */
  jsonl_line: string;
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

/** The five families a runtime port carries, each one engine-owned memory layout, as streamlib's plan names them. */
export const PORT_FAMILIES = ["image", "array", "channels", "packets", "records"] as const;

/** One of the five port families. */
export type PortFamily = (typeof PORT_FAMILIES)[number];

/** A port a node declares under the graph's `ports.inputs` or `ports.outputs`. */
export interface StreamGraphDeclaredPort {
  name: string;
  /** The family the port carries, from its `family` key; `null` while the runtime serves none, or one this app does not know. */
  family: PortFamily | null;
  /** What an output carries, as its `catalog_entry.section` names it (`video`, `audio`, `binary`, …); `null` when it declares none, as every input does. */
  catalog_section: string | null;
}

/** One node of a stream's graph, by the name a link end and a port address name it by. */
export interface StreamGraphNode {
  /** The runtime's id of the node, which a log record's `processor_id` names it by. */
  id: string;
  name: string;
  type: string;
  /** The processor's state as the runtime names it, such as `Running`. */
  state: string | null;
  /** Its config as the graph renders it, the keys its stream's code gave it; `{}` when it renders none. */
  config: { [key: string]: JsonValue };
  /** The input ports it declares, in the graph's order; `[]` when the runtime lists none. */
  input_ports: StreamGraphDeclaredPort[];
  /** The output ports it declares, in the graph's order; `[]` when the runtime lists none. */
  output_ports: StreamGraphDeclaredPort[];
  /** Messages it dropped on each link into it, by the link's `id`, as `components.metrics` counts them since the link was wired. */
  dropped_bags_by_link: Record<string, number>;
  /** Messages each of its output ports refused, by port name, as `components.metrics` counts them. */
  refused_bags_by_output_port: Record<string, number>;
}

/** One link of a stream's graph, from an output port to an input port; the source may be in another stream. */
export interface StreamGraphLink {
  /** The runtime's id of the link, which a node's `dropped_bags_by_link` is keyed by. */
  id: string;
  source_node: string;
  source_port: string;
  target_node: string;
  target_port: string;
  /** `wired`, `pending`, `awaiting_remote`, `error`, `disconnecting` or `disconnected`. */
  state: string;
}

/** An output port the stream exposes, at `internal`, `private` or `public`. */
export interface StreamGraphExposedPort {
  node: string;
  port: string;
  level: string;
  /** The runtime's loopback preview page playing this output, `<origin>/watch/<machine>/<stream>/<node>/<port>?video_only`, showing the video alone; `null` for an `internal` port, which is never served, and for every port of a graph that names no machine. */
  watch_page_url: string | null;
}

/** What `describe_stream_graph` answers: one loaded stream's nodes, links and exposed ports, and the document they were read from. */
export interface StreamGraphSummary {
  stream: string;
  nodes: StreamGraphNode[];
  links: StreamGraphLink[];
  exposed: StreamGraphExposedPort[];
  /** The `graph` tool's text exactly as the runtime wrote it, which `tatolab graph --stream` prints. */
  graph_document_text: string;
}

/** One port a node type declares, as the node catalog lists it. */
export interface NodeCatalogPort {
  name: string;
  description: string;
  /** The family the port carries, from its `family` key; `null` while the runtime serves none, or one this app does not know. */
  family: PortFamily | null;
}

/** One node type a stream can add, as the node catalog lists it under the `type` a graph node carries. */
export interface NodeCatalogEntry {
  type: string;
  description: string;
  /** Its config's JSON Schema, draft 2020-12 with no `$schema` key; `null` for a type described without one. */
  config_schema: JsonValue | null;
  inputs: NodeCatalogPort[];
  outputs: NodeCatalogPort[];
}

/** What `describe_node_catalog` answers: every node type the loaded stream `stream` can add, from `GET /api/registry?stream=`. */
export interface NodeCatalog {
  stream: string;
  node_types: NodeCatalogEntry[];
}

/** What a project folder is chosen for in the app's folder dialog: a project to import, or the folder a new project is created in, which may not exist yet. */
export type StreamProjectFolderChosenFor = "project_to_run" | "new_project_directory";

/** What `create_project` answers at once: the action it queued, the stream id the new project's `main` runs under, and the project's folder resolved. */
export interface ProjectCreationQueued {
  action: string;
  stream: string;
  project_directory: string;
}

/** What `run_project` answers at once: the action it queued, and the project's folder. */
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
  /** `making_the_venv`, `compiling` or `starting` while `in_progress`; `null` otherwise. */
  step: string | null;
  streams: StreamTakenInByAnAction[];
  /** Why a `failed` action failed, in the runtime's words; `null` otherwise. */
  failed_because: string | null;
}

/** What `cancel_stream_action` answers: the action, `cancelled` for one dropped from its queue, or `in_progress` for one stopping at the step it is on, or a state newer than this app. */
export interface StreamActionCancelAnswer {
  action: string;
  state: string;
}

/** What following a stream action read: its description, or the runtime's words that it no longer holds the action. */
export type StreamActionFollowed = { kind: "described"; description: StreamActionDescription } | { kind: "not_held"; words: string };

/** One value of a relay's settings on the wire: `add_relay` and `configure_relay` take them, `list_relays` lists the non-secret ones, a `string_list` is a list of text, and `null` returns a setting to its default. */
export type RelaySettingValue = string | number | boolean | readonly string[] | null;

/** Whether the runtime holds a value for one secret setting of a relay; never the value. */
export type RelaySecretPresence = "set" | "unset";

/** A relay's settings by name, as `add_relay` and `configure_relay` take them and `list_relays` lists them. */
export type RelaySettingsByName = Record<string, RelaySettingValue>;

/**
 * Where a relay stands with its relay, as `list_relays` reports it: `not_joined` with why when the runtime knows,
 * `joining`, `joined`, or `lost` with why and when it joins again; a state newer than this app is kept as spelled.
 */
export type RelayConnectionState =
  | { state: "not_joined"; why: string | null }
  | { state: "joining" }
  | { state: "joined" }
  | { state: "lost"; why: string; rejoining_after_ms: number }
  | { state: "newer_than_this_app"; spelled_as: string };

/** One relay the runtime holds, as `list_relays` lists it, the built-in ones first. */
export interface ListedRelay {
  relay_id: string;
  /** The adapter it is joined through, as the relay-adapter catalog names it. */
  adapter: string;
  /** Whether it is built in, and so never removed. */
  built_in: boolean;
  /** Its settings, every secret left out. */
  settings: RelaySettingsByName;
  /** Each secret setting its adapter takes, by name, and whether the runtime holds a value for it; never the value. */
  secrets: Record<string, RelaySecretPresence>;
  connection_state: RelayConnectionState;
}

/** How a person enters one setting, as the relay-adapter catalog's `type` declares it; a `select` takes one of its `options`, a `file` takes a file's text, picked or pasted. */
export type RelaySettingFieldType =
  | { type: "string" }
  | { type: "url" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "select"; options: readonly string[] }
  | { type: "string_list" }
  | { type: "file" };

/** One setting an adapter takes, as the relay-adapter catalog's `settings` lists it. */
export interface RelaySettingField {
  name: string;
  field_type: RelaySettingFieldType;
  /** The runtime keeps it in the OS secret store and lists it only as set or unset, whatever its type. */
  is_secret: boolean;
  is_required: boolean;
  doc: string;
  /** Its value when an instance's settings leave it out; `null` when the catalog serves none. */
  default_value: RelaySettingValue;
}

/** One adapter of the runtime's relay-adapter catalog: its kind, as `add_relay` takes it, the name and icon people see it by, what it joins, and the settings it takes, in the catalog's order. */
export interface RelayAdapter {
  kind: string;
  /** The name people know it by (`"moq.pro"`); `null` from a runtime that serves none. */
  display_name: string | null;
  /** The provider's own logo, a `data:image/…` URI the runtime carries on a square canvas; `null` when it serves none, or one that is not `data:image/`. */
  display_icon_data_uri: string | null;
  doc: string;
  setting_fields: RelaySettingField[];
}

/** What `describe_relays` answers: every relay the runtime holds and every adapter it can join one through. */
export interface RelaysDescription {
  relays: ListedRelay[];
  adapters: RelayAdapter[];
}

/** A project folder as its `pyproject.toml` describes it. */
export interface ProjectOnDisk {
  /** The folder, absolute with its links resolved. */
  folder: string;
  /** `[project] name`. */
  name: string;
  /** `[project] dependencies`, each as `pyproject.toml` spells it. */
  requirements: string[];
}

/** Where an imported project comes from: a folder a uv `path` source names, read or unreadable with why, or a package index. */
export type ImportedProjectSource =
  | { kind: "folder"; project: ProjectOnDisk }
  | { kind: "folder_unreadable"; folder: string; refusal: string }
  | { kind: "package_index" };

/** One dependency of the open project, which the studio shows as an import. */
export interface ImportedProject {
  /** The requirement's name, normalized as PEP 503 normalizes a package name. */
  name: string;
  requirement: string;
  source: ImportedProjectSource;
}

/** The project open in the studio: its folder's own project, and the projects it imports, in `pyproject.toml`'s order. */
export interface OpenProject {
  project: ProjectOnDisk;
  imports: ImportedProject[];
}

/** What `read_open_project` answers and `tatolab-open-project-changed` carries: no project open, the open one read, or its folder unreadable, with why in the words of what refused. */
export type OpenProjectReading =
  | { kind: "none_open" }
  | { kind: "read"; open_project: OpenProject }
  | { kind: "unreadable"; folder: string; refusal: string };

/** What a popped-out Viewer window is pinned to: the stream it plays and the words it is titled with, and the node whose exposed output it plays, or `null` for the stream's first. */
export interface PoppedOutViewerTarget {
  stream: string;
  project_name: string;
  display_name: string;
  node: string | null;
}

/** A `@node` or `@stream` a catalog entry brings: its name, where it is imported from, and one line on what it does. */
export interface PackageCatalogMember {
  name: string;
  import_path: string;
  summary: string;
}

/** One package or sample project the catalog at get.tatolab.com lists, as its version 1 serves it. */
export interface PackageCatalogEntry {
  kind: "package" | "sample";
  /** The project's name, as a requirement names it. */
  name: string;
  title: string;
  summary: string;
  version: string;
  /** The PEP 508 requirement Import adds to `[project] dependencies` as it is. */
  requirement: string;
  nodes: PackageCatalogMember[];
  streams: PackageCatalogMember[];
  homepage_url: string | null;
}

/** What `read_package_catalog` answers: the catalog's entries and how many it served that the app could not read, or why it was not read, in the words of what refused. */
export type PackageCatalogReading =
  | { kind: "read"; entries: PackageCatalogEntry[]; unreadable_entry_count: number }
  | { kind: "not_read"; because: string };

/** What `preview_import` answers: the workspace's `pyproject.toml` before and after the requirement is added, and the version it was read at, which `import_into_workspace` takes back. */
export interface ImportPreview {
  file: string;
  text_before: string;
  text_after: string;
  based_on_version: string;
}

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
  /** The `[project]` name its `pyproject.toml` gives, or `null` when the folder or the file does not read now. */
  project_name: string | null;
  /** When it was last opened, in milliseconds since the epoch on the wall clock: for display only. */
  last_opened_at_wall_clock_ms: number;
}

/** What `read_project_file` answers: a file of the open project or its imports, as read from disk. */
export interface ProjectFileRead {
  /** The file, absolute, as the window named it. */
  file: string;
  /** The folder of the project the file belongs to. */
  project_folder: string;
  text: string;
  /** The SHA-256 of the bytes read, in hex, which `save_project_file` takes back as `based_on_version`. */
  version: string;
  /** Whether the file belongs to the open project, whose files the studio saves; an import's are read-only. */
  is_editable: boolean;
}

/** What `save_project_file` answers: the version the file now has on disk. */
export interface ProjectFileSaved {
  version: string;
}

/** What `list_project_files` answers: a project's Python files and `pyproject.toml`, relative to its folder, in name order. */
export interface ProjectFiles {
  project_folder: string;
  files: string[];
}

/** What `tatolab-python-language-server-message` carries: one JSON-RPC message a session's language server sent, or its end, with why. */
export type PythonLanguageServerEvent =
  | { session: string; kind: "message"; message: JsonValue }
  | { session: string; kind: "ended"; because: string };
