import { Handle, Position, useStore, useStoreApi, type NodeProps } from "@xyflow/react";
import { cn } from "cn";
import { ChevronDown, ChevronRight, Hammer, SquareX, TriangleAlert, type LucideIcon } from "lucide-react";
import { Fragment, memo, useContext, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { inputAddressKey, type InputAddress } from "../../pin_model/node_inputs";
import { nodeOfABody, takesAControl } from "../../pin_model/controlled_inputs";
import { freeConversionWords } from "../../pin_model/node_input_link";
import { doesAChangeRebuildTheNode, nodePinLabel, nodePinRowKey, nodePinRows, nodePinsShown, type NodePin } from "../../pin_model/node_pins";
import { valueWords, wordsOfAValueOfNoType } from "../../pin_model/value_words";
import type { PinFlow, PinType } from "../../pin_type_readings";
import { pinTypeKey, pinTypeWords, pinWords, type PinTypeKey } from "../../pin_model/pin_type_words";
import { jsonTextOf, type StreamGraphPortPin } from "../../studio_readings";
import { InputControlMount } from "../input_control_mount";
import { NodeBodyMount } from "../node_body_mount";
import { NodeGraphNodesFoundContext } from "../node_graph_find_bar";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "../support/full_strength_focus_ring";
import { nodeGraphPinKey, type NodeGraphCardCondition, type NodeGraphCardKind, type NodeGraphCanvasNode } from "../support/node_graph_canvas_contract";
import { NodeGraphCardKindMark, NodeGraphCardLanguageTag } from "./node_card_kind_mark";
import { type NodeGraphCardFlowNode, type NodeGraphFlowNode, type NodeGraphLinkFlowEdge, inputPinHandleId, outputPinHandleId, connectionLookupKeyOfTheHandle, NodeGraphEditableContext, NodeGraphWireFitsContext, NodeGraphCardAndFrameEditingContext, NodeGraphInputValuesContext, NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE } from "../support/node_graph_flow_elements";
import { NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT, NODE_GRAPH_CARD_HEADER_HEIGHT, NODE_GRAPH_CARD_PIN_ROWS_PADDING, NODE_GRAPH_PIN_ROW_HEIGHT } from "../support/node_graph_layout";
import { isAPinSocketOfTheCardUnmeasured } from "../support/node_graph_pin_socket_measurement";

/** What a pin shows while the pointer rests on it: its name, its type and flow in words and the facts of its stream, then its description, then what the runtime marks on the link that feeds it: a conversion it makes for free, naming both types, and each warning in the runtime's words. */
function nodeGraphPinTooltip(pin: NodePin): string {
  const facts = [pin.name, pinWords(pin.pin), ...pin.stream_facts_words].join(" · ");
  const freeConversion = freeConversionWords(pin.link, pin.pin);
  return [facts, pin.description, freeConversion, ...(pin.link?.warnings ?? []).map((warning) => warning.words)].filter((line) => line !== null).join("\n");
}

/** The attributes a socket's shape and colour are picked by: its flow (round while it has none) and its type's key. */
function socketLookAttributes(pin: StreamGraphPortPin | null): { "data-pin-type": PinTypeKey; "data-pin-flow": PinFlow | undefined } {
  return { "data-pin-type": pinTypeKey(pin), "data-pin-flow": pin?.flow };
}

/** Why a card's node failed, when the card shows it under its pins. */
export function failureWordsTheCardShows(graphNode: Pick<NodeGraphCanvasNode, "condition">): string | null {
  return graphNode.condition.look === "failed" ? graphNode.condition.failed_because : null;
}

/** The narrowest and the widest a card is drawn, in the canvas and in a preview outside it. */
const NODE_GRAPH_CARD_WIDTHS_PX = { narrowest: 180, widest: 360 } as const;

/** The box every card is drawn in, in the canvas and in a preview outside it. */
const NODE_GRAPH_CARD_CLASS_NAMES = "node-graph-card relative";

/** A pin's socket at the card's edge, shaped by its flow and coloured by its type, filled while a link joins it, and ringed in the wire's type where the runtime converts that link for free. */
function NodeGraphPinSocket({
  nodeId,
  side,
  pin,
  takesNewWires,
}: {
  nodeId: string;
  side: "input" | "output";
  pin: NodePin;
  /** False on a collapsed card, whose pins all meet at its header's edge, so no one pin can be told apart to wire. */
  takesNewWires: boolean;
}) {
  const isEditable = useContext(NodeGraphEditableContext);
  const wireFit = useContext(NodeGraphWireFitsContext)?.get(nodeGraphPinKey(nodeId, side, pin.name, pin.member));
  const handleType = side === "input" ? "target" : "source";
  const handleId = side === "input" ? inputPinHandleId(nodePinRowKey(pin)) : outputPinHandleId(nodePinRowKey(pin));
  // A socket is drawn again only when it gains its first link or loses its last; `useNodeConnections` would draw it
  // again for every link it gains or loses.
  const isLinked = useStore((state) => state.connectionLookup.has(connectionLookupKeyOfTheHandle(nodeId, handleType, handleId)));
  // A Trigger is drawn as an arrow, which has no edge to ring; the runtime converts no Trigger for free in any case.
  const wireConvertedForFree = pin.pin?.flow === "trigger" ? null : (pin.link?.converts_for_free_from ?? null);
  const wireTypeKeyOfAFreeConversion = wireConvertedForFree === null ? null : pinTypeKey(wireConvertedForFree);
  return (
    <Handle
      type={handleType}
      position={side === "input" ? Position.Left : Position.Right}
      id={handleId}
      isConnectable={isEditable && takesNewWires}
      className="node-graph-pin"
      {...socketLookAttributes(pin.pin)}
      title={wireFit?.words ?? nodeGraphPinTooltip(pin)}
      data-wire-fit={wireFit?.outcome}
      data-stream-facts={pin.stream_facts_words.length === 0 ? undefined : pin.stream_facts_words.join(" · ")}
      data-linked={isLinked || undefined}
      data-bundle={pin.bundle === null ? undefined : pin.bundle.is_open ? "open" : "closed"}
      data-converts-for-free-from={wireTypeKeyOfAFreeConversion ?? undefined}
    >
      {wireTypeKeyOfAFreeConversion !== null && <span aria-hidden className="node-graph-pin-wire-ring" data-pin-type={wireTypeKeyOfAFreeConversion} />}
    </Handle>
  );
}

/** The words of the value an unwired input holds, at its row's end, written as JSON for an input with no exact type. They are written from the store as each value arrives, so a value that changes draws no card again. */
const NodeGraphInputValueWords = memo(function NodeGraphInputValueWords({ address, pinType }: { address: InputAddress; pinType: PinType | null }) {
  const inputValues = useContext(NodeGraphInputValuesContext);
  const wordsElement = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = wordsElement.current;
    if (inputValues === null || element === null) return;
    return inputValues.watchValue(address, (shown) => {
      const words = (pinType === null ? wordsOfAValueOfNoType(shown.value) : valueWords(pinType, shown.value)) ?? "";
      element.textContent = words;
      element.title = words;
    });
  }, [inputValues, address, pinType]);
  return <span ref={wordsElement} className="ml-auto max-w-1/2 min-w-0 truncate pl-2 text-fg-3 tabular-nums empty:hidden" data-node-graph-input-value={address.input} />;
}, haveTheSameInputAndType);

