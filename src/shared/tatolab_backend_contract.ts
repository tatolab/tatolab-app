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

/** How a newer Tatolab found by a check reaches the person: downloaded in the background and installed in place as the app restarts; or its download opened, for a `.deb`, which only apt replaces. */
export type TatolabAppUpdateDelivery = "install_and_relaunch" | "open_the_download";

/**
 * Where checking for a newer Tatolab stands. `not_offered` is an app that cannot update itself (an
 * unpackaged one), with why; `available` is a newer version a check found that has not downloaded (a
 * `.deb`'s, or one whose background download failed); `ready_to_restart` is a newer version downloaded
 * and staged, which installs as the app restarts or quits; `failed` carries the updater's own words, and
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
  /** What an output states about the stream it carries now, from its `stream_facts` key; `null` when it states none, as every input does. */
  stream_facts: PortStreamFacts | null;
  /** `false` on a Records port, whose values no type checks, from its `values_checked` key; `null` on every other family. */
  values_checked: boolean | null;
}

/** An Image stream's frame rate, as a rational number of frames per second. */
export interface ImageStreamFrameRate {
  numerator: number;
  denominator: number;
}

/** An HDR stream's content light level, in cd/m² (CTA-861.3). */
export interface ImageStreamContentLightLevel {
  max_content_light_level: number;
  max_frame_average_light_level: number;
}

/** The mastering display an HDR stream was graded on (SMPTE ST 2086): luminance in steps of 0.0001 cd/m². */
export interface ImageStreamMasteringDisplayColourVolume {
  max_display_mastering_luminance: number;
  min_display_mastering_luminance: number;
}

/** An output port's stream facts as the runtime renders them under `stream_facts`, tagged by `family`; a field the port does not state is `null`. */
export type PortStreamFacts =
  | {
      family: "image";
      frame_rate: ImageStreamFrameRate | null;
      content_light_level: ImageStreamContentLightLevel | null;
      mastering_display_colour_volume: ImageStreamMasteringDisplayColourVolume | null;
    }
  | {
      family: "packets";
      /** The codec with its profile and level, as an RFC 6381 `codecs` parameter spells it (`avc1.64001f`, `opus`). */
      rfc6381_codec: string | null;
      coded_width: number | null;
      coded_height: number | null;
      sample_rate: number | null;
      channel_count: number | null;
      /** The bytes of the codec's out-of-band configuration record (`avcC`, `hvcC`, `OpusHead`), from its lowercase hex. */
      codec_configuration_byte_length: number | null;
    };

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

/** What `describe_stream_graph` answers: one loaded stream's nodes and links, and the document they were read from. */
export interface StreamGraphSummary {
  stream: string;
  nodes: StreamGraphNode[];
  links: StreamGraphLink[];
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

/** What a popped-out Viewer window is pinned to: the stream it plays and the words it is titled with, and the node whose output it plays, or `null` to play the stream's last picture. */
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

/** A view type the open project or one of its imports brings: its id (`<distribution>:<entry>`), the distribution and `tatolab.views` entry it comes from, its `tatolab_view.json` as parsed, and the URL its folder is served under, which its entry and every file it loads resolve against. */
export interface ListedStudioView {
  view_type_id: string;
  distribution: string;
  entry_name: string;
  manifest_json: JsonValue;
  folder_url: string;
}

/** The output port of a running node a Viewer shows: the stream's id, the node's id as `graph` lists it, and the port's name. */
export interface PortViewerTarget {
  stream: string;
  node_id: string;
  port: string;
}

/** The facts beside an Image frame a port viewer hands the window as a shared texture. */
export interface PortViewerImageFrameFacts {
  port_viewer: string;
  /** The runtime's wire name of the frame's pixel format (`bgra32`, `rgba32`, `nv12`, …). */
  format_wire_name: string;
  /** Messages the viewer skipped before this one, because a viewer reads only the latest. */
  skipped_since_last_read: number;
}

/** One channel of a Channels block, as the Viewer draws its waveform: the lowest and highest sample of each of its columns, its peak and its RMS. */
export interface PortViewerChannelWaveform {
  column_minimums: number[];
  column_maximums: number[];
  peak: number;
  rms: number;
}

/** One attribute of an Array frame: its name, element type and shape, where its data lives, and, for numeric data in the payload, its statistics. */
export interface PortViewerArrayAttributeReading {
  name: string;
  dtype: string;
  shape: number[];
  residency: "cpu" | "gpu";
  statistics: { element_count: number; minimum: number; maximum: number; mean: number } | null;
}

/** What a port viewer read of one message of a family other than Image, from the family's descriptor and payload. */
export type PortViewerMessageReading =
  | {
      family: "channels";
      start_sample: number;
      sample_rate: number;
      channel_count: number;
      samples_per_channel: number;
      sample_type: string;
      channel_waveforms: PortViewerChannelWaveform[];
    }
  | { family: "array"; attributes: PortViewerArrayAttributeReading[] }
  | { family: "packets"; codec: string; byte_length: number; starts_group: boolean; timestamp_ns: number }
  | { family: "records"; record: JsonValue }
  | { family: "bytes"; byte_length: number }
  | { family: "unreadable"; port_family: string; because: string };

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
