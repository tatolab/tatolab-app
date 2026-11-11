import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { NodeGraphCanvas, type NodeGraphCanvasEditing, type NodeGraphCanvasPoint, type NodeGraphCanvasToolsInTheWindowToolbar, type NodeGraphCanvasViewport } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SearchPopover } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, StudioSelection, TatoAppViewConnection, ViewSettings, WindowToolbarGraphTool, WindowToolbarGraphToolOffered, WindowToolbarGraphToolsOffer } from "@tatolab/tato-app-view-sdk";
import type {
  ListedStreamsReading,
  NodeCatalogReading,
  ProjectNodeTypesReading,
  OpenProjectReading,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  StreamGraphAction,
  StreamGraphNodeStudioFields,
  StreamGraphReading,
  StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { streamPreparingWords } from "../shared/stream_preparing_words";
import { streamGraphCanvasContents } from "./stream_graph_canvas_contents";
import { useStreamGraphEditsSentToTheRuntime } from "./stream_graph_edit_sending";
import {
  cardCollapsedEdits,
  cardLetGoOverALinkEdits,
  cardsMovedEdits,
  deletedEdits,
  doesTheGraphShowTheStudioSentAhead,
  editedStreamGraphOf,
  frameRenamedEdits,
  nodePlacedEdits,
  noteChangedEdits,
  notePlacedEdits,
  pinsWiredEdits,
  selectionCollapsedEdits,
  selectionFramedEdits,
  studioFieldsSetBy,
  subgraphRefreshedEdits,
  subgraphUnlockedEdits,
  nameOfTheNewSubgraph,
  type EditedStreamGraph,
  type LooseWire,
} from "./stream_graph_edits";
import { streamGraphLevelReached } from "./stream_graph_levels";
import { nodeTypeSearchItems, nodeTypesTheSearchOffers } from "./stream_graph_node_type_search";
import { StreamGraphSubgraphReadOnlyBanner, StreamGraphSubgraphTrail } from "./stream_graph_subgraph_strip";
import { streamGraphSavedWords } from "./stream_graph_saved_words";
import { isTheSamePlaceLeft, settingsWithTheStreamLeft, whereTheStreamWasLeft, type WhereAStreamWasLeft } from "./stream_graph_where_left";

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

/** Stops nothing: a stream the runtime lists in no project has no project node types to watch. */
const NO_PROJECT_FOLDER_TO_LIST: StopWatching = () => undefined;

/** The canvas's tools offered to the window's toolbar for as long as the graph is drawn, each press reaching the canvas. */
function useTheCanvasToolsInTheWindowToolbar(connection: TatoAppViewConnection): NodeGraphCanvasToolsInTheWindowToolbar {
  const pressFromTheToolbar = useRef<((tool: WindowToolbarGraphTool) => void) | null>(null);
  const offer = useRef<WindowToolbarGraphToolsOffer | null>(null);
  const toolsLastReported = useRef<readonly WindowToolbarGraphToolOffered[] | null>(null);
  const [isTakenByTheToolbar, setIsTakenByTheToolbar] = useState(false);
  const showTheTools = useCallback((offerShowing: WindowToolbarGraphToolsOffer, tools: readonly WindowToolbarGraphToolOffered[]) => {
    void offerShowing.show(tools).then((answer) => offer.current === offerShowing && setIsTakenByTheToolbar(answer.kind === "done"));
  }, []);
  useEffect(() => {
    const offerMade = connection.offerGraphToolsToTheWindow(
      (tool) => pressFromTheToolbar.current?.(tool),
      () => {
        if (offer.current === offerMade) offer.current = null;
        setIsTakenByTheToolbar(false);
      },
    );
    offer.current = offerMade;
    if (toolsLastReported.current !== null) showTheTools(offerMade, toolsLastReported.current);
    return () => {
      offer.current = null;
      offerMade.withdraw();
      setIsTakenByTheToolbar(false);
    };
  }, [connection, showTheTools]);
  const onToolsChanged = useCallback(
    (tools: readonly WindowToolbarGraphToolOffered[]) => {
      toolsLastReported.current = tools;
      if (offer.current !== null) showTheTools(offer.current, tools);
    },
    [showTheTools],
  );
  return useMemo(() => ({ onToolsChanged, pressFromTheToolbar, isTakenByTheToolbar }), [onToolsChanged, isTakenByTheToolbar]);
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
  const watchTheTabsCatalog = useCallback(
    (listener: (reading: NodeCatalogReading) => void): StopWatching => connection.watchNodeCatalog(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const catalogReading = useViewReading(watchTheTabsCatalog);
  const [subgraphNamesSteppedThrough, setSubgraphNamesSteppedThrough] = useState<readonly string[]>([]);
  const levelShown = useMemo(() => (graphReading?.kind === "read" ? streamGraphLevelReached(graphReading.graph, subgraphNamesSteppedThrough) : null), [graphReading, subgraphNamesSteppedThrough]);
  const subgraphsSteppedThrough = levelShown?.subgraphs_stepped_through ?? [];
  const innermostSubgraph = subgraphsSteppedThrough.at(-1) ?? null;
  const canvasContents = useMemo(
    () => (levelShown === null ? null : streamGraphCanvasContents(levelShown.graph, catalogReading?.kind === "listed" ? catalogReading.catalog : null)),
    [levelShown, catalogReading],
  );
  const [selectedNodeInsideTheSubgraph, setSelectedNodeInsideTheSubgraph] = useState<string | null>(null);
  const subgraphNamesReached = subgraphsSteppedThrough.map((subgraph) => subgraph.name).join("/");
  useEffect(() => {
    if (levelShown !== null && levelShown.subgraphs_stepped_through.length < subgraphNamesSteppedThrough.length) {
      setSubgraphNamesSteppedThrough(levelShown.subgraphs_stepped_through.map((subgraph) => subgraph.name));
    }
  }, [levelShown, subgraphNamesSteppedThrough.length]);
  const stepToTheLevel = useCallback(
    (depth: number) => {
      setSubgraphNamesSteppedThrough((namesBefore) => namesBefore.slice(0, Math.max(depth, 0)));
      setSelectedNodeInsideTheSubgraph(null);
    },
    [],
  );
  const stepInsideTheSubgraph = useCallback(
    (subgraphName: string) => {
      setSubgraphNamesSteppedThrough(subgraphNamesReached === "" ? [subgraphName] : [...subgraphNamesReached.split("/"), subgraphName]);
      setSelectedNodeInsideTheSubgraph(null);
    },
    [subgraphNamesReached],
  );
  const subgraphDepth = subgraphsSteppedThrough.length;
  useEffect(() => {
    if (subgraphDepth === 0) return;
    const stepUpOnU = (event: KeyboardEvent) => {
      const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (isTyping || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (event.key !== "u" && event.key !== "U")) return;
      event.preventDefault();
      stepToTheLevel(subgraphDepth - 1);
    };
    window.addEventListener("keydown", stepUpOnU);
    return () => window.removeEventListener("keydown", stepUpOnU);
  }, [subgraphDepth, stepToTheLevel]);
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((stream) => stream.stream === streamTab.stream) : undefined;
  const importedProjectName = importedProjectNameOfTheStream(streamTab.stream, openProject, listedStreams);
  const toolsInTheWindowToolbar = useTheCanvasToolsInTheWindowToolbar(connection);
  const areaSettings = useViewReadingSoFar(connection.watchSettings);
  const areaSettingsRead = areaSettings.kind === "read" ? areaSettings.reading : null;
  const viewportWhereTheStreamWasLeft = useMemo(() => whereTheStreamWasLeft(areaSettingsRead, streamTab.stream)?.viewport ?? null, [areaSettingsRead, streamTab.stream]);
  const areaSettingsLastSent = useRef<{ settings: ViewSettings } | null>(null);
  const settingsToBuildOn = useRef<ViewSettings>(null);
  if (areaSettingsLastSent.current !== null && JSON.stringify(areaSettingsLastSent.current.settings) === JSON.stringify(areaSettingsRead)) areaSettingsLastSent.current = null;
  settingsToBuildOn.current = areaSettingsLastSent.current?.settings ?? areaSettingsRead;
  const keepWhereTheStreamWasLeft = useCallback(
    (left: Partial<WhereAStreamWasLeft>) => {
      const before = whereTheStreamWasLeft(settingsToBuildOn.current, streamTab.stream);
      const whereNow: WhereAStreamWasLeft = {
        viewport: left.viewport !== undefined ? left.viewport : (before?.viewport ?? null),
        selected_node: left.selected_node !== undefined ? left.selected_node : (before?.selected_node ?? null),
      };
      if (before !== null && isTheSamePlaceLeft(before, whereNow)) return;
      const sent = { settings: settingsWithTheStreamLeft(settingsToBuildOn.current, streamTab.stream, whereNow) };
      areaSettingsLastSent.current = sent;
      settingsToBuildOn.current = sent.settings;
      void connection.rememberSettings(sent.settings).then((answer) => {
        if (answer.kind === "refused" && areaSettingsLastSent.current === sent) areaSettingsLastSent.current = null;
      });
    },
    [connection, streamTab.stream],
  );
  const hasTheSelectionBeenRestored = useRef(false);
  useEffect(() => {
    if (hasTheSelectionBeenRestored.current || areaSettingsRead === null || selection === null || canvasContents === null) return;
    hasTheSelectionBeenRestored.current = true;
    const selectedNodeLeft = whereTheStreamWasLeft(areaSettingsRead, streamTab.stream)?.selected_node ?? null;
    const isNothingElseSelected = selection.kind === "nothing" || (selection.kind === "stream" && selection.stream === streamTab.stream);
    if (selectedNodeLeft === null || !isNothingElseSelected || !canvasContents.nodes.some((node) => node.node_id === selectedNodeLeft)) return;
    select({ kind: "node", stream: streamTab.stream, node: selectedNodeLeft });
  }, [areaSettingsRead, selection, select, streamTab.stream, canvasContents]);
  const { sendTheGesture, refusalOfTheLatestEdit } = useStreamGraphEditsSentToTheRuntime(connection, listedStream?.location?.project_directory ?? null);
  const [studioSentAheadByNodeId, setStudioSentAheadByNodeId] = useState<ReadonlyMap<string, StreamGraphNodeStudioFields>>(new Map());
  useEffect(() => {
    if (graphReading?.kind !== "read") return;
    setStudioSentAheadByNodeId((sentAhead) => {
      const stillAhead = [...sentAhead].filter(([nodeId, studio]) => !doesTheGraphShowTheStudioSentAhead(graphReading.graph, nodeId, studio));
      return stillAhead.length === sentAhead.size ? sentAhead : new Map(stillAhead);
    });
  }, [graphReading]);
  const editedGraph = useMemo(() => (graphReading?.kind === "read" ? editedStreamGraphOf(graphReading.graph, studioSentAheadByNodeId) : null), [graphReading, studioSentAheadByNodeId]);
  const sendTheStudioGesture = useCallback(
    (actions: StreamGraphAction[]) => {
      const studioSet = studioFieldsSetBy(actions);
      if (studioSet.size > 0) setStudioSentAheadByNodeId((sentAhead) => new Map([...sentAhead, ...studioSet]));
      return sendTheGesture(actions).then((answer) => {
        if (answer === "refused" && studioSet.size > 0)
          setStudioSentAheadByNodeId((sentAhead) => new Map([...sentAhead].filter(([nodeId, studio]) => studioSet.get(nodeId) !== studio)));
        return answer;
      });
    },
    [sendTheGesture],
  );
  const [nodeTypeSearchAsked, setNodeTypeSearchAsked] = useState<NodeTypeSearchAsked | null>(null);
  const [modulesAndMarketplaceRefusal, showTheRefusalOfOpeningTheMarketplace] = useRefusalOfTheLatestAsk();
  const closeTheNodeTypeSearch = useCallback(() => setNodeTypeSearchAsked(null), []);
  useEffect(() => setNodeTypeSearchAsked(null), [subgraphNamesReached]);
  const editing = useMemo((): NodeGraphCanvasEditing | null => {
    if (importedProjectName !== null || editedGraph === null || "because" in editedGraph) return null;
    return {
      onCardsMoved: (moves, cardLetGoOverALink) =>
        sendTheStudioGesture([
          ...(cardLetGoOverALink === null ? [] : cardLetGoOverALinkEdits(editedGraph, cardLetGoOverALink.node_id, cardLetGoOverALink.link_id)),
          ...cardsMovedEdits(editedGraph, moves),
        ]),
      onPinsWired: (source, target) => void sendTheGesture(pinsWiredEdits(editedGraph, source, target)),
      onWireLetGoOverTheCanvas: (looseWire, at) => setNodeTypeSearchAsked({ at, looseWire }),
      onNodeAskedFor: (at) => setNodeTypeSearchAsked({ at, looseWire: null }),
      onNoteAskedFor: (at) => void sendTheGesture(notePlacedEdits(editedGraph, at.on_the_canvas)),
      onDeleted: (deleted) => void sendTheGesture(deletedEdits(editedGraph, deleted)),
      onFrameAskedFor: (nodeIds) => sendTheGesture(selectionFramedEdits(editedGraph, nodeIds)),
      onSubgraphAskedFor: (nodeIds) => {
        const subgraphName = nameOfTheNewSubgraph(editedGraph.graph);
        void sendTheGesture(selectionCollapsedEdits(editedGraph, nodeIds, subgraphName)).then((answer) => {
          if (answer !== "applied") return;
          keepWhereTheStreamWasLeft({ selected_node: subgraphName });
          select({ kind: "node", stream: streamTab.stream, node: subgraphName });
        });
      },
      onNoteChanged: (noteId, change) => sendTheGesture(noteChangedEdits(editedGraph, noteId, change)),
      onFrameRenamed: (frameId, title) => void sendTheGesture(frameRenamedEdits(editedGraph, frameId, title)),
      onCardCollapsed: (nodeId, collapsed) => void sendTheStudioGesture(cardCollapsedEdits(editedGraph, nodeId, collapsed)),
    };
  }, [importedProjectName, editedGraph, sendTheGesture, sendTheStudioGesture, select, streamTab.stream, keepWhereTheStreamWasLeft]);
  const editingOfTheLevelShown = innermostSubgraph === null ? editing : null;
  const sendTheSubgraphGesture = useCallback(
    (actionsOf: (edited: EditedStreamGraph, subgraphName: string) => StreamGraphAction[], returnsToTheStreamsLevel: boolean) => {
      const outermostSubgraph = subgraphsSteppedThrough[0];
      if (editedGraph === null || "because" in editedGraph || outermostSubgraph === undefined) return;
      void sendTheGesture(actionsOf(editedGraph, outermostSubgraph.name)).then((answer) => {
        if (answer !== "applied" || !returnsToTheStreamsLevel) return;
        stepToTheLevel(0);
        select({ kind: "nothing" });
      });
    },
    [editedGraph, subgraphsSteppedThrough, sendTheGesture, stepToTheLevel, select],
  );
  const projectFolderOfTheStream = listedStream?.location?.project_directory ?? null;
  const watchTheProjectsNodeTypes = useCallback(
    (listener: (reading: ProjectNodeTypesReading) => void): StopWatching =>
      projectFolderOfTheStream === null ? NO_PROJECT_FOLDER_TO_LIST : connection.watchProjectNodeTypes(projectFolderOfTheStream, listener),
    [connection, projectFolderOfTheStream],
  );
  const projectNodeTypesReading = useViewReading(watchTheProjectsNodeTypes);
  const catalog = useMemo(
    () => nodeTypesTheSearchOffers(catalogReading?.kind === "listed" ? catalogReading.catalog.node_types : [], projectNodeTypesReading?.kind === "listed" ? projectNodeTypesReading.listing : null),
    [catalogReading, projectNodeTypesReading],
  );
  const looseWireOfTheSearch = nodeTypeSearchAsked?.looseWire ?? null;
  const nodeTypeSearchItemsOffered = useMemo(() => nodeTypeSearchItems(catalog, looseWireOfTheSearch), [catalog, looseWireOfTheSearch]);
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
      keepWhereTheStreamWasLeft({ selected_node: nodeName });
      if (nodeName !== null) select({ kind: "node", stream: streamTab.stream, node: nodeName });
      else if (projectFolder !== undefined)
        select({
          kind: "stream",
          stream: streamTab.stream,
          project_folder: projectFolder,
        });
      else select({ kind: "nothing" });
    },
    [select, listedStreams, streamTab.stream, keepWhereTheStreamWasLeft],
  );
  const onViewportLeft = useCallback((viewport: NodeGraphCanvasViewport) => keepWhereTheStreamWasLeft({ viewport }), [keepWhereTheStreamWasLeft]);

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
    const preparingWords = streamPreparingWords(listedStream, streamTab.display_name);
    if (preparingWords !== null) return <WaitingState title={preparingWords.title} explanation={preparingWords.explanation} data-stream-graph-state="preparing" />;
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
  if (areaSettings.kind !== "read") return null;
  if (canvasContents === null || (canvasContents.nodes.length === 0 && editing === null && innermostSubgraph === null)) {
    return <WaitingState title={`${streamTab.display_name} has no nodes`} explanation="Its graph document holds none." data-stream-graph-state="empty" />;
  }
  return (
    <>
      {editedGraph !== null && "because" in editedGraph && importedProjectName === null && (
        <RefusalLine layout="bar" tone="warning" lead="Read only:" words={editedGraph.because} />
      )}
      {refusalOfTheLatestEdit !== null && <RefusalLine layout="bar" lead={refusalOfTheLatestEdit.lead} words={refusalOfTheLatestEdit.words} />}
      <RefusalOfTheLatestAskBar refusal={modulesAndMarketplaceRefusal} />
      {innermostSubgraph !== null && <StreamGraphSubgraphTrail streamDisplayName={streamTab.display_name} subgraphsSteppedThrough={subgraphsSteppedThrough} onLevelChosen={stepToTheLevel} />}
      <NodeGraphCanvas
        key={subgraphsSteppedThrough.map((subgraph) => subgraph.name).join("/")}
        label={innermostSubgraph === null ? `Graph of ${streamTab.display_name}` : `Graph inside ${innermostSubgraph.name}`}
        nodes={canvasContents.nodes}
        links={canvasContents.links}
        frames={canvasContents.frames}
        notes={canvasContents.notes}
        selectedNodeId={innermostSubgraph !== null ? selectedNodeInsideTheSubgraph : selection?.kind === "node" && selection.stream === streamTab.stream ? selection.node : null}
        onNodeSelected={innermostSubgraph !== null ? setSelectedNodeInsideTheSubgraph : onNodeSelected}
        editing={editingOfTheLevelShown}
        toolsInTheWindowToolbar={toolsInTheWindowToolbar}
        viewportWhereItWasLeft={innermostSubgraph === null ? viewportWhereTheStreamWasLeft : null}
        onViewportLeft={innermostSubgraph === null ? onViewportLeft : null}
        onSubgraphOpened={stepInsideTheSubgraph}
        overlay={
          <>
            {canvasContents.nodes.length === 0 && nodeTypeSearchAsked === null && innermostSubgraph === null && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center text-xs text-fg-3" data-stream-graph-state="empty">
                {streamTab.display_name} has no nodes yet. Click the graph and press Tab to add one.
              </p>
            )}
            {nodeTypeSearchAsked !== null && (
              <SearchPopover
                label="Add a node"
                heading={nodeTypeSearchAsked.looseWire === null ? "Add node" : `Add node wired to ${nodeTypeSearchAsked.looseWire.node_id}.${nodeTypeSearchAsked.looseWire.pin}`}
                placeholder="Search node types"
                items={nodeTypeSearchItemsOffered}
                emptyWords={catalogReading?.kind === "not_listed" ? catalogReading.because : "No node type matches."}
                chooseWords="place"
                chooseAndStayWords="place another"
                at={nodeTypeSearchAsked.at.in_the_element}
                onItemChosen={placeTheChosenNodeType}
                onClosed={closeTheNodeTypeSearch}
                footLink={{ words: "Install modules…", onPressed: () => showTheRefusalOfOpeningTheMarketplace("Didn't open the Marketplace:", connection.openModulesAndMarketplace("marketplace")) }}
                data-stream-graph-node-type-search={streamTab.stream}
              />
            )}
            {innermostSubgraph !== null && (
              <div className="absolute top-2 right-2 z-10 max-w-[calc(100%-4rem)]">
                <StreamGraphSubgraphReadOnlyBanner
                  subgraph={innermostSubgraph}
                  isOnTheStreamsOwnLevel={subgraphsSteppedThrough.length === 1}
                  editsRefusedBecause={importedProjectName !== null ? `${importedProjectName} is an import` : editedGraph === null ? "The graph isn't read yet" : "because" in editedGraph ? editedGraph.because : null}
                  onRefreshed={() => sendTheSubgraphGesture(subgraphRefreshedEdits, false)}
                  onUnlocked={() => sendTheSubgraphGesture(subgraphUnlockedEdits, true)}
                />
              </div>
            )}
            {importedProjectName !== null && innermostSubgraph === null && (
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
