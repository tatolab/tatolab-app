// Port viewers' connection to the runtime: one `/control/ws` connection, because the runtime ties a viewer to the
// connection that opened it and closes every viewer a connection opened when it closes; what `open_viewer` and
// `close_viewer` answer, read field for field.

import { jsonObject, optionalText, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** What `open_viewer` answers (`OpenViewerToolResult`): where the viewer's own process subscribes to read the port. */
export interface OpenedRuntimeViewer {
  /** The id `close_viewer` takes: `<stream>/<node_id>/<port>`. */
  viewer: string;
  stream: string;
  /** The node's id, as `graph` lists it. */
  node_id: string;
  /** The node's name: its label, not its identity. */
  node_name: string;
  port: string;
  /** The root of the iceoryx2 domain the port's channel lives in. */
  iceoryx2_domain_root: string;
  /** The iceoryx2 service whose reserved subscriber slot the viewer takes. */
  channel: string;
  /** The iceoryx2 event service the port's node notifies on each write to `channel`. */
  wake_service: string;
  /** Which of the port's messages the viewer reads: `every_message` for a Channels port, in order as far back as the channel holds them, `latest_message` for every other family. */
  viewer_reads: RuntimeViewerReads;
  /** The surface-sharing socket's path on Linux, its Mach service's name on macOS; `null` on macOS when the open named no `viewer_process_id`. */
  surface_share_address: string | null;
}

/** Which of a port's messages a viewer reads, as `open_viewer` answers it. */
export type RuntimeViewerReads = "latest_message" | "every_message";

function isARuntimeViewerReads(wireValue: string): wireValue is RuntimeViewerReads {
  return wireValue === "latest_message" || wireValue === "every_message";
}

/** The output port of a running node a viewer reads, and the process that imports its Image frames. */
export interface RuntimeViewerTarget {
  stream: string;
  /** The node's id, as `graph` lists it. */
  node_id: string;
  port: string;
  /** The pid of the process that imports the frames; the runtime's surface-sharing service on macOS admits only that process. */
  viewer_process_id: number;
}

/** An `open_viewer` result read field for field; unknown fields are ignored. */
export function openedRuntimeViewerFromTheOpenViewerToolResult(operationResult: unknown): Result<OpenedRuntimeViewer, string> {
  const toolResult = jsonObject(operationResult, "the open_viewer result");
  const openedViewer = toolResult.ok ? openedRuntimeViewerOnTheWire(toolResult.value) : toolResult;
  return openedViewer.ok ? openedViewer : failedWith(`the runtime's open_viewer result could not be read: ${openedViewer.failure}`);
}

function openedRuntimeViewerOnTheWire(toolResult: JsonObjectOnTheWire): Result<OpenedRuntimeViewer, string> {
  const viewer = requiredText(toolResult, "viewer");
  if (!viewer.ok) return viewer;
  const stream = requiredText(toolResult, "stream");
  if (!stream.ok) return stream;
  const nodeId = requiredText(toolResult, "node_id");
  if (!nodeId.ok) return nodeId;
  const nodeName = requiredText(toolResult, "node_name");
  if (!nodeName.ok) return nodeName;
  const port = requiredText(toolResult, "port");
  if (!port.ok) return port;
  const iceoryx2DomainRoot = requiredText(toolResult, "iceoryx2_domain_root");
  if (!iceoryx2DomainRoot.ok) return iceoryx2DomainRoot;
  const channel = requiredText(toolResult, "channel");
  if (!channel.ok) return channel;
  const wakeService = requiredText(toolResult, "wake_service");
  if (!wakeService.ok) return wakeService;
  const viewerReads = requiredText(toolResult, "viewer_reads");
  if (!viewerReads.ok) return viewerReads;
  if (!isARuntimeViewerReads(viewerReads.value)) return failedWith(`its viewer_reads is ${JSON.stringify(viewerReads.value)}, not latest_message or every_message`);
  const surfaceShareAddress = optionalText(toolResult, "surface_share_address");
  if (!surfaceShareAddress.ok) return surfaceShareAddress;
  return succeeded({
    viewer: viewer.value,
    stream: stream.value,
    node_id: nodeId.value,
    node_name: nodeName.value,
    port: port.value,
    iceoryx2_domain_root: iceoryx2DomainRoot.value,
    channel: channel.value,
    wake_service: wakeService.value,
    viewer_reads: viewerReads.value,
    surface_share_address: surfaceShareAddress.value,
  });
}

/** A `close_viewer` result's `viewer`, the id of the viewer it closed. */
export function closedViewerFromTheCloseViewerToolResult(operationResult: unknown): Result<string, string> {
  const toolResult = jsonObject(operationResult, "the close_viewer result");
  const viewer = toolResult.ok ? requiredText(toolResult.value, "viewer") : toolResult;
  return viewer.ok ? viewer : failedWith(`the runtime's close_viewer result could not be read: ${viewer.failure}`);
}

/** Why a call over the port viewers' connection came back without an answer, and whether it was the operation's own refusal. */
export interface RuntimeViewerCallFailure {
  readonly words: string;
  readonly theRuntimeRefusedIt: boolean;
}

/** One `/control/ws` connection port viewers are opened over, held open while any of them is. */
export interface RuntimeViewerConnection {
  /** Open a viewer of `target`'s output port, held open until `closeViewer` or this connection closes; refused in the runtime's own words. */
  readonly openViewer: (target: RuntimeViewerTarget) => Promise<Result<OpenedRuntimeViewer, RuntimeViewerCallFailure>>;
  /** Close the viewer `viewer` this connection opened, answering the id the runtime closed; refused in the runtime's own words. */
  readonly closeViewer: (viewer: string) => Promise<Result<string, RuntimeViewerCallFailure>>;
  /** Call `whenTheConnectionCloses` once, with why, when the connection closes from either end; at once if it already has. */
  readonly onClosed: (whenTheConnectionCloses: (whyItClosed: string) => void) => void;
  /** Whether the connection is still open. */
  readonly isOpen: () => boolean;
  /** Close the connection, which closes every viewer it opened. */
  readonly close: () => void;
}
