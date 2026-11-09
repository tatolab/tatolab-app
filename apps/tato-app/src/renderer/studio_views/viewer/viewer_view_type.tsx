import { useViewReading } from "@tatolab/tato-app-view-sdk/kit/view_readings";
import { PictureInPicture2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FieldMenu, MenuSingleChoiceGroup, type MenuSingleChoice } from "@tatolab/tato-app-view-sdk/kit/menus";
import { IconButton } from "@tatolab/tato-app-view-sdk/kit/icon_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/kit/refusal_line";
import { WaitingState } from "@tatolab/tato-app-view-sdk/kit/waiting_state";
import type {
  JsonValue,
  PoppedOutViewerTarget,
  PortViewerConnectionEvent,
  PortViewerMessageReading,
  PortViewerTarget,
  StopWatching,
  StreamGraphDeclaredPort,
  StreamGraphReading,
  StreamGraphSummary,
  StreamTabAddress,
  StudioSelection,
  StudioViewHostConnection,
  StudioViewType,
} from "../../view_host/studio_view_contract";
import { nodeTitle } from "../node_words";
import { portStreamFactsWords } from "../port_stream_facts_words";
import { PortViewerMessageReadingShown, packetsUnitsSeenWith, type PacketsUnitSeen } from "./port_viewer_message_readings";

/** One output port of a stream's graph: its node's id as `graph` lists it, that node's name, and the port's own name. */
export type ViewerPortAddress = { node_id: string; node_name: string; port: string };

/** What a Viewer area keeps with the layout: the port the person chose to play, by its node's id, or `null` to follow the selection. */
export type ViewerSettings = { chosen_port: { stream: string; node_id: string; port: string } | null };

const FOLLOW_THE_SELECTION_CHOICE = "follow_the_selection";

function viewerSettingsFrom(savedSettings: JsonValue): ViewerSettings | null {
  if (typeof savedSettings !== "object" || savedSettings === null || Array.isArray(savedSettings)) return null;
  const chosenPort = savedSettings["chosen_port"];
  if (chosenPort === null) return { chosen_port: null };
  if (typeof chosenPort !== "object" || chosenPort === undefined || Array.isArray(chosenPort)) return null;
  const { stream, node_id, port } = chosenPort;
  if (typeof stream !== "string" || typeof node_id !== "string" || typeof port !== "string") return null;
  return { chosen_port: { stream, node_id, port } };
}

function viewerPortChoiceKey(portAddress: { node_id: string; port: string }): string {
  return JSON.stringify([portAddress.node_id, portAddress.port]);
}

function everyOutputPortOf(graph: StreamGraphSummary): (ViewerPortAddress & { family: string | null })[] {
  return graph.nodes.flatMap((node) => node.output_ports.map((outputPort) => ({ node_id: node.id, node_name: node.name, port: outputPort.name, family: outputPort.family })));
}

/**
 * The output port the Viewer plays for `graph`: the selected node's, its picture first; or else the stream's last picture, the first
 * Image port that feeds no other node's Image output, then a port whose family the runtime does not serve, which may be a picture;
 * or else its first port of any family.
 */
