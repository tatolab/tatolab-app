import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow, useStore, useStoreApi, type NodeChange, type ReactFlowState } from "@xyflow/react";
import { cn } from "cn";
import { Combine, Frame, Hand, MousePointer2, Plus, Scan, Search, StickyNote, Workflow, ZoomIn, ZoomOut } from "lucide-react";
import { ColourPickerDialog, isAHexColour } from "./colour_picker_dialog";
import { RightClickMenu } from "./menus";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { IconButton } from "./icon_button";
import { ToggleIconButton } from "./toggle_icon_button";
import { ToolbarDivider, ToolbarGroup } from "./toolbar";
import { StudioViewToolbarTools } from "./studio_area_frame";
import { NodeGraphFindBar, NodeGraphNodesFoundContext } from "./node_graph_find_bar";
import { isPartOfTheGraphOutsideTheView } from "./support/node_graph_map_visibility";
import { frameACardIsLetGoIn, frameRectangleAroundCards, linkUnderACard, placeClearBelowTheCards, type NodeGraphLinkMidpoint } from "./support/node_graph_editing";
import { type NodeGraphCanvasNode, type NodeGraphCanvasFrame, NODE_GRAPH_FRAME_COLOURS, type NodeGraphCanvasNote, type NodeGraphCanvasLink, type NodeGraphCanvasPoint, type NodeGraphCanvasViewport, type NodeGraphCanvasCardMove, type NodeGraphCanvasEditing, type NodeGraphCardCode } from "./support/node_graph_canvas_contract";
import { theDragCarriesANodeType, theNodeTypeTheDragCarries } from "./support/node_type_drag";
import { NodeGraphCardView } from "./node_graph/node_card";
import { pinTypeKeyOfTheLink } from "./support/node_graph_link_colour";
import { rowKeyOfTheLinkEnd } from "../pin_model/node_pins";
import { type NodeGraphCardFlowNode, type NodeGraphNoteFlowNode, type NodeGraphFrameFlowNode, type NodeGraphFlowNode, type NodeGraphLinkFlowEdge, inputPinHandleId, outputPinHandleId, NodeGraphEditableContext, NodeGraphWireFitsContext, NodeGraphNoteEditingContext, NodeGraphNoteResizingContext, NodeGraphCardAndFrameEditingContext, NodeGraphFrameColoursUsedContext, NodeGraphFrameColourPickingContext, NodeGraphFrameWordsEditingContext, NodeGraphInputValuesContext, NodeGraphWireRoutesContext } from "./support/node_graph_flow_elements";
import type { InputValues } from "../pin_services/input_values";
import { type NodeGraphRightClicked, NodeGraphRightClickChoices } from "./node_graph_right_click_choices";
import { NodeGraphFrameView } from "./node_graph_frame_view";
import { NodeGraphNoteView } from "./node_graph_note_view";
import { NodeGraphLinkView } from "./node_graph_link_view";
import { useNodeGraphWiring } from "./support/use_node_graph_wiring";
import { useNodeGraphFrameEditing } from "./support/use_node_graph_frame_editing";
import { useNodeGraphNodeFind } from "./support/use_node_graph_node_find";
import { useNodeGraphSelection } from "./support/use_node_graph_selection";
import { useNodeGraphBoxSelection } from "./support/use_node_graph_box_selection";
import { FIT_TO_VIEW_OPTIONS, useNodeGraphCardLayout } from "./support/use_node_graph_card_layout";
import { onTheCanvasPixel } from "./support/node_graph_held_layout";
import { useNodeGraphWireRoutes } from "./support/use_node_graph_wire_routes";
import { useNodeGraphTidyUp } from "./support/use_node_graph_tidy_up";

/** The room a card or note placed from a tool takes, so the view shows it whole. */
const NODE_GRAPH_PLACED_ROOM = { width: 240, height: 120 };

const noteFlowNodeId = (noteId: string) => `note:${noteId}`;

const noteIdOfTheFlowNode = (flowNodeId: string): string | null => (flowNodeId.startsWith("note:") ? flowNodeId.slice("note:".length) : null);

const frameFlowNodeId = (frameId: string) => `frame:${frameId}`;

const NODE_GRAPH_NODE_TYPES = { node_graph_card: memo(NodeGraphCardView), node_graph_note: memo(NodeGraphNoteView), node_graph_frame: memo(NodeGraphFrameView) };

const NODE_GRAPH_EDGE_TYPES = { node_graph_link: memo(NodeGraphLinkView) };

/** The zoom below which the cards' inline controls are too small to read or use, so the canvas hides them; their rows keep their height. */
const NODE_GRAPH_INLINE_CONTROLS_SHOWN_FROM_ZOOM = 0.5;

const isZoomedOutPastTheInlineControls = (state: ReactFlowState) => state.transform[2] < NODE_GRAPH_INLINE_CONTROLS_SHOWN_FROM_ZOOM;

/** What a left-drag on an editable canvas does: the pointer draws a box that selects what it touches, the hand pans the view. */
type NodeGraphCanvasTool = "pointer" | "hand";

