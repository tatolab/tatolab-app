import { Handle, Position, useStore, useStoreApi, type NodeProps } from "@xyflow/react";
import { cn } from "cn";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { ChevronDown, ChevronRight, Combine, SquareX, TriangleAlert } from "lucide-react";
import { MenuItem, MenuOpenBesideItsParent } from "./menus";
import { Fragment, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { NodeGraphNodesFoundContext } from "./node_graph_find_bar";
import { NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT, NODE_GRAPH_CARD_HEADER_HEIGHT, NODE_GRAPH_CARD_PIN_ROWS_PADDING, NODE_GRAPH_PIN_ROW_HEIGHT } from "./support/node_graph_layout";
import { isAPinSocketOfTheCardUnmeasured } from "./support/node_graph_pin_socket_measurement";
import { type NodeGraphPinFamily, nodeGraphPinFamilyWords, type NodeGraphCanvasPin, type NodeGraphCardCondition, type NodeGraphCanvasNode } from "./support/node_graph_canvas_contract";
import { type NodeGraphCardFlowNode, type NodeGraphFlowNode, type NodeGraphLinkFlowEdge, inputPinHandleId, outputPinHandleId, NodeGraphSelectionContext, NodeGraphPortPickingContext, NodeGraphEditableContext, NodeGraphCardAndFrameEditingContext, NodeGraphLinkedPinsContext, linkedPinKey } from "./support/node_graph_flow_elements";

/** What a pin shows while the pointer rests on it: its name, its family and the facts of its stream, then its description. */
function nodeGraphPinTooltip(pin: NodeGraphCanvasPin): string {
  const facts = [pin.name, ...(pin.family === null ? [] : [nodeGraphPinFamilyWords(pin.family)]), ...pin.stream_facts_words].join(" · ");
  return pin.description === null ? facts : `${facts}\n${pin.description}`;
}

/** Why a card's node failed, when the card shows it under its pins. */
export function failureWordsTheCardShows(graphNode: NodeGraphCanvasNode): string | null {
  return graphNode.condition.look === "failed" ? graphNode.condition.failed_because : null;
}

/** The narrowest and the widest a card is drawn, in the canvas and in a preview outside it. */
const NODE_GRAPH_CARD_WIDTHS_PX = { narrowest: 180, widest: 360 } as const;

/** The box every card is drawn in, in the canvas and in a preview outside it. */
const NODE_GRAPH_CARD_CLASS_NAMES = "node-graph-card relative";

/** A pin's mark at the card's edge, shaped and coloured by its family, or a plain bar while none is known. */
function NodeGraphPinHandle({
  nodeId,
  side,
  pin,
  takesNewWires,
}: {
  nodeId: string;
  side: "input" | "output";
  pin: NodeGraphCanvasPin;
  /** False on a collapsed card, whose pins all meet at its header's edge, so no one pin can be told apart to wire. */
  takesNewWires: boolean;
}) {
  const linkedPins = useContext(NodeGraphLinkedPinsContext);
  const isEditable = useContext(NodeGraphEditableContext);
  return (
    <Handle
      type={side === "input" ? "target" : "source"}
      position={side === "input" ? Position.Left : Position.Right}
      id={
        side === "input"
          ? inputPinHandleId(pin.name)
          : outputPinHandleId(pin.name)
      }
      isConnectable={isEditable && takesNewWires}
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

/** What a card's header and pin rows draw of a node. */
type NodeGraphCardFaceNode = Pick<NodeGraphCanvasNode, "title" | "type_name" | "description" | "condition" | "input_pins" | "output_pins" | "is_collapsed" | "subgraph">;

/** A card's header and its pin rows, which the canvas and a preview outside it both draw; `pinAtTheCardsEdge` draws each pin's socket. */
function NodeGraphCardHeaderAndPinRows({
  graphNode,
  beforeTheTitle = null,
  pinAtTheCardsEdge,
}: {
  graphNode: NodeGraphCardFaceNode;
  /** What leads the header, as the canvas's button that collapses the card. */
  beforeTheTitle?: ReactNode;
  /** `takesNewWires` is false on a collapsed card, whose pins all meet at its header's edge. */
  pinAtTheCardsEdge: (side: "input" | "output", pin: NodeGraphCanvasPin, takesNewWires: boolean) => ReactNode;
}) {
  const pinRowCount = Math.max(graphNode.input_pins.length, graphNode.output_pins.length);
  return (
    <>
      <div
        className="node-graph-card-header relative flex items-center gap-2 px-2"
        style={{ height: NODE_GRAPH_CARD_HEADER_HEIGHT }}
        title={graphNode.description ?? undefined}
      >
        {beforeTheTitle}
        {graphNode.subgraph !== null && <Combine className="size-3 shrink-0 text-fg-2" strokeWidth={2} aria-label="Subgraph" data-node-graph-card-subgraph={graphNode.subgraph} />}
        <span className="truncate text-xs font-semibold text-fg">
          {graphNode.title}
        </span>
        {graphNode.type_name !== null && (
          <span className="ml-auto shrink-0 text-[10.5px] text-fg-3" data-node-graph-card-type={graphNode.type_name}>
            {graphNode.type_name}
          </span>
        )}
        <NodeGraphCardConditionTag condition={graphNode.condition} />
        {graphNode.is_collapsed && (
          <>
            {graphNode.input_pins.map((pin) => (
              <Fragment key={`input:${pin.name}`}>{pinAtTheCardsEdge("input", pin, false)}</Fragment>
            ))}
            {graphNode.output_pins.map((pin) => (
              <Fragment key={`output:${pin.name}`}>{pinAtTheCardsEdge("output", pin, false)}</Fragment>
            ))}
          </>
        )}
      </div>
      {!graphNode.is_collapsed && (
        <div style={{ paddingBlock: NODE_GRAPH_CARD_PIN_ROWS_PADDING }}>
        {Array.from({ length: pinRowCount }, (_, rowIndex) => {
          const inputPin = graphNode.input_pins[rowIndex];
          const outputPin = graphNode.output_pins[rowIndex];
          return (
            <div
              key={rowIndex}
              className="relative flex items-center justify-between gap-4 px-3 text-2xs text-fg-2"
              style={{ height: NODE_GRAPH_PIN_ROW_HEIGHT }}
            >
              <span
                className="truncate"
                data-node-graph-input-pin={inputPin?.name}
                title={inputPin === undefined ? undefined : nodeGraphPinTooltip(inputPin)}
              >
                {inputPin?.name}
              </span>
              <span
                className="truncate text-right"
                data-node-graph-output-pin={outputPin?.name}
                title={outputPin === undefined ? undefined : nodeGraphPinTooltip(outputPin)}
              >
                {outputPin?.name}
              </span>
              {inputPin !== undefined && pinAtTheCardsEdge("input", inputPin, true)}
              {outputPin !== undefined && pinAtTheCardsEdge("output", outputPin, true)}
            </div>
          );
        })}
        </div>
      )}
    </>
  );
}

/** Measures the card's pin sockets again whenever React Flow holds no place for one of them, which would leave its links undrawn and its pins unable to start a wire; React Flow measures a card only when its size changes. */
function useEveryPinSocketOfTheCardMeasured(nodeId: string, graphNode: NodeGraphCardFaceNode): RefObject<HTMLDivElement | null> {
  const reactFlowStore = useStoreApi<NodeGraphFlowNode, NodeGraphLinkFlowEdge>();
  const cardElement = useRef<HTMLDivElement>(null);
  const inputSocketIds = graphNode.input_pins.map((pin) => inputPinHandleId(pin.name));
  const outputSocketIds = graphNode.output_pins.map((pin) => outputPinHandleId(pin.name));
  const isAPinSocketUnmeasured = useStore((state) => isAPinSocketOfTheCardUnmeasured(state.nodeLookup.get(nodeId)?.internals.handleBounds, inputSocketIds, outputSocketIds));
  useLayoutEffect(() => {
    if (!isAPinSocketUnmeasured) return;
    const flowNodeElement = cardElement.current?.closest<HTMLDivElement>(".react-flow__node");
    if (flowNodeElement === null || flowNodeElement === undefined) return;
    reactFlowStore.getState().updateNodeInternals(new Map([[nodeId, { id: nodeId, nodeElement: flowNodeElement, force: true }]]));
  }, [isAPinSocketUnmeasured, nodeId, reactFlowStore]);
  return cardElement;
}

/** A card on the canvas: its header, its pins and what it says of its condition. */
export function NodeGraphCardView({ id, data }: NodeProps<NodeGraphCardFlowNode>) {
  const cardElement = useEveryPinSocketOfTheCardMeasured(id, data.graphNode);
  const selectedNodeIds = useContext(NodeGraphSelectionContext);
  const cardAndFrameEditing = useContext(NodeGraphCardAndFrameEditingContext);
  const portPicking = useContext(NodeGraphPortPickingContext);
  const nodesFound = useContext(NodeGraphNodesFoundContext);
  const { graphNode } = data;
  const portsThatCanJoin = portPicking?.portsThatCanJoinByNodeId.get(graphNode.node_id) ?? null;
  const isSelected = selectedNodeIds.has(graphNode.node_id);
  const findLook = nodesFound.current_node_id === graphNode.node_id ? "current" : nodesFound.found_node_ids.has(graphNode.node_id) ? "found" : undefined;
  const failureWords = failureWordsTheCardShows(graphNode);
  return (
    <div
      ref={cardElement}
      className={cn(
        NODE_GRAPH_CARD_CLASS_NAMES,
        isSelected && "node-graph-card-selected",
        portPicking !== null && (portsThatCanJoin === null ? "node-graph-card-not-pickable" : "node-graph-card-pickable"),
      )}
      style={{ minWidth: NODE_GRAPH_CARD_WIDTHS_PX.narrowest, maxWidth: NODE_GRAPH_CARD_WIDTHS_PX.widest }}
      data-node-graph-card={graphNode.node_id}
      data-port-pick={portPicking === null ? undefined : portsThatCanJoin === null ? "dim" : "lit"}
      data-selected={isSelected || undefined}
      data-found={findLook}
      data-condition={graphNode.condition.look}
      data-collapsed={graphNode.is_collapsed || undefined}
      data-subgraph={graphNode.subgraph ?? undefined}
    >
      <NodeGraphCardHeaderAndPinRows
        graphNode={graphNode}
        beforeTheTitle={
          cardAndFrameEditing !== null && (
            <button
              type="button"
              className={cn("nodrag -mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-3 outline-none hover:bg-hover hover:text-fg", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
              aria-label={`${graphNode.title} pins`}
              aria-expanded={!graphNode.is_collapsed}
              onClick={() => cardAndFrameEditing.onCardCollapsed(graphNode.node_id, !graphNode.is_collapsed)}
              data-node-graph-card-collapse={graphNode.node_id}
            >
              {graphNode.is_collapsed ? <ChevronRight className="size-3" strokeWidth={2} aria-hidden /> : <ChevronDown className="size-3" strokeWidth={2} aria-hidden />}
            </button>
          )
        }
        pinAtTheCardsEdge={(side, pin, takesNewWires) => <NodeGraphPinHandle nodeId={graphNode.node_id} side={side} pin={pin} takesNewWires={takesNewWires} />}
      />
      {failureWords !== null && !graphNode.is_collapsed && (
        <p
          className="node-graph-card-failure-words w-0 min-w-full px-2.5 py-1.5 text-2xs leading-4 text-danger-text"
          style={{ height: NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT }}
          title={failureWords}
          data-node-graph-failure-words
        >
          <span className="line-clamp-2 break-words">{failureWords}</span>
        </p>
      )}
      {portPicking !== null && portPicking.nodeAskingWhichPort === graphNode.node_id && portsThatCanJoin !== null && (
        <MenuOpenBesideItsParent label={`Which port of ${graphNode.title}`} onClosed={portPicking.onAskWhichClosed} data-node-graph-port-pick-which={graphNode.node_id}>
          {portsThatCanJoin.map((port) => (
            <MenuItem key={port} onChosen={() => portPicking.onPortChosen(graphNode.node_id, port)} data-node-graph-port-pick-choice={port}>
              {port}
            </MenuItem>
          ))}
        </MenuOpenBesideItsParent>
      )}
    </div>
  );
}

/** The tag at a card header's right saying its node failed, is not ready or is restarting; a healthy card has none. */
function NodeGraphCardConditionTag({ condition }: { condition: NodeGraphCardCondition }) {
  if (condition.look === "healthy") return null;
  if (condition.look === "restarting")
    return (
      <span className="node-graph-card-condition-tag ml-auto shrink-0 rounded-sm bg-well px-1.5 text-[10px] leading-4 font-medium text-fg-3" data-node-graph-condition-tag="restarting">
        Restarting
      </span>
    );
  if (condition.look === "not_ready")
    return (
      <span
        className="node-graph-card-condition-tag ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-well px-1.5 text-[10px] leading-4 font-medium text-warn-text"
        title={condition.not_ready_because}
        data-node-graph-condition-tag="not_ready"
      >
        <TriangleAlert className="size-3" strokeWidth={1.75} aria-hidden />
        Not ready
      </span>
    );
  return (
    <span className="node-graph-card-condition-tag ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-danger-soft px-1.5 text-[10px] leading-4 font-medium text-danger-text" data-node-graph-condition-tag="failed">
      <SquareX className="size-3" strokeWidth={1.75} aria-hidden />
      Failed
    </span>
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

/** How much smaller than in the graph a card's preview is drawn. */
const NODE_GRAPH_CARD_PREVIEW_SCALE = 0.85;

/** The narrowest a card's preview is drawn, which a popover drawing one beside itself keeps room for. */
export const NODE_GRAPH_CARD_PREVIEW_NARROWEST_WIDTH_PX = Math.ceil(NODE_GRAPH_CARD_WIDTHS_PX.narrowest * NODE_GRAPH_CARD_PREVIEW_SCALE);

/** A node's card as the graph would draw it once placed, smaller and outside any canvas: its name on the header and its pins at its edges, none linked. */
export function NodeGraphCardPreview({
  title,
  inputPins,
  outputPins,
}: {
  title: string;
  inputPins: readonly Pick<NodeGraphCanvasPin, "name" | "family">[];
  outputPins: readonly Pick<NodeGraphCanvasPin, "name" | "family">[];
}) {
  const pinsOfThePreview = (pins: readonly Pick<NodeGraphCanvasPin, "name" | "family">[]) => pins.map((pin): NodeGraphCanvasPin => ({ ...pin, description: null, stream_facts_words: [] }));
  return (
    <div
      className={cn(NODE_GRAPH_CARD_CLASS_NAMES, "w-max")}
      style={{ zoom: NODE_GRAPH_CARD_PREVIEW_SCALE, minWidth: NODE_GRAPH_CARD_WIDTHS_PX.narrowest, maxWidth: `min(${NODE_GRAPH_CARD_WIDTHS_PX.widest}px, 100%)` }}
      data-condition="healthy"
      data-node-graph-card-preview={title}
    >
      <NodeGraphCardHeaderAndPinRows
        graphNode={{ title, type_name: null, description: null, condition: { look: "healthy" }, input_pins: pinsOfThePreview(inputPins), output_pins: pinsOfThePreview(outputPins), is_collapsed: false, subgraph: null }}
        pinAtTheCardsEdge={(side, pin) => <span aria-hidden className="node-graph-pin node-graph-pin-of-a-preview" data-side={side} data-family={pin.family ?? undefined} />}
      />
    </div>
  );
}
