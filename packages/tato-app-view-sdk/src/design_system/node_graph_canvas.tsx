import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Connection, type EdgeChange, type FinalConnectionState, type NodeChange } from "@xyflow/react";
import { cn } from "cn";
import { Combine, Crosshair, Frame, Plus, Scan, Search, StickyNote, ZoomIn, ZoomOut } from "lucide-react";
import { ColourPickerDialog, isAHexColour } from "./colour_picker_dialog";
import { RightClickMenu } from "./menus";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { IconButton } from "./icon_button";
import { ToolbarDivider, ToolbarGroup } from "./toolbar";
import { StudioViewToolbarTools } from "./studio_area_frame";
import { NodeGraphFindBar, nodeGraphFindIndexAfterAStep, nodeGraphNodeIdsMatching, NodeGraphNodesFoundContext, NO_NODE_GRAPH_NODE_FOUND, type NodeGraphNodesFound } from "./node_graph_find_bar";
import { layOutNodeGraph, nodeGraphCardHeight, type NodeGraphPosition } from "./support/node_graph_layout";
import { isPartOfTheGraphOutsideTheView } from "./support/node_graph_map_visibility";
import { canPinsOfTheseFamiliesBeWired, frameACardIsLetGoIn, frameRectangleAroundCards, linkUnderACard, placeClearBelowTheCards, type NodeGraphLinkMidpoint } from "./support/node_graph_editing";
import { type NodeGraphPinFamily, type NodeGraphCanvasNode, type NodeGraphPortPicking, type NodeGraphCanvasFrame, NODE_GRAPH_FRAME_COLOURS, type NodeGraphCanvasNote, type NodeGraphCanvasLink, type NodeGraphCanvasPoint, type NodeGraphCanvasViewport, type NodeGraphCanvasCardMove, type NodeGraphCanvasEditing } from "./support/node_graph_canvas_contract";
import { failureWordsTheCardShows, NodeGraphCardView } from "./node_graph_card_view";
import { type NodeGraphCardFlowNode, type NodeGraphNoteFlowNode, type NodeGraphFrameFlowNode, type NodeGraphFlowNode, type NodeGraphLinkFlowEdge, inputPinHandleId, outputPinHandleId, NodeGraphSelectionContext, NodeGraphPortPickingContext, NodeGraphEditableContext, NodeGraphNoteEditingContext, NodeGraphNoteResizingContext, NodeGraphCardAndFrameEditingContext, NodeGraphFrameColoursUsedContext, NodeGraphFrameColourPickingContext, NodeGraphLinkedPinsContext, linkedPinKey, type NodeGraphFrameWordsBeingEdited, NodeGraphFrameWordsEditingContext } from "./support/node_graph_flow_elements";
import { type NodeGraphRightClicked, NodeGraphRightClickChoices } from "./node_graph_right_click_choices";
import { NodeGraphFrameView } from "./node_graph_frame_view";
import { NodeGraphNoteView } from "./node_graph_note_view";
import { NodeGraphLinkView } from "./node_graph_link_view";

/** How many colours other frames use beyond the presets a frame's menu offers again. */
const FRAME_COLOURS_USED_ELSEWHERE_OFFERED = 3;

/** The colours the canvas's frames use that no preset is, newest frame first, at most `FRAME_COLOURS_USED_ELSEWHERE_OFFERED`. */
function frameColoursUsedBeyondThePresets(frames: readonly NodeGraphCanvasFrame[]): readonly string[] {
  const presetColours = new Set(NODE_GRAPH_FRAME_COLOURS.map(({ colour }) => colour.toLowerCase()));
  const usedColours = frames.flatMap((frame) => (frame.colour === null || presetColours.has(frame.colour.toLowerCase()) ? [] : [frame.colour.toLowerCase()]));
  return [...new Set(usedColours.reverse())].slice(0, FRAME_COLOURS_USED_ELSEWHERE_OFFERED);
}

/** The room a card or note placed from a tool takes, so the view shows it whole. */
const NODE_GRAPH_PLACED_ROOM = { width: 240, height: 120 };

/** The narrowest a card is drawn; a card with longer names grows to fit them. */
const NODE_GRAPH_CARD_SMALLEST_WIDTH = 180;

const FIT_TO_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1, duration: 0 };

/** A pin's name and side from the handle id React Flow reports. */
function pinOfAHandleId(handleId: string | null | undefined): { side: "input" | "output"; pin: string } | null {
  if (handleId === null || handleId === undefined) return null;
  if (handleId.startsWith("input:")) return { side: "input", pin: handleId.slice("input:".length) };
  if (handleId.startsWith("output:")) return { side: "output", pin: handleId.slice("output:".length) };
  return null;
}

const noteFlowNodeId = (noteId: string) => `note:${noteId}`;