export function outputPortTheViewerPlays(graph: StreamGraphSummary, selection: StudioSelection | null): ViewerPortAddress | null {
  const outputPorts = everyOutputPortOf(graph);
  const mayBeAPicture = (outputPort: { family: string | null }) => outputPort.family === "image" || outputPort.family === null;
  const selectedNode = selection?.kind === "node" && selection.stream === graph.stream ? selection.node : null;
  const selectedNodesPorts = outputPorts.filter((outputPort) => outputPort.node_name === selectedNode);
  const pictures = outputPorts.filter(mayBeAPicture);
  const imagePorts = outputPorts.filter((outputPort) => outputPort.family === "image");
  const feedsANodeOf = (outputPort: ViewerPortAddress, nodeNames: Set<string>) =>
    graph.links.some((link) => link.source_node === outputPort.node_name && link.source_port === outputPort.port && nodeNames.has(link.target_node));
  const nodesWithAPicture = new Set(pictures.map((outputPort) => outputPort.node_name));
  const nodesWithAnImagePort = new Set(imagePorts.map((outputPort) => outputPort.node_name));
  const played =
    selectedNodesPorts.find(mayBeAPicture) ??
    selectedNodesPorts[0] ??
    imagePorts.find((outputPort) => !feedsANodeOf(outputPort, nodesWithAnImagePort)) ??
    pictures.find((outputPort) => !feedsANodeOf(outputPort, nodesWithAPicture)) ??
    pictures[0] ??
    outputPorts[0] ??
    null;
  return played === null ? null : { node_id: played.node_id, node_name: played.node_name, port: played.port };
}

function chosenPortStillInTheGraph(graph: StreamGraphSummary, settings: ViewerSettings): ViewerPortAddress | null {
  const chosenPort = settings.chosen_port;
  if (chosenPort === null || chosenPort.stream !== graph.stream) return null;
  const outputPortInTheGraph = everyOutputPortOf(graph).find((outputPort) => outputPort.node_id === chosenPort.node_id && outputPort.port === chosenPort.port);
  return outputPortInTheGraph === undefined ? null : { node_id: outputPortInTheGraph.node_id, node_name: outputPortInTheGraph.node_name, port: outputPortInTheGraph.port };
}

/** The port the Viewer plays: the one chosen for this stream while the graph still has it, or else the one the selection gives. */
export function portTheViewerPlays(graph: StreamGraphSummary, selection: StudioSelection | null, settings: ViewerSettings): ViewerPortAddress | null {
  return chosenPortStillInTheGraph(graph, settings) ?? outputPortTheViewerPlays(graph, selection);
}

/** What Pop out pins a Viewer window to: the stream tab shown, and the node selected in it, or `null` when no node of that stream is selected. */
export function poppedOutViewerTargetOf(streamTab: StreamTabAddress, selection: StudioSelection | null): PoppedOutViewerTarget {
  return {
    stream: streamTab.stream,
    project_name: streamTab.project_name,
    display_name: streamTab.display_name,
    node: selection?.kind === "node" && selection.stream === streamTab.stream ? selection.node : null,
  };
}

function portWordsOf(graph: StreamGraphSummary, portAddress: ViewerPortAddress): string {
  const node = graph.nodes.find((graphNode) => graphNode.id === portAddress.node_id);
  return `${node === undefined ? portAddress.node_name : nodeTitle(node.name, node.type)} › ${portAddress.port}`;
}

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

/** What a port viewer shows besides its picture: waiting for the first message, another family's latest message read by its family, a format it cannot draw, or why it is reopening or has ended. */
type PortViewerShown =
  | { kind: "waiting" }
  | { kind: "picture"; format_wire_name: string }
  | { kind: "messages"; reading: PortViewerMessageReading; packets_units_seen: readonly PacketsUnitSeen[]; messages_read: number }
  | { kind: "undrawable"; format_wire_name: string }
  | { kind: "reopening"; because: string }
  | { kind: "ended"; because: string };

const MESSAGE_READING_REDRAWN_EVERY_MS = 66;

