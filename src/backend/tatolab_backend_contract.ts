// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

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
  app_update: TatolabAppUpdateState;
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
  /** The runtime's loopback preview page playing this output, `<origin>/watch/<machine>/<stream>/<node>/<port>`; `null` for an `internal` port, which is never served. */
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
