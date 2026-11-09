import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useMemo } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { NodeGraphCanvas } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { ListedStreamsReading, OpenProjectReading, StopWatching, StreamGraphReading, StreamTabAddress, StudioViewHostConnection, StudioViewType } from "../../view_host/studio_view_contract";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";

/** The issue that opens an import as a project of its own, where it can be edited. */
const OPENING_AN_IMPORT_TO_EDIT_ARRIVES_WITH = "tatolab/tatolab-app#133";

/** The import a stream's project is, by its name, when the open project imports the project the runtime lists it from; `null` for the project's own. */
function importedProjectNameOfTheStream(stream: string, openProject: OpenProjectReading | null, listedStreams: ListedStreamsReading | null): string | null {
  if (openProject?.kind !== "read" || listedStreams?.kind !== "listed") return null;
  const projectDirectory = listedStreams.streams.find((listedStream) => listedStream.stream === stream)?.location?.project_directory;
  if (projectDirectory === undefined || projectDirectory === openProject.open_project.project.folder) return null;
  const importedProject = openProject.open_project.imports.find((imported) => imported.source.kind === "folder" && imported.source.project.folder === projectDirectory);
  return importedProject === undefined ? null : importedProject.name;
}

/** The graph of the stream tab shown, read while the view is drawn. */
function StreamGraphOfTheTab({ connection, streamTab }: { connection: StudioViewHostConnection<null>; streamTab: StreamTabAddress }) {
  const watchTheTabsGraph = useCallback(
    (listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const graphReading = useViewReading(watchTheTabsGraph);
  const selection = useViewReading(connection.watchSelection);
  const openProject = useViewReading(connection.watchOpenProject);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const canvasContents = useMemo(() => (graphReading?.kind === "read" ? streamGraphCanvasContents(graphReading.graph) : null), [graphReading]);
  const onNodeSelected = useCallback(
    (nodeName: string | null) => {
      const projectFolder = listedStreams?.kind === "listed" ? listedStreams.streams.find((listedStream) => listedStream.stream === streamTab.stream)?.location?.project_directory : undefined;
      if (nodeName !== null) connection.select({ kind: "node", stream: streamTab.stream, node: nodeName });
      else if (projectFolder !== undefined) connection.select({ kind: "stream", stream: streamTab.stream, project_folder: projectFolder });
      else connection.select({ kind: "nothing" });
    },
    [connection, listedStreams, streamTab.stream],
  );

  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((stream) => stream.stream === streamTab.stream) : undefined;
  if (listedStream?.state === "failed") {
    return (
      <WaitingState
        isFailure
        title={`${streamTab.display_name} failed`}
        explanation={
          listedStream.failed_because === null
            ? "The runtime lists it failed and gives no reason. Press Live to run it again."
            : "Fix what the runtime says below, then press Live to run it again."
        }
        data-stream-graph-state="failed"
      >
        {listedStream.failed_because !== null && <RuntimeFailureWords words={listedStream.failed_because} data-stream-graph-failure={streamTab.stream} />}
      </WaitingState>
    );
  }
  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") {
    const isRunning = listedStream?.state === "running";
    return (
      <WaitingState
        isFailure={isRunning}
        title={isRunning ? `${streamTab.display_name}'s graph can't be read` : `${streamTab.display_name} isn't running`}
        explanation={graphReading.because}
        data-stream-graph-state="not_read"
      />
    );
  }
  if (canvasContents === null || canvasContents.nodes.length === 0) {
    return <WaitingState title={`${streamTab.display_name} has no nodes`} explanation="Its graph document holds none." data-stream-graph-state="empty" />;
  }
  const importedProjectName = importedProjectNameOfTheStream(streamTab.stream, openProject, listedStreams);
  return (
    <NodeGraphCanvas
      label={`Graph of ${streamTab.display_name}`}
      nodes={canvasContents.nodes}
      links={canvasContents.links}
      selectedNodeId={selection?.kind === "node" && selection.stream === streamTab.stream ? selection.node : null}
      onNodeSelected={onNodeSelected}
      overlay={
        importedProjectName !== null && (
          <div className="absolute top-2 right-2 z-10">
            <ReadOnlyBanner
              words={
                <>
                  Read only · <span className="font-mono">{importedProjectName}</span> is an import
                </>
              }
              action={
                <ActionButton
                  size="small"
                  disabledReason={`Opening an import as its own project arrives with ${OPENING_AN_IMPORT_TO_EDIT_ARRIVES_WITH}`}
                  onPressed={() => undefined}
                  data-stream-graph-action="open_to_edit"
                >
                  Open to edit
                </ActionButton>
              }
              data-stream-graph-read-only={importedProjectName}
            />
          </div>
        )
      }
      data-stream-graph={streamTab.stream}
    />
  );
}

/** The stream graph of the active stream tab, or what to do while no tab is open. */
function StreamGraphBody({ connection }: { connection: StudioViewHostConnection<null> }) {
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  if (activeStreamTab === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to open its tab." data-stream-graph-state="no_tab" />;
  return <StreamGraphOfTheTab key={activeStreamTab.stream} connection={connection} streamTab={activeStreamTab} />;
}

/** The stream graph: the active stream tab's nodes and links, drawn the Blueprint way. */
export const STREAM_GRAPH_VIEW_TYPE: StudioViewType<null> = {
  view_type_id: "stream_graph",
  title: "Stream graph",
  icon: "stream_graph",
  brought_by: { kind: "built_in" },
  default_settings: null,
  settingsFromSavedLayout: () => null,
  renderStudioView: (connection) => ({ header_tools: null, body: <StreamGraphBody connection={connection} /> }),
};