const frameFlowNodeId = (frameId: string) => `frame:${frameId}`;

const NODE_GRAPH_NODE_TYPES = { node_graph_card: memo(NodeGraphCardView), node_graph_note: memo(NodeGraphNoteView), node_graph_frame: memo(NodeGraphFrameView) };

const NODE_GRAPH_EDGE_TYPES = { node_graph_link: memo(NodeGraphLinkView) };

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

/** What decides where the cards with no saved place sit: the nodes, their pins and the links; a new one lays the graph out again. */
function nodeGraphShapeKey(
  nodes: readonly NodeGraphCanvasNode[],
  links: readonly NodeGraphCanvasLink[],
): string {
  return JSON.stringify([
    nodes.map((node) => [
      node.node_id,
      node.title,
      node.input_pins,
      node.output_pins,
      failureWordsTheCardShows(node) !== null,
    ]),
    links.map((link) => [
      link.source_node_id,
      link.source_pin,
      link.target_node_id,
      link.target_pin,
    ]),
  ]);
}

/** The cards' widths as drawn, read once React Flow has measured them for one shape of the graph. */
interface MeasuredCardWidths {
  shapeKey: string;
  widthByNode: Map<string, number>;
}

/** Where a card or note sits while it is dragged, or after it was let go until the graph shows it there or the edit is refused. */
type HeldPositionById = ReadonlyMap<string, NodeGraphPosition>;

/** A note's width and height on the canvas. */
type NodeGraphNoteSize = { width: number; height: number };

const samePosition = (first: NodeGraphPosition | null | undefined, second: NodeGraphPosition | null | undefined) =>
  first !== null && first !== undefined && second !== null && second !== undefined && first.x === second.x && first.y === second.y;

/** A card's or note's place on the whole canvas pixel an edit sends it to, so a held place matches the graph that shows it. */
const onTheCanvasPixel = (position: NodeGraphPosition): NodeGraphPosition => ({ x: Math.round(position.x), y: Math.round(position.y) });

/** A note's size in the whole canvas pixels an edit sends. */
const inCanvasPixels = (size: NodeGraphNoteSize): NodeGraphNoteSize => ({ width: Math.round(size.width), height: Math.round(size.height) });

const sameSize = (first: NodeGraphNoteSize, second: NodeGraphNoteSize | undefined) => second !== undefined && first.width === second.width && first.height === second.height;

/** `held` without the entries `isShown` says the graph now shows. */
function heldValuesNotShownYet<Held>(held: ReadonlyMap<string, Held>, isShown: (id: string, heldValue: Held) => boolean): ReadonlyMap<string, Held> {
  const stillHeld = [...held].filter(([id, heldValue]) => !isShown(id, heldValue));
  return stillHeld.length === held.size ? held : new Map(stillHeld);
}

/** `held` with each of `entries` set. */
function withEntriesSet<Held>(held: ReadonlyMap<string, Held>, entries: readonly { id: string; value: Held }[]): ReadonlyMap<string, Held> {
  const after = new Map(held);
  for (const { id, value } of entries) after.set(id, value);
  return after;
}