/** Whether React Flow would draw `before` and `after` the same: the same node, place, size and selection, and the same edits allowed. */
function isTheSameCardFlowNode(before: NodeGraphCardFlowNode, after: NodeGraphCardFlowNode): boolean {
  return (
    before.data === after.data &&
    before.position.x === after.position.x &&
    before.position.y === after.position.y &&
    before.measured === after.measured &&
    before.selected === after.selected &&
    before.draggable === after.draggable &&
    before.connectable === after.connectable
  );
}

/** The links whose both ends are cards drawn here. */
function flowEdgesJoining(
  links: readonly NodeGraphCanvasLink[],
  nodeById: ReadonlyMap<string, NodeGraphCanvasNode>,
): NodeGraphCanvasLink[] {
  return links.filter(
    (graphLink) =>
      nodeById.has(graphLink.source_node_id) &&
      nodeById.has(graphLink.target_node_id),
  );
}

function NodeGraphFlow({
  label,
  nodes,
  links,
  frames,
  notes,
  selectedNodeIds,
  onNodesSelected,
  editing,
  viewportWhereItWasLeft,
  onViewportLeft,
  onSubgraphOpened,
  codeOfTheCard,
  overlay,
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  frames: readonly NodeGraphCanvasFrame[];
  notes: readonly NodeGraphCanvasNote[];
  /** The cards selected, the one picked last at the end. */
  selectedNodeIds: readonly string[];
  /** The cards selected after a click, a drag-box or a delete, the one picked last at the end; none when the selection was cleared. */
  onNodesSelected: (nodeIds: readonly string[]) => void;
  editing: NodeGraphCanvasEditing | null;
  viewportWhereItWasLeft: NodeGraphCanvasViewport | null;
  onViewportLeft: ((viewport: NodeGraphCanvasViewport) => void) | null;
  onSubgraphOpened: ((nodeId: string) => void) | null;
  codeOfTheCard: ((nodeId: string) => NodeGraphCardCode) | null;
  overlay?: ReactNode;
}) {
  const reactFlow = useReactFlow();
  const reactFlowStore = useStoreApi<NodeGraphFlowNode, NodeGraphLinkFlowEdge>();
  const wireRoutes = useNodeGraphWireRoutes();
  const canvasElement = useRef<HTMLDivElement>(null);
  const isTheMapShown = useStore(isPartOfTheGraphOutsideTheView);
  const areTheInlineControlsHidden = useStore(isZoomedOutPastTheInlineControls);
  const pointerRestsAt = useRef<NodeGraphCanvasPoint | null>(null);
  const [canvasTool, setCanvasTool] = useState<NodeGraphCanvasTool>("pointer");
  // A canvas that cannot be edited keeps React Flow's own drag, which pans, whatever tool its editable levels chose.
  const isThePointerInUse = editing !== null && canvasTool === "pointer";
  const isTheHandInUse = editing !== null && canvasTool === "hand";
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.node_id, node])),
    [nodes],
  );
  const { selectedIds, selectedNoteIds, selectedLinkIds, followTheSelectionChanges, selectWhatTheBoxHolds, followTheLinkChanges, selectNothing, clearTheSelectionAfterADelete, selectTheRightClickedCard, selectTheRightClickedNote, selectTheRightClickedLink } = useNodeGraphSelection(selectedNodeIds, nodeById, onNodesSelected);
  const { cardSizeByNode, isLaidOutOnMeasuredSizes, hasBeenFramed, positionOfTheCard, frameOfTheCard, sizeOfTheCard, positionOfTheNote, sizeOfTheNote, followTheLayoutChanges, holdTheCardMoves, releaseTheHeldCards, holdTheNoteMoves, releaseTheHeldNotePositions, keepTheResizedNote } = useNodeGraphCardLayout(nodes, links, notes, nodeById, editing, reactFlow, viewportWhereItWasLeft);

  const isACard = useCallback((flowNodeId: string) => nodeById.has(flowNodeId), [nodeById]);
  const { pressTheCanvas, isABoxPossible, boxMarksRedrawn } = useNodeGraphBoxSelection({ reactFlow, selectedIds, selectedNoteIds, isACard, noteIdOfTheFlowNode, onBoxed: selectWhatTheBoxHolds });

  // React Flow takes up again only the cards handed as new objects, and a card draws again for new data, so a card is
  // handed its object from before, or else its data from before, wherever they are unchanged.
  const cardFlowNodesBefore = useRef<ReadonlyMap<string, NodeGraphCardFlowNode>>(new Map());
  const flowNodes: NodeGraphFlowNode[] = useMemo(() => {
    const frameNodes: NodeGraphFrameFlowNode[] = frames.flatMap((graphFrame) => {
      const rectangle = frameRectangleAroundCards(
        nodes.filter((node) => frameOfTheCard(node) === graphFrame.frame_id).map((node) => ({ position: positionOfTheCard(node), ...sizeOfTheCard(node) })),
      );
      if (rectangle === null) return [];
      return [
        {
          id: frameFlowNodeId(graphFrame.frame_id),
          type: "node_graph_frame",
          position: { x: rectangle.x, y: rectangle.y },
          width: rectangle.width,
          height: rectangle.height,
          data: { graphFrame },
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          zIndex: -1,
          ariaLabel: `Frame ${graphFrame.title}`,
        },
      ];
    });
    const noteNodes: NodeGraphNoteFlowNode[] = notes.map((graphNote) => {
      const size = sizeOfTheNote(graphNote);
      return {
        id: noteFlowNodeId(graphNote.note_id),
        type: "node_graph_note",
        position: positionOfTheNote(graphNote),
        width: size.width,
        height: size.height,
        data: { graphNote },
        selected: selectedNoteIds.has(graphNote.note_id),
        draggable: isThePointerInUse,
        selectable: isThePointerInUse,
        connectable: false,
        ariaLabel: `Note ${graphNote.text}`,
      };
    });
    const cardNodes: NodeGraphCardFlowNode[] = nodes.map((graphNode) => {
      const cardNodeBefore = cardFlowNodesBefore.current.get(graphNode.node_id);
      const cardNode: NodeGraphCardFlowNode = {
        id: graphNode.node_id,
        type: "node_graph_card",
        position: positionOfTheCard(graphNode),
        measured: cardSizeByNode.get(graphNode.node_id),
        selected: selectedIds.has(graphNode.node_id),
        data: cardNodeBefore?.data.graphNode === graphNode ? cardNodeBefore.data : { graphNode },
        draggable: isThePointerInUse,
        connectable: isThePointerInUse,
        ariaLabel: `Node ${graphNode.title}`,
      };
      // A box marks React Flow's own copy of a card in or out of it, so a card it marked otherwise is handed to it again.
      const isMarkedAsSelected = (reactFlowStore.getState().nodeLookup.get(graphNode.node_id)?.selected ?? false) === cardNode.selected;
      return cardNodeBefore !== undefined && isMarkedAsSelected && isTheSameCardFlowNode(cardNodeBefore, cardNode) ? cardNodeBefore : cardNode;
    });
    return [...frameNodes, ...noteNodes, ...cardNodes];
    // boxMarksRedrawn draws the cards again after each box step React Flow marked otherwise than the selection.
  }, [frames, notes, nodes, isThePointerInUse, boxMarksRedrawn, reactFlowStore, positionOfTheCard, frameOfTheCard, sizeOfTheCard, cardSizeByNode, positionOfTheNote, sizeOfTheNote, selectedIds, selectedNoteIds]);
  useLayoutEffect(() => {
    cardFlowNodesBefore.current = new Map(flowNodes.flatMap((flowNode): [string, NodeGraphCardFlowNode][] => (flowNode.type === "node_graph_card" ? [[flowNode.id, flowNode]] : [])));
  }, [flowNodes]);
  const flowEdges: NodeGraphLinkFlowEdge[] = useMemo(
    () =>
      flowEdgesJoining(links, nodeById).map((graphLink) => ({
        id: graphLink.link_id,
        type: "node_graph_link",
        source: graphLink.source_node_id,
        sourceHandle: outputPinHandleId(rowKeyOfTheLinkEnd(nodeById.get(graphLink.source_node_id)?.outputs ?? [], graphLink.source_pin, graphLink.source_member)),
        target: graphLink.target_node_id,
        targetHandle: inputPinHandleId(rowKeyOfTheLinkEnd(nodeById.get(graphLink.target_node_id)?.inputs ?? [], graphLink.target_pin, graphLink.target_member)),
        data: {
          graphLink,
          pin_type_key: pinTypeKeyOfTheLink(graphLink, nodeById),
        },
        focusable: editing !== null,
        selectable: isThePointerInUse,
        selected: selectedLinkIds.has(graphLink.link_id),
      })),
    [links, nodeById, editing, isThePointerInUse, selectedLinkIds],
  );

  const followTheChanges = useCallback(
    (changes: NodeChange<NodeGraphFlowNode>[]) => {
      followTheLayoutChanges(changes);
      followTheSelectionChanges(isABoxPossible() ? changes.filter((change) => change.type !== "select") : changes);
    },
    [followTheLayoutChanges, followTheSelectionChanges, isABoxPossible],
  );

  /** Where `clientPoint` is on the canvas and in the canvas element. */
  const canvasPointOf = useCallback(
    (clientPoint: { x: number; y: number }): NodeGraphCanvasPoint => {
      const elementBox = canvasElement.current?.getBoundingClientRect();
      return {
        on_the_canvas: reactFlow.screenToFlowPosition(clientPoint),
        in_the_element: { x: clientPoint.x - (elementBox?.left ?? 0), y: clientPoint.y - (elementBox?.top ?? 0) },
      };
    },
    [reactFlow],
  );

  /** Where in the canvas element a tool places what it adds: a little up and left of the middle, so it is seen whole. */
  const placingPointInTheElement = useCallback((): { x: number; y: number } => {
    const elementBox = canvasElement.current?.getBoundingClientRect();
    return { x: (elementBox?.width ?? 0) * 0.4, y: (elementBox?.height ?? 0) * 0.35 };
  }, []);

  /** The placing point of the view as it is. */
  const middleOfTheView = useCallback((): NodeGraphCanvasPoint => {
    const elementBox = canvasElement.current?.getBoundingClientRect();
    const inTheElement = placingPointInTheElement();
    return canvasPointOf({ x: (elementBox?.left ?? 0) + inTheElement.x, y: (elementBox?.top ?? 0) + inTheElement.y });
  }, [canvasPointOf, placingPointInTheElement]);

  /** A place clear of every card and note, the view moved so it sits at the placing point, for what a tool places. */
  const clearPlaceBroughtIntoView = useCallback((): NodeGraphCanvasPoint => {
    const middle = middleOfTheView();
    const clearPlace = placeClearBelowTheCards(
      [
        ...nodes.map((node) => ({ position: positionOfTheCard(node), ...sizeOfTheCard(node) })),
        ...notes.map((note) => ({ position: positionOfTheNote(note), ...sizeOfTheNote(note) })),
      ],
      middle.on_the_canvas,
    );
    const elementBox = canvasElement.current?.getBoundingClientRect();
    if (elementBox === undefined) return middle;
    const clearPlaceOnTheScreen = reactFlow.flowToScreenPosition(clearPlace);
    const clearPlaceInTheElement = { x: clearPlaceOnTheScreen.x - elementBox.left, y: clearPlaceOnTheScreen.y - elementBox.top };
    const isSeenWhole =
      clearPlaceInTheElement.x >= 0 &&
      clearPlaceInTheElement.y >= 0 &&
      clearPlaceInTheElement.x + NODE_GRAPH_PLACED_ROOM.width <= elementBox.width &&
      clearPlaceInTheElement.y + NODE_GRAPH_PLACED_ROOM.height <= elementBox.height;
    if (isSeenWhole) return { on_the_canvas: clearPlace, in_the_element: clearPlaceInTheElement };
    const zoom = reactFlow.getZoom();
    const placingPointFromTheCentre = { x: middle.in_the_element.x - elementBox.width / 2, y: middle.in_the_element.y - elementBox.height / 2 };
    void reactFlow.setCenter(clearPlace.x - placingPointFromTheCentre.x / zoom, clearPlace.y - placingPointFromTheCentre.y / zoom, { zoom, duration: 200 });
    return { on_the_canvas: clearPlace, in_the_element: middle.in_the_element };
  }, [middleOfTheView, nodes, notes, positionOfTheNote, sizeOfTheNote, positionOfTheCard, sizeOfTheCard, reactFlow]);

  /** Each link's midpoint on the canvas, read off the path drawn for it. */
  const linkMidpointsDrawn = useCallback((): NodeGraphLinkMidpoint[] => {
    const element = canvasElement.current;
    if (element === null) return [];
    return [...element.querySelectorAll<SVGGElement>("[data-node-graph-link]")].flatMap((linkGroup) => {
      const linkId = linkGroup.dataset["nodeGraphLink"];
      const path = linkGroup.querySelector<SVGPathElement>("path.react-flow__edge-path");
      if (linkId === undefined || path === null || typeof path.getTotalLength !== "function") return [];
      const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
      return [{ link_id: linkId, midpoint: { x: midpoint.x, y: midpoint.y } }];
    });
  }, []);

  const keepTheMovedCards = useCallback(
    (draggedNodes: readonly NodeGraphFlowNode[]) => {
      if (editing === null) return;
      const draggedCards = draggedNodes.filter((flowNode) => nodeById.has(flowNode.id));
      const draggedNotes = draggedNodes.filter((flowNode) => flowNode.type === "node_graph_note");
      for (const note of draggedNotes) {
        const noteId = note.id.slice("note:".length);
        void editing.onNoteChanged(noteId, { position: onTheCanvasPixel(note.position) }).then((answer) => {
          if (answer === "refused") releaseTheHeldNotePositions([noteId]);
        });
      }
      if (draggedCards.length === 0) return;
      const draggedIds = new Set(draggedCards.map((card) => card.id));
      const onlyCard = draggedCards.length === 1 ? draggedCards[0] : undefined;
      const onlyNode = onlyCard === undefined ? undefined : nodeById.get(onlyCard.id);
      const linkLetGoOver =
        onlyCard !== undefined && onlyNode !== undefined && !links.some((link) => link.source_node_id === onlyCard.id || link.target_node_id === onlyCard.id)
          ? linkUnderACard({ position: onlyCard.position, ...sizeOfTheCard(onlyNode) }, linkMidpointsDrawn())
          : null;
      const framesLeftStanding = frames.map((graphFrame) => ({
        frame_id: graphFrame.frame_id,
        rectangle: frameRectangleAroundCards(
          nodes.filter((node) => !draggedIds.has(node.node_id) && frameOfTheCard(node) === graphFrame.frame_id).map((node) => ({ position: positionOfTheCard(node), ...sizeOfTheCard(node) })),
        ),
      }));
      const moves: NodeGraphCanvasCardMove[] = [
        ...draggedCards.flatMap((card) => {
          const node = nodeById.get(card.id);
          return node === undefined ? [] : [{ node_id: card.id, position: onTheCanvasPixel(card.position), frame_id: frameACardIsLetGoIn({ position: card.position, ...sizeOfTheCard(node) }, frameOfTheCard(node), framesLeftStanding) }];
        }),
        ...nodes
          .filter((node) => node.saved_position === null && !draggedIds.has(node.node_id))
          .map((node) => ({ node_id: node.node_id, position: onTheCanvasPixel(positionOfTheCard(node)), frame_id: frameOfTheCard(node) })),
      ];
      const movedIds = moves.map((move) => move.node_id);
      holdTheCardMoves(moves);
      void editing.onCardsMoved(moves, onlyCard === undefined || linkLetGoOver === null ? null : { node_id: onlyCard.id, link_id: linkLetGoOver }).then((answer) => {
        if (answer !== "refused") return;
        releaseTheHeldCards(movedIds);
      });
    },
    [editing, nodeById, nodes, links, frames, positionOfTheCard, frameOfTheCard, sizeOfTheCard, linkMidpointsDrawn, holdTheCardMoves, releaseTheHeldCards, releaseTheHeldNotePositions],
  );

  const { tidyUp, tidiesTheSelection, isGliding, tidyUpDisabledReason } = useNodeGraphTidyUp({ editing, nodes, links, notes, nodeById, selectedIds, positionOfTheCard, frameOfTheCard, sizeOfTheCard, positionOfTheNote, sizeOfTheNote, holdTheCardMoves, releaseTheHeldCards, holdTheNoteMoves, releaseTheHeldNotePositions });

  const { wireFits, askHowTheWireFits, canTheConnectionBeWired, wireThePins, followTheWireLetGo } = useNodeGraphWiring(editing, canvasPointOf);

  const { takeAKeyTypedWhileTheFrameIsMade, frameTheSelection, frameWordsEditing, setFrameIdWhoseColourIsPicked, frameWhoseColourIsPicked, frameColoursUsed, cardAndFrameEditing } = useNodeGraphFrameEditing(editing, frames, selectedIds);

  const frameSelectionDisabledReason = selectedIds.size === 0 ? "Select the nodes to frame first" : null;
  const subgraphDisabledReason = selectedIds.size === 0 ? "Select the nodes to collapse into a subgraph first" : null;
  const collapseTheSelectionIntoASubgraph = useCallback(() => {
    if (editing !== null && selectedIds.size > 0) editing.onSubgraphAskedFor([...selectedIds]);
  }, [editing, selectedIds]);
  const frameTheWholeGraph = useCallback(() => {
    void reactFlow.fitView({ ...FIT_TO_VIEW_OPTIONS, duration: 200 }).then(() => {
      const { x, y, zoom } = reactFlow.getViewport();
      onViewportLeft?.({ x, y, zoom });
    });
  }, [reactFlow, onViewportLeft]);
  const deleteTheSelection = useCallback(() => {
    if (editing === null || (selectedIds.size === 0 && selectedLinkIds.size === 0 && selectedNoteIds.size === 0)) return;
    editing.onDeleted({ node_ids: [...selectedIds], link_ids: [...selectedLinkIds], note_ids: [...selectedNoteIds] });
    clearTheSelectionAfterADelete();
  }, [editing, selectedIds, selectedLinkIds, selectedNoteIds, clearTheSelectionAfterADelete]);
  const { nodeFind, changeTheFindWords, stepTheFind, nodeIdsFound, currentNodeIdFound, nodesFound, openTheNodeFind, closeTheNodeFind } = useNodeGraphNodeFind(nodes, reactFlow, canvasElement);
  const [rightClicked, setRightClicked] = useState<NodeGraphRightClicked | null>(null);
  const followTheRightClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const flowNodeId = target?.closest<HTMLElement>(".react-flow__node")?.dataset["id"];
      const linkId = target?.closest<SVGGElement>("[data-node-graph-link]")?.dataset["nodeGraphLink"];
      if (flowNodeId !== undefined && nodeById.has(flowNodeId)) {
        selectTheRightClickedCard(flowNodeId);
        setRightClicked({ kind: "card", node_id: flowNodeId });
      } else if (flowNodeId?.startsWith("note:") === true && editing !== null) {
        const noteId = flowNodeId.slice("note:".length);
        selectTheRightClickedNote(noteId);
        setRightClicked({ kind: "note", note_id: noteId });
      } else if (linkId !== undefined && editing !== null) {
        selectTheRightClickedLink(linkId);
        setRightClicked({ kind: "link", link_id: linkId });
      } else {
        setRightClicked({ kind: "canvas", at: canvasPointOf({ x: event.clientX, y: event.clientY }) });
      }
    },
    [nodeById, editing, selectTheRightClickedCard, selectTheRightClickedNote, selectTheRightClickedLink, canvasPointOf],
  );
  const followTheKeys = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if ((event.key === "f" || event.key === "F") && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        openTheNodeFind();
        return;
      }
      if (editing === null) return;
      if (takeAKeyTypedWhileTheFrameIsMade(event)) return;
      const isOnAControl = event.target instanceof Element && event.target.closest("button, a, select, [role=menuitem]") !== null;
      if (event.key === "Tab" && !isOnAControl && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        editing.onNodeAskedFor(pointerRestsAt.current ?? middleOfTheView());
      } else if (
        selectedIds.size > 0 &&
        !event.altKey &&
        (((event.key === "f" || event.key === "F") && !event.metaKey && !event.ctrlKey) || ((event.key === "g" || event.key === "G") && (event.metaKey || event.ctrlKey) && !event.shiftKey))
      ) {
        event.preventDefault();
        frameTheSelection();
      } else if (selectedIds.size > 0 && (event.key === "g" || event.key === "G") && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey) {
        event.preventDefault();
        collapseTheSelectionIntoASubgraph();
      } else if ((event.key === "v" || event.key === "V" || event.key === "h" || event.key === "H") && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setCanvasTool(event.key === "h" || event.key === "H" ? "hand" : "pointer");
      } else if ((event.key === "t" || event.key === "T") && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        tidyUp();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedIds.size === 0 && selectedLinkIds.size === 0 && selectedNoteIds.size === 0) return;
        event.preventDefault();
        deleteTheSelection();
      }
    },
    [editing, middleOfTheView, selectedIds, selectedLinkIds, selectedNoteIds, frameTheSelection, collapseTheSelectionIntoASubgraph, deleteTheSelection, tidyUp, openTheNodeFind, takeAKeyTypedWhileTheFrameIsMade],
  );

  return (
      <NodeGraphEditableContext value={editing !== null}>
        <NodeGraphWireFitsContext value={wireFits}>
        <NodeGraphNoteEditingContext value={editing?.onNoteChanged ?? null}>
        <NodeGraphNoteResizingContext value={editing === null ? null : keepTheResizedNote}>
          <NodeGraphCardAndFrameEditingContext value={cardAndFrameEditing}>
            <NodeGraphFrameWordsEditingContext value={frameWordsEditing}>
            <NodeGraphFrameColoursUsedContext value={frameColoursUsed}>
            <NodeGraphFrameColourPickingContext value={setFrameIdWhoseColourIsPicked}>
          <NodeGraphNodesFoundContext value={nodesFound}>
            <div className="flex size-full flex-col">
            <StudioViewToolbarTools label={`${label} tools`}>
              {editing !== null && (
                <>
                  <ToolbarGroup>
                    <ToggleIconButton
                      icon={MousePointer2}
                      label="Select"
                      tooltipWhileOn="Select: drag a box to select (V)"
                      tooltipWhileOff="Select: drag a box to select (V)"
                      isOn={canvasTool === "pointer"}
                      onToggled={() => setCanvasTool("pointer")}
                      data-node-graph-tool="pointer"
                    />
                    <ToggleIconButton
                      icon={Hand}
                      label="Hand"
                      tooltipWhileOn="Hand: drag to move around (H)"
                      tooltipWhileOff="Hand: drag to move around (H)"
                      isOn={canvasTool === "hand"}
                      onToggled={() => setCanvasTool("hand")}
                      data-node-graph-tool="hand"
                    />
                  </ToolbarGroup>
                  <ToolbarDivider />
                  <ToolbarGroup>
                    <IconButton icon={Plus} label="Add node" tooltip="Add node (Tab)" onPressed={() => editing.onNodeAskedFor(clearPlaceBroughtIntoView())} data-node-graph-tool="add_node" />
                    <IconButton
                      icon={Frame}
                      label="Frame the selected nodes"
                      tooltip="Frame the selected nodes (F)"
                      disabledReason={frameSelectionDisabledReason}
                      onPressed={() => {
                        canvasElement.current?.focus({ preventScroll: true });
                        frameTheSelection();
                      }}
                      data-node-graph-tool="frame_selection"
                    />
                    <IconButton icon={StickyNote} label="Add a note" onPressed={() => editing.onNoteAskedFor(clearPlaceBroughtIntoView())} data-node-graph-tool="add_note" />
                    <IconButton
                      icon={Combine}
                      label="Collapse the selection into a subgraph"
                      tooltip="Collapse the selection into a subgraph (⇧⌘G)"
                      disabledReason={subgraphDisabledReason}
                      onPressed={collapseTheSelectionIntoASubgraph}
                      data-node-graph-tool="add_subgraph"
                    />
                    <IconButton
                      icon={Workflow}
                      label={tidiesTheSelection ? "Tidy up the selected nodes" : "Tidy up the graph"}
                      tooltip={tidiesTheSelection ? "Tidy up the selected nodes (⇧T)" : "Tidy up the graph (⇧T)"}
                      disabledReason={tidyUpDisabledReason}
                      onPressed={tidyUp}
                      data-node-graph-tool="tidy_up"
                    />
                  </ToolbarGroup>
                  <ToolbarDivider />
                </>
              )}
              <ToolbarGroup>
                <IconButton icon={Scan} label="Frame the whole graph" onPressed={frameTheWholeGraph} data-node-graph-tool="frame_all" />
                <IconButton icon={ZoomIn} label="Zoom in" onPressed={() => void reactFlow.zoomIn({ duration: 150 })} data-node-graph-tool="zoom_in" />
                <IconButton icon={ZoomOut} label="Zoom out" onPressed={() => void reactFlow.zoomOut({ duration: 150 })} data-node-graph-tool="zoom_out" />
              </ToolbarGroup>
              <ToolbarDivider />
              <ToolbarGroup>
                <IconButton icon={Search} label="Find nodes" tooltip="Find nodes (⌘F)" onPressed={openTheNodeFind} data-node-graph-tool="find" />
              </ToolbarGroup>
            </StudioViewToolbarTools>
            <RightClickMenu
              label={`${label}: what to do`}
              returnsFocusToTheRowOnClosing={false}
              choices={
                rightClicked === null ? null : (
                  <NodeGraphRightClickChoices
                    rightClicked={rightClicked}
                    graphNode={rightClicked.kind === "card" ? (nodeById.get(rightClicked.node_id) ?? null) : null}
                    editing={editing}
                    selectedCardCount={selectedIds.size}
                    onFrameTheSelection={() => {
                      canvasElement.current?.focus({ preventScroll: true });
                      frameTheSelection();
                    }}
                    onCollapseTheSelection={collapseTheSelectionIntoASubgraph}
                    onDeleteTheSelection={deleteTheSelection}
                    onFrameTheWholeGraph={frameTheWholeGraph}
                    onSubgraphOpened={onSubgraphOpened}
                    codeOfTheCard={rightClicked.kind === "card" && codeOfTheCard !== null ? codeOfTheCard(rightClicked.node_id) : null}
                  />
                )
              }
            >
            <div
              ref={canvasElement}
              className="relative min-h-0 w-full flex-1"
              tabIndex={editing === null ? undefined : 0}
              onKeyDown={followTheKeys}
              onContextMenuCapture={followTheRightClick}
              onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                pointerRestsAt.current = canvasPointOf({ x: event.clientX, y: event.clientY });
              }}
              onPointerDownCapture={(event: ReactPointerEvent<HTMLDivElement>) => {
                pointerRestsAt.current = canvasPointOf({ x: event.clientX, y: event.clientY });
                if (isThePointerInUse) pressTheCanvas(event);
              }}
              onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
                if (editing === null || !theDragCarriesANodeType(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event: ReactDragEvent<HTMLDivElement>) => {
                const nodeType = editing === null ? null : theNodeTypeTheDragCarries(event.dataTransfer);
                if (editing === null || nodeType === null) return;
                event.preventDefault();
                editing.onNodeTypeDropped(nodeType, canvasPointOf({ x: event.clientX, y: event.clientY }));
              }}
              data-node-graph-editable={editing !== null || undefined}
            >
              {nodeFind !== null && (
                <NodeGraphFindBar
                  findWords={nodeFind.find_words}
                  onFindWordsChanged={changeTheFindWords}
                  currentIndex={Math.max(0, nodeIdsFound.indexOf(currentNodeIdFound ?? ""))}
                  matchCount={nodeIdsFound.length}
                  onStepped={stepTheFind}
                  onClosed={closeTheNodeFind}
                />
              )}
              <NodeGraphWireRoutesContext value={wireRoutes}>
                <ReactFlow<NodeGraphFlowNode, NodeGraphLinkFlowEdge>
                  aria-label={label}
                  className={cn(
                    "node-graph-canvas",
                    areTheInlineControlsHidden && "node-graph-canvas-zoomed-out",
                    isGliding && "node-graph-canvas-tidying",
                    isTheHandInUse && "node-graph-canvas-hand",
                    !isLaidOutOnMeasuredSizes && !hasBeenFramed && "opacity-0",
                  )}
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={NODE_GRAPH_NODE_TYPES}
                  edgeTypes={NODE_GRAPH_EDGE_TYPES}
                  onNodesChange={followTheChanges}
                  onEdgesChange={followTheLinkChanges}
                  onNodeDragStop={(_event, _node, draggedNodes) => keepTheMovedCards(draggedNodes)}
                  onMoveEnd={(event, viewport) => {
                    if (event !== null && hasBeenFramed) onViewportLeft?.({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
                  }}
                  onNodeDoubleClick={(_event, flowNode) => {
                    if (flowNode.type === "node_graph_card" && (nodeById.get(flowNode.id)?.subgraph ?? null) !== null) onSubgraphOpened?.(flowNode.id);
                  }}
                  onConnectStart={askHowTheWireFits}
                  onConnect={wireThePins}
                  onConnectEnd={followTheWireLetGo}
                  isValidConnection={canTheConnectionBeWired}
                  onPaneClick={isTheHandInUse ? undefined : selectNothing}
                  nodesDraggable={isThePointerInUse}
                  nodesConnectable={isThePointerInUse}
                  edgesFocusable={editing !== null}
                  elementsSelectable={!isTheHandInUse}
                  deleteKeyCode={null}
                  panOnDrag={isThePointerInUse ? [1] : true}
                  selectionOnDrag={isThePointerInUse}
                  selectionMode={SelectionMode.Partial}
                  selectionKeyCode={isThePointerInUse ? "Shift" : null}
                  multiSelectionKeyCode={isThePointerInUse ? ["Meta", "Control"] : null}
                  minZoom={0.2}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  colorMode="dark"
                >
                  <Background
                    variant={BackgroundVariant.Lines}
                    gap={24}
                    lineWidth={1}
                    color="var(--studio-graph-grid)"
                  />
                  {isTheMapShown && (
                    <MiniMap
                      className="node-graph-minimap"
                      style={{ width: 168, height: 108 }}
                      ariaLabel="Map of the whole graph"
                      pannable
                      zoomable
                      nodeColor={(flowNode) => (flowNode.type === "node_graph_card" ? "var(--fg-3)" : "transparent")}
                      nodeStrokeColor={(flowNode) => (flowNode.type === "node_graph_card" ? "var(--studio-graph-card-line)" : "transparent")}
                      maskColor="var(--scrim)"
                      bgColor="var(--studio-graph-tools)"
                    />
                  )}
                  {overlay}
                </ReactFlow>
              </NodeGraphWireRoutesContext>
            </div>
            </RightClickMenu>
            </div>
          </NodeGraphNodesFoundContext>
            {cardAndFrameEditing !== null && (
              <ColourPickerDialog
                isOpen={frameWhoseColourIsPicked !== null}
                onOpenChange={(isOpen) => {
                  if (!isOpen) setFrameIdWhoseColourIsPicked(null);
                }}
                title={frameWhoseColourIsPicked === null ? "Frame color" : `Color of ${frameWhoseColourIsPicked.title}`}
                startingColour={frameWhoseColourIsPicked?.colour !== null && frameWhoseColourIsPicked?.colour !== undefined && isAHexColour(frameWhoseColourIsPicked.colour) ? frameWhoseColourIsPicked.colour : (NODE_GRAPH_FRAME_COLOURS[0]?.colour ?? "#ffffff")}
                recentColours={frameColoursUsed}
                onColourPicked={(colour) => {
                  if (frameWhoseColourIsPicked !== null) cardAndFrameEditing.onFrameChanged(frameWhoseColourIsPicked.frame_id, { colour });
                }}
                data-node-graph-frame-colour-picker=""
              />
            )}
            </NodeGraphFrameColourPickingContext>
            </NodeGraphFrameColoursUsedContext>
            </NodeGraphFrameWordsEditingContext>
          </NodeGraphCardAndFrameEditingContext>
        </NodeGraphNoteResizingContext>
        </NodeGraphNoteEditingContext>
        </NodeGraphWireFitsContext>
      </NodeGraphEditableContext>
  );
}