/** The picture, or the messages, one port viewer reads from a running node's output port. */
function PortViewerPicture({
  connection,
  target,
  nodeName,
  portWords,
  streamFactsOfThePort,
}: {
  connection: StudioViewHostConnection<ViewerSettings>;
  target: PortViewerTarget;
  nodeName: string;
  portWords: string;
  streamFactsOfThePort: Pick<StreamGraphDeclaredPort, "stream_facts" | "values_checked">;
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
    const handleTheEvent = (event: PortViewerConnectionEvent) => {
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
    const portViewer = connection.watchPortViewer({ stream, node_id, port }, handleTheEvent);
    return () => portViewer.close();
  }, [connection, stream, node_id, port]);
  const isAPicture = shown.kind === "picture";
  const streamFactsWords = portStreamFactsWords(streamFactsOfThePort).join(" · ");
  return (
    <div
      className={isAPicture || shown.kind === "waiting" ? "relative flex min-h-0 flex-1 flex-col bg-black" : "relative flex min-h-0 flex-1 flex-col"}
      data-viewer-playing={`${nodeName}/${port}`}
      data-viewer-port-state={shown.kind}
    >
      <canvas ref={canvasRef} aria-label={`Live picture of ${portWords}`} className={isAPicture ? "block size-full object-contain" : "hidden"} data-viewer-picture="" />
      {isAPicture && streamFactsWords !== "" && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white/85" data-viewer-stream-facts={streamFactsWords}>
          {streamFactsWords}
        </div>
      )}
      {shown.kind === "waiting" && <WaitingState title={`Reading ${portWords}`} explanation="The picture shows once the node writes its next frame." />}
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
        <WaitingState title={`${portWords} is ${shown.format_wire_name}`} explanation={`The Viewer draws four-byte BGRA and RGBA frames it reads as pixels; ${shown.format_wire_name} arrives later.`} />
      )}
      {shown.kind === "reopening" && <WaitingState title={`Reopening ${portWords}`} explanation={shown.because} data-viewer-reopening="" />}
      {shown.kind === "ended" && <WaitingState isFailure title={`Stopped reading ${portWords}`} explanation={shown.because} data-viewer-ended="" />}
    </div>
  );
}

/** The output port `address` names as `graph` declares it; `undefined` once the graph no longer has it. */
function declaredOutputPortOf(graph: StreamGraphSummary, address: ViewerPortAddress): StreamGraphDeclaredPort | undefined {
  return graph.nodes.find((node) => node.id === address.node_id)?.output_ports.find((outputPort) => outputPort.name === address.port);
}

function useTheGraphOfTheTab(connection: StudioViewHostConnection<ViewerSettings>, stream: string): StreamGraphReading | null {
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  return useViewReading(watchTheTabsGraph);
}

/** The Viewer of the stream tab shown: the live picture of the port it plays. */
function ViewerOfTheTab({ connection, streamTab }: { connection: StudioViewHostConnection<ViewerSettings>; streamTab: StreamTabAddress }) {
  const graphReading = useTheGraphOfTheTab(connection, streamTab.stream);
  const selection = useViewReading(connection.watchSelection);
  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") {
    return <WaitingState title={`Nothing of ${streamTab.display_name} to view yet`} explanation={graphReading.because} data-viewer-state="not_read" />;
  }
  const playedPort = portTheViewerPlays(graphReading.graph, selection, connection.settings);
  if (playedPort === null) {
    return (
      <WaitingState
        title={`${streamTab.display_name} has no output to view`}
        explanation="The Viewer plays any output port of a running node. None of this stream's nodes declares one."
        data-viewer-state="no_output_port"
      />
    );
  }
  return (
    <PortViewerPicture
      key={viewerPortChoiceKey(playedPort)}
      connection={connection}
      target={{ stream: streamTab.stream, node_id: playedPort.node_id, port: playedPort.port }}
      nodeName={playedPort.node_name}
      portWords={portWordsOf(graphReading.graph, playedPort)}
      streamFactsOfThePort={declaredOutputPortOf(graphReading.graph, playedPort) ?? { stream_facts: null, values_checked: null }}
    />
  );
}

/** The Viewer of the active stream tab, or what to do while no tab is open. */
function ViewerBody({ connection }: { connection: StudioViewHostConnection<ViewerSettings> }) {
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  if (activeStreamTab === null) {
    return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to view it here." data-viewer-state="no_tab" />;
  }
  return <ViewerOfTheTab key={activeStreamTab.stream} connection={connection} streamTab={activeStreamTab} />;
}

