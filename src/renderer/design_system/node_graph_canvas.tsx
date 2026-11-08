import {
  Background,
  BackgroundVariant,
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "cn";
import { Scan } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { IconButton } from "./icon_button";
import {
  layOutNodeGraph,
  NODE_GRAPH_CARD_HEADER_HEIGHT,
  NODE_GRAPH_CARD_PIN_ROWS_PADDING,
  NODE_GRAPH_PIN_ROW_HEIGHT,
  type NodeGraphPosition,
} from "./node_graph_layout";

/** The family a pin carries, which picks its shape and colour and its links' colour. */
export type NodeGraphPinFamily =
  | "image"
  | "array"
  | "channels"
  | "packets"
  | "records";

const NODE_GRAPH_PIN_FAMILY_WORDS: Record<NodeGraphPinFamily, string> = {
  image: "Image",
  array: "Array",
  channels: "Channels",
  packets: "Packets",
  records: "Records",
};

/** One pin of a card: its name, its family, `null` drawn as a plain bar while none is known, and what it states about its stream, shown while the pointer rests on it. */
export interface NodeGraphCanvasPin {
  name: string;
  family: NodeGraphPinFamily | null;
  stream_facts_words: readonly string[];
}

/** What a pin shows while the pointer rests on it: its name, its family and the facts of its stream. */
function nodeGraphPinTooltip(pin: NodeGraphCanvasPin): string {
  return [pin.name, ...(pin.family === null ? [] : [NODE_GRAPH_PIN_FAMILY_WORDS[pin.family]]), ...pin.stream_facts_words].join(" · ");
}

/** One node a graph canvas draws: its name on the card's header, and its pins, inputs on the left and outputs on the right. */
export interface NodeGraphCanvasNode {
  node_id: string;
  title: string;
  input_pins: readonly NodeGraphCanvasPin[];
  output_pins: readonly NodeGraphCanvasPin[];
}

/** How a link is drawn: carrying, not carrying yet (dashed), failed (red), or going away (dashed and faint). */
export type NodeGraphLinkLook = "carrying" | "waiting" | "failed" | "ending";

/** One link a graph canvas draws, from an output pin to an input pin. */
export interface NodeGraphCanvasLink {
  link_id: string;
  source_node_id: string;
  source_pin: string;
  target_node_id: string;
  target_pin: string;
  look: NodeGraphLinkLook;
  /** What a pointer resting on the link reads, such as its state in words. */
  description: string;
}

/** The narrowest a card is drawn; a card with longer names grows to fit them. */
const NODE_GRAPH_CARD_SMALLEST_WIDTH = 180;
const FIT_TO_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1, duration: 0 };

type NodeGraphCardFlowNode = Node<
  { graphNode: NodeGraphCanvasNode },
  "node_graph_card"
>;
type NodeGraphLinkFlowEdge = Edge<
  { graphLink: NodeGraphCanvasLink; family: NodeGraphPinFamily | null },
  "node_graph_link"
>;

const inputPinHandleId = (pinName: string) => `input:${pinName}`;
const outputPinHandleId = (pinName: string) => `output:${pinName}`;

/** What every card reads beside its own node, so a selection redraws cards without rebuilding the graph. */
const NodeGraphSelectionContext = createContext<string | null>(null);

/** Every pin a link joins, by `linkedPinKey`, which a card draws filled. */
const NodeGraphLinkedPinsContext = createContext<ReadonlySet<string>>(
  new Set(),
);

const linkedPinKey = (
  nodeId: string,
  side: "input" | "output",
  pinName: string,
) => `${nodeId}\u0000${side}\u0000${pinName}`;

/** A pin's mark at the card's edge, shaped and coloured by its family, or a plain bar while none is known. */
function NodeGraphPinHandle({
  nodeId,
  side,
  pin,
}: {
  nodeId: string;
  side: "input" | "output";
  pin: NodeGraphCanvasPin;
}) {
  const linkedPins = useContext(NodeGraphLinkedPinsContext);
  return (
    <Handle
      type={side === "input" ? "target" : "source"}
      position={side === "input" ? Position.Left : Position.Right}
      id={
        side === "input"
          ? inputPinHandleId(pin.name)
          : outputPinHandleId(pin.name)
      }
      isConnectable={false}
      className="node-graph-pin"
      data-family={pin.family ?? undefined}
      title={nodeGraphPinTooltip(pin)}
      data-stream-facts={pin.stream_facts_words.length === 0 ? undefined : pin.stream_facts_words.join(" · ")}
      data-linked={
        linkedPins.has(linkedPinKey(nodeId, side, pin.name)) || undefined
      }
    />
  );
}