/**
 * A graph of nodes and links drawn the Blueprint way: a card per node, its input pins down its left edge and its outputs
 * down its right, links as curves between them, labelled frames behind the cards they hold and notes beside them. Cards
 * with no saved place are laid out left to right, and the graph is framed whole when it first shows. Clicking a card
 * selects it; clicking the canvas selects nothing. Given `editing`, cards and notes drag, pins wire, Tab asks for a
 * node, F or ⌘G frames the selection, a frame's title edits on a double-click, and Backspace deletes it. `overlay` draws over the canvas.
 */
export function NodeGraphCanvas({
  label,
  nodes,
  links,
  frames = [],
  notes = [],
  selectedNodeIds,
  onNodesSelected,
  editing = null,
  viewportWhereItWasLeft = null,
  onViewportLeft = null,
  onSubgraphOpened = null,
  codeOfTheCard = null,
  inputValues = null,
  overlay,
  ...controlDataAttributes
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  frames?: readonly NodeGraphCanvasFrame[];
  notes?: readonly NodeGraphCanvasNote[];
  /** The cards selected, the one picked last at the end. */
  selectedNodeIds: readonly string[];
  /** The cards selected after a click, a drag-box or a delete, the one picked last at the end; none when the selection was cleared. */
  onNodesSelected: (nodeIds: readonly string[]) => void;
  /** What a person's edits ask for; `null` draws the graph read only. */
  editing?: NodeGraphCanvasEditing | null;
  /** Where the person left the canvas's pan and zoom, which it opens on; `null` frames the whole graph. */
  viewportWhereItWasLeft?: NodeGraphCanvasViewport | null;
  /** Told where the person leaves the pan and zoom after each pan or zoom of theirs. */
  onViewportLeft?: ((viewport: NodeGraphCanvasViewport) => void) | null;
  /** Told when a person double-clicks a card that holds a subgraph, to step inside it; `null` steps nowhere. */
  onSubgraphOpened?: ((nodeId: string) => void) | null;
  /** Whether the card `nodeId`'s node type has code its right-click menu's Edit code opens; `null` offers no Edit code. */
  codeOfTheCard?: ((nodeId: string) => NodeGraphCardCode) | null;
  /** The frame's store of input values, which each unwired input's row shows its value from; `null` shows none. */
  inputValues?: InputValues | null;
  overlay?: ReactNode;
} & ControlDataAttributes) {
  return (
    <div className="relative min-h-0 flex-1" {...controlDataAttributes}>
      <NodeGraphInputValuesContext value={inputValues}>
      <ReactFlowProvider>
        <NodeGraphFlow
          label={label}
          nodes={nodes}
          links={links}
          frames={frames}
          notes={notes}
          selectedNodeIds={selectedNodeIds}
          onNodesSelected={onNodesSelected}
          editing={editing}
          viewportWhereItWasLeft={viewportWhereItWasLeft}
          onViewportLeft={onViewportLeft}
          onSubgraphOpened={onSubgraphOpened}
          codeOfTheCard={codeOfTheCard}
          overlay={overlay}
        />
      </ReactFlowProvider>
      </NodeGraphInputValuesContext>
    </div>
  );
}
