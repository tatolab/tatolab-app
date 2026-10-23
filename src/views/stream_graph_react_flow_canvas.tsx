// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  streamGraphLinkLabelClauses,
  streamGraphLinkTone,
  type StreamGraphLinkTone,
  type StreamGraphCanvas,
  type StreamGraphLinkLine,
  type StreamGraphStepCard,
} from "../presentation/stream_graph_canvas_presentation";
import type { StreamGraphStepPosition } from "../presentation/stream_graph_step_layout";
import { joinClassNames } from "./shadcn/class_names";
import { StreamGraphStepCardView, type StreamGraphStepCardSurroundings } from "./stream_graph_step_card_view";

type StreamGraphStepFlowNode = Node<{ step: StreamGraphStepCard }, "stream_graph_step">;
type StreamGraphLinkFlowEdge = Edge<{ link: StreamGraphLinkLine }, "stream_graph_link">;

const FIT_TO_VIEW_OPTIONS = { padding: 0.14, maxZoom: 1, duration: 250 };
/** Below this the cards' words get too small to read, so the canvas opens at it, from the left, and pans instead. */
const SMALLEST_OPENING_ZOOM = 0.85;
const OPENING_VIEW_MARGIN = 48;

const portHandleId = (portSide: "input" | "output", portName: string) => `${portSide}:${portName}`;

/** What every card and line on the canvas reads, so a hover or a toggle redraws them without rebuilding the graph. */
interface StreamGraphCanvasSurroundings extends Omit<StreamGraphStepCardSurroundings, "isSelected" | "renderPortHandle"> {
  selectedStepName: string | null;
  hoveredLinkId: string | null;
}

const StreamGraphCanvasSurroundingsContext = createContext<StreamGraphCanvasSurroundings | null>(null);

function useStreamGraphCanvasSurroundings(): StreamGraphCanvasSurroundings | null {
  return useContext(StreamGraphCanvasSurroundingsContext);
}

function StepFlowNodeView({ data }: NodeProps<StreamGraphStepFlowNode>) {
  const surroundings = useStreamGraphCanvasSurroundings();
  if (surroundings === null) return null;
  const isSelected = surroundings.selectedStepName === data.step.name;
  return (
    <StreamGraphStepCardView
      step={data.step}
      surroundings={{
        ...surroundings,
        isSelected,
        renderPortHandle: (portSide, portName) => (
          <Handle
            type={portSide === "input" ? "target" : "source"}
            position={portSide === "input" ? Position.Left : Position.Right}
            id={portHandleId(portSide, portName)}
            isConnectable={false}
            className={joinClassNames(
              "h-[10px]! min-h-0! w-[3px]! min-w-0! rounded-[1px]! border-0!",
              portSide === "input" ? "-left-px!" : "-right-px!",
              isSelected ? "bg-brand!" : "bg-fg-4!",
            )}
          />
        ),
      }}
    />
  );
}

const LINK_STROKE_COLOUR_BY_TONE: Record<StreamGraphLinkTone, string> = {
  failed: "var(--danger)",
  dropping: "var(--warn)",
  selected: "var(--brand)",
  neutral: "var(--fg-4)",
};