/** The family a card's header is tinted by: its first output's, else its first input's. */
function headerFamilyOf(
  graphNode: NodeGraphCanvasNode,
): NodeGraphPinFamily | null {
  return (
    graphNode.output_pins[0]?.family ?? graphNode.input_pins[0]?.family ?? null
  );
}

function NodeGraphCardView({ data }: NodeProps<NodeGraphCardFlowNode>) {
  const selectedNodeId = useContext(NodeGraphSelectionContext);
  const { graphNode } = data;
  const isSelected = selectedNodeId === graphNode.node_id;
  const pinRowCount = Math.max(
    graphNode.input_pins.length,
    graphNode.output_pins.length,
  );
  return (
    <div
      className={cn(
        "node-graph-card min-w-[180px] max-w-[360px]",
        isSelected && "node-graph-card-selected",
      )}
      data-node-graph-card={graphNode.node_id}
      data-selected={isSelected || undefined}
    >
      <div
        className="node-graph-card-header flex items-center px-2"
        data-family={headerFamilyOf(graphNode) ?? undefined}
        style={{ height: NODE_GRAPH_CARD_HEADER_HEIGHT }}
      >
        <span className="truncate text-xs font-semibold text-fg">
          {graphNode.title}
        </span>
      </div>
      <div style={{ paddingBlock: NODE_GRAPH_CARD_PIN_ROWS_PADDING }}>
        {Array.from({ length: pinRowCount }, (_, rowIndex) => {
          const inputPin = graphNode.input_pins[rowIndex];
          const outputPin = graphNode.output_pins[rowIndex];
          return (
            <div
              key={rowIndex}
              className="relative flex items-center justify-between gap-4 px-3 text-[11px] text-fg-2"
              style={{ height: NODE_GRAPH_PIN_ROW_HEIGHT }}
            >
              <span
                className="truncate"
                data-node-graph-input-pin={inputPin?.name}
              >
                {inputPin?.name}
              </span>
              <span
                className="truncate text-right"
                data-node-graph-output-pin={outputPin?.name}
              >
                {outputPin?.name}
              </span>
              {inputPin !== undefined && (
                <NodeGraphPinHandle
                  nodeId={graphNode.node_id}
                  side="input"
                  pin={inputPin}
                />
              )}
              {outputPin !== undefined && (
                <NodeGraphPinHandle
                  nodeId={graphNode.node_id}
                  side="output"
                  pin={outputPin}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeGraphLinkView({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<NodeGraphLinkFlowEdge>) {
  const [linkPath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });
  if (data === undefined) return null;
  const { look, description } = data.graphLink;
  return (
    <g
      data-node-graph-link={data.graphLink.link_id}
      data-look={look}
      data-family={data.family ?? undefined}
    >
      <title>{description}</title>
      <BaseEdge
        id={id}
        path={linkPath}
        interactionWidth={14}
        className={cn("node-graph-link", `node-graph-link-${look}`)}
      />
    </g>
  );
}

const NODE_GRAPH_NODE_TYPES = { node_graph_card: memo(NodeGraphCardView) };
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

/** What decides where the cards sit: the nodes, their pins and the links; a new one lays the graph out again. */
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

function NodeGraphFlow({
  label,
  nodes,
  links,
  selectedNodeId,
  onNodeSelected,
  overlay,
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  selectedNodeId: string | null;
  onNodeSelected: (nodeId: string | null) => void;
  overlay?: ReactNode;
}) {
  const reactFlow = useReactFlow();
  const [cardSizeByNode, setCardSizeByNode] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(new Map());
  const areCardsMeasured = nodes.every((node) =>
    cardSizeByNode.has(node.node_id),
  );
  const shapeKey = nodeGraphShapeKey(nodes, links);
  const [measuredCardWidths, setMeasuredCardWidths] =
    useState<MeasuredCardWidths | null>(null);
  const isLaidOutOnMeasuredWidths = measuredCardWidths?.shapeKey === shapeKey;

  const positionByNode: Map<string, NodeGraphPosition> = useMemo(
    () =>
      layOutNodeGraph(
        nodes.map((node) => ({
          node_id: node.node_id,
          input_pin_names: node.input_pins.map((pin) => pin.name),
          output_pin_names: node.output_pins.map((pin) => pin.name),
          card_width:
            (isLaidOutOnMeasuredWidths
              ? measuredCardWidths.widthByNode.get(node.node_id)
              : undefined) ?? NODE_GRAPH_CARD_SMALLEST_WIDTH,
        })),
        links,
      ),
    [nodes, links, isLaidOutOnMeasuredWidths, measuredCardWidths],
  );

  const flowNodes: NodeGraphCardFlowNode[] = useMemo(
    () =>
      nodes.map((graphNode) => ({
        id: graphNode.node_id,
        type: "node_graph_card",
        position: positionByNode.get(graphNode.node_id) ?? { x: 0, y: 0 },
        measured: cardSizeByNode.get(graphNode.node_id),
        data: { graphNode },
        draggable: false,
        connectable: false,
        ariaLabel: `Node ${graphNode.title}`,
      })),
    [nodes, positionByNode, cardSizeByNode],
  );
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
        focusable: false,
        selectable: false,
      })),
    [links, nodeById],
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
    if (isLaidOutOnMeasuredWidths) void reactFlow.fitView(FIT_TO_VIEW_OPTIONS);
  }, [isLaidOutOnMeasuredWidths, reactFlow, shapeKey]);

  const followTheChanges = useCallback(
    (changes: NodeChange<NodeGraphCardFlowNode>[]) => {
      const measuredChanges = changes.flatMap((change) =>
        change.type === "dimensions" && change.dimensions !== undefined
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
      const selectedChange = changes.find(
        (change) => change.type === "select" && change.selected,
      );
      if (selectedChange !== undefined && selectedChange.type === "select")
        onNodeSelected(selectedChange.id);
    },
    [onNodeSelected],
  );

  return (
    <NodeGraphSelectionContext value={selectedNodeId}>
      <NodeGraphLinkedPinsContext value={linkedPins}>
        <ReactFlow<NodeGraphCardFlowNode, NodeGraphLinkFlowEdge>
          aria-label={label}
          className={cn(
            "node-graph-canvas",
            !isLaidOutOnMeasuredWidths && "opacity-0",
          )}
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_GRAPH_NODE_TYPES}
          edgeTypes={NODE_GRAPH_EDGE_TYPES}
          onNodesChange={followTheChanges}
          onPaneClick={() => onNodeSelected(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
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
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 rounded-md bg-studio-graph-tools p-0.5">
            <IconButton
              icon={Scan}
              label="Frame the whole graph"
              size="compact"
              onPressed={() =>
                void reactFlow.fitView({
                  ...FIT_TO_VIEW_OPTIONS,
                  duration: 200,
                })
              }
              data-node-graph-tool="frame_all"
            />
          </div>
            {overlay}
        </ReactFlow>
      </NodeGraphLinkedPinsContext>
    </NodeGraphSelectionContext>
  );
}

/**
 * A graph of nodes and links drawn the Blueprint way: a card per node, its input pins down its left edge and its outputs
 * down its right, links as curves between them, laid out left to right and framed whole when its shape changes.
 * Clicking a card selects it; clicking the canvas selects nothing. `overlay` draws over the canvas's top right.
 */
export function NodeGraphCanvas({
  label,
  nodes,
  links,
  selectedNodeId,
  onNodeSelected,
  overlay,
  ...controlDataAttributes
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  selectedNodeId: string | null;
  onNodeSelected: (nodeId: string | null) => void;
  overlay?: ReactNode;
} & ControlDataAttributes) {
  return (
    <div className="relative min-h-0 flex-1" {...controlDataAttributes}>
      <ReactFlowProvider>
        <NodeGraphFlow
          label={label}
          nodes={nodes}
          links={links}
          selectedNodeId={selectedNodeId}
          onNodeSelected={onNodeSelected}
          overlay={overlay}
        />
      </ReactFlowProvider>
    </div>
  );
}

/** A port's mark beside its name outside the canvas, as Properties lists ports: the same mark a card's pin is drawn with. */
export function NodeGraphPinMark({
  family,
}: {
  family: NodeGraphPinFamily | null;
}) {
  return (
    <span
      aria-hidden
      className="node-graph-pin-mark"
      data-family={family ?? undefined}
    />
  );
}

/** A family's name as a socket's tooltip and Properties write it. */
export function nodeGraphPinFamilyWords(family: NodeGraphPinFamily): string {
  return NODE_GRAPH_PIN_FAMILY_WORDS[family];
}
