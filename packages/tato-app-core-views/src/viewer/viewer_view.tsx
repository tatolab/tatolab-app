import { streamPreparingWords } from "../shared/stream_preparing_words";
import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useRef, useState } from "react";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { PortFamilyPlaceholder } from "@tatolab/tato-app-view-sdk/design_system/port_family_placeholder";
import type { PortViewerEvent, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type {
  PortViewerMessageReading,
  PortViewerTarget,
  StreamGraphDeclaredPort,
  StreamGraphReading,
  StreamGraphSummary,
  StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { nodeTitle } from "../shared/node_words";
import { portStreamFactsWords } from "../shared/port_stream_facts_words";
import { PortViewerMessageReadingShown, packetsUnitsSeenWith, type PacketsUnitSeen } from "./port_viewer_message_readings";
import {
  nodeVisualizerPortKey,
  nodeVisualizerSubjectOf,
  portWordsOf,
  stateKeepingThePlayedNodeFromWriting,
  type NodeVisualizerPortAddress,
  type NodeVisualizerSubject,
} from "./node_visualizer_subject";

const BGRA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["bgra32", "bgra8_unorm", "bgra8_unorm_srgb"]);
const RGBA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["rgba32", "rgba8_unorm", "rgba8_unorm_srgb"]);

/** Draw `pixels`, rows of `bytesPerRow` in a four-byte BGRA or RGBA format, onto `canvas`; `false` for any other format. */
function drawCpuReadPixels(canvas: HTMLCanvasElement, width: number, height: number, formatWireName: string, bytesPerRow: number, pixels: Uint8Array): boolean {
  const isBgra = BGRA_BYTE_ORDER_FORMAT_WIRE_NAMES.has(formatWireName);
  if (!isBgra && !RGBA_BYTE_ORDER_FORMAT_WIRE_NAMES.has(formatWireName)) return false;
  const drawing = canvas.getContext("2d");
  if (drawing === null) return false;
  const imageData = new ImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = row * bytesPerRow + column * 4;
      const to = (row * width + column) * 4;
      imageData.data[to] = pixels[from + (isBgra ? 2 : 0)] ?? 0;
      imageData.data[to + 1] = pixels[from + 1] ?? 0;
      imageData.data[to + 2] = pixels[from + (isBgra ? 0 : 2)] ?? 0;
      imageData.data[to + 3] = pixels[from + 3] ?? 255;
    }
  }
  canvas.width = width;
  canvas.height = height;
  drawing.putImageData(imageData, 0, 0);
  return true;
}

/** What a port's visualizer shows besides its picture: waiting for the first message, another family's latest message read by its family, a format it cannot draw, or why it is reopening or has ended. */
type PortViewerShown =
  | { kind: "waiting" }
  | { kind: "picture"; format_wire_name: string }
  | { kind: "messages"; reading: PortViewerMessageReading; packets_units_seen: readonly PacketsUnitSeen[]; messages_read: number }
  | { kind: "undrawable"; format_wire_name: string }
  | { kind: "reopening"; because: string }
  | { kind: "ended"; because: string };

const MESSAGE_READING_REDRAWN_EVERY_MS = 66;

