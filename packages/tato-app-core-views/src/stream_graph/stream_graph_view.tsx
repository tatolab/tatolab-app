import { useViewReading, useViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { NODE_GRAPH_CARD_PREVIEW_NARROWEST_WIDTH_PX, NodeGraphCardPreview } from "@tatolab/tato-app-view-sdk/design_system/node_graph/node_card";
import { NodeGraphCanvas } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import type { NodeGraphCanvasEditing, NodeGraphCanvasPoint, NodeGraphCanvasViewport, NodeGraphCardCode } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { FormDialog } from "@tatolab/tato-app-view-sdk/design_system/form_dialog";
import { SearchPopover, type SearchPopoverAction } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import { Plus, Store } from "lucide-react";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { ImportedProject, StopWatching, StudioSelection, TatoAppViewConnection, ViewSettings } from "@tatolab/tato-app-view-sdk";
import { graphAddressOfTheStreamsOwnLevel, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { InputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import { settingValuesOfTheGraph } from "@tatolab/tato-app-view-sdk/pin_model/node_settings";
import { InputControlBinderContext, useInputControlsOfTheFrame, useInputValuesOfTheStream } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import {
  nodeTypeDescriptionsByType,
  type ListedStreamsReading,
  type OpenProjectReading,
  type StreamGraphAction,
  type StreamGraphNode,
  type StreamGraphNodeStudioFields,
  type StreamGraphReading,
  type StreamTabAddress,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { wiresReadAtTheLevel } from "../shared/node_pins_of_the_graph";
import { useNodeTypesOfTheProject } from "../shared/use_node_types_of_the_project";
import { CoreViewFrame } from "../shared/core_view_page";
import { RefusalOfTheLatestAskBar, useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { codeOfTheNodeType, openTheCodeOfTheNodeType } from "../shared/code_of_the_node_type";
import { CODE_VIEW_TYPE_ID } from "../shared/files_the_code_view_opens";
import { NewNodeFileForm } from "../shared/new_node_file_form";
import { streamPreparingWords } from "../shared/stream_preparing_words";
import { StreamConditionChip, StreamDiagnosticBars } from "../shared/stream_condition_bar";
import type { StreamDiagnosticLine, StreamDiagnosticLink } from "../shared/stream_condition_words";
import { streamGraphCanvasContents, type StreamGraphCanvasContents } from "./stream_graph_canvas_contents";
import { useStreamGraphEditsSentToTheRuntime } from "../shared/stream_graph_edit_sending";
import {
  bundleOpenedEdits,
  cardCollapsedEdits,
  cardLetGoOverALinkEdits,
  cardsMovedEdits,
  generatorSubgraphPlacedEdits,
  deletedEdits,
  doesTheGraphShowTheStudioSentAhead,
  editedStreamGraphOf,
  frameChangedEdits,
  frameRemovedEdits,
  linkDisconnectedEdits,
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
} from "../shared/stream_graph_edits";
import { nodesTheSelectionHoldsInTheStream, selectionOfTheNodes } from "../shared/nodes_of_the_selection";
import { levelOfTheSubgraphsSteppedThrough, selectionOfTheSubgraphSteppedOutOf, streamGraphLevelReached, theSubgraphKeepingTheLevelReadOnly } from "./stream_graph_levels";
import { linkCandidatesRequestOf, portsALooseWireFits, wireFitsOfTheAnswer } from "./stream_graph_wire_fits";
import { graphGeneratorOfTheSearchItem, graphGeneratorSearchItems, nodeTypeSearchItems, nodeTypeSearchNarrowing, nodeTypeSearchPreviewCard, nodeTypesTheSearchOffers } from "./stream_graph_node_type_search";
import { doesChoosingThePackageAddIt, marketplaceChoiceOfTheSearchItem, marketplaceSearchItems } from "./stream_graph_marketplace_search";
import { useMarketplaceOfTheNodeSearch } from "./use_marketplace_of_the_node_search";
import { NODE_TYPE_CATEGORIES_WORDS, NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS } from "../shared/node_type_category_path";
import { StreamGraphSubgraphReadOnlyBanner, StreamGraphSubgraphTrail } from "./stream_graph_subgraph_strip";
import { isTheSamePlaceLeft, settingsWithTheStreamLeft, whereTheStreamWasLeft, type WhereAStreamWasLeft } from "./stream_graph_where_left";

/** How far each node placed with ⇧↵ lands from the one before, so a run of them can be told apart. */
const NEXT_PLACED_NODE_OFFSET = 36;

/** The search over a loose wire offers no way on beside its field. */


/** Where the Add node search was asked for, the wire it was dragged off when it was, and the port of each node type the runtime answered that wire fits; `null` until it answers, or when it did not, so the search judges nothing. */
interface NodeTypeSearchAsked {
  at: NodeGraphCanvasPoint;
  looseWire: LooseWire | null;
  portsTheWireFits: ReadonlyMap<string, string> | null;
}

/** The loose wire a node of `nodeType` placed from `asked` is linked to and the port of the placed node that links it, as the runtime answered; `null` for none. */
function wiredToTheLooseWire(asked: NodeTypeSearchAsked, nodeType: string): { looseWire: LooseWire; port: string } | null {
  const port = asked.portsTheWireFits?.get(nodeType);
  return asked.looseWire === null || port === undefined ? null : { looseWire: asked.looseWire, port };
}

/** The issue that opens an import as a project of its own, where it can be edited. */
const OPENING_AN_IMPORT_TO_EDIT_ARRIVES_WITH = "tatolab/tatolab-app#133";

const NO_SUBGRAPHS_STEPPED_THROUGH: readonly StreamGraphNode[] = [];

/** Why no edit can be sent to `editedGraph`, the graph of a stream of the import `importedProjectName` (`null` for the project's own); `null` when one can. */
function whyNoEditCanBeSentTo(editedGraph: EditedStreamGraph | { because: string } | null, importedProjectName: string | null): string | null {
  if (importedProjectName !== null) return `${importedProjectName} is an import`;
  if (editedGraph === null) return "The graph isn't read yet";
  return "because" in editedGraph ? editedGraph.because : null;
}

/** The import a stream's project is, by its name, when the open project imports the project the runtime lists it from; `null` for the project's own. */
function importedProjectNameOfTheStream(stream: string, openProject: OpenProjectReading | null, listedStreams: ListedStreamsReading | null): string | null {
  if (openProject?.kind !== "read" || listedStreams?.kind !== "listed") return null;
  const projectDirectory = listedStreams.streams.find((listedStream) => listedStream.stream === stream)?.location?.project_directory;
  if (projectDirectory === undefined || projectDirectory === openProject.open_project.project.folder) return null;
  const importedProject = openProject.open_project.imports.find((imported) => imported.source.kind === "folder" && imported.source.project.folder === projectDirectory);
  return importedProject === undefined ? null : importedProject.name;
}

const NO_IMPORTS: readonly ImportedProject[] = [];

/** The graph of the stream tab shown, read while the view is drawn. */
function StreamGraphOfTheTab({
  connection,
  inputValues,
  streamTab,
  select,
}: {
  connection: TatoAppViewConnection;
  inputValues: InputValues;
  streamTab: StreamTabAddress;
  select: (selection: StudioSelection) => void;
}) {
  const watchTheTabsGraph = useCallback(
    (listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(streamTab.stream, listener),
    [connection, streamTab.stream],
  );
  const graphReading = useViewReading(watchTheTabsGraph);
  const selection = useViewReading(connection.watchSelection);
  const openProject = useViewReading(connection.watchOpenProject);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const [subgraphNamesSteppedThrough, setSubgraphNamesSteppedThrough] = useState<readonly string[]>([]);
  const levelShown = useMemo(() => (graphReading?.kind === "read" ? streamGraphLevelReached(graphReading.graph, subgraphNamesSteppedThrough) : null), [graphReading, subgraphNamesSteppedThrough]);
  const subgraphsSteppedThrough = levelShown?.subgraphs_stepped_through ?? NO_SUBGRAPHS_STEPPED_THROUGH;
  const innermostSubgraph = subgraphsSteppedThrough.at(-1) ?? null;
  const subgraphKeepingTheLevelReadOnly = theSubgraphKeepingTheLevelReadOnly(subgraphsSteppedThrough);
  const levelOfTheEdits = useMemo(() => levelOfTheSubgraphsSteppedThrough(subgraphsSteppedThrough), [subgraphsSteppedThrough]);
  const nodesSelectedAtTheLevelShown = useMemo(() => nodesTheSelectionHoldsInTheStream(selection, streamTab.stream, levelOfTheEdits), [selection, streamTab.stream, levelOfTheEdits]);
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((stream) => stream.stream === streamTab.stream) : undefined;
  const projectFolder = listedStream?.location?.project_directory ?? null;
  const streamCondition = listedStream?.condition ?? null;
  const nodeTypesReading = useNodeTypesOfTheProject(connection, projectFolder);
  const nodeTypesOfTheProject = nodeTypesReading?.kind === "listed" ? nodeTypesReading.node_types : null;
  const describedByType = useMemo(() => nodeTypeDescriptionsByType(nodeTypesOfTheProject?.described ?? []), [nodeTypesOfTheProject]);
  const settingValues = useMemo(() => (graphReading?.kind === "read" ? settingValuesOfTheGraph(graphReading.graph, describedByType) : []), [graphReading, describedByType]);
  useInputValuesOfTheStream(connection, inputValues, streamTab.stream, projectFolder, settingValues);
  const streamAsset = graphReading?.kind === "read" ? (graphReading.graph.asset ?? null) : null;
  const valuesOfTheLevelShown = useMemo(
    (): GraphAddress | null => {
      const streamsOwnLevel = graphAddressOfTheStreamsOwnLevel(projectFolder, streamAsset);
      return streamsOwnLevel === null ? null : { ...streamsOwnLevel, level: levelOfTheEdits };
    },
    [projectFolder, streamAsset, levelOfTheEdits],
  );
  // Each reading is drawn from the one before, so the cards of the nodes it left as they were are not drawn again.
  const canvasContentsBefore = useRef<StreamGraphCanvasContents | null>(null);
  const canvasContents = useMemo(
    () =>
      levelShown === null
        ? null
        : streamGraphCanvasContents(
            levelShown.graph,
            describedByType,
            canvasContentsBefore.current,
            valuesOfTheLevelShown,
            levelShown.subgraphs_stepped_through.length === 0 ? streamCondition : null,
            wiresReadAtTheLevel(streamTab.stream, valuesOfTheLevelShown),
          ),
    [levelShown, describedByType, valuesOfTheLevelShown, streamCondition, streamTab.stream],
  );
  useLayoutEffect(() => {
    canvasContentsBefore.current = canvasContents;
  }, [canvasContents]);
  const subgraphNamesReached = subgraphsSteppedThrough.map((subgraph) => subgraph.name).join("/");
  useEffect(() => {
    if (levelShown !== null && levelShown.subgraphs_stepped_through.length < subgraphNamesSteppedThrough.length) {
      setSubgraphNamesSteppedThrough(levelShown.subgraphs_stepped_through.map((subgraph) => subgraph.name));
    }
  }, [levelShown, subgraphNamesSteppedThrough.length]);
  const stepToTheLevel = useCallback(
    (depth: number) => {
      const depthReached = Math.max(depth, 0);
      const selectionOfTheSubgraph = selectionOfTheSubgraphSteppedOutOf(streamTab.stream, subgraphsSteppedThrough, depthReached);
      if (selectionOfTheSubgraph !== null && nodesSelectedAtTheLevelShown.length > 0) select(selectionOfTheSubgraph);
      setSubgraphNamesSteppedThrough((namesBefore) => namesBefore.slice(0, depthReached));
    },
    [subgraphsSteppedThrough, nodesSelectedAtTheLevelShown, streamTab.stream, select],
  );
  const stepInsideTheSubgraph = useCallback(
    (subgraphName: string) => {
      setSubgraphNamesSteppedThrough(subgraphNamesReached === "" ? [subgraphName] : [...subgraphNamesReached.split("/"), subgraphName]);
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
  const importedProjectName = importedProjectNameOfTheStream(streamTab.stream, openProject, listedStreams);
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
  const { sendTheGesture, refusalOfTheLatestEdit } = useStreamGraphEditsSentToTheRuntime(connection, projectFolder);
  const [studioSentAheadByNodeId, setStudioSentAheadByNodeId] = useState<ReadonlyMap<string, StreamGraphNodeStudioFields>>(new Map());
  useEffect(() => {
    if (graphReading?.kind !== "read") return;
    setStudioSentAheadByNodeId((sentAhead) => {
      const stillAhead = [...sentAhead].filter(([nodeId, studio]) => !doesTheGraphShowTheStudioSentAhead(graphReading.graph, nodeId, studio));
      return stillAhead.length === sentAhead.size ? sentAhead : new Map(stillAhead);
    });
  }, [graphReading]);
  const editedGraph = useMemo(() => (levelShown === null ? null : editedStreamGraphOf(levelShown.graph, studioSentAheadByNodeId)), [levelShown, studioSentAheadByNodeId]);
  const sendTheGestureAtTheLevelShown = useCallback((actions: readonly StreamGraphAction[]) => sendTheGesture(actions, levelOfTheEdits), [sendTheGesture, levelOfTheEdits]);
  const sendTheStudioGesture = useCallback(
    (actions: StreamGraphAction[]) => {
      const studioSet = studioFieldsSetBy(actions);
      if (studioSet.size > 0) setStudioSentAheadByNodeId((sentAhead) => new Map([...sentAhead, ...studioSet]));
      return sendTheGestureAtTheLevelShown(actions).then((answer) => {
        if (answer === "refused" && studioSet.size > 0)
          setStudioSentAheadByNodeId((sentAhead) => new Map([...sentAhead].filter(([nodeId, studio]) => studioSet.get(nodeId) !== studio)));
        return answer;
      });
    },
    [sendTheGestureAtTheLevelShown],
  );
  const [nodeTypeSearchAsked, setNodeTypeSearchAsked] = useState<NodeTypeSearchAsked | null>(null);
  const [newNodeAskedAt, setNewNodeAskedAt] = useState<NodeGraphCanvasPoint | null>(null);
  const [modulesAndMarketplaceRefusal, showTheRefusalOfOpeningTheMarketplace] = useRefusalOfTheLatestAsk();
  const [codeOpeningRefusal, showTheRefusalOfOpeningTheCode] = useRefusalOfTheLatestAsk();
  const [marketplaceAddRefusal, showTheRefusalOfTheMarketplaceAdd] = useRefusalOfTheLatestAsk();
  const openProjectOfTheStream = openProject?.kind === "read" && openProject.open_project.project.folder === projectFolder ? openProject.open_project : null;
  const nodeTypeSourcesOfTheProject = nodeTypesOfTheProject?.listing.sources ?? null;
  const { marketplace, addsByEntryName, addThePackage } = useMarketplaceOfTheNodeSearch(connection, nodeTypeSearchAsked !== null, openProjectOfTheStream, nodeTypeSourcesOfTheProject);
  const importsOfTheStreamsProject = openProjectOfTheStream?.imports ?? NO_IMPORTS;
  const codeOfTheCard = useCallback(
    (nodeId: string): NodeGraphCardCode => {
      const nodeType = levelShown?.graph.nodes.find((node) => node.name === nodeId)?.type ?? null;
      if (nodeType === null) return { kind: "does_not_open", because: "The graph no longer holds this node." };
      const code = codeOfTheNodeType(nodeTypesReading, importsOfTheStreamsProject, nodeType);
      if (code.kind === "does_not_open") return code;
      return { kind: "opens", onOpened: () => showTheRefusalOfOpeningTheCode("Didn't open the code:", openTheCodeOfTheNodeType(connection, code)) };
    },
    [levelShown, nodeTypesReading, importsOfTheStreamsProject, connection, showTheRefusalOfOpeningTheCode],
  );
  const closeTheNodeTypeSearch = useCallback(() => setNodeTypeSearchAsked(null), []);
  useEffect(() => {
    setNodeTypeSearchAsked(null);
    setNewNodeAskedAt(null);
  }, [subgraphNamesReached]);
  const editing = useMemo((): NodeGraphCanvasEditing | null => {
    if (importedProjectName !== null || editedGraph === null || "because" in editedGraph) return null;
    return {
      onCardsMoved: (moves, cardLetGoOverALink) =>
        sendTheStudioGesture([
          ...(cardLetGoOverALink === null ? [] : cardLetGoOverALinkEdits(editedGraph, cardLetGoOverALink.node_id, cardLetGoOverALink.link_id)),
          ...cardsMovedEdits(editedGraph, moves),
        ]),
      fitsOfAWireFrom: async (draggedOff) => {
        const request = linkCandidatesRequestOf(editedGraph, draggedOff, levelOfTheEdits, "placed_ports");
        if (request === null || projectFolder === null) return new Map();
        return wireFitsOfTheAnswer(editedGraph, draggedOff, await connection.checkLinkCandidates(projectFolder, request));
      },
      onPinsWired: (source, target) => void sendTheGestureAtTheLevelShown(pinsWiredEdits(editedGraph, source, target)),
      onWireLetGoOverTheCanvas: (looseWire, at) => {
        const asked: NodeTypeSearchAsked = { at, looseWire, portsTheWireFits: null };
        setNodeTypeSearchAsked(asked);
        const request = linkCandidatesRequestOf(editedGraph, looseWire, levelOfTheEdits, "node_type_ports");
        if (request === null || projectFolder === null) return;
        void connection.checkLinkCandidates(projectFolder, request).then((checking) =>
          setNodeTypeSearchAsked((current) => (current === asked ? { ...asked, portsTheWireFits: portsALooseWireFits(checking) } : current)),
        );
      },
      onNodeAskedFor: (at) => setNodeTypeSearchAsked({ at, looseWire: null, portsTheWireFits: null }),
      onNoteAskedFor: (at) => void sendTheGestureAtTheLevelShown(notePlacedEdits(editedGraph, at.on_the_canvas)),
      onDeleted: (deleted) => void sendTheGestureAtTheLevelShown(deletedEdits(editedGraph, deleted)),
      onFrameAskedFor: (nodeIds) => sendTheGestureAtTheLevelShown(selectionFramedEdits(editedGraph, nodeIds)),
      onSubgraphAskedFor: (nodeIds) => {
        const subgraphName = nameOfTheNewSubgraph(editedGraph.graph);
        void sendTheGestureAtTheLevelShown(selectionCollapsedEdits(editedGraph, nodeIds, subgraphName)).then((answer) => {
          if (answer !== "applied") return;
          if (levelOfTheEdits.length === 0) keepWhereTheStreamWasLeft({ selected_node: subgraphName });
          const selectionOfTheSubgraph = selectionOfTheNodes(streamTab.stream, [subgraphName], levelOfTheEdits);
          if (selectionOfTheSubgraph !== null) select(selectionOfTheSubgraph);
        });
      },
      onNoteChanged: (noteId, change) => sendTheGestureAtTheLevelShown(noteChangedEdits(editedGraph, noteId, change)),
      onFrameChanged: (frameId, change) => void sendTheGestureAtTheLevelShown(frameChangedEdits(editedGraph, frameId, change)),
      onFrameRemoved: (frameId) => void sendTheGestureAtTheLevelShown(frameRemovedEdits(editedGraph, frameId)),
      onCardCollapsed: (nodeId, collapsed) => void sendTheStudioGesture(cardCollapsedEdits(editedGraph, nodeId, collapsed)),
      onBundleOpened: (nodeId, side, pin, open) => void sendTheStudioGesture(bundleOpenedEdits(editedGraph, nodeId, side, pin, open)),
    };
  }, [importedProjectName, editedGraph, sendTheGestureAtTheLevelShown, sendTheStudioGesture, select, streamTab.stream, keepWhereTheStreamWasLeft, levelOfTheEdits, connection, projectFolder]);
  const editingOfTheLevelShown = subgraphKeepingTheLevelReadOnly === null ? editing : null;
  const sendTheSubgraphGesture = useCallback(
    (depth: number, actionsOf: (edited: EditedStreamGraph, subgraphName: string) => StreamGraphAction[], returnsToItsLevel: boolean) => {
      const subgraph = subgraphsSteppedThrough[depth];
      if (graphReading?.kind !== "read" || subgraph === undefined) return;
      const levelHoldingTheSubgraph = streamGraphLevelReached(
        graphReading.graph,
        subgraphsSteppedThrough.slice(0, depth).map((steppedThrough) => steppedThrough.name),
      );
      const editedLevel = editedStreamGraphOf(levelHoldingTheSubgraph.graph);
      if ("because" in editedLevel) return;
      void sendTheGesture(actionsOf(editedLevel, subgraph.name), levelOfTheSubgraphsSteppedThrough(subgraphsSteppedThrough, depth)).then((answer) => {
        if (answer !== "applied" || !returnsToItsLevel) return;
        stepToTheLevel(depth);
        if (depth === 0) select({ kind: "nothing" });
      });
    },
    [graphReading, subgraphsSteppedThrough, sendTheGesture, stepToTheLevel, select],
  );
  const whyNoEditCanBeSent = whyNoEditCanBeSentTo(editedGraph, importedProjectName);
  const editedGraphOfTheStreamsOwnLevel = useMemo(() => (graphReading?.kind === "read" ? editedStreamGraphOf(graphReading.graph) : null), [graphReading]);
  const disconnectedEditsOf = useCallback(
    (link: StreamDiagnosticLink): StreamGraphAction[] =>
      editedGraphOfTheStreamsOwnLevel === null || "because" in editedGraphOfTheStreamsOwnLevel ? [] : linkDisconnectedEdits(editedGraphOfTheStreamsOwnLevel, link),
    [editedGraphOfTheStreamsOwnLevel],
  );
  const [recoveryRefusal, showTheRefusalOfTheRecovery] = useRefusalOfTheLatestAsk();
  const whyTheDiagnosticActionCannotRun = useCallback(
    (line: StreamDiagnosticLine): string | null => {
      if (projectFolder === null) return "The runtime lists this stream in no project, so Studio has no project to recover it in.";
      if (importedProjectName !== null) return `${importedProjectName} is an import`;
      if (line.action.kind !== "disconnect_the_link") return null;
      const whyNoEdit = whyNoEditCanBeSentTo(editedGraphOfTheStreamsOwnLevel, null);
      if (whyNoEdit !== null) return whyNoEdit;
      const { from_node: fromNode, to_node: toNode } = line.action.link;
      return disconnectedEditsOf(line.action.link).length === 0 ? `The graph holds no node named ${fromNode} or ${toNode}, so no link of theirs can be disconnected` : null;
    },
    [projectFolder, importedProjectName, editedGraphOfTheStreamsOwnLevel, disconnectedEditsOf],
  );
  const runTheDiagnosticAction = useCallback(
    (line: StreamDiagnosticLine) => {
      if (projectFolder === null) return;
      if (line.action.kind === "ask_studio") showTheRefusalOfTheRecovery(`${line.action.label} was refused:`, connection.recoverTheProjectsStreams(projectFolder, line.action.recovery));
      if (line.action.kind === "disconnect_the_link") void sendTheGesture(disconnectedEditsOf(line.action.link));
    },
    [connection, projectFolder, disconnectedEditsOf, sendTheGesture, showTheRefusalOfTheRecovery],
  );
  const nodeTypesOffered = useMemo(() => nodeTypesTheSearchOffers(nodeTypesOfTheProject), [nodeTypesOfTheProject]);
  const looseWireOfTheSearch = nodeTypeSearchAsked?.looseWire ?? null;
  const portsTheWireOfTheSearchFits = nodeTypeSearchAsked?.portsTheWireFits ?? null;
  const nodeTypeSearchItemsOffered = useMemo(
    () => [
      ...nodeTypeSearchItems(nodeTypesOffered, portsTheWireOfTheSearchFits, openProjectOfTheStream),
      ...(subgraphDepth === 0 ? graphGeneratorSearchItems(nodeTypesOfTheProject?.listing ?? null, looseWireOfTheSearch, openProjectOfTheStream) : []),
      // A node of a module not yet added declares no port the runtime could judge a wire against, so the search over a loose wire offers none.
      ...(looseWireOfTheSearch === null && openProjectOfTheStream !== null ? marketplaceSearchItems(marketplace, openProjectOfTheStream, nodeTypeSourcesOfTheProject, addsByEntryName) : []),
    ],
    [nodeTypesOffered, nodeTypesOfTheProject, looseWireOfTheSearch, portsTheWireOfTheSearchFits, subgraphDepth, openProjectOfTheStream, marketplace, nodeTypeSourcesOfTheProject, addsByEntryName],
  );
  const previewOfTheNodeTypeSearched = useCallback(
    (searchItemId: string) => {
      const previewCard = nodeTypeSearchPreviewCard(nodeTypesOffered, searchItemId);
      return previewCard === null ? null : <NodeGraphCardPreview {...previewCard} />;
    },
    [nodeTypesOffered],
  );
  const canANewNodeBeCreated = editing !== null && openProjectOfTheStream !== null;
  const atOfTheNodeTypeSearch = nodeTypeSearchAsked?.at ?? null;
  const nodeTypeSearchActions = useMemo((): readonly SearchPopoverAction[] => {
    const toTheMarketplace: SearchPopoverAction = {
      label: "Install modules from marketplace",
      icon: Store,
      onPressed: () => showTheRefusalOfOpeningTheMarketplace("Didn't open the Marketplace:", connection.openModulesAndMarketplace("marketplace")),
    };
    // A node made new declares no port the wire could be linked to, so the search over a loose wire offers no Create new node.
    if (looseWireOfTheSearch !== null || !canANewNodeBeCreated || atOfTheNodeTypeSearch === null) return [toTheMarketplace];
    return [toTheMarketplace, { label: "Create new node", icon: Plus, onPressed: () => setNewNodeAskedAt(atOfTheNodeTypeSearch) }];
  }, [connection, showTheRefusalOfOpeningTheMarketplace, looseWireOfTheSearch, canANewNodeBeCreated, atOfTheNodeTypeSearch]);
  const placeTheNewNode = useCallback(
    ({ file, node_type: nodeType }: { file: string; node_type: string }) => {
      const at = newNodeAskedAt;
      setNewNodeAskedAt(null);
      if (at === null) return;
      if (editedGraph === null || "because" in editedGraph) {
        showTheRefusalOfOpeningTheCode("Didn't place the new node:", Promise.resolve({ kind: "refused", because: editedGraph === null ? `${file} was created, but the stream's graph isn't read.` : `${file} was created, but ${editedGraph.because}` }));
        return;
      }
      // The file stays when placing its node is refused: the runtime made it, and the refusal says why the node was not placed.
      void sendTheGestureAtTheLevelShown(nodePlacedEdits(editedGraph, nodeType, at.on_the_canvas, null)).then((answer) => {
        if (answer === "applied") showTheRefusalOfOpeningTheCode("Didn't open the new node's code:", connection.openView(CODE_VIEW_TYPE_ID, { kind: "file", file }));
      });
    },
    [newNodeAskedAt, editedGraph, sendTheGestureAtTheLevelShown, showTheRefusalOfOpeningTheCode, connection],
  );
  const takeTheMarketplaceChoice = useCallback(
    (searchItemId: string): boolean => {
      const choice = marketplaceChoiceOfTheSearchItem(searchItemId);
      if (choice === null) return false;
      const entry = marketplace?.kind === "read" ? marketplace.entries.find((listed) => listed.name === choice.entry_name) : undefined;
      if (choice.kind === "open_the_sample") {
        setNodeTypeSearchAsked(null);
        showTheRefusalOfOpeningTheMarketplace("Didn't open the Marketplace:", connection.openModulesAndMarketplace("marketplace", choice.entry_name));
      } else if (doesChoosingThePackageAddIt(addsByEntryName[choice.entry_name]) && openProjectOfTheStream !== null) {
        // The search stays open: once the module is added, its nodes are listed with the project's own, to place as any other.
        showTheRefusalOfTheMarketplaceAdd(`Didn't add ${entry?.title ?? choice.entry_name} to ${openProjectOfTheStream.project.name}:`, addThePackage(choice.entry_name));
      }
      return true;
    },
    [marketplace, addsByEntryName, openProjectOfTheStream, connection, addThePackage, showTheRefusalOfOpeningTheMarketplace, showTheRefusalOfTheMarketplaceAdd],
  );
  const placeTheChosenNodeType = useCallback(
    (searchItemId: string, staysOpen: boolean) => {
      if (takeTheMarketplaceChoice(searchItemId)) return;
      if (nodeTypeSearchAsked === null || editedGraph === null || "because" in editedGraph) return;
      const chosenGenerator = graphGeneratorOfTheSearchItem(searchItemId);
      const chosenNodeType = nodeTypesOffered.find((offered) => offered.listed.node_type === searchItemId);
      const placedEdits =
        chosenGenerator !== null
          ? generatorSubgraphPlacedEdits(editedGraph, chosenGenerator, nodeTypeSearchAsked.at.on_the_canvas)
          : chosenNodeType === undefined
            ? null
            : nodePlacedEdits(editedGraph, chosenNodeType.listed.node_type, nodeTypeSearchAsked.at.on_the_canvas, wiredToTheLooseWire(nodeTypeSearchAsked, chosenNodeType.listed.node_type));
      if (placedEdits === null) return;
      void sendTheGestureAtTheLevelShown(placedEdits);
      // A second generator placed before the graph shows the first would take the first's name, which refreshes it.
      if (!staysOpen || chosenGenerator !== null) {
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
        portsTheWireFits: null,
      });
    },
    [takeTheMarketplaceChoice, nodeTypesOffered, nodeTypeSearchAsked, editedGraph, sendTheGestureAtTheLevelShown],
  );
  const onNodesSelected = useCallback(
    (nodeNames: readonly string[]) => {
      if (levelOfTheEdits.length === 0) keepWhereTheStreamWasLeft({ selected_node: nodeNames.at(-1) ?? null });
      const selectionOfTheNodesPicked = selectionOfTheNodes(streamTab.stream, nodeNames, levelOfTheEdits);
      if (selectionOfTheNodesPicked !== null) select(selectionOfTheNodesPicked);
      else if (projectFolder !== null)
        select({
          kind: "stream",
          stream: streamTab.stream,
          project_folder: projectFolder,
        });
      else select({ kind: "nothing" });
    },
    [select, projectFolder, streamTab.stream, keepWhereTheStreamWasLeft, levelOfTheEdits],
  );
  const onViewportLeft = useCallback((viewport: NodeGraphCanvasViewport) => keepWhereTheStreamWasLeft({ viewport }), [keepWhereTheStreamWasLeft]);

  const conditionOfTheStream = (
    <>
      {streamCondition !== null && (
        <StudioViewToolbarTools label="Stream graph condition">
          <StreamConditionChip condition={streamCondition} />
        </StudioViewToolbarTools>
      )}
      {streamCondition === null && listedStream?.state === "failed" && (
        <RefusalLine
          layout="bar"
          lead={`${streamTab.display_name} failed:`}
          words={listedStream.failed_because ?? "The runtime lists it failed and gives no reason."}
          data-stream-graph-failure={streamTab.stream}
        />
      )}
      <StreamDiagnosticBars condition={streamCondition} streamWords={streamTab.display_name} onActionChosen={runTheDiagnosticAction} whyTheActionCannotRun={whyTheDiagnosticActionCannotRun} />
      <RefusalOfTheLatestAskBar refusal={recoveryRefusal} />
    </>
  );
  const graphOfTheLevelShown = (): ReactNode => {
    if (graphReading === null) return null;
    if (graphReading.kind === "not_read") {
      const preparingWords = streamPreparingWords(listedStream, streamTab.display_name);
      return (
        preparingWords !== null ? (
          <WaitingState title={preparingWords.title} explanation={preparingWords.explanation} data-stream-graph-state="preparing" />
        ) : (
          <WaitingState isFailure title={`${streamTab.display_name}'s graph can't be read`} explanation={graphReading.because} data-stream-graph-state="not_read" />
        )
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
        <RefusalOfTheLatestAskBar refusal={marketplaceAddRefusal} />
        <RefusalOfTheLatestAskBar refusal={codeOpeningRefusal} />
        {innermostSubgraph !== null && (
          <StreamGraphSubgraphTrail
            streamDisplayName={streamTab.display_name}
            subgraphsSteppedThrough={subgraphsSteppedThrough}
            onLevelChosen={stepToTheLevel}
            unlockOfTheSubgraphShown={
              subgraphKeepingTheLevelReadOnly === null
                ? { onUnlocked: () => sendTheSubgraphGesture(subgraphDepth - 1, subgraphUnlockedEdits, true), disabledReason: whyNoEditCanBeSent }
                : null
            }
          />
        )}
        <NodeGraphCanvas
          key={subgraphsSteppedThrough.map((subgraph) => subgraph.name).join("/")}
          label={innermostSubgraph === null ? `Graph of ${streamTab.display_name}` : `Graph inside ${innermostSubgraph.name}`}
          nodes={canvasContents.nodes}
          links={canvasContents.links}
          frames={canvasContents.frames}
          notes={canvasContents.notes}
          selectedNodeIds={nodesSelectedAtTheLevelShown}
          onNodesSelected={onNodesSelected}
          editing={editingOfTheLevelShown}
          viewportWhereItWasLeft={innermostSubgraph === null ? viewportWhereTheStreamWasLeft : null}
          onViewportLeft={innermostSubgraph === null ? onViewportLeft : null}
          onSubgraphOpened={stepInsideTheSubgraph}
          codeOfTheCard={codeOfTheCard}
          inputValues={inputValues}
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
                  placeholder={nodeTypeSearchAsked.looseWire === null ? "Search node types and generators" : "Search node types"}
                  items={nodeTypeSearchItemsOffered}
                  narrowedTo={nodeTypeSearchAsked.looseWire === null ? null : nodeTypeSearchNarrowing(nodeTypeSearchAsked.looseWire)}
                  emptyWords={nodeTypesReading?.kind === "not_listed" ? nodeTypesReading.because : "No node type matches."}
                  uncategorisedWords={NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS}
                  categoriesWords={NODE_TYPE_CATEGORIES_WORDS}
                  at={nodeTypeSearchAsked.at.in_the_element}
                  onItemChosen={placeTheChosenNodeType}
                  onClosed={closeTheNodeTypeSearch}
                  actionsBesideTheField={nodeTypeSearchActions}
                  previewOfTheItem={previewOfTheNodeTypeSearched}
                  previewNarrowestWidthPx={NODE_GRAPH_CARD_PREVIEW_NARROWEST_WIDTH_PX}
                  data-stream-graph-node-type-search={streamTab.stream}
                />
              )}
              {openProjectOfTheStream !== null && (
                <FormDialog
                  isOpen={newNodeAskedAt !== null}
                  onOpenChange={(isOpen) => {
                    if (!isOpen) setNewNodeAskedAt(null);
                  }}
                  title="Create new node"
                  description="A node file made from the runtime's node template, its node placed where the search opened, and its code opened in the Code layout."
                  focusOnOpen="first_field_at_its_end"
                  data-stream-graph-new-node={streamTab.stream}
                >
                  <NewNodeFileForm connection={connection} projectFolder={openProjectOfTheStream.project.folder} layout="in_a_dialog" onCreated={placeTheNewNode} onClosed={() => setNewNodeAskedAt(null)} />
                </FormDialog>
              )}
              {subgraphKeepingTheLevelReadOnly !== null && (
                <div className="absolute top-2 right-2 z-10 max-w-[calc(100%-4rem)]">
                  <StreamGraphSubgraphReadOnlyBanner
                    subgraph={subgraphKeepingTheLevelReadOnly.subgraph}
                    isOnTheStreamsOwnLevel={subgraphKeepingTheLevelReadOnly.depth === 0}
                    editsRefusedBecause={whyNoEditCanBeSent}
                    onRefreshed={() => sendTheSubgraphGesture(subgraphKeepingTheLevelReadOnly.depth, subgraphRefreshedEdits, false)}
                    onUnlocked={() => sendTheSubgraphGesture(subgraphKeepingTheLevelReadOnly.depth, subgraphUnlockedEdits, true)}
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
  };
  // The stream's condition stays where it is whatever the graph shows under it, so its bars, and the focus on one of their actions, are not drawn again as the graph is read.
  return (
    <>
      {conditionOfTheStream}
      {graphOfTheLevelShown()}
    </>
  );
}

/** The stream graph of the active stream tab, or what to do while no tab is open. */
function StreamGraphBody({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  const [selectionRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  const select = useCallback((selection: StudioSelection) => showTheRefusalOf("Didn't select:", connection.select(selection)), [connection, showTheRefusalOf]);
  const { inputValues, inputControls } = useInputControlsOfTheFrame(connection);
  if (activeStreamTab.kind === "not_read_yet") return null;
  if (activeStreamTab.reading === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to open its tab." data-stream-graph-state="no_tab" />;
  return (
    <InputControlBinderContext value={inputControls}>
      <RefusalOfTheLatestAskBar refusal={selectionRefusal} />
      <StreamGraphOfTheTab key={activeStreamTab.reading.stream} connection={connection} inputValues={inputValues} streamTab={activeStreamTab.reading} select={select} />
    </InputControlBinderContext>
  );
}

/** The Stream graph view's whole frame: the active stream tab's nodes and links, drawn the Blueprint way, under its header row. */
export function StreamGraphView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Stream graph tools">
      <StreamGraphBody connection={connection} />
    </CoreViewFrame>
  );
}