/** Whether a row's value words name the same input of the same type, so a new reading's equal address keeps the words' watch. */
function haveTheSameInputAndType(before: { address: InputAddress; pinType: PinType | null }, after: { address: InputAddress; pinType: PinType | null }): boolean {
  return inputAddressKey(before.address) === inputAddressKey(after.address) && (before.pinType === after.pinType || jsonTextOf(before.pinType) === jsonTextOf(after.pinType));
}

/** The mark a card's control carries, so the canvas hides it while zoomed out past reading it. */
const INLINE_CONTROL_HOST_ATTRIBUTES = { [NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE]: "" } as const;

/**
 * What an input's row shows of its value at its end: the control `takesAControl` gives it, or its value in words where the table
 * has none, and nothing for one that holds no value of its own. An input of a type only a wire carries shows only a control its
 * wire drives, such as a preview its node type names; one of a named type shows its type's name where the table has no control
 * for it.
 */
function NodeGraphInputValueOfTheRow({ pin }: { pin: NodePin }) {
  const isEditable = useContext(NodeGraphEditableContext);
  const controlled = takesAControl(pin);
  if (controlled !== null && controlled.driven_by !== null) {
    const pinType = controlled.declaration.pin_type;
    const noControl = pinType.type === "named" ? <NodeGraphNamedTypeWords pinType={pinType} /> : null;
    return <InputControlMount input={controlled} surface="node" readOnly={!isEditable} fallback={null} noControl={noControl} className="ml-auto shrink-0 pl-2" hostAttributes={INLINE_CONTROL_HOST_ATTRIBUTES} />;
  }
  if (pin.value_address === null) return null;
  const wordsOfTheValue = <NodeGraphInputValueWords address={pin.value_address} pinType={pin.pin?.pin_type ?? null} />;
  if (controlled === null) return wordsOfTheValue;
  return <InputControlMount input={controlled} surface="node" readOnly={!isEditable} fallback={wordsOfTheValue} className="ml-auto shrink-0 pl-2" hostAttributes={INLINE_CONTROL_HOST_ATTRIBUTES} />;
}