/** The picture, or the messages, the Node visualizer reads from a running node's output port. */
function PortViewerPicture({
  connection,
  target,
  nodeName,
  portWords,
  streamFactsOfThePort,
}: {
  connection: TatoAppViewConnection;
  target: PortViewerTarget;
  nodeName: string;
  portWords: string;
  streamFactsOfThePort: Pick<StreamGraphDeclaredPort, "family" | "stream_facts" | "values_checked">;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<PortViewerShown>({ kind: "waiting" });
  const { stream, node_id, port } = target;
  useEffect(() => {
    setShown({ kind: "waiting" });
    let shownKind: PortViewerShown["kind"] = "waiting";
    let messagesRead = 0;
    let messageReadingShownAtMs = Number.NEGATIVE_INFINITY;
    let packetsUnitsSeen: PacketsUnitSeen[] = [];
    const show = (nextShown: PortViewerShown) => {
      shownKind = nextShown.kind;
      setShown(nextShown);
    };
    const showThePicture = (formatWireName: string) => {
      if (shownKind !== "picture") show({ kind: "picture", format_wire_name: formatWireName });
    };
    const handleTheEvent = (event: PortViewerEvent) => {
      const canvas = canvasRef.current;
      if (event.kind === "image_frame") {
        const drawing = canvas?.getContext("2d") ?? null;
        if (canvas !== null && drawing !== null) {
          if (canvas.width !== event.video_frame.displayWidth) canvas.width = event.video_frame.displayWidth;
          if (canvas.height !== event.video_frame.displayHeight) canvas.height = event.video_frame.displayHeight;
          drawing.drawImage(event.video_frame, 0, 0);
        }
        event.video_frame.close();
        showThePicture(event.format_wire_name);
      } else if (event.kind === "image_pixels") {
        const drawn = canvas !== null && drawCpuReadPixels(canvas, event.width, event.height, event.format_wire_name, event.bytes_per_row, event.pixels);
        if (drawn) showThePicture(event.format_wire_name);
        else if (shownKind !== "undrawable") show({ kind: "undrawable", format_wire_name: event.format_wire_name });
      } else if (event.kind === "message") {
        messagesRead += 1 + event.skipped_since_last_read;
        if (event.reading.family === "packets") packetsUnitsSeen = packetsUnitsSeenWith(packetsUnitsSeen, event.reading);
        const nowMs = performance.now();
        if (shownKind !== "messages" || nowMs - messageReadingShownAtMs >= MESSAGE_READING_REDRAWN_EVERY_MS) {
          messageReadingShownAtMs = nowMs;
          show({ kind: "messages", reading: event.reading, packets_units_seen: packetsUnitsSeen, messages_read: messagesRead });
        }
      } else {
        show(event);
      }
    };
    return connection.watchPortViewer({ stream, node_id, port }, handleTheEvent, (because) => show({ kind: "ended", because }));
  }, [connection, stream, node_id, port]);
  const isAPicture = shown.kind === "picture";
  const streamFactsWords = portStreamFactsWords(streamFactsOfThePort).join(" · ");
  return (
    <div
      className="port-preview-surface relative flex min-h-0 flex-1 flex-col"
      data-viewer-playing={`${nodeName}/${port}`}
      data-viewer-port-state={shown.kind}
    >
      <canvas ref={canvasRef} aria-label={`Live picture of ${portWords}`} className={isAPicture ? "block size-full object-contain" : "hidden"} data-viewer-picture="" />
      {isAPicture && streamFactsWords !== "" && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white/85" data-viewer-stream-facts={streamFactsWords}>
          {streamFactsWords}
        </div>
      )}
      {shown.kind === "waiting" && (
        <PortFamilyPlaceholder
          family={streamFactsOfThePort.family}
          title={portWords}
          explanation={streamFactsOfThePort.family === "image" || streamFactsOfThePort.family === null ? "Waiting for the node's next frame." : "Waiting for the node's next message."}
          data-viewer-waiting=""
        />
      )}
      {shown.kind === "messages" && (
        <div className="flex min-h-0 flex-1 flex-col" data-viewer-messages={shown.reading.family}>
          <div className="flex min-w-0 items-baseline gap-2 border-b border-line px-3 py-1.5 text-xs">
            <span className="min-w-0 shrink-0 truncate text-fg-2">{portWords}</span>
            {streamFactsWords !== "" && (
              <span className="min-w-0 truncate text-2xs text-fg-3" data-viewer-stream-facts={streamFactsWords}>
                {streamFactsWords}
              </span>
            )}
          </div>
          <PortViewerMessageReadingShown reading={shown.reading} unitsSeen={shown.packets_units_seen} messagesRead={shown.messages_read} valuesChecked={streamFactsOfThePort.values_checked} />
        </div>
      )}
      {shown.kind === "undrawable" && (
        <WaitingState title={`${portWords} is ${shown.format_wire_name}`} explanation={`The Node visualizer draws four-byte BGRA and RGBA frames it reads as pixels; ${shown.format_wire_name} arrives later.`} />
      )}
      {shown.kind === "reopening" && (
        <PortFamilyPlaceholder family={streamFactsOfThePort.family} title={portWords} explanation="Reopening this port…" details={shown.because} data-viewer-reopening="" />
      )}
      {shown.kind === "ended" && (
        <PortFamilyPlaceholder
          family={streamFactsOfThePort.family}
          title={portWords}
          explanation="Nothing is reaching this port right now. It shows here live once the node runs again."
          details={shown.because}
          data-viewer-ended=""
        />
      )}
    </div>
  );
}

/** The output port `address` names as `graph` declares it; `undefined` once the graph no longer has it. */
function declaredOutputPortOf(graph: StreamGraphSummary, address: NodeVisualizerPortAddress): StreamGraphDeclaredPort | undefined {
  return graph.nodes.find((node) => node.id === address.node_id)?.output_ports.find((outputPort) => outputPort.name === address.port);
}

