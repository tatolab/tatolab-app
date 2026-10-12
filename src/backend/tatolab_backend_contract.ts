/** The platform the app runs on, which decides the window's chrome and how Tatolab is installed and removed. */
export type TatolabPlatform = "macos" | "linux";

/**
 * What the service manager says about the runtime: Service Management's launch agent on macOS; on Linux the
 * systemd user unit `tatolabd.service`, enabled, installed but disabled, or absent, and never `requires_approval`.
 */
export type RuntimeAgentRegistration = "enabled" | "requires_approval" | "not_registered" | "not_found";

/** Whether the runtime answers its local API. */
export type RuntimeState = "running" | "starting" | "stopped" | "unreachable";

/** Whether first-launch machine setup still needs the administrator prompt; always `complete` on Linux. */
export type MachineSetupState = "complete" | "needs_administrator" | "waiting_for_administrator";

/** One stream the runtime lists. `state` is attached, kept, stopped or failed, or a state newer than this app. */
export interface ListedStream {
  name: string;
  state: string;
  project_directory: string;
  /** How many nodes its loaded graph holds; `null` while it is not loaded. */
  node_count: number | null;
  failed_because: string | null;
}

/** What `get_tatolab_status` answers and `tatolab-status-changed` carries. */
export interface TatolabStatus {
  app_version: string;
  platform: TatolabPlatform;
  run_tatolab: boolean;
  runtime_agent: RuntimeAgentRegistration;
  runtime_state: RuntimeState;
  machine_name: string | null;
  /** `null` when the streams were not listed: the runtime is down or listing them failed. */
  streams: ListedStream[] | null;
  machine_setup_state: MachineSetupState;
  /** `/usr/local/bin/tatolab` on macOS once linked; on Linux the absolute path of `~/.local/bin/tatolab` while it exists. */
  command_line_tool_linked_at: string | null;
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
}

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

/** One node of a stream's graph, by the name a link end and a port address name it by. */
export interface StreamGraphNode {
  name: string;
  type: string;
  /** The processor's state as the runtime names it, such as `Running`. */
  state: string | null;
}

/** One link of a stream's graph, from an output port to an input port; the source may be in another stream. */
export interface StreamGraphLink {
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
}

/** What `describe_stream_graph` answers: one loaded stream's nodes, links and exposed ports. */
export interface StreamGraphSummary {
  stream: string;
  nodes: StreamGraphNode[];
  links: StreamGraphLink[];
  exposed: StreamGraphExposedPort[];
}
