import { useCallback } from "react";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import type {
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

/** The Viewer of the stream tab shown: its exposed output's preview, with the output it plays named under it. */
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
      className="flex min-h-0 flex-1 flex-col"
      data-viewer-playing={`${playedOutput.node}/${playedOutput.port}`}
    >
      <div className="min-h-0 flex-1">
        <ExposedOutputWatchPageFrame
          watchPageUrl={playedOutput.watch_page_url}
          outputWords={outputWords}
        />
      </div>
      <p
        className="shrink-0 truncate border-t border-studio-frame px-3 py-1.5 text-xs text-fg-3"
        data-viewer-output=""
      >
        {outputWords}
      </p>
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

/** The Viewer: the runtime's live preview of the active stream's exposed output, the selected node's where it exposes one. */
export const VIEWER_VIEW_TYPE: StudioViewType<null> = {
  view_type_id: "viewer",
  title: "Viewer",
  icon: "viewer",
  brought_by: { kind: "built_in" },
  default_settings: null,
  settingsFromSavedLayout: () => null,
  renderStudioView: (connection) => ({
    header_tools: null,
    body: <ViewerBody connection={connection} />,
  }),
};