function useTheGraphOfTheTab(connection: TatoAppViewConnection, stream: string): StreamGraphReading | null {
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  return useViewReading(watchTheTabsGraph);
}

/** Why a node in `state` shows no live preview, and when it will. */
function nodeNotRunningWords(state: string): string {
  if (state === "Error") return "This node failed. It shows here live once it runs again.";
  if (state === "Paused") return "Paused. It shows here live once the node runs again.";
  return "Not running. It shows here live once the stream plays.";
}

/** The Node visualizer of a graph it has read: the live picture of the selected node's port while that node runs, or else a placeholder saying what to do. */
function ViewerOfTheGraph({ connection, streamTab, graph, subject }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress; graph: StreamGraphSummary; subject: NodeVisualizerSubject }) {
  if (subject.kind === "nothing_selected") {
    return <PortFamilyPlaceholder family={null} title="Select a node to visualize it" explanation="Click a node in the stream graph and what it outputs shows here." data-viewer-state="nothing_selected" />;
  }
  if (subject.kind === "node_without_output") {
    return (
      <PortFamilyPlaceholder
        family={null}
        title={nodeTitle(subject.node.name, subject.node.type)}
        explanation="This node has no output to visualize."
        data-viewer-state="node_without_output"
      />
    );
  }
  const playedPort = subject.port;
  const portWords = portWordsOf(graph, playedPort);
  const declaredPort = declaredOutputPortOf(graph, playedPort) ?? { family: null, stream_facts: null, values_checked: null };
  const playedNodeState = stateKeepingThePlayedNodeFromWriting(graph, playedPort);
  if (playedNodeState !== null) {
    return (
      <PortFamilyPlaceholder
        family={declaredPort.family}
        title={portWords}
        explanation={nodeNotRunningWords(playedNodeState)}
        details={graph.nodes.find((node) => node.id === playedPort.node_id)?.failed_because ?? undefined}
        data-viewer-state="node_not_running"
        data-viewer-node-state={playedNodeState}
      />
    );
  }
  return (
    <PortViewerPicture
      key={nodeVisualizerPortKey(playedPort)}
      connection={connection}
      target={{ stream: streamTab.stream, node_id: playedPort.node_id, port: playedPort.port }}
      nodeName={playedPort.node_name}
      portWords={portWords}
      streamFactsOfThePort={declaredPort}
    />
  );
}

/** The Node visualizer's frame for the open stream tab, following the selection once the tab's graph and the selection are read. */
function ViewerOfTheTab({ connection, streamTab }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress }) {
  const graphReading = useTheGraphOfTheTab(connection, streamTab.stream);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const selection = useViewReading(connection.watchSelection);
  if (graphReading === null) return <CoreViewFrame connection={connection}>{null}</CoreViewFrame>;
  if (graphReading.kind === "not_read") {
    const preparingWords = streamPreparingWords(listedStreams?.kind === "listed" ? listedStreams.streams.find((listed) => listed.stream === streamTab.stream) : undefined, streamTab.display_name);
    return (
      <CoreViewFrame connection={connection}>
        {preparingWords !== null ? (
          <PortFamilyPlaceholder family={null} title={preparingWords.title} explanation={preparingWords.explanation} data-viewer-state="preparing" />
        ) : (
          <PortFamilyPlaceholder
            family={null}
            title={`Nothing of ${streamTab.display_name} to visualize yet`}
            explanation="Its nodes show here once the runtime serves the stream's graph."
            details={graphReading.because}
            data-viewer-state="not_read"
          />
        )}
      </CoreViewFrame>
    );
  }
  return (
    <CoreViewFrame connection={connection}>
      <ViewerOfTheGraph connection={connection} streamTab={streamTab} graph={graphReading.graph} subject={nodeVisualizerSubjectOf(graphReading.graph, selection)} />
    </CoreViewFrame>
  );
}

/** The Node visualizer view's whole frame: the live picture of the selected node's output, and a placeholder while nothing is selected or nothing live reaches it. */
export function ViewerView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  if (activeStreamTab.kind === "not_read_yet") return <CoreViewFrame connection={connection}>{null}</CoreViewFrame>;
  if (activeStreamTab.reading === null) {
    return (
      <CoreViewFrame connection={connection}>
        <PortFamilyPlaceholder family={null} title="No stream is open" explanation="Double-click a stream in the outliner to visualize its nodes here." data-viewer-state="no_tab" />
      </CoreViewFrame>
    );
  }
  return <ViewerOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} />;
}
