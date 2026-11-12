// Port viewers' connection to the runtime: one `/control/stream` connection, because the runtime ties
// a viewer to the connection that opened it and closes every viewer a connection opened when it closes.

import { jsonObject, optionalText, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { localApiRequestFailure, theRuntimesRefusal, type LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { TatolabRuntimeControlStreamConnection } from "./tatolab_runtime_control_operation_call.js";

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
  /** The surface-sharing socket's path on Linux, its Mach service's name on macOS; `null` on macOS when the open named no `viewer_process_id`. */
  surface_share_address: string | null;
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
    surface_share_address: surfaceShareAddress.value,
  });
}

/** A `close_viewer` result's `viewer`, the id of the viewer it closed. */
export function closedViewerFromTheCloseViewerToolResult(operationResult: unknown): Result<string, string> {
  const toolResult = jsonObject(operationResult, "the close_viewer result");
  const viewer = toolResult.ok ? requiredText(toolResult.value, "viewer") : toolResult;
  return viewer.ok ? viewer : failedWith(`the runtime's close_viewer result could not be read: ${viewer.failure}`);
}

/** One `/control/stream` connection port viewers are opened over, held open while any of them is. */
export class RuntimeViewerControlConnection {
  private constructor(private readonly controlStreamConnection: TatolabRuntimeControlStreamConnection) {}

  /** Open a connection to the local API at `localApiSocketPath`, giving up on it and on any later answer after `requestTimeoutMs`. */
  static async open(localApiSocketPath: string, requestTimeoutMs: number): Promise<Result<RuntimeViewerControlConnection, LocalApiRequestFailure>> {
    const opened = await TatolabRuntimeControlStreamConnection.open(localApiSocketPath, requestTimeoutMs);
    return opened.ok ? succeeded(new RuntimeViewerControlConnection(opened.value)) : opened;
  }

  /** Open a viewer of `target`'s output port, held open until `closeViewer` or this connection closes; refused in the runtime's own words. */
  async openViewer(target: RuntimeViewerTarget): Promise<Result<OpenedRuntimeViewer, LocalApiRequestFailure>> {
    const answered = await this.controlStreamConnection.callControlOperation("open_viewer", {
      stream: target.stream,
      node_id: target.node_id,
      port: target.port,
      viewer_process_id: target.viewer_process_id,
    });
    if (!answered.ok) return answered;
    if (answered.value.kind === "refused_by_the_operation") return theRuntimesRefusal(answered.value.words);
    const openedViewer = openedRuntimeViewerFromTheOpenViewerToolResult(answered.value.result);
    return openedViewer.ok ? openedViewer : localApiRequestFailure(openedViewer.failure);
  }

  /** Close the viewer `viewer` this connection opened, answering the id the runtime closed; refused in the runtime's own words. */
  async closeViewer(viewer: string): Promise<Result<string, LocalApiRequestFailure>> {
    const answered = await this.controlStreamConnection.callControlOperation("close_viewer", { viewer });
    if (!answered.ok) return answered;
    if (answered.value.kind === "refused_by_the_operation") return theRuntimesRefusal(answered.value.words);
    const closedViewer = closedViewerFromTheCloseViewerToolResult(answered.value.result);
    return closedViewer.ok ? closedViewer : localApiRequestFailure(closedViewer.failure);
  }

  /** Call `whenTheConnectionCloses` once, with why, when the connection closes from either end; at once if it already has. */
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void {
    this.controlStreamConnection.onClosed(whenTheConnectionCloses);
  }

  /** Whether the connection is still open. */
  isOpen(): boolean {
    return this.controlStreamConnection.isOpen();
  }

  /** Close the connection, which closes every viewer it opened. */
  close(): void {
    this.controlStreamConnection.close();
  }
}