function LinkFlowEdgeView({ id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps<StreamGraphLinkFlowEdge>) {
  const surroundings = useStreamGraphCanvasSurroundings();
  const [linePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 });
  if (surroundings === null || data === undefined) return null;
  const { link } = data;
  const tone = streamGraphLinkTone(link, surroundings.selectedStepName, surroundings.areCountersShown);
  const isHovered = surroundings.hoveredLinkId === id;
  const labelClauses = streamGraphLinkLabelClauses(link, surroundings.areCountersShown);
  return (
    <>
      <BaseEdge
        id={id}
        path={linePath}
        interactionWidth={18}
        style={{
          stroke: LINK_STROKE_COLOUR_BY_TONE[tone],
          // A failed line is wider as well as red, so it does not read by its colour alone.
          strokeWidth: tone === "failed" ? 2.5 : isHovered || tone !== "neutral" ? 1.75 : 1.25,
          strokeDasharray: link.look === "wired" || link.look === "error" ? undefined : "4 4",
          opacity: link.look === "ending" ? 0.6 : 1,
        }}
      />
      {(isHovered || labelClauses.length > 0) && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={joinClassNames(
              "nodrag nopan pointer-events-none absolute flex h-5 items-center gap-1.5 rounded-md border bg-popover px-1.5 font-mono text-[11px] whitespace-nowrap tabular-nums",
              isHovered ? "border-line-strong shadow-[var(--shadow-pop)]" : "border-line",
            )}
            data-stream-graph-link-label={link.linkId}
          >
            {isHovered && link.look !== "error" && <span className="text-fg-2">{link.stateSentence}</span>}
            {labelClauses.map((labelClause) => (
              <span key={labelClause.emphasis} className={labelClause.emphasis === "failure" ? "text-danger-text" : "text-warn-text"}>
                {labelClause.words}
              </span>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const STREAM_GRAPH_NODE_TYPES = { stream_graph_step: memo(StepFlowNodeView) };
const STREAM_GRAPH_EDGE_TYPES = { stream_graph_link: memo(LinkFlowEdgeView) };

/** Holds the canvas's viewport for the toolbar beside it; the graph tab is drawn inside it. */
export function StreamGraphCanvasProvider({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

/** The commands that move the canvas's viewport, the same object for as long as the canvas lives. */
export interface StreamGraphViewportCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToActualSize: () => void;
  fitToView: () => void;
}

/** The canvas's viewport commands, for the toolbar and the F key. */
export function useStreamGraphViewportCommands(): StreamGraphViewportCommands {
  const reactFlow = useReactFlow();
  return useMemo(
    () => ({
      zoomIn: () => void reactFlow.zoomIn({ duration: 150 }),
      zoomOut: () => void reactFlow.zoomOut({ duration: 150 }),
      zoomToActualSize: () => void reactFlow.zoomTo(1, { duration: 200 }),
      fitToView: () => void reactFlow.fitView(FIT_TO_VIEW_OPTIONS),
    }),
    [reactFlow],
  );
}

/** The canvas's zoom as a whole percentage, re-rendering the caller as it changes. */
export function useStreamGraphZoomPercent(): number {
  return useStore((flowState) => Math.round(flowState.transform[2] * 100));
}

/**
 * Frames the canvas once its cards are measured: the whole graph when it fits at a readable zoom, otherwise the
 * smallest readable zoom from its left edge, centred top to bottom while it fits.
 */
function useOpeningViewOnceMeasured(): void {
  const reactFlow = useReactFlow();
  const areCardsMeasured = useNodesInitialized();
  const canvasWidth = useStore((flowState) => flowState.width);
  const canvasHeight = useStore((flowState) => flowState.height);
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (hasOpened || !areCardsMeasured || canvasWidth === 0 || canvasHeight === 0) return;
    setHasOpened(true);
    const graphBounds = reactFlow.getNodesBounds(reactFlow.getNodes());
    // The zoom fitView would choose: React Flow pads the graph by its padding fraction on each axis.
    const fittingZoom = Math.min(
      canvasWidth / Math.max(1, graphBounds.width * (1 + FIT_TO_VIEW_OPTIONS.padding)),
      canvasHeight / Math.max(1, graphBounds.height * (1 + FIT_TO_VIEW_OPTIONS.padding)),
      FIT_TO_VIEW_OPTIONS.maxZoom,
    );
    if (fittingZoom >= SMALLEST_OPENING_ZOOM) {
      void reactFlow.fitView({ ...FIT_TO_VIEW_OPTIONS, duration: 0 });
      return;
    }
    const scaledHeight = graphBounds.height * SMALLEST_OPENING_ZOOM;
    void reactFlow.setViewport({
      x: OPENING_VIEW_MARGIN - graphBounds.x * SMALLEST_OPENING_ZOOM,
      y:
        scaledHeight > canvasHeight - OPENING_VIEW_MARGIN * 2
          ? OPENING_VIEW_MARGIN - graphBounds.y * SMALLEST_OPENING_ZOOM
          : canvasHeight / 2 - (graphBounds.y + graphBounds.height / 2) * SMALLEST_OPENING_ZOOM,
      zoom: SMALLEST_OPENING_ZOOM,
    });
  }, [hasOpened, areCardsMeasured, canvasWidth, canvasHeight, reactFlow]);
}

/** What the canvas draws and how a person's hand on it reaches the tab around it. */
export interface StreamGraphReactFlowCanvasProps extends Omit<StreamGraphCanvasSurroundings, "hoveredLinkId"> {
  canvas: StreamGraphCanvas;
  stepPositions: ReadonlyMap<string, StreamGraphStepPosition>;
  onStepSelected: (stepName: string | null) => void;
  onStepMoved: (stepName: string, position: StreamGraphStepPosition) => void;
  /** A person began to pan or zoom, which closes a hover preview left behind. */
  onViewportMoveStarted: () => void;
}

/** A stream's steps as cards and its links as lines on a pannable, zoomable canvas with a minimap. */
export function StreamGraphReactFlowCanvas({ canvas, stepPositions, onStepSelected, onStepMoved, onViewportMoveStarted, ...surroundings }: StreamGraphReactFlowCanvasProps) {
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<StreamGraphStepFlowNode[]>([]);

  useEffect(() => {
    setFlowNodes((shownNodes) =>
      canvas.steps.map((step) => {
        const shownNode = shownNodes.find((node) => node.id === step.name);
        return {
          id: step.name,
          type: "stream_graph_step",
          // A card held mid-drag stays under the pointer when a new reading of the graph arrives.
          position: shownNode?.dragging === true ? shownNode.position : (stepPositions.get(step.name) ?? { x: 0, y: 0 }),
          data: { step },
          draggable: true,
          focusable: !step.isInAnotherStream,
          ariaLabel: step.isInAnotherStream ? `${step.name}, in another stream` : `${step.name}, ${step.stateWord}${step.origin === null ? "" : `, ${step.origin}`}`,
          measured: shownNode?.measured,
          dragging: shownNode?.dragging,
        };
      }),
    );
  }, [canvas, stepPositions]);

  const flowEdges = useMemo<StreamGraphLinkFlowEdge[]>(
    () =>
      canvas.links.map((link) => ({
        id: link.linkId === "" ? `${link.sourceStepName}.${link.sourcePortName}>${link.targetStepName}.${link.targetPortName}` : link.linkId,
        type: "stream_graph_link",
        source: link.sourceStepName,
        sourceHandle: portHandleId("output", link.sourcePortName),
        target: link.targetStepName,
        targetHandle: portHandleId("input", link.targetPortName),
        data: { link },
      })),
    [canvas],
  );

  // Selection is the tab's, so only measuring and dragging change the nodes here.
  const onNodesChange = useCallback((nodeChanges: NodeChange<StreamGraphStepFlowNode>[]) => {
    setFlowNodes((shownNodes) => applyNodeChanges(nodeChanges.filter((nodeChange) => nodeChange.type === "dimensions" || nodeChange.type === "position"), shownNodes));
  }, []);

  const canvasSurroundings: StreamGraphCanvasSurroundings = { ...surroundings, hoveredLinkId };
  useOpeningViewOnceMeasured();

  return (
    <StreamGraphCanvasSurroundingsContext.Provider value={canvasSurroundings}>
      <ReactFlow<StreamGraphStepFlowNode, StreamGraphLinkFlowEdge>
        className="stream-graph-canvas"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={STREAM_GRAPH_NODE_TYPES}
        edgeTypes={STREAM_GRAPH_EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={(_, clickedNode) => onStepSelected(clickedNode.data.step.isInAnotherStream ? null : clickedNode.id)}
        onNodeDragStop={(_, draggedNode) => onStepMoved(draggedNode.id, draggedNode.position)}
        onPaneClick={() => onStepSelected(null)}
        onKeyDown={(keyboardEvent) => {
          // React Flow focuses a card's node wrapper; Enter or Space selects that step.
          if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
          const focusedNodeId = keyboardEvent.target instanceof HTMLElement && keyboardEvent.target.classList.contains("react-flow__node") ? keyboardEvent.target.dataset.id : undefined;
          const focusedStep = canvas.steps.find((step) => step.name === focusedNodeId);
          if (focusedStep === undefined || focusedStep.isInAnotherStream) return;
          keyboardEvent.preventDefault();
          onStepSelected(focusedStep.name);
        }}
        onEdgeMouseEnter={(_, hoveredEdge) => setHoveredLinkId(hoveredEdge.id)}
        onEdgeMouseLeave={() => setHoveredLinkId(null)}
        onMoveStart={(moveEvent) => {
          // A fit or zoom the window itself runs arrives with no event, and leaves a hover preview open.
          if (moveEvent !== null) onViewportMoveStarted();
        }}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background id="minor" variant={BackgroundVariant.Lines} gap={24} lineWidth={1} color="color-mix(in srgb, var(--line) 38%, transparent)" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={120} lineWidth={1} color="color-mix(in srgb, var(--line) 65%, transparent)" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          ariaLabel="Minimap of the graph"
          nodeColor={(minimapNode) => (minimapNode.id === surroundings.selectedStepName ? "var(--brand)" : "var(--line-strong)")}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          maskColor="color-mix(in srgb, var(--window) 62%, transparent)"
          style={{ width: 144, height: 90 }}
        />
      </ReactFlow>
    </StreamGraphCanvasSurroundingsContext.Provider>
  );
}