function withoutTheIds<Held>(held: ReadonlyMap<string, Held>, ids: readonly string[]): ReadonlyMap<string, Held> {
  if (!ids.some((id) => held.has(id))) return held;
  const after = new Map(held);
  for (const id of ids) after.delete(id);
  return after;
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
  portPicking,
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
  portPicking: NodeGraphPortPicking | null;
  overlay?: ReactNode;
}) {
  const reactFlow = useReactFlow();
  const [nodeAskingWhichPort, setNodeAskingWhichPort] = useState<string | null>(null);
  const portPickingOfTheCards = useMemo(
    () =>
      portPicking === null
        ? null
        : {
            portsThatCanJoinByNodeId: portPicking.portsThatCanJoinByNodeId,
            nodeAskingWhichPort,
            onPortChosen: (nodeId: string, port: string) => {
              setNodeAskingWhichPort(null);
              portPicking.onPicked(nodeId, port);
            },
            onAskWhichClosed: () => setNodeAskingWhichPort(null),
          },
    [portPicking, nodeAskingWhichPort],
  );
  useEffect(() => {
    if (portPicking === null) {
      setNodeAskingWhichPort(null);
      return;
    }
    const ownerDocument = canvasElement.current?.ownerDocument ?? document;
    const endThePickOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || nodeAskingWhichPort !== null) return;
      event.preventDefault();
      portPicking.onEnded();
    };
    ownerDocument.addEventListener("keydown", endThePickOnEscape);
    return () => ownerDocument.removeEventListener("keydown", endThePickOnEscape);
  }, [portPicking, nodeAskingWhichPort]);
  const pickTheCard = (nodeId: string) => {
    const portsThatCanJoin = portPicking?.portsThatCanJoinByNodeId.get(nodeId);
    if (portPicking === null || portsThatCanJoin === undefined) return;
    const [onlyPort] = portsThatCanJoin;
    if (portsThatCanJoin.length === 1 && onlyPort !== undefined) portPicking.onPicked(nodeId, onlyPort);
    else setNodeAskingWhichPort(nodeId);
  };
  const isTheMapShown = useStore(isPartOfTheGraphOutsideTheView);
  const canvasElement = useRef<HTMLDivElement>(null);
  const pointerRestsAt = useRef<NodeGraphCanvasPoint | null>(null);
  const [cardSizeByNode, setCardSizeByNode] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(new Map());
  const areCardsMeasured = nodes.every((node) =>
    node.saved_position !== null || cardSizeByNode.has(node.node_id),
  );
  const shapeKey = nodeGraphShapeKey(nodes, links);
  const [measuredCardWidths, setMeasuredCardWidths] =
    useState<MeasuredCardWidths | null>(null);
  const isLaidOutOnMeasuredWidths = measuredCardWidths?.shapeKey === shapeKey;
  const [hasBeenFramed, setHasBeenFramed] = useState(false);
  const [heldCardPositions, setHeldCardPositions] = useState<HeldPositionById>(new Map());
  const [heldCardFrames, setHeldCardFrames] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [heldNotePositions, setHeldNotePositions] = useState<HeldPositionById>(new Map());
  const [heldNoteSizes, setHeldNoteSizes] = useState<ReadonlyMap<string, NodeGraphNoteSize>>(new Map());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set(selectedNodeIds));
  const [selectedNoteIds, setSelectedNoteIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setSelectedIds((selectedBefore) => (holdsTheSameNodes(selectedBefore, selectedNodeIds) ? selectedBefore : new Set(selectedNodeIds)));
  }, [selectedNodeIds]);

  const savedPositionByNode = useMemo(() => new Map(nodes.map((node) => [node.node_id, node.saved_position])), [nodes]);
  useEffect(() => {
    setHeldCardPositions((held) => heldValuesNotShownYet(held, (nodeId, position) => samePosition(position, savedPositionByNode.get(nodeId))));
    setSelectedIds((selectedBefore) => {
      const stillInTheGraph = [...selectedBefore].filter((nodeId) => savedPositionByNode.has(nodeId));
      return stillInTheGraph.length === selectedBefore.size ? selectedBefore : new Set(stillInTheGraph);
    });
  }, [savedPositionByNode]);
  useEffect(() => {
    const frameIdByNode = new Map(nodes.map((node) => [node.node_id, node.frame_id]));
    setHeldCardFrames((held) => heldValuesNotShownYet(held, (nodeId, frameId) => !frameIdByNode.has(nodeId) || frameIdByNode.get(nodeId) === frameId));
  }, [nodes]);
  useEffect(() => {
    const noteById = new Map(notes.map((note) => [note.note_id, note]));
    setHeldNotePositions((held) => heldValuesNotShownYet(held, (noteId, position) => samePosition(position, noteById.get(noteId)?.position)));
    setHeldNoteSizes((held) => heldValuesNotShownYet(held, (noteId, size) => noteById.get(noteId) === undefined || sameSize(size, noteById.get(noteId)?.size)));
  }, [notes]);

  const laidOutPositionByNode: Map<string, NodeGraphPosition> = useMemo(
    () =>
      layOutNodeGraph(
        nodes.map((node) => ({
          node_id: node.node_id,
          input_pin_names: node.input_pins.map((pin) => pin.name),
          output_pin_names: node.output_pins.map((pin) => pin.name),
          shows_failure_words: failureWordsTheCardShows(node) !== null,
          is_collapsed: node.is_collapsed,
          card_width:
            (isLaidOutOnMeasuredWidths
              ? measuredCardWidths.widthByNode.get(node.node_id)
              : undefined) ?? NODE_GRAPH_CARD_SMALLEST_WIDTH,
        })),
        links,
      ),
    [nodes, links, isLaidOutOnMeasuredWidths, measuredCardWidths],
  );
  const positionOfTheCard = useCallback(
    (node: NodeGraphCanvasNode): NodeGraphPosition =>
      heldCardPositions.get(node.node_id) ?? node.saved_position ?? laidOutPositionByNode.get(node.node_id) ?? { x: 0, y: 0 },
    [heldCardPositions, laidOutPositionByNode],
  );
  const frameOfTheCard = useCallback((node: NodeGraphCanvasNode): string | null => (heldCardFrames.has(node.node_id) ? (heldCardFrames.get(node.node_id) ?? null) : node.frame_id), [heldCardFrames]);
  const sizeOfTheCard = useCallback(
    (node: NodeGraphCanvasNode) =>
      cardSizeByNode.get(node.node_id) ?? {
        width: NODE_GRAPH_CARD_SMALLEST_WIDTH,
        height: nodeGraphCardHeight({ input_pin_names: node.input_pins.map((pin) => pin.name), output_pin_names: node.output_pins.map((pin) => pin.name), shows_failure_words: failureWordsTheCardShows(node) !== null, is_collapsed: node.is_collapsed }),
      },
    [cardSizeByNode],
  );

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
      const size = heldNoteSizes.get(graphNote.note_id) ?? graphNote.size;
      return {
        id: noteFlowNodeId(graphNote.note_id),
        type: "node_graph_note",
        position: heldNotePositions.get(graphNote.note_id) ?? graphNote.position,
        width: size.width,
        height: size.height,
        data: { graphNote },
        selected: selectedNoteIds.has(graphNote.note_id),
        draggable: editing !== null,
        selectable: editing !== null,
        connectable: false,
        ariaLabel: `Note ${graphNote.text}`,
      };
    });
    const cardNodes: NodeGraphCardFlowNode[] = nodes.map((graphNode) => ({
      id: graphNode.node_id,
      type: "node_graph_card",
      position: positionOfTheCard(graphNode),
      measured: cardSizeByNode.get(graphNode.node_id),
      selected: selectedIds.has(graphNode.node_id),
      data: { graphNode },
      draggable: editing !== null,
      connectable: editing !== null,
      ariaLabel: `Node ${graphNode.title}`,
    }));
    return [...frameNodes, ...noteNodes, ...cardNodes];
  }, [frames, notes, nodes, editing, positionOfTheCard, frameOfTheCard, sizeOfTheCard, cardSizeByNode, heldNotePositions, heldNoteSizes, selectedIds, selectedNoteIds]);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.node_id, node])),
    [nodes],
  );
  const linkedPins = useMemo(
    () =>
      new Set(
        flowEdgesJoining(links, nodeById).flatMap((graphLink) => [
          linkedPinKey(
            graphLink.source_node_id,
            "output",
            graphLink.source_pin,
          ),
          linkedPinKey(graphLink.target_node_id, "input", graphLink.target_pin),
        ]),
      ),
    [links, nodeById],
  );
  const [selectedLinkIds, setSelectedLinkIds] = useState<ReadonlySet<string>>(new Set());
  const flowEdges: NodeGraphLinkFlowEdge[] = useMemo(
    () =>
      flowEdgesJoining(links, nodeById).map((graphLink) => ({
        id: graphLink.link_id,
        type: "node_graph_link",
        source: graphLink.source_node_id,
        sourceHandle: outputPinHandleId(graphLink.source_pin),
        target: graphLink.target_node_id,
        targetHandle: inputPinHandleId(graphLink.target_pin),
        data: {
          graphLink,
          family:
            nodeById
              .get(graphLink.source_node_id)
              ?.output_pins.find((pin) => pin.name === graphLink.source_pin)
              ?.family ?? null,
        },
        focusable: editing !== null,
        selectable: editing !== null,
        selected: selectedLinkIds.has(graphLink.link_id),
      })),
    [links, nodeById, editing, selectedLinkIds],
  );

  useEffect(() => {
    if (!areCardsMeasured || isLaidOutOnMeasuredWidths) return;
    const widthByNode = new Map(
      nodes.map((node) => [
        node.node_id,
        cardSizeByNode.get(node.node_id)?.width ??
          NODE_GRAPH_CARD_SMALLEST_WIDTH,
      ]),
    );
    setMeasuredCardWidths({ shapeKey, widthByNode });
  }, [
    areCardsMeasured,
    isLaidOutOnMeasuredWidths,
    nodes,
    cardSizeByNode,
    shapeKey,
  ]);

  useEffect(() => {
    if (!isLaidOutOnMeasuredWidths || hasBeenFramed) return;
    if (viewportWhereItWasLeft === null) void reactFlow.fitView(FIT_TO_VIEW_OPTIONS);
    else void reactFlow.setViewport(viewportWhereItWasLeft);
    setHasBeenFramed(true);
  }, [isLaidOutOnMeasuredWidths, hasBeenFramed, reactFlow, viewportWhereItWasLeft]);

  const followTheChanges = useCallback(
    (changes: NodeChange<NodeGraphFlowNode>[]) => {
      const measuredChanges = changes.flatMap((change) =>
        change.type === "dimensions" && change.dimensions !== undefined && nodeById.has(change.id)
          ? [{ id: change.id, size: change.dimensions }]
          : [],
      );
      if (measuredChanges.length > 0) {
        setCardSizeByNode((sizesBefore) => {
          const sizesAfter = new Map(sizesBefore);
          for (const { id, size } of measuredChanges) sizesAfter.set(id, size);
          return sizesAfter;
        });
      }
      const draggedCards = changes.flatMap((change) => (change.type === "position" && change.position !== undefined && nodeById.has(change.id) ? [{ id: change.id, value: onTheCanvasPixel(change.position) }] : []));
      if (draggedCards.length > 0) setHeldCardPositions((held) => withEntriesSet(held, draggedCards));
      const movedNotes = changes.flatMap((change) =>
        change.type === "position" && change.position !== undefined && change.id.startsWith("note:") ? [{ id: change.id.slice("note:".length), value: onTheCanvasPixel(change.position) }] : [],
      );
      if (movedNotes.length > 0) setHeldNotePositions((held) => withEntriesSet(held, movedNotes));
      const resizedNotes = changes.flatMap((change) =>
        change.type === "dimensions" && change.dimensions !== undefined && change.resizing === true && change.id.startsWith("note:") ? [{ id: change.id.slice("note:".length), value: inCanvasPixels(change.dimensions) }] : [],
      );
      if (resizedNotes.length > 0) setHeldNoteSizes((held) => withEntriesSet(held, resizedNotes));
      const noteSelectionChanges = changes.flatMap((change) => (change.type === "select" && change.id.startsWith("note:") ? [change] : []));
      if (noteSelectionChanges.length > 0) {
        setSelectedNoteIds((selectedBefore) => {
          const selectedAfter = new Set(selectedBefore);
          for (const change of noteSelectionChanges) {
            if (change.selected) selectedAfter.add(change.id.slice("note:".length));
            else selectedAfter.delete(change.id.slice("note:".length));
          }
          return selectedAfter;
        });
      }
      const selectionChanges = changes.flatMap((change) => (change.type === "select" && nodeById.has(change.id) ? [change] : []));
      if (selectionChanges.length > 0) {
        const selectedAfter = new Set(selectedIds);
        for (const change of selectionChanges) {
          if (change.selected) selectedAfter.add(change.id);
          else selectedAfter.delete(change.id);
        }
        if (holdsTheSameNodes(selectedIds, [...selectedAfter])) return;
        setSelectedIds(selectedAfter);
        const clickedLast = [...selectionChanges].reverse().find((change) => change.selected)?.id ?? null;
        onNodesSelected(clickedLast === null ? [...selectedAfter] : [...[...selectedAfter].filter((nodeId) => nodeId !== clickedLast), clickedLast]);
      }
    },
    [onNodesSelected, nodeById, selectedIds, editing],
  );

  const followTheLinkChanges = useCallback((changes: EdgeChange<NodeGraphLinkFlowEdge>[]) => {
    const selectionChanges = changes.flatMap((change) => (change.type === "select" ? [change] : []));
    if (selectionChanges.length === 0) return;
    setSelectedLinkIds((selectedBefore) => {
      const selectedAfter = new Set(selectedBefore);
      for (const change of selectionChanges) {
        if (change.selected) selectedAfter.add(change.id);
        else selectedAfter.delete(change.id);
      }
      return selectedAfter;
    });
  }, []);

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
        ...notes.map((note) => ({ position: heldNotePositions.get(note.note_id) ?? note.position, ...(heldNoteSizes.get(note.note_id) ?? note.size) })),
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
  }, [middleOfTheView, nodes, notes, heldNotePositions, heldNoteSizes, positionOfTheCard, sizeOfTheCard, reactFlow]);

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
          if (answer === "refused") setHeldNotePositions((held) => withoutTheIds(held, [noteId]));
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
      setHeldCardPositions((held) => withEntriesSet(held, moves.map((move) => ({ id: move.node_id, value: move.position }))));
      setHeldCardFrames((held) => withEntriesSet(held, moves.map((move) => ({ id: move.node_id, value: move.frame_id }))));
      void editing.onCardsMoved(moves, onlyCard === undefined || linkLetGoOver === null ? null : { node_id: onlyCard.id, link_id: linkLetGoOver }).then((answer) => {
        if (answer !== "refused") return;
        setHeldCardPositions((held) => withoutTheIds(held, movedIds));
        setHeldCardFrames((held) => withoutTheIds(held, movedIds));
      });
    },
    [editing, nodeById, nodes, links, frames, positionOfTheCard, frameOfTheCard, sizeOfTheCard, linkMidpointsDrawn],
  );

  const keepTheResizedNote = useCallback(
    (noteId: string, resized: NodeGraphPosition & NodeGraphNoteSize) => {
      if (editing === null) return;
      const position = onTheCanvasPixel(resized);
      const size = inCanvasPixels(resized);
      setHeldNotePositions((held) => withEntriesSet(held, [{ id: noteId, value: position }]));
      setHeldNoteSizes((held) => withEntriesSet(held, [{ id: noteId, value: size }]));
      void editing.onNoteChanged(noteId, { position, size }).then((answer) => {
        if (answer !== "refused") return;
        setHeldNotePositions((held) => withoutTheIds(held, [noteId]));
        setHeldNoteSizes((held) => withoutTheIds(held, [noteId]));
      });
    },
    [editing],
  );

  const pinFamilyOf = useCallback(
    (nodeId: string, side: "input" | "output", pinName: string): NodeGraphPinFamily | null => {
      const graphNode = nodeById.get(nodeId);
      return (side === "input" ? graphNode?.input_pins : graphNode?.output_pins)?.find((pin) => pin.name === pinName)?.family ?? null;
    },
    [nodeById],
  );
  const canTheConnectionBeWired = useCallback(
    (connection: Connection | NodeGraphLinkFlowEdge) => {
      const source = pinOfAHandleId(connection.sourceHandle);
      const target = pinOfAHandleId(connection.targetHandle);
      if (source?.side !== "output" || target?.side !== "input") return false;
      return canPinsOfTheseFamiliesBeWired(pinFamilyOf(connection.source, "output", source.pin), pinFamilyOf(connection.target, "input", target.pin));
    },
    [pinFamilyOf],
  );
  const wireThePins = useCallback(
    (connection: Connection) => {
      const source = pinOfAHandleId(connection.sourceHandle);
      const target = pinOfAHandleId(connection.targetHandle);
      if (editing === null || source === null || target === null) return;
      editing.onPinsWired({ node_id: connection.source, pin: source.pin }, { node_id: connection.target, pin: target.pin });
    },
    [editing],
  );
  const followTheWireLetGo = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (editing === null || connectionState.isValid === true || connectionState.toNode !== null || connectionState.fromHandle === null) return;
      const pin = pinOfAHandleId(connectionState.fromHandle.id);
      if (pin === null) return;
      const clientPoint = "changedTouches" in event ? event.changedTouches[0] : event;
      if (clientPoint === undefined) return;
      editing.onWireLetGoOverTheCanvas(
        { node_id: connectionState.fromHandle.nodeId, pin: pin.pin, side: pin.side, family: pinFamilyOf(connectionState.fromHandle.nodeId, pin.side, pin.pin) },
        canvasPointOf({ x: clientPoint.clientX, y: clientPoint.clientY }),
      );
    },
    [editing, pinFamilyOf, canvasPointOf],
  );

  const [frameWordsBeingEdited, setFrameWordsBeingEdited] = useState<NodeGraphFrameWordsBeingEdited | null>(null);
  const frameIdsWhenAFrameWasAskedFor = useRef<ReadonlySet<string> | null>(null);
  const titleTypedWhileTheFrameIsMade = useRef({ typed: "", isEntered: false });
  const frameTheSelection = useCallback(() => {
    if (editing === null) return;
    const frameIdsBefore = new Set(frames.map((frame) => frame.frame_id));
    frameIdsWhenAFrameWasAskedFor.current = frameIdsBefore;
    titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: false };
    void editing.onFrameAskedFor([...selectedIds]).then((answer) => {
      if (answer === "refused" && frameIdsWhenAFrameWasAskedFor.current === frameIdsBefore) frameIdsWhenAFrameWasAskedFor.current = null;
    });
  }, [editing, frames, selectedIds]);
  useEffect(() => {
    const frameIdsBefore = frameIdsWhenAFrameWasAskedFor.current;
    if (frameIdsBefore === null) return;
    const newFrame = frames.find((frame) => !frameIdsBefore.has(frame.frame_id));
    if (newFrame === undefined) return;
    frameIdsWhenAFrameWasAskedFor.current = null;
    const { typed, isEntered } = titleTypedWhileTheFrameIsMade.current;
    titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: false };
    const typedTitle = typed.trim();
    if (isEntered && typedTitle !== "") {
      editing?.onFrameChanged(newFrame.frame_id, { title: typedTitle });
      return;
    }
    if (isEntered) return;
    setFrameWordsBeingEdited({ frame_id: newFrame.frame_id, field: "title", ...(typed === "" ? {} : { typed_ahead: typed }) });
  }, [frames, editing]);
  const frameWordsEditing = useMemo(() => ({ frameWordsBeingEdited, editTheFrameWords: setFrameWordsBeingEdited }), [frameWordsBeingEdited]);
  const [frameIdWhoseColourIsPicked, setFrameIdWhoseColourIsPicked] = useState<string | null>(null);
  const frameWhoseColourIsPicked = frames.find((frame) => frame.frame_id === frameIdWhoseColourIsPicked) ?? null;
  const frameColoursUsed = useMemo(() => frameColoursUsedBeyondThePresets(frames), [frames]);
  const cardAndFrameEditing = useMemo(
    () => (editing === null ? null : { onFrameChanged: editing.onFrameChanged, onFrameRemoved: editing.onFrameRemoved, onCardCollapsed: editing.onCardCollapsed }),
    [editing],
  );

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
    setSelectedLinkIds(new Set());
    setSelectedNoteIds(new Set());
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      onNodesSelected([]);
    }
  }, [editing, selectedIds, selectedLinkIds, selectedNoteIds, onNodesSelected]);
  const [nodeFind, setNodeFind] = useState<{ find_words: string; current_index: number } | null>(null);
  const nodeIdsFound = useMemo(() => (nodeFind === null ? [] : nodeGraphNodeIdsMatching(nodes, nodeFind.find_words)), [nodes, nodeFind]);
  const currentNodeIdFound = nodeFind === null ? null : (nodeIdsFound[Math.min(nodeFind.current_index, nodeIdsFound.length - 1)] ?? null);
  const nodesFound = useMemo<NodeGraphNodesFound>(
    () => (nodeFind === null ? NO_NODE_GRAPH_NODE_FOUND : { found_node_ids: new Set(nodeIdsFound), current_node_id: currentNodeIdFound }),
    [nodeFind, nodeIdsFound, currentNodeIdFound],
  );
  useEffect(() => {
    if (currentNodeIdFound !== null) void reactFlow.fitView({ nodes: [{ id: currentNodeIdFound }], minZoom: reactFlow.getZoom(), maxZoom: reactFlow.getZoom(), duration: 200 });
  }, [currentNodeIdFound, reactFlow]);
  const openTheNodeFind = useCallback(() => setNodeFind((findSoFar) => findSoFar ?? { find_words: "", current_index: 0 }), []);
  const closeTheNodeFind = useCallback(() => {
    setNodeFind(null);
    canvasElement.current?.focus({ preventScroll: true });
  }, []);
  const [rightClicked, setRightClicked] = useState<NodeGraphRightClicked | null>(null);
  const followTheRightClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const flowNodeId = target?.closest<HTMLElement>(".react-flow__node")?.dataset["id"];
      const linkId = target?.closest<SVGGElement>("[data-node-graph-link]")?.dataset["nodeGraphLink"];
      if (flowNodeId !== undefined && nodeById.has(flowNodeId)) {
        if (!selectedIds.has(flowNodeId)) {
          setSelectedIds(new Set([flowNodeId]));
          setSelectedLinkIds(new Set());
          setSelectedNoteIds(new Set());
          onNodesSelected([flowNodeId]);
        }
        setRightClicked({ kind: "card", node_id: flowNodeId });
      } else if (flowNodeId?.startsWith("note:") === true && editing !== null) {
        const noteId = flowNodeId.slice("note:".length);
        if (!selectedNoteIds.has(noteId)) {
          setSelectedNoteIds(new Set([noteId]));
          setSelectedLinkIds(new Set());
          if (selectedIds.size > 0) {
            setSelectedIds(new Set());
            onNodesSelected([]);
          }
        }
        setRightClicked({ kind: "note", note_id: noteId });
      } else if (linkId !== undefined && editing !== null) {
        if (!selectedLinkIds.has(linkId)) {
          setSelectedLinkIds(new Set([linkId]));
          setSelectedNoteIds(new Set());
          if (selectedIds.size > 0) {
            setSelectedIds(new Set());
            onNodesSelected([]);
          }
        }
        setRightClicked({ kind: "link", link_id: linkId });
      } else {
        setRightClicked({ kind: "canvas", at: canvasPointOf({ x: event.clientX, y: event.clientY }) });
      }
    },
    [nodeById, selectedIds, selectedLinkIds, selectedNoteIds, editing, onNodesSelected, canvasPointOf],
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
      const titleTyped = titleTypedWhileTheFrameIsMade.current;
      if (frameIdsWhenAFrameWasAskedFor.current !== null && !titleTyped.isEntered && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key.length === 1) titleTyped.typed += event.key;
        else if (event.key === "Backspace") titleTyped.typed = titleTyped.typed.slice(0, -1);
        else if (event.key === "Enter") titleTyped.isEntered = true;
        else if (event.key === "Escape") titleTypedWhileTheFrameIsMade.current = { typed: "", isEntered: true };
        if (event.key.length === 1 || event.key === "Backspace" || event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          return;
        }
      }
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
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedIds.size === 0 && selectedLinkIds.size === 0 && selectedNoteIds.size === 0) return;
        event.preventDefault();
        deleteTheSelection();
      }
    },
    [editing, middleOfTheView, selectedIds, selectedLinkIds, selectedNoteIds, frameTheSelection, collapseTheSelectionIntoASubgraph, deleteTheSelection, openTheNodeFind],
  );

  return (
    <NodeGraphSelectionContext value={selectedIds}>
    <NodeGraphPortPickingContext value={portPickingOfTheCards}>
      <NodeGraphEditableContext value={editing !== null}>
        <NodeGraphNoteEditingContext value={editing?.onNoteChanged ?? null}>
        <NodeGraphNoteResizingContext value={editing === null ? null : keepTheResizedNote}>
          <NodeGraphCardAndFrameEditingContext value={cardAndFrameEditing}>
            <NodeGraphFrameWordsEditingContext value={frameWordsEditing}>
            <NodeGraphFrameColoursUsedContext value={frameColoursUsed}>
            <NodeGraphFrameColourPickingContext value={setFrameIdWhoseColourIsPicked}>
          <NodeGraphLinkedPinsContext value={linkedPins}>
          <NodeGraphNodesFoundContext value={nodesFound}>
            <div className="flex size-full flex-col">
            <StudioViewToolbarTools label={`${label} tools`}>
              {editing !== null && (
                <>
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
              }}
              data-node-graph-editable={editing !== null || undefined}
            >
              {portPicking !== null && (
                <div className="pointer-events-none absolute top-2 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-2xs whitespace-nowrap text-on-brand" role="status" data-node-graph-port-pick-banner="">
                  <Crosshair className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 truncate">{portPicking.words} · Esc ends the pick</span>
                </div>
              )}
              {nodeFind !== null && (
                <NodeGraphFindBar
                  findWords={nodeFind.find_words}
                  onFindWordsChanged={(findWords) => setNodeFind({ find_words: findWords, current_index: 0 })}
                  currentIndex={Math.max(0, nodeIdsFound.indexOf(currentNodeIdFound ?? ""))}
                  matchCount={nodeIdsFound.length}
                  onStepped={(step) => setNodeFind((findSoFar) => (findSoFar === null ? null : { ...findSoFar, current_index: nodeGraphFindIndexAfterAStep(findSoFar.current_index, nodeIdsFound.length, step) }))}
                  onClosed={closeTheNodeFind}
                />
              )}
              <ReactFlow<NodeGraphFlowNode, NodeGraphLinkFlowEdge>
                aria-label={label}
                className={cn(
                  "node-graph-canvas",
                  !isLaidOutOnMeasuredWidths && !hasBeenFramed && "opacity-0",
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
                onNodeClick={(_event, flowNode) => {
                  if (portPicking !== null && flowNode.type === "node_graph_card") pickTheCard(flowNode.id);
                }}
                onNodeDoubleClick={(_event, flowNode) => {
                  if (flowNode.type === "node_graph_card" && (nodeById.get(flowNode.id)?.subgraph ?? null) !== null) onSubgraphOpened?.(flowNode.id);
                }}
                onConnect={wireThePins}
                onConnectEnd={followTheWireLetGo}
                isValidConnection={canTheConnectionBeWired}
                onPaneClick={() => {
                  if (portPicking !== null) {
                    setNodeAskingWhichPort(null);
                    return;
                  }
                  onNodesSelected([]);
                  setSelectedLinkIds(new Set());
                  setSelectedNoteIds(new Set());
                  setSelectedIds(new Set());
                }}
                nodesDraggable={editing !== null}
                nodesConnectable={editing !== null}
                edgesFocusable={editing !== null}
                elementsSelectable={portPicking === null}
                deleteKeyCode={null}
                selectionKeyCode={editing === null ? null : "Shift"}
                multiSelectionKeyCode={editing === null ? null : ["Meta", "Control"]}
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
            </div>
            </RightClickMenu>
            </div>
          </NodeGraphNodesFoundContext>
          </NodeGraphLinkedPinsContext>
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
      </NodeGraphEditableContext>
    </NodeGraphPortPickingContext>
    </NodeGraphSelectionContext>
  );
}

/** Whether `selectedIds` holds exactly the nodes of `nodeIds`, in any order. */
function holdsTheSameNodes(selectedIds: ReadonlySet<string>, nodeIds: readonly string[]): boolean {
  return selectedIds.size === nodeIds.length && nodeIds.every((nodeId) => selectedIds.has(nodeId));
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
  portPicking = null,
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
  /** The port being picked, which lights the nodes that can join and dims the rest; `null` while none is. */
  portPicking?: NodeGraphPortPicking | null;
  overlay?: ReactNode;
} & ControlDataAttributes) {
  return (
    <div className="relative min-h-0 flex-1" {...controlDataAttributes}>
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
          portPicking={portPicking}
          overlay={overlay}
        />
      </ReactFlowProvider>
    </div>
  );
}