/** The port the Viewer plays, chosen from every output of the tab's graph, or following the selection. */
function ViewerPortChooser({ connection, streamTab }: { connection: StudioViewHostConnection<ViewerSettings>; streamTab: StreamTabAddress }) {
  const graphReading = useTheGraphOfTheTab(connection, streamTab.stream);
  const selection = useViewReading(connection.watchSelection);
  if (graphReading === null || graphReading.kind === "not_read") return null;
  const { graph } = graphReading;
  const playedPort = portTheViewerPlays(graph, selection, connection.settings);
  if (playedPort === null) return null;
  const chosenPort = chosenPortStillInTheGraph(graph, connection.settings);
  const portChoices: MenuSingleChoice<string>[] = [
    { choice: FOLLOW_THE_SELECTION_CHOICE, label: "Follow the selection" },
    ...everyOutputPortOf(graph).map((outputPort) => ({ choice: viewerPortChoiceKey(outputPort), label: portWordsOf(graph, outputPort) })),
  ];
  const playedPortWords = portWordsOf(graph, playedPort);
  return (
    <FieldMenu label={`Port: ${playedPortWords}`} words={playedPortWords} menuWidth="fit" data-viewer-port-chooser="">
      <MenuSingleChoiceGroup
        choices={portChoices}
        chosen={chosenPort === null ? FOLLOW_THE_SELECTION_CHOICE : viewerPortChoiceKey(chosenPort)}
        dataAttributeOfEachChoice="data-viewer-port-choice"
        onChosen={(choice) => {
          const portChosenNow = everyOutputPortOf(graph).find((outputPort) => viewerPortChoiceKey(outputPort) === choice);
          connection.rememberSettings({ chosen_port: portChosenNow === undefined ? null : { stream: graph.stream, node_id: portChosenNow.node_id, port: portChosenNow.port } });
        }}
      />
    </FieldMenu>
  );
}

/** The port chooser and Pop out, in the Viewer's header while a stream tab is open, and why the last pop-out was refused. */
function ViewerHeaderTools({ connection }: { connection: StudioViewHostConnection<ViewerSettings> }) {
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const selection = useViewReading(connection.watchSelection);
  const [popOutRefusal, setPopOutRefusal] = useState<string | null>(null);
  if (activeStreamTab === null) return null;
  const popOut = () => {
    setPopOutRefusal(null);
    void connection.popOutViewer(poppedOutViewerTargetOf(activeStreamTab, selection)).then((popOutAnswer) => {
      setPopOutRefusal(popOutAnswer.kind === "not_popped_out" ? popOutAnswer.because : null);
    });
  };
  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5">
      {popOutRefusal !== null && (
        <div className="min-w-0 truncate" data-viewer-pop-out-refusal="">
          <RefusalLine lead="Didn't pop out:" words={popOutRefusal} />
        </div>
      )}
      <ViewerPortChooser key={activeStreamTab.stream} connection={connection} streamTab={activeStreamTab} />
      <IconButton
        icon={PictureInPicture2}
        size="compact"
        label="Pop out the Viewer"
        tooltip="Pop the Viewer out into its own window, pinned to this stream and the node selected"
        onPressed={popOut}
        data-viewer-pop-out=""
      />
    </div>
  );
}

/** The Viewer: the live picture of any output port of the active stream's running nodes, the selected node's unless a port is chosen. */
export const VIEWER_VIEW_TYPE: StudioViewType<ViewerSettings> = {
  view_type_id: "viewer",
  title: "Viewer",
  icon: "viewer",
  brought_by: { kind: "built_in" },
  default_settings: { chosen_port: null },
  settingsFromSavedLayout: viewerSettingsFrom,
  renderStudioView: (connection) => ({
    header_tools: <ViewerHeaderTools connection={connection} />,
    body: <ViewerBody connection={connection} />,
  }),
};