/** The name of the named type an input takes, at its row's end, where no control draws the input. */
function NodeGraphNamedTypeWords({ pinType }: { pinType: PinType }) {
  return (
    <span className="ml-auto max-w-1/2 min-w-0 truncate pl-2 text-fg-3" data-node-graph-input-type-words>
      {pinTypeWords(pinType)}
    </span>
  );
}

/** What the mark beside a setting its node reads as it is set up says while the pointer rests on it. */
const REBUILDS_THE_NODE_WORDS = "A change rebuilds the node";

/** A small mark beside a pin row's name, in `toneClassName`, saying `words` while the pointer rests on it and to a screen reader; `markAttributes` name what it marks. */
function NodeGraphPinRowMark({ icon: Icon, words, toneClassName, markAttributes }: { icon: LucideIcon; words: string; toneClassName: string; markAttributes: Record<`data-${string}`, string> }) {
  return (
    <span className={cn("ml-1 flex shrink-0", toneClassName)} title={words} {...markAttributes}>
      <Icon className="size-2.5" strokeWidth={2} aria-label={words} />
    </span>
  );
}

/** The mark beside the name of a setting its node reads as it is set up, saying a change of it rebuilds the node; none on any other pin. */
export function NodeGraphRebuildsTheNodeMark({ pin }: { pin: NodePin }) {
  if (!doesAChangeRebuildTheNode(pin)) return null;
  return <NodeGraphPinRowMark icon={Hammer} words={REBUILDS_THE_NODE_WORDS} toneClassName="text-fg-3" markAttributes={{ "data-node-graph-rebuilds-the-node": pin.name }} />;
}

/** The amber triangle beside the name of an input whose link the runtime warns of, saying each warning in its words; none on any other pin. */
function NodeGraphLinkWarningMark({ pin }: { pin: NodePin }) {
  const warningWords = (pin.link?.warnings ?? []).map((warning) => warning.words);
  if (warningWords.length === 0) return null;
  return <NodeGraphPinRowMark icon={TriangleAlert} words={warningWords.join("\n")} toneClassName="text-warn-text" markAttributes={{ "data-node-graph-link-warning": pin.name }} />;
}

