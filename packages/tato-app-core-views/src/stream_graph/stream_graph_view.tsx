import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { NodeGraphCanvas, type NodeGraphCanvasEditing, type NodeGraphCanvasPoint } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SearchPopover } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, StudioSelection, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type {
  ListedStreamsReading,
  NodeCatalogReading,
  OpenProjectReading,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  StreamGraphReading,
  StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";
import { useStreamGraphEditsSentToTheRuntime } from "./stream_graph_edit_sending";
import {
  cardLetGoOverALinkEdits,
  cardsMovedEdits,
  deletedEdits,
  editedStreamGraphOf,
  nodePlacedEdits,
  noteChangedEdits,
  notePlacedEdits,
  pinsWiredEdits,
  selectionFramedEdits,
  type LooseWire,
} from "./stream_graph_edits";
import { nodeTypeSearchItems } from "./stream_graph_node_type_search";
import { streamGraphSavedWords } from "./stream_graph_saved_words";

/** How far each node placed with ⇧↵ lands from the one before, so a run of them can be told apart. */
const NEXT_PLACED_NODE_OFFSET = 36;

/** Where the Add node search was asked for, and the wire it was dragged off when it was. */
interface NodeTypeSearchAsked {
  at: NodeGraphCanvasPoint;
  looseWire: LooseWire | null;
}

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
function StreamGraphOfTheTab({ connection, streamTab, select }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress; select: (selection: StudioSelection) => void }) {
  const watchTheTabsGraph = useCallback(
    (listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const graphReading = useViewReading(watchTheTabsGraph);
  const selection = useViewReading(connection.watchSelection);
  const openProject = useViewReading(connection.watchOpenProject);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const canvasContents = useMemo(() => (graphReading?.kind === "read" ? streamGraphCanvasContents(graphReading.graph) : null), [graphReading]);
  const watchTheTabsCatalog = useCallback(
    (listener: (reading: NodeCatalogReading) => void): StopWatching => connection.watchNodeCatalog(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const catalogReading = useViewReading(watchTheTabsCatalog);
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((stream) => stream.stream === streamTab.stream) : undefined;
  const importedProjectName = importedProjectNameOfTheStream(streamTab.stream, openProject, listedStreams);
  const { sendTheGesture, refusalOfTheLatestEdit } = useStreamGraphEditsSentToTheRuntime(connection, listedStream?.location?.project_directory ?? null);
  const editedGraph = useMemo(() => (graphReading?.kind === "read" ? editedStreamGraphOf(graphReading.graph) : null), [graphReading]);
  const [nodeTypeSearchAsked, setNodeTypeSearchAsked] = useState<NodeTypeSearchAsked | null>(null);
  const closeTheNodeTypeSearch = useCallback(() => setNodeTypeSearchAsked(null), []);
  const editing = useMemo((): NodeGraphCanvasEditing | null => {
    if (importedProjectName !== null || editedGraph === null || "because" in editedGraph) return null;
    return {
      onCardsMoved: (moves) => sendTheGesture(cardsMovedEdits(editedGraph, moves)),
      onPinsWired: (source, target) => void sendTheGesture(pinsWiredEdits(editedGraph, source, target)),
      onWireLetGoOverTheCanvas: (looseWire, at) => setNodeTypeSearchAsked({ at, looseWire }),
      onNodeAskedFor: (at) => setNodeTypeSearchAsked({ at, looseWire: null }),
      onNoteAskedFor: (at) => void sendTheGesture(notePlacedEdits(editedGraph, at.on_the_canvas)),
      onCardLetGoOverALink: (nodeId, linkId) => void sendTheGesture(cardLetGoOverALinkEdits(editedGraph, nodeId, linkId)),
      onDeleted: (deleted) => void sendTheGesture(deletedEdits(editedGraph, deleted)),
      onFrameAskedFor: (nodeIds) => void sendTheGesture(selectionFramedEdits(editedGraph, nodeIds)),
      onNoteChanged: (noteId, change) => sendTheGesture(noteChangedEdits(editedGraph, noteId, change)),
    };
  }, [importedProjectName, editedGraph, sendTheGesture]);
  const catalog = catalogReading?.kind === "listed" ? catalogReading.catalog.node_types : [];
  const placeTheChosenNodeType = useCallback(
    (nodeType: string, staysOpen: boolean) => {
      const chosen = catalog.find((entry) => entry.type === nodeType);
      if (nodeTypeSearchAsked === null || chosen === undefined || editedGraph === null || "because" in editedGraph) return;
      void sendTheGesture(nodePlacedEdits(editedGraph, chosen, nodeTypeSearchAsked.at.on_the_canvas, nodeTypeSearchAsked.looseWire));
      if (!staysOpen) {
        setNodeTypeSearchAsked(null);
        return;
      }
      const { on_the_canvas: onTheCanvas, in_the_element: inTheElement } = nodeTypeSearchAsked.at;
      setNodeTypeSearchAsked({
        at: {
          on_the_canvas: {
            x: onTheCanvas.x + NEXT_PLACED_NODE_OFFSET,
            y: onTheCanvas.y + NEXT_PLACED_NODE_OFFSET,
          },
          in_the_element: inTheElement,
        },
        looseWire: null,
      });
    },
    [catalog, nodeTypeSearchAsked, editedGraph, sendTheGesture],
  );
  const onNodeSelected = useCallback(
    (nodeName: string | null) => {
      const projectFolder = listedStreams?.kind === "listed" ? listedStreams.streams.find((listedStream) => listedStream.stream === streamTab.stream)?.location?.project_directory : undefined;
      if (nodeName !== null) select({ kind: "node", stream: streamTab.stream, node: nodeName });
      else if (projectFolder !== undefined)
        select({
          kind: "stream",
          stream: streamTab.stream,
          project_folder: projectFolder,
        });
      else select({ kind: "nothing" });
    },
    [select, listedStreams, streamTab.stream],
  );

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
  if (canvasContents === null || (canvasContents.nodes.length === 0 && editing === null)) {
    return <WaitingState title={`${streamTab.display_name} has no nodes`} explanation="Its graph document holds none." data-stream-graph-state="empty" />;
  }
  return (
    <>
      {editedGraph !== null && "because" in editedGraph && importedProjectName === null && (
        <RefusalLine layout="bar" tone="warning" lead="Read only:" words={editedGraph.because} />
      )}
      {refusalOfTheLatestEdit !== null && <RefusalLine layout="bar" lead={refusalOfTheLatestEdit.lead} words={refusalOfTheLatestEdit.words} />}
      <NodeGraphCanvas
        label={`Graph of ${streamTab.display_name}`}
        nodes={canvasContents.nodes}
        links={canvasContents.links}
        frames={canvasContents.frames}
        notes={canvasContents.notes}
        selectedNodeId={selection?.kind === "node" && selection.stream === streamTab.stream ? selection.node : null}
        onNodeSelected={onNodeSelected}
        editing={editing}
        overlay={
          <>
            {canvasContents.nodes.length === 0 && nodeTypeSearchAsked === null && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center text-xs text-fg-3" data-stream-graph-state="empty">
                {streamTab.display_name} has no nodes yet. Press Tab to add one.
              </p>
            )}
            {nodeTypeSearchAsked !== null && (
              <SearchPopover
                label="Add a node"
                heading={nodeTypeSearchAsked.looseWire === null ? "Add node" : `Add node wired to ${nodeTypeSearchAsked.looseWire.node_id}.${nodeTypeSearchAsked.looseWire.pin}`}
                placeholder="Search node types"
                items={nodeTypeSearchItems(catalog, nodeTypeSearchAsked.looseWire)}
                emptyWords={catalogReading?.kind === "not_listed" ? catalogReading.because : "No node type matches."}
                at={nodeTypeSearchAsked.at.in_the_element}
                onItemChosen={placeTheChosenNodeType}
                onClosed={closeTheNodeTypeSearch}
                data-stream-graph-node-type-search={streamTab.stream}
              />
            )}
            {importedProjectName !== null && (
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
            )}
          </>
        }
        data-stream-graph={streamTab.stream}
      />
    </>
  );
}

/** The stream graph of the active stream tab, or what to do while no tab is open. */
function StreamGraphBody({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  const [selectionRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const select = useCallback((selection: StudioSelection) => showTheRefusalOf("Didn't select:", connection.select(selection)), [connection, showTheRefusalOf]);
  if (activeStreamTab.kind === "not_read_yet") return null;
  if (activeStreamTab.reading === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to open its tab." data-stream-graph-state="no_tab" />;
  return (
    <>
      <RefusalOfTheLatestAskBar refusal={selectionRefusal} />
      <StreamGraphOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} select={select} />
    </>
  );
}

/** The header's words on the open project's history, as "Saved · last edit by you", while its change feed reads. */
function StreamGraphSavedWordsOfTheProject({ connection, projectFolder }: { connection: TatoAppViewConnection; projectFolder: string }) {
  const transactionsReading = useViewReading(
    useCallback((listener: (reading: ProjectTransactionsReading) => void): StopWatching => connection.watchProjectTransactions(projectFolder, listener), [connection, projectFolder]),
  );
  const [thePersonEditing, setThePersonEditing] = useState<ProjectTransactionAuthor | null>(null);
  useEffect(() => {
    let isStillShown = true;
    void connection.readThePersonEditing().then((reading) => isStillShown && setThePersonEditing(reading.kind === "read" ? reading.author : null));
    return () => {
      isStillShown = false;
    };
  }, [connection]);
  const savedWords = transactionsReading?.kind === "read" ? streamGraphSavedWords(transactionsReading.project_transactions.transactions, thePersonEditing) : null;
  return savedWords === null ? null : (
    <span className="truncate text-2xs text-fg-3" data-stream-graph-saved>
      {savedWords}
    </span>
  );
}

/** The Stream graph view's header tools: the active tab's stream, and who made the open project's latest edit. */
function StreamGraphHeaderTools({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  const openProject = useViewReading(connection.watchOpenProject);
  const streamTab = activeStreamTab.kind === "read" ? activeStreamTab.reading : null;
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      {streamTab !== null && <span className="truncate text-xs font-medium text-fg">{streamTab.display_name}</span>}
      {openProject?.kind === "read" && <StreamGraphSavedWordsOfTheProject key={openProject.open_project.project.folder} connection={connection} projectFolder={openProject.open_project.project.folder} />}
    </span>
  );
}

/** The Stream graph view's whole frame: the active stream tab's nodes and links, drawn the Blueprint way, under its header row. */
export function StreamGraphView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection} headerTools={<StreamGraphHeaderTools connection={connection} />}>
      <StreamGraphBody connection={connection} />
    </CoreViewFrame>
  );
}
