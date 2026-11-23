import { streamPreparingWords } from "../shared/stream_preparing_words";
import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { PortFamilyPlaceholder } from "@tatolab/tato-app-view-sdk/design_system/port_family_placeholder";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { LatestPortViewerPictureDrawnEachAnimationFrame, type PortViewerEvent, type StopWatching, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import {
  familyOfThePort,
  type PortViewerMessageReading,
  type PortViewerRecovery,
  type PortViewerTarget,
  type StreamGraph,
  type StreamGraphPort,
  type StreamGraphReading,
  type StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import type { PortFamily } from "@tatolab/tato-app-view-sdk/port_families";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { ToggleIconButton } from "@tatolab/tato-app-view-sdk/design_system/toggle_icon_button";
import { Maximize2, Minimize2 } from "lucide-react";
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

/** What a port's visualizer shows besides its picture: waiting for the first message, another family's latest message read by its family, a format it cannot draw, or why it is reopening or has ended. */
type PortViewerShown =
  | { kind: "waiting" }
  | { kind: "picture"; format_wire_name: string }
  | { kind: "messages"; reading: PortViewerMessageReading; packets_units_seen: readonly PacketsUnitSeen[]; messages_read: number }
  | { kind: "undrawable"; format_wire_name: string }
  | { kind: "reopening"; because: string }
  | { kind: "ended"; because: string; recovery: PortViewerRecovery };

const MESSAGE_READING_REDRAWN_EVERY_MS = 66;

/** What an ended port viewer says of how it recovers. */
const ENDED_EXPLANATIONS: Record<PortViewerRecovery, string> = {
  shows_once_the_node_runs: "Nothing is reaching this port right now. It shows here live once the node runs again.",
  open_the_port_again: "This port couldn't be read. Open it again to try once more.",
};

/** The picture, or the messages, the Node visualizer reads from a running node's output port. */
export function PortViewerPicture({
  connection,
  target,
  nodeName,
  portWords,
  streamFactsOfThePort,
  isTheNodeNotReady,
}: {
  connection: TatoAppViewConnection;
  target: PortViewerTarget;
  nodeName: string;
  portWords: string;
  /** What the played port states of its stream, with the family it names. */
  streamFactsOfThePort: Pick<StreamGraphPort, "stream_facts" | "values_checked"> & { family: PortFamily | null };
  /** Draws the editor's checker behind the picture, which shows through the transparent frames the runtime sends while the node is not ready. */
  isTheNodeNotReady: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<PortViewerShown>({ kind: "waiting" });
  const [timesOpenedAgain, setTimesOpenedAgain] = useState(0);
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
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const pictureDrawn = new LatestPortViewerPictureDrawnEachAnimationFrame(canvas, (picture, isDrawn) => {
      if (isDrawn) showThePicture(picture.format_wire_name);
      else if (shownKind !== "undrawable") show({ kind: "undrawable", format_wire_name: picture.format_wire_name });
    });
    const handleTheEvent = (event: PortViewerEvent) => {
      if (event.kind === "image_frame" || event.kind === "image_pixels") {
        pictureDrawn.drawOnTheNextAnimationFrame(event);
        return;
      }
      pictureDrawn.dropTheWaitingPicture();
      if (event.kind === "message") {
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
    // Studio refuses only a watch it holds under the same id already, which opening again, under a new watch id, does not repeat.
    const stopWatching = connection.watchPortViewer({ stream, node_id, port }, handleTheEvent, (because) => {
      pictureDrawn.dropTheWaitingPicture();
      show({ kind: "ended", because, recovery: "open_the_port_again" });
    });
    return () => {
      stopWatching();
      pictureDrawn.dropTheWaitingPicture();
    };
  }, [connection, stream, node_id, port, timesOpenedAgain]);
  const isAPicture = shown.kind === "picture";
  const streamFactsWords = portStreamFactsWords(streamFactsOfThePort).join(" · ");
  return (
    <div
      className="port-preview-surface relative flex min-h-0 flex-1 flex-col"
      data-viewer-playing={`${nodeName}/${port}`}
      data-viewer-port-state={shown.kind}
      data-viewer-node-not-ready={isTheNodeNotReady || undefined}
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
          <PortViewerMessageReadingShown reading={shown.reading} unitsSeen={shown.packets_units_seen} messagesRead={shown.messages_read} valuesChecked={streamFactsOfThePort.values_checked ?? null} />
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
          explanation={ENDED_EXPLANATIONS[shown.recovery]}
          details={shown.because}
          action={
            shown.recovery === "open_the_port_again" ? (
              <ActionButton size="small" hasFocusOnOpen={timesOpenedAgain > 0} onPressed={() => setTimesOpenedAgain((times) => times + 1)} data-viewer-open-again="">
                Open again
              </ActionButton>
            ) : undefined
          }
          data-viewer-ended={shown.recovery}
        />
      )}
    </div>
  );
}

/** The output port `address` names as `graph` declares it; `undefined` once the graph no longer has it. */
function declaredOutputPortOf(graph: StreamGraph, address: NodeVisualizerPortAddress): StreamGraphPort | undefined {
  return graph.nodes.find((node) => node.id === address.node_id)?.ports.outputs.find((outputPort) => outputPort.name === address.port);
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
function ViewerOfTheGraph({ connection, streamTab, graph, subject }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress; graph: StreamGraph; subject: NodeVisualizerSubject }) {
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
  const declaredOutputPort = declaredOutputPortOf(graph, playedPort);
  const declaredPort = { stream_facts: declaredOutputPort?.stream_facts, values_checked: declaredOutputPort?.values_checked, family: declaredOutputPort === undefined ? null : familyOfThePort(declaredOutputPort) };
  const playedNode = graph.nodes.find((node) => node.id === playedPort.node_id);
  const playedNodeState = stateKeepingThePlayedNodeFromWriting(graph, playedPort);
  if (playedNodeState !== null) {
    return (
      <PortFamilyPlaceholder
        family={declaredPort.family}
        title={portWords}
        explanation={nodeNotRunningWords(playedNodeState)}
        details={playedNode?.components.failed_because ?? undefined}
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
      isTheNodeNotReady={(playedNode?.components.not_ready_because ?? null) !== null}
    />
  );
}

/** The Node visualizer's frame: its toolbar row holding Expand, which grows its area to fill the window and, pressed again or with Esc, puts the layout back. */
function NodeVisualizerFrame({ connection, children }: { connection: TatoAppViewConnection; children: ReactNode }) {
  const isExpanded = useViewReading(connection.watchAreaExpansion) ?? false;
  const [expansionRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  return (
    <CoreViewFrame
      connection={connection}
      toolbarLabel="Node visualizer tools"
      toolbarTools={
        <ToggleIconButton
          icon={Maximize2}
          iconWhileOn={Minimize2}
          label="Expand"
          tooltipWhileOff="Expand to fill the window"
          tooltipWhileOn="Put the layout back (Esc)"
          isOn={isExpanded}
          onToggled={(isOn) => showTheRefusalOf(isOn ? "Didn't expand:" : "Didn't put the layout back:", connection.expandTheArea(isOn))}
          data-viewer-expand=""
        />
      }
    >
      <RefusalOfTheLatestAskBar refusal={expansionRefusal} />
      {children}
    </CoreViewFrame>
  );
}

/** The Node visualizer's frame for the open stream tab, following the selection once the tab's graph and the selection are read. */
function ViewerOfTheTab({ connection, streamTab }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress }) {
  const graphReading = useTheGraphOfTheTab(connection, streamTab.stream);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const selection = useViewReading(connection.watchSelection);
  if (graphReading === null) return <NodeVisualizerFrame connection={connection}>{null}</NodeVisualizerFrame>;
  if (graphReading.kind === "not_read") {
    const preparingWords = streamPreparingWords(listedStreams?.kind === "listed" ? listedStreams.streams.find((listed) => listed.stream === streamTab.stream) : undefined, streamTab.display_name);
    return (
      <NodeVisualizerFrame connection={connection}>
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
      </NodeVisualizerFrame>
    );
  }
  return (
    <NodeVisualizerFrame connection={connection}>
      <ViewerOfTheGraph connection={connection} streamTab={streamTab} graph={graphReading.graph} subject={nodeVisualizerSubjectOf(graphReading.graph, selection)} />
    </NodeVisualizerFrame>
  );
}

/** The Node visualizer view's whole frame: the live picture of the selected node's output, and a placeholder while nothing is selected or nothing live reaches it. */
export function ViewerView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  if (activeStreamTab.kind === "not_read_yet") return <NodeVisualizerFrame connection={connection}>{null}</NodeVisualizerFrame>;
  if (activeStreamTab.reading === null) {
    return (
      <NodeVisualizerFrame connection={connection}>
        <PortFamilyPlaceholder family={null} title="No stream is open" explanation="Double-click a stream in the outliner to visualize its nodes here." data-viewer-state="no_tab" />
      </NodeVisualizerFrame>
    );
  }
  return <ViewerOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} />;
}
