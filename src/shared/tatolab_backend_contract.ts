/** The platform the app runs on, which decides the window's chrome and how Tatolab is installed and removed. */
export type TatolabPlatform = "macos" | "linux";

/**
 * What the service manager says about the runtime: Service Management's launch agent on macOS; on Linux the
 * systemd user unit `tatolabd.service`, enabled, installed but disabled, or absent, and never `requires_approval`.
 */
export type RuntimeAgentRegistration = "enabled" | "requires_approval" | "not_registered" | "not_found";

/**
 * Whether the runtime answers its local API. `starting` is the agent enabled and the runtime not answering yet,
 * within the start timeout; past it, `unreachable` is a runtime that answered since it was last started and then
 * stopped, and `never_answered` one that has not answered once since. `blocked_by_the_service_manager` is launchd
 * giving up on the agent (a spawn it refused, exit 78 EX_CONFIG, or a code-signing kill such as a Launch Constraint
 * Violation), or systemd holding `tatolabd.service` failed.
 */
export type RuntimeState = "running" | "starting" | "stopped" | "unreachable" | "never_answered" | "blocked_by_the_service_manager";

/** `/usr/local/bin/tatolab` on macOS: linked to this app's CLI, not linked, or not offered with why (Linux, whose installer links the command; a local-proof build; an app with no CLI in it). */
export type CommandLineToolUsrLocalBinLink = { kind: "linked"; path: string } | { kind: "not_linked" } | { kind: "not_offered"; reason: string };

/** One stream the runtime lists. `state` is attached, kept, stopped or failed, or a state newer than this app. */
export interface ListedStream {
  name: string;
  state: string;
  project_directory: string;
  /** How many nodes its loaded graph holds; `null` while it is not loaded. */
  node_count: number | null;
  failed_because: string | null;
}

/** A stream action the window asks the runtime for, named as the runtime's tool and the window's command are. */
export type TatolabStreamActionName = "stop_stream" | "start_stream" | "remove_stream";

/** What `stop_stream` answers. */
export interface StreamStopAnswer {
  /** The runtime's words when it unloaded a kept stream but could not record it stopped, so a runtime restart loads it again; `null` otherwise. */
  not_recorded_because: string | null;
}

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
  run_tatolab: boolean;
  runtime_agent: RuntimeAgentRegistration;
  runtime_state: RuntimeState;
  machine_name: string | null;
  /** `null` when the streams were not listed: the runtime is down or listing them failed. */
  streams: ListedStream[] | null;
  /** Whether "Get Started" ended first run; the macOS window shows Welcome until it has. Linux has no first run, so its window never reads it. */
  first_run_finished: boolean;
  /** The absolute path of `~/.local/bin/tatolab` while it is linked: on macOS to this app's CLI, on Linux by the installer. */
  command_line_tool_linked_at: string | null;
  command_line_tool_usr_local_bin_link: CommandLineToolUsrLocalBinLink;
  app_update: TatolabAppUpdateState;
  /** The socket this build reads the runtime's local API at. */
  local_api_socket: string;
  stream_failure_notifications: StreamFailureNotificationsState;
  open_at_login: TatolabAppOpenAtLogin;
  command_line_tool_version: TatolabCommandLineToolVersion;
  python_for_new_environments: PythonForNewEnvironments;
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

/** One record of a stream's log, flattened by the backend from the runtime's JSONL record. */
export interface StreamLogRecord {
  sequence: number;
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
  /** The record as JSON text, every number in the digits the runtime wrote, so `host_ts` is exact. */
  jsonl_line: string;
}

/** The folder under a stream's project directory that the runtime writes the stream's log segments into. */
export const STREAM_LOG_FOLDER_IN_THE_PROJECT = ".streamlib/logs";

/** What `read_stream_log_records` answers: one loaded stream's records after the sequence asked for. */
export interface StreamLogRecordsPage {
  stream: string;
  /** Which load of the stream; a page naming another instance than the last numbers its records from 1 again. */
  stream_instance: string;
  records: StreamLogRecord[];
  next_after: number;
  /** Records after the one asked for that the runtime dropped from its history before this read. */
  records_no_longer_held: number;
}

/** A port a node declares under the graph's `ports.inputs` or `ports.outputs`. */
export interface StreamGraphDeclaredPort {
  name: string;
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
  /** The runtime's loopback preview page playing this output, `<origin>/watch/<machine>/<stream>/<node>/<port>`; `null` for an `internal` port, which is never served, and for every port of a graph that names no machine. */
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

/** What a project folder is chosen for in the app's folder dialog: a project to run, or the directory `tatolab new` creates. */
export type StreamProjectFolderChosenFor = "project_to_run" | "new_project_directory";

/** A project's `.venv` as the app found it: its interpreter present, with the Python and `tatolab-stream` versions it names when it names them; or missing, which the app makes with its own uv when the project runs. */
export type StreamProjectPythonEnvironment =
  | { kind: "present"; python_version: string | null; tatolab_stream_version: string | null }
  | { kind: "missing" };

/** What the app found in a project folder the window may name: whether it exists, its `stream.py`, and its `.venv`. */
export interface StreamProjectFolderReport {
  /** An absolute path. */
  folder: string;
  folder_exists: boolean;
  stream_file_present: boolean;
  /** The functions `stream.py` marks `@stream`, in file order, found by reading its text; the runtime decides what compiles. */
  stream_functions: string[];
  python_environment: StreamProjectPythonEnvironment;
}

/** What `run_stream` answers for a load it carried out, field for field. */
export interface StreamRunAnswer {
  /** The name the stream was loaded under, as the runtime cast it. */
  stream: string;
  stream_instance: string;
  kept: boolean;
  project_directory: string;
  node_count: number;
  /** Whether the load replaced the kept stream of the same project and function. */
  replaced_the_kept_record: boolean;
  /** Each line the compile wrote to its standard error, the cross-floor check's warnings among them. */
  compile_warnings: string[];
}

/**
 * What running a project folder came to: the stream running; the runtime's refusal of a name a listed stream holds, with the
 * first name no listed stream holds; or the app's uv failing to make the project's `.venv` first, in uv's own words. Any
 * other refusal is the command's refusal.
 */
export type StreamProjectRunOutcome =
  | { kind: "running"; answer: StreamRunAnswer }
  | { kind: "name_taken"; refusal: string; free_name: string }
  | { kind: "python_environment_not_made"; words: string };

/** The Python the app makes a project's `.venv` from: Tatolab's own, with its version; Tatolab's own in a build that carries none, with why; or the interpreter the person chose in Settings. */
export type PythonForNewEnvironments =
  | { kind: "built_in"; python_version: string }
  | { kind: "built_in_not_offered"; reason: string }
  | { kind: "chosen"; interpreter: string };

/** What Settings asks the Python for new environments to be: Tatolab's own, or one the person picks in the app's own file dialog, so the window never names a program for the app to run. */
export type PythonForNewEnvironmentsChoice = "built_in" | "chosen_in_a_file_dialog";

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
