import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useRef, useState } from "react";
import { FieldMenu, MenuSingleChoiceGroup, type MenuSingleChoice } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { PortViewerEvent, StopWatching, TatoAppViewConnection, ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type {
  PortViewerMessageReading,
  PortViewerTarget,
  StreamGraphDeclaredPort,
  StreamGraphReading,
  StreamGraphSummary,
  StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { portStreamFactsWords } from "../shared/port_stream_facts_words";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { PortViewerMessageReadingShown, packetsUnitsSeenWith, type PacketsUnitSeen } from "./port_viewer_message_readings";
import {
  chosenPortStillInTheGraph,
  everyOutputPortOf,
  portTheViewerPlays,
  portWordsOf,
  viewerChosenPortOf,
  viewerPortChoiceKey,
  type ViewerChosenPort,
  type ViewerPortAddress,
} from "./viewer_port_choice";

const FOLLOW_THE_SELECTION_CHOICE = "follow_the_selection";

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
  connection: TatoAppViewConnection;
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

function useTheGraphOfTheTab(connection: TatoAppViewConnection, stream: string): StreamGraphReading | null {
  const watchTheTabsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  return useViewReading(watchTheTabsGraph);
}

/** The Viewer of a graph it has read: the live picture of the port it plays. */
function ViewerOfTheGraph({ connection, streamTab, graph, playedPort }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress; graph: StreamGraphSummary; playedPort: ViewerPortAddress | null }) {
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
      portWords={portWordsOf(graph, playedPort)}
      streamFactsOfThePort={declaredOutputPortOf(graph, playedPort) ?? { stream_facts: null, values_checked: null }}
    />
  );
}

/** The port the Viewer plays, chosen from every output of the tab's graph, or following the selection; the choice is kept in the area's settings. */
function ViewerPortChooser({
  connection,
  graph,
  playedPort,
  chosenPortSetting,
  showTheRefusalOf,
}: {
  connection: TatoAppViewConnection;
  graph: StreamGraphSummary;
  playedPort: ViewerPortAddress;
  chosenPortSetting: ViewerChosenPort;
  showTheRefusalOf: (lead: string, asked: Promise<ViewAskDone>) => void;
}) {
  const chosenPort = chosenPortStillInTheGraph(graph, chosenPortSetting);
  const portChoices: MenuSingleChoice<string>[] = [
    { choice: FOLLOW_THE_SELECTION_CHOICE, label: "Follow the selection" },
    ...everyOutputPortOf(graph).map((outputPort) => ({ choice: viewerPortChoiceKey(outputPort), label: portWordsOf(graph, outputPort) })),
  ];
  const playedPortWords = portWordsOf(graph, playedPort);
  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5">
      <FieldMenu label={`Port: ${playedPortWords}`} words={playedPortWords} menuWidth="fit" data-viewer-port-chooser="">
        <MenuSingleChoiceGroup closesTheMenuOnChoice
          choices={portChoices}
          chosen={chosenPort === null ? FOLLOW_THE_SELECTION_CHOICE : viewerPortChoiceKey(chosenPort)}
          dataAttributeOfEachChoice="data-viewer-port-choice"
          onChosen={(choice) => {
            const portChosenNow = everyOutputPortOf(graph).find((outputPort) => viewerPortChoiceKey(outputPort) === choice);
            showTheRefusalOf(
              "Didn't keep the port:",
              connection.rememberSettings({ chosen_port: portChosenNow === undefined ? null : { stream: graph.stream, node_id: portChosenNow.node_id, port: portChosenNow.port } }),
            );
          }}
        />
      </FieldMenu>
    </div>
  );
}

/** The Viewer's frame for the open stream tab: its port chooser in the header row, and its picture under why the last port choice was refused, once the tab's graph, the selection and the area's settings are read. */
function ViewerOfTheTab({ connection, streamTab }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress }) {
  const graphReading = useTheGraphOfTheTab(connection, streamTab.stream);
  const selection = useViewReading(connection.watchSelection);
  const settings = useViewReadingSoFar(connection.watchSettings);
  const [portChoiceRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  if (graphReading === null || settings.kind === "not_read_yet") return <CoreViewFrame connection={connection}>{null}</CoreViewFrame>;
  if (graphReading.kind === "not_read") {
    return (
      <CoreViewFrame connection={connection}>
        <WaitingState title={`Nothing of ${streamTab.display_name} to view yet`} explanation={graphReading.because} data-viewer-state="not_read" />
      </CoreViewFrame>
    );
  }
  const { graph } = graphReading;
  const chosenPortSetting = viewerChosenPortOf(settings.reading);
  const playedPort = portTheViewerPlays(graph, selection, chosenPortSetting);
  return (
    <CoreViewFrame
      connection={connection}
      headerTools={
        playedPort !== null && <ViewerPortChooser connection={connection} graph={graph} playedPort={playedPort} chosenPortSetting={chosenPortSetting} showTheRefusalOf={showTheRefusalOf} />
      }
    >
      <RefusalOfTheLatestAskBar refusal={portChoiceRefusal} />
      <ViewerOfTheGraph connection={connection} streamTab={streamTab} graph={graph} playedPort={playedPort} />
    </CoreViewFrame>
  );
}

/** The Viewer view's whole frame: the live picture of any output port of the active stream's running nodes, the selected node's unless a port is chosen in its header row. */
export function ViewerView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  if (activeStreamTab.kind === "not_read_yet") return <CoreViewFrame connection={connection}>{null}</CoreViewFrame>;
  if (activeStreamTab.reading === null) {
    return (
      <CoreViewFrame connection={connection}>
        <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to view it here." data-viewer-state="no_tab" />
      </CoreViewFrame>
    );
  }
  return <ViewerOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} />;
}