/** What a screen reader hears of an input whose link the runtime converts for free, which its socket shows in two tones; none on any other pin. */
function NodeGraphFreeConversionWordsForAScreenReader({ pin }: { pin: NodePin }) {
  const words = freeConversionWords(pin.link, pin.pin);
  return words === null ? null : <span className="sr-only" data-node-graph-free-conversion={pin.name}>{words}</span>;
}

/** Whether a card draws a socket for `pin`: every pin but a setting, which takes a value and no wire. */
function takesASocket(pin: Pick<NodePin, "setting">): boolean {
  return pin.setting === null;
}

/** What a card's header and pin rows draw of a node. */
type NodeGraphCardFaceNode = Pick<NodeGraphCanvasNode, "title" | "type_name" | "description" | "condition" | "inputs" | "outputs" | "is_collapsed" | "kind">;

/** A card's header and its rows, one full-width row per pin, outputs first, then settings, then the other inputs; the canvas and a preview outside it both draw it, and `socketOfThePin` draws the socket of each pin but a setting. */
function NodeGraphCardHeaderAndPinRows({
  graphNode,
  beforeTheTitle = null,
  aboveTheRows = null,
  socketOfThePin,
  beforeABundlesName = () => null,
}: {
  graphNode: NodeGraphCardFaceNode;
  /** What leads the header, as the canvas's button that collapses the card. */
  beforeTheTitle?: ReactNode;
  /** What an open card draws between its header and its rows, as its node body. */
  aboveTheRows?: ReactNode;
  /** `takesNewWires` is false on a collapsed card, whose pins all meet at its header's edge. */
  socketOfThePin: (side: "input" | "output", pin: NodePin, takesNewWires: boolean) => ReactNode;
  /** What leads a bundle pin's row, as the canvas's button that shows or folds its members. */
  beforeABundlesName?: (side: "input" | "output", pin: NodePin) => ReactNode;
}) {
  const rows = nodePinRows(nodePinsShown(graphNode.inputs), nodePinsShown(graphNode.outputs));
  return (
    <>
      <div
        className="node-graph-card-header relative flex items-center gap-2 px-2"
        style={{ height: NODE_GRAPH_CARD_HEADER_HEIGHT }}
        title={graphNode.description ?? undefined}
        data-kind={graphNode.kind.look}
      >
        {beforeTheTitle}
        <NodeGraphCardKindMark kind={graphNode.kind} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
          {graphNode.title}
        </span>
        {graphNode.type_name !== null && (
          <span className="node-graph-card-type shrink-0 text-[10.5px]" data-node-graph-card-type={graphNode.type_name}>
            {graphNode.type_name}
          </span>
        )}
        <NodeGraphCardLanguageTag kind={graphNode.kind} />
        <NodeGraphCardConditionTag condition={graphNode.condition} />
        {graphNode.is_collapsed && rows.filter((row) => takesASocket(row.node_pin)).map((row) => <Fragment key={`${row.side}:${nodePinRowKey(row.node_pin)}`}>{socketOfThePin(row.side, row.node_pin, false)}</Fragment>)}
      </div>
      {!graphNode.is_collapsed && aboveTheRows}
      {!graphNode.is_collapsed && rows.length > 0 && (
        <div style={{ paddingBlock: NODE_GRAPH_CARD_PIN_ROWS_PADDING }}>
          {rows.map((row) => (
            <div
              key={`${row.side}:${nodePinRowKey(row.node_pin)}`}
              className={cn("relative flex items-center px-3 py-0.5 text-2xs text-fg-2", row.side === "output" && "justify-end", row.node_pin.member !== null && (row.side === "input" ? "pl-6" : "pr-6"))}
              style={{ minHeight: NODE_GRAPH_PIN_ROW_HEIGHT }}
              data-node-graph-pin-row={row.side}
              data-node-graph-setting={row.node_pin.setting === null ? undefined : row.node_pin.setting.read}
              data-node-graph-member={row.node_pin.member ?? undefined}
            >
              {row.side === "input" && row.node_pin.bundle !== null && beforeABundlesName(row.side, row.node_pin)}
              <span
                className={cn("truncate", row.side === "output" && "text-right")}
                {...(row.side === "input" ? { "data-node-graph-input-pin": nodePinRowKey(row.node_pin) } : { "data-node-graph-output-pin": nodePinRowKey(row.node_pin) })}
                title={nodeGraphPinTooltip(row.node_pin)}
              >
                {nodePinLabel(row.node_pin)}
              </span>
              {row.side === "output" && row.node_pin.bundle !== null && beforeABundlesName(row.side, row.node_pin)}
              <NodeGraphFreeConversionWordsForAScreenReader pin={row.node_pin} />
              <NodeGraphRebuildsTheNodeMark pin={row.node_pin} />
              <NodeGraphLinkWarningMark pin={row.node_pin} />
              {row.side === "input" && <NodeGraphInputValueOfTheRow pin={row.node_pin} />}
              {takesASocket(row.node_pin) && socketOfThePin(row.side, row.node_pin, true)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** The chevron leading a bundle pin's row, which shows a row for each of its members or folds them back into the bundle's row. */
function NodeGraphBundleOpenButton({ nodeId, side, pin, onBundleOpened }: { nodeId: string; side: "input" | "output"; pin: NodePin; onBundleOpened: (nodeId: string, side: "input" | "output", pin: string, open: boolean) => void }) {
  const isOpen = pin.bundle?.is_open === true;
  return (
    <button
      type="button"
      className={cn("nodrag flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-3 outline-none hover:bg-hover hover:text-fg", side === "input" ? "-ml-1 mr-0.5" : "-mr-1 ml-0.5", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      aria-label={`${pin.name} members`}
      aria-expanded={isOpen}
      onClick={() => onBundleOpened(nodeId, side, pin.name, !isOpen)}
      data-node-graph-bundle-open={pin.name}
    >
      {isOpen ? <ChevronDown className="size-3" strokeWidth={2} aria-hidden /> : <ChevronRight className="size-3" strokeWidth={2} aria-hidden />}
    </button>
  );
}

/** Measures the card's pin sockets again whenever React Flow holds no place for one of them, which would leave its links undrawn and its pins unable to start a wire; React Flow measures a card only when its size changes. */
function useEveryPinSocketOfTheCardMeasured(nodeId: string, graphNode: NodeGraphCardFaceNode): RefObject<HTMLDivElement | null> {
  const reactFlowStore = useStoreApi<NodeGraphFlowNode, NodeGraphLinkFlowEdge>();
  const cardElement = useRef<HTMLDivElement>(null);
  const inputSocketIds = nodePinsShown(graphNode.inputs).filter(takesASocket).map((pin) => inputPinHandleId(nodePinRowKey(pin)));
  const outputSocketIds = nodePinsShown(graphNode.outputs).map((pin) => outputPinHandleId(nodePinRowKey(pin)));
  const isAPinSocketUnmeasured = useStore((state) => isAPinSocketOfTheCardUnmeasured(state.nodeLookup.get(nodeId)?.internals.handleBounds, inputSocketIds, outputSocketIds));
  useLayoutEffect(() => {
    if (!isAPinSocketUnmeasured) return;
    const flowNodeElement = cardElement.current?.closest<HTMLDivElement>(".react-flow__node");
    if (flowNodeElement === null || flowNodeElement === undefined) return;
    reactFlowStore.getState().updateNodeInternals(new Map([[nodeId, { id: nodeId, nodeElement: flowNodeElement, force: true }]]));
  }, [isAPinSocketUnmeasured, nodeId, reactFlowStore]);
  return cardElement;
}

/** A card on the canvas: its header, the body its node type's module draws, a row per pin and what it says of its condition; it is drawn again only when its node, its selection or what the canvas around it shares changes. */
export function NodeGraphCardView({ id, data, selected: isSelected }: NodeProps<NodeGraphCardFlowNode>) {
  const cardElement = useEveryPinSocketOfTheCardMeasured(id, data.graphNode);
  const cardAndFrameEditing = useContext(NodeGraphCardAndFrameEditingContext);
  const nodesFound = useContext(NodeGraphNodesFoundContext);
  const { graphNode } = data;
  const findLook = nodesFound.current_node_id === graphNode.node_id ? "current" : nodesFound.found_node_ids.has(graphNode.node_id) ? "found" : undefined;
  const failureWords = failureWordsTheCardShows(graphNode);
  const isEditable = useContext(NodeGraphEditableContext);
  const bodysNode = useMemo(() => (graphNode.node_type === null ? null : nodeOfABody(graphNode.node_type, graphNode.inputs)), [graphNode.node_type, graphNode.inputs]);
  return (
    <div
      ref={cardElement}
      className={cn(NODE_GRAPH_CARD_CLASS_NAMES, isSelected && "node-graph-card-selected")}
      style={{ minWidth: NODE_GRAPH_CARD_WIDTHS_PX.narrowest, maxWidth: NODE_GRAPH_CARD_WIDTHS_PX.widest }}
      data-node-graph-card={graphNode.node_id}
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
        aboveTheRows={bodysNode !== null && <NodeBodyMount node={bodysNode} readOnly={!isEditable} />}
        socketOfThePin={(side, pin, takesNewWires) => <NodeGraphPinSocket nodeId={graphNode.node_id} side={side} pin={pin} takesNewWires={takesNewWires} />}
        beforeABundlesName={(side, pin) => cardAndFrameEditing !== null && <NodeGraphBundleOpenButton nodeId={graphNode.node_id} side={side} pin={pin} onBundleOpened={cardAndFrameEditing.onBundleOpened} />}
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

/** A port's mark beside its name outside the canvas, as Properties and the Library list ports: the socket a card draws for it, filled. */
export function NodeGraphPinMark({ pin }: { pin: StreamGraphPortPin | null }) {
  return <span aria-hidden className="node-graph-pin-mark" {...socketLookAttributes(pin)} />;
}

/** How much smaller than in the graph a card's preview is drawn. */
const NODE_GRAPH_CARD_PREVIEW_SCALE = 0.85;

/** The narrowest a card's preview is drawn, which a popover drawing one beside itself keeps room for. */
export const NODE_GRAPH_CARD_PREVIEW_NARROWEST_WIDTH_PX = Math.ceil(NODE_GRAPH_CARD_WIDTHS_PX.narrowest * NODE_GRAPH_CARD_PREVIEW_SCALE);

/** A node's card as the graph would draw it once placed, smaller and outside any canvas: its name and kind on the header and a row per pin, none linked. */
export function NodeGraphCardPreview({ title, kind, inputs, outputs }: { title: string; kind: NodeGraphCardKind; inputs: readonly NodePin[]; outputs: readonly NodePin[] }) {
  return (
    <div
      className={cn(NODE_GRAPH_CARD_CLASS_NAMES, "w-max")}
      style={{ zoom: NODE_GRAPH_CARD_PREVIEW_SCALE, minWidth: NODE_GRAPH_CARD_WIDTHS_PX.narrowest, maxWidth: `min(${NODE_GRAPH_CARD_WIDTHS_PX.widest}px, 100%)` }}
      data-condition="healthy"
      data-node-graph-card-preview={title}
    >
      <NodeGraphCardHeaderAndPinRows
        graphNode={{ title, type_name: null, description: null, condition: { look: "healthy" }, inputs, outputs, is_collapsed: false, kind }}
        socketOfThePin={(side, pin) => <span aria-hidden className="node-graph-pin node-graph-pin-of-a-preview" data-side={side} {...socketLookAttributes(pin.pin)} />}
      />
    </div>
  );
}
