import { PictureInPicture2 } from "lucide-react";
import { useCallback, useState } from "react";
import { IconButton } from "../../design_system/icon_button";
import { RefusalLine } from "../../design_system/refusal_line";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import type {
  PoppedOutViewerTarget,
  StopWatching,
  StreamGraphReading,
  StreamGraphSummary,
  StreamTabAddress,
  StudioSelection,
  StudioViewHostConnection,
  StudioViewType,
} from "../../view_host/studio_view_contract";
import { nodeTitle } from "../node_words";

/** The issue that previews any port of any node, one view per family. */
const PREVIEWING_ANY_PORT_ARRIVES_WITH = "tatolab/tatolab-app#135";

/** The exposed output the Viewer plays for `graph`: the selected node's first one the runtime serves a preview page for, or else the stream's first. */
export function exposedOutputTheViewerPlays(
  graph: StreamGraphSummary,
  selection: StudioSelection | null,
): StreamGraphSummary["exposed"][number] | null {
  const previewed = graph.exposed.filter(
    (exposedPort) => exposedPort.watch_page_url !== null,
  );
  const selectedNode =
    selection?.kind === "node" && selection.stream === graph.stream
      ? selection.node
      : null;
  return (
    previewed.find((exposedPort) => exposedPort.node === selectedNode) ??
    previewed[0] ??
    null
  );
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

/** The runtime's preview page of one exposed output, on its loopback origin: the window's content security policy frames that one origin, and the main process lets a frame navigate only to its `/watch/` pages. */
function ExposedOutputWatchPageFrame({
  watchPageUrl,
  outputWords,
}: {
  watchPageUrl: string;
  outputWords: string;
}) {
  return (
    <iframe
      key={watchPageUrl}
      src={watchPageUrl}
      title={`Preview of ${outputWords}`}
      sandbox="allow-scripts allow-same-origin"
      allow="autoplay; fullscreen"
      referrerPolicy="no-referrer"
      className="block size-full bg-black"
      data-viewer-watch-page={watchPageUrl}
    />
  );
}

/** The Viewer of the stream tab shown: its exposed output's video, alone. */
function ViewerOfTheTab({
  connection,
  streamTab,
}: {
  connection: StudioViewHostConnection<null>;
  streamTab: StreamTabAddress;
}) {
  const watchTheTabsGraph = useCallback(
    (listener: (reading: StreamGraphReading) => void): StopWatching =>
      connection.watchStreamGraph(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const graphReading = useStudioViewReading(watchTheTabsGraph);
  const selection = useStudioViewReading(connection.watchSelection);
  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") {
    return (
      <WaitingState
        title={`Nothing of ${streamTab.display_name} to preview yet`}
        explanation={graphReading.because}
        data-viewer-state="not_read"
      />
    );
  }
  const playedOutput = exposedOutputTheViewerPlays(
    graphReading.graph,
    selection,
  );
  if (playedOutput === null || playedOutput.watch_page_url === null) {
    return (
      <WaitingState
        title={`${streamTab.display_name} exposes no output to preview`}
        explanation="The runtime previews a stream's exposed outputs. Previewing any port of any node arrives later."
        waitsOn={PREVIEWING_ANY_PORT_ARRIVES_WITH}
        data-viewer-state="nothing_exposed"
      />
    );
  }
  const playedNode = graphReading.graph.nodes.find(
    (node) => node.name === playedOutput.node,
  );
  const outputWords = `${playedNode === undefined ? playedOutput.node : nodeTitle(playedNode.name, playedNode.type)} › ${playedOutput.port}`;
  return (
    <div
      className="min-h-0 flex-1"
      data-viewer-playing={`${playedOutput.node}/${playedOutput.port}`}
    >
      <ExposedOutputWatchPageFrame
        watchPageUrl={playedOutput.watch_page_url}
        outputWords={outputWords}
      />
    </div>
  );
}

/** The Viewer of the active stream tab, or what to do while no tab is open. */
function ViewerBody({
  connection,
}: {
  connection: StudioViewHostConnection<null>;
}) {
  const activeStreamTab = useStudioViewReading(connection.watchActiveStreamTab);
  if (activeStreamTab === null)
    return (
      <WaitingState
        title="No stream is open"
        explanation="Double-click a stream in the outliner to preview it here."
        data-viewer-state="no_tab"
      />
    );
  return (
    <ViewerOfTheTab
      key={activeStreamTab.stream}
      connection={connection}
      streamTab={activeStreamTab}
    />
  );
}

/** Pop out, in the Viewer's header while a stream tab is open, and why the last pop-out was refused. */
function ViewerHeaderTools({ connection }: { connection: StudioViewHostConnection<null> }) {
  const activeStreamTab = useStudioViewReading(connection.watchActiveStreamTab);
  const selection = useStudioViewReading(connection.watchSelection);
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

/** The Viewer: the runtime's live preview of the active stream's exposed output, the selected node's where it exposes one. */
export const VIEWER_VIEW_TYPE: StudioViewType<null> = {
  view_type_id: "viewer",
  title: "Viewer",
  icon: "viewer",
  brought_by: { kind: "built_in" },
  default_settings: null,
  settingsFromSavedLayout: () => null,
  renderStudioView: (connection) => ({
    header_tools: <ViewerHeaderTools connection={connection} />,
    body: <ViewerBody connection={connection} />,
  }),
};
