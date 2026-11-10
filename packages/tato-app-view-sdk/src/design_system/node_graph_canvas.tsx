import {
  Background,
  BackgroundVariant,
  BaseEdge,
  getBezierPath,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnResizeEnd,
} from "@xyflow/react";
import { cn } from "cn";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { ChevronDown, ChevronRight, Frame, Plus, Scan, SquareX, StickyNote } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { IconButton } from "./icon_button";
import {
  layOutNodeGraph,
  NODE_GRAPH_CARD_FAILURE_WORDS_HEIGHT,
  NODE_GRAPH_CARD_HEADER_HEIGHT,
  NODE_GRAPH_CARD_PIN_ROWS_PADDING,
  NODE_GRAPH_PIN_ROW_HEIGHT,
  nodeGraphCardHeight,
  type NodeGraphPosition,
} from "./support/node_graph_layout";
import { canPinsOfTheseFamiliesBeWired, frameRectangleAroundCards, linkUnderACard, placeClearBelowTheCards, type NodeGraphLinkMidpoint } from "./support/node_graph_editing";

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

/** How a card shows its node is doing: as every healthy card, restarting (a quiet tag), or failed (red, with why in the runtime's words when it gave them). */
export type NodeGraphCardCondition =
  | { look: "healthy" }
  | { look: "restarting" }
  | { look: "failed"; failed_because: string | null };

/** One node a graph canvas draws: its name on the card's header, how it is doing, its pins (inputs on the left, outputs on the right), where it was left, and the frame it sits in. */
export interface NodeGraphCanvasNode {
  node_id: string;
  title: string;
  /** Its type's short name, quiet beside the title; `null` when the title already says it. */
  type_name: string | null;
  condition: NodeGraphCardCondition;
  input_pins: readonly NodeGraphCanvasPin[];
  output_pins: readonly NodeGraphCanvasPin[];
  /** Where its card was left; `null` lays it out with the other cards that have none. */
  saved_position: NodeGraphPosition | null;
  /** The frame drawn around it, by `frame_id`; `null` for none. */
  frame_id: string | null;
  /** Drawn as its header alone, its wires meeting the header's edges. */
  is_collapsed: boolean;
}

/** A labelled frame drawn around the cards that name it, with its title on a tab, its description under it, and a tint of its colour. */
export interface NodeGraphCanvasFrame {
  frame_id: string;
  title: string;
  description: string | null;
  /** A CSS colour the frame is tinted with; `null` for the canvas's own. */
  colour: string | null;
}

/** A note on the canvas beside the cards: its text, where its top-left corner sits and its size. */
export interface NodeGraphCanvasNote {
  note_id: string;
  text: string;
  position: NodeGraphPosition;
  size: { width: number; height: number };
}

/** Why a card's node failed, when the card shows it under its pins. */
function failureWordsTheCardShows(graphNode: NodeGraphCanvasNode): string | null {
  return graphNode.condition.look === "failed" ? graphNode.condition.failed_because : null;
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

/** One end of a wire a person drew: a card's pin. */
export interface NodeGraphCanvasPinEnd {
  node_id: string;
  pin: string;
}

/** A pin a person dragged a wire off and let go of over empty canvas: which side of its card, and its family. */
export interface NodeGraphCanvasLooseWire extends NodeGraphCanvasPinEnd {
  side: "input" | "output";
  family: NodeGraphPinFamily | null;
}

/** A point a person pointed at: on the canvas, where a card placed there sits, and in the canvas element's own pixels, where a menu opened there shows. */
export interface NodeGraphCanvasPoint {
  on_the_canvas: NodeGraphPosition;
  in_the_element: { x: number; y: number };
}

/** Whether an edit the canvas asked for was applied; a refused one puts what it moved back. */
export type NodeGraphCanvasEditAnswer = "applied" | "refused";

/** The room a card or note placed from a tool takes, so the view shows it whole. */
const NODE_GRAPH_PLACED_ROOM = { width: 240, height: 120 };

/** What a person's edits on the canvas ask for; each call is one gesture. */
export interface NodeGraphCanvasEditing {
  /** Cards dragged and let go, each at its new top-left corner, together with every card that had no saved place, so the layout stays as seen; a lone card with no links let go of over a link is spliced into it in the same gesture. */
  onCardsMoved(moves: readonly { node_id: string; position: NodeGraphPosition }[], cardLetGoOverALink: { node_id: string; link_id: string } | null): Promise<NodeGraphCanvasEditAnswer>;
  /** A wire drawn from an output pin to an input pin of a family it can carry. */
  onPinsWired(source: NodeGraphCanvasPinEnd, target: NodeGraphCanvasPinEnd): void;
  /** A wire dragged off a pin and let go of over empty canvas, to place a node there that it feeds or reads. */
  onWireLetGoOverTheCanvas(looseWire: NodeGraphCanvasLooseWire, at: NodeGraphCanvasPoint): void;
  /** Tab pressed over the canvas, to place a node where the pointer rests, or Add node pressed, to place one in the middle of the view. */
  onNodeAskedFor(at: NodeGraphCanvasPoint): void;
  /** Note pressed, to place a note in the middle of the view. */
  onNoteAskedFor(at: NodeGraphCanvasPoint): void;
  /** The selected cards, links and notes, deleted with Backspace or Delete. */
  onDeleted(deleted: { node_ids: readonly string[]; link_ids: readonly string[]; note_ids: readonly string[] }): void;
  /** F, ⌘G or Frame pressed with cards selected, to frame them. */
  onFrameAskedFor(nodeIds: readonly string[]): Promise<NodeGraphCanvasEditAnswer>;
  /** A frame's title edited on its tab. */
  onFrameRenamed(frameId: string, title: string): void;
  /** A card's chevron pressed, to collapse it to its header or open it again. */
  onCardCollapsed(nodeId: string, collapsed: boolean): void;
  /** A note's text edited, or the note moved or resized. */
  onNoteChanged(noteId: string, change: { text?: string; position?: NodeGraphPosition; size?: { width: number; height: number } }): Promise<NodeGraphCanvasEditAnswer>;
}

/** The narrowest a card is drawn; a card with longer names grows to fit them. */
const NODE_GRAPH_CARD_SMALLEST_WIDTH = 180;
const FIT_TO_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1, duration: 0 };
const NODE_GRAPH_NOTE_SMALLEST_SIZE = { width: 120, height: 60 };

type NodeGraphCardFlowNode = Node<
  { graphNode: NodeGraphCanvasNode },
  "node_graph_card"
>;
type NodeGraphNoteFlowNode = Node<
  { graphNote: NodeGraphCanvasNote },
  "node_graph_note"
>;
type NodeGraphFrameFlowNode = Node<
  { graphFrame: NodeGraphCanvasFrame },
  "node_graph_frame"
>;
type NodeGraphFlowNode = NodeGraphCardFlowNode | NodeGraphNoteFlowNode | NodeGraphFrameFlowNode;
type NodeGraphLinkFlowEdge = Edge<
  { graphLink: NodeGraphCanvasLink; family: NodeGraphPinFamily | null },
  "node_graph_link"
>;

const inputPinHandleId = (pinName: string) => `input:${pinName}`;
const outputPinHandleId = (pinName: string) => `output:${pinName}`;
/** A pin's name and side from the handle id React Flow reports. */
function pinOfAHandleId(handleId: string | null | undefined): { side: "input" | "output"; pin: string } | null {
  if (handleId === null || handleId === undefined) return null;
  if (handleId.startsWith("input:")) return { side: "input", pin: handleId.slice("input:".length) };
  if (handleId.startsWith("output:")) return { side: "output", pin: handleId.slice("output:".length) };
  return null;
}

const noteFlowNodeId = (noteId: string) => `note:${noteId}`;
const frameFlowNodeId = (frameId: string) => `frame:${frameId}`;

/** The cards drawn selected, which every card reads so a selection redraws cards without rebuilding the graph. */
const NodeGraphSelectionContext = createContext<ReadonlySet<string>>(new Set());

/** Whether the canvas takes edits, which lets its pins start wires and its notes be edited. */
const NodeGraphEditableContext = createContext<boolean>(false);

/** What a note asks for when its text is edited or it is resized. */
const NodeGraphNoteEditingContext = createContext<NodeGraphCanvasEditing["onNoteChanged"] | null>(null);

/** What a note's corners ask for when a resize ends; `null` on a read-only canvas. */
const NodeGraphNoteResizingContext = createContext<((noteId: string, resized: NodeGraphPosition & { width: number; height: number }) => void) | null>(null);

/** What a card's chevron and a frame's title ask for on an editable canvas; `null` on a read-only one. */
const NodeGraphCardAndFrameEditingContext = createContext<Pick<NodeGraphCanvasEditing, "onFrameRenamed" | "onCardCollapsed"> | null>(null);

/** The frame whose title is being edited, and how a frame starts or stops having it edited; `null` outside a canvas. */
const NodeGraphFrameRenamingContext = createContext<{ frameIdBeingRenamed: string | null; renameTheFrame: (frameId: string | null) => void } | null>(null);

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

function NodeGraphCardView({ data }: NodeProps<NodeGraphCardFlowNode>) {
  const selectedNodeIds = useContext(NodeGraphSelectionContext);
  const cardAndFrameEditing = useContext(NodeGraphCardAndFrameEditingContext);
  const { graphNode } = data;
  const isSelected = selectedNodeIds.has(graphNode.node_id);
  const failureWords = failureWordsTheCardShows(graphNode);
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
      data-condition={graphNode.condition.look}
      data-collapsed={graphNode.is_collapsed || undefined}
    >
      <div
        className="node-graph-card-header relative flex items-center gap-2 px-2"
        style={{ height: NODE_GRAPH_CARD_HEADER_HEIGHT }}
      >
        {cardAndFrameEditing !== null && (
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
        )}
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
              <NodeGraphPinHandle key={`input:${pin.name}`} nodeId={graphNode.node_id} side="input" pin={pin} takesNewWires={false} />
            ))}
            {graphNode.output_pins.map((pin) => (
              <NodeGraphPinHandle key={`output:${pin.name}`} nodeId={graphNode.node_id} side="output" pin={pin} takesNewWires={false} />
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
                  takesNewWires
                />
              )}
              {outputPin !== undefined && (
                <NodeGraphPinHandle
                  nodeId={graphNode.node_id}
                  side="output"
                  pin={outputPin}
                  takesNewWires
                />
              )}
            </div>
          );
        })}
        </div>
      )}
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

/** The tag at a card header's right saying its node failed or is restarting; a healthy card has none. */
function NodeGraphCardConditionTag({ condition }: { condition: NodeGraphCardCondition }) {
  if (condition.look === "healthy") return null;
  if (condition.look === "restarting")
    return (
      <span className="node-graph-card-condition-tag ml-auto shrink-0 rounded-sm bg-well px-1.5 text-[10px] leading-4 font-medium text-fg-3" data-node-graph-condition-tag="restarting">
        Restarting
      </span>
    );
  return (
    <span className="node-graph-card-condition-tag ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-danger-soft px-1.5 text-[10px] leading-4 font-medium text-danger-text" data-node-graph-condition-tag="failed">
      <SquareX className="size-3" strokeWidth={1.75} aria-hidden />
      Failed
    </span>
  );
}

/** A note: its text, which a double-click edits on an editable canvas and leaving the field keeps, and its corners, which resize it while it is selected. */
function NodeGraphNoteView({ data, selected }: NodeProps<NodeGraphNoteFlowNode>) {
  const { graphNote } = data;
  const isEditable = useContext(NodeGraphEditableContext);
  const onNoteChanged = useContext(NodeGraphNoteEditingContext);
  const [textBeingEdited, setTextBeingEdited] = useState<string | null>(null);
  const keepTheText = () => {
    if (textBeingEdited !== null && textBeingEdited !== graphNote.text && onNoteChanged !== null) void onNoteChanged(graphNote.note_id, { text: textBeingEdited });
    setTextBeingEdited(null);
  };
  const keepTheResizedNote = useContext(NodeGraphNoteResizingContext);
  const keepTheSize: OnResizeEnd = (_event, resized) => keepTheResizedNote?.(graphNote.note_id, resized);
  return (
    <div
      className="node-graph-note size-full"
      data-node-graph-note={graphNote.note_id}
      data-selected={selected || undefined}
      onDoubleClick={isEditable ? () => setTextBeingEdited(graphNote.text) : undefined}
    >
      {isEditable && (
        <NodeResizer
          isVisible={selected}
          minWidth={NODE_GRAPH_NOTE_SMALLEST_SIZE.width}
          minHeight={NODE_GRAPH_NOTE_SMALLEST_SIZE.height}
          onResizeEnd={keepTheSize}
          handleClassName="node-graph-note-resize-handle"
          lineClassName="node-graph-note-resize-line"
        />
      )}
      {textBeingEdited === null ? (
        <p className="size-full overflow-hidden px-2.5 py-2 text-xs leading-4 whitespace-pre-wrap text-fg-2">{graphNote.text}</p>
      ) : (
        <textarea
          aria-label="Note text"
          className="nodrag nowheel size-full resize-none bg-transparent px-2.5 py-2 text-xs leading-4 text-fg outline-none"
          autoFocus
          value={textBeingEdited}
          onChange={(event) => setTextBeingEdited(event.target.value)}
          onBlur={keepTheText}
          onKeyDown={(event) => {
            if (event.key === "Escape") setTextBeingEdited(null);
            event.stopPropagation();
          }}
          data-node-graph-note-text-field={graphNote.note_id}
        />
      )}
    </div>
  );
}

/** A frame behind its cards: its title on a coloured tab, which a double-click edits on an editable canvas, and its description under it. */
function NodeGraphFrameView({ data }: NodeProps<NodeGraphFrameFlowNode>) {
  const { graphFrame } = data;
  const cardAndFrameEditing = useContext(NodeGraphCardAndFrameEditingContext);
  const frameRenaming = useContext(NodeGraphFrameRenamingContext);
  const isBeingRenamed = frameRenaming?.frameIdBeingRenamed === graphFrame.frame_id;
  const keepTheTitle = (title: string) => {
    const trimmedTitle = title.trim();
    if (trimmedTitle !== "" && trimmedTitle !== graphFrame.title) cardAndFrameEditing?.onFrameRenamed(graphFrame.frame_id, trimmedTitle);
    frameRenaming?.renameTheFrame(null);
  };
  const titleTabStyle = graphFrame.colour === null ? undefined : { backgroundColor: `color-mix(in srgb, ${graphFrame.colour} 30%, var(--studio-area))` };
  return (
    <div
      className="node-graph-frame size-full"
      style={graphFrame.colour === null ? undefined : { borderColor: `color-mix(in srgb, ${graphFrame.colour} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${graphFrame.colour} 7%, transparent)` }}
      data-node-graph-frame={graphFrame.frame_id}
    >
      {isBeingRenamed ? (
        <input
          aria-label="Frame title"
          className="node-graph-frame-title nodrag text-xs font-semibold text-fg outline-none"
          style={titleTabStyle}
          autoFocus
          defaultValue={graphFrame.title}
          onFocus={(focusEvent) => focusEvent.target.select()}
          onBlur={(blurEvent) => keepTheTitle(blurEvent.target.value)}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "Escape") keyboardEvent.currentTarget.value = graphFrame.title;
            if (keyboardEvent.key === "Enter" || keyboardEvent.key === "Escape") keyboardEvent.currentTarget.blur();
            keyboardEvent.stopPropagation();
          }}
          data-node-graph-frame-title-field={graphFrame.frame_id}
        />
      ) : (
        <span
          className="node-graph-frame-title nopan truncate text-xs font-semibold"
          style={titleTabStyle}
          onDoubleClick={cardAndFrameEditing === null ? undefined : () => frameRenaming?.renameTheFrame(graphFrame.frame_id)}
          data-node-graph-frame-title={graphFrame.frame_id}
        >
          {graphFrame.title}
        </span>
      )}
      {graphFrame.description !== null && graphFrame.description !== "" && (
        <p className="node-graph-frame-description truncate px-2.5 text-2xs text-fg-2">{graphFrame.description}</p>
      )}
    </div>
  );
}

function NodeGraphLinkView({
  id,
  data,
  selected,
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
      data-selected={selected || undefined}
    >
      <title>{description}</title>
      <BaseEdge
        id={id}
        path={linkPath}
        interactionWidth={14}
        className={cn("node-graph-link", `node-graph-link-${look}`, selected === true && "node-graph-link-selected")}
      />
    </g>
  );
}

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
  selectedNodeId,
  onNodeSelected,
  editing,
  overlay,
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  frames: readonly NodeGraphCanvasFrame[];
  notes: readonly NodeGraphCanvasNote[];
  selectedNodeId: string | null;
  onNodeSelected: (nodeId: string | null) => void;
  editing: NodeGraphCanvasEditing | null;
  overlay?: ReactNode;
}) {
  const reactFlow = useReactFlow();
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
  const [heldNotePositions, setHeldNotePositions] = useState<HeldPositionById>(new Map());
  const [heldNoteSizes, setHeldNoteSizes] = useState<ReadonlyMap<string, NodeGraphNoteSize>>(new Map());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set(selectedNodeId === null ? [] : [selectedNodeId]));
  const [selectedNoteIds, setSelectedNoteIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setSelectedIds((selectedBefore) => {
      if (selectedNodeId === null) return selectedBefore.size === 0 ? selectedBefore : new Set();
      return selectedBefore.has(selectedNodeId) ? selectedBefore : new Set([selectedNodeId]);
    });
  }, [selectedNodeId]);

  const savedPositionByNode = useMemo(() => new Map(nodes.map((node) => [node.node_id, node.saved_position])), [nodes]);
  useEffect(() => {
    setHeldCardPositions((held) => heldValuesNotShownYet(held, (nodeId, position) => samePosition(position, savedPositionByNode.get(nodeId))));
    setSelectedIds((selectedBefore) => {
      const stillInTheGraph = [...selectedBefore].filter((nodeId) => savedPositionByNode.has(nodeId));
      return stillInTheGraph.length === selectedBefore.size ? selectedBefore : new Set(stillInTheGraph);
    });
  }, [savedPositionByNode]);
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
        nodes.filter((node) => node.frame_id === graphFrame.frame_id).map((node) => ({ position: positionOfTheCard(node), ...sizeOfTheCard(node) })),
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
  }, [frames, notes, nodes, editing, positionOfTheCard, sizeOfTheCard, cardSizeByNode, heldNotePositions, heldNoteSizes, selectedIds, selectedNoteIds]);
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
    void reactFlow.fitView(FIT_TO_VIEW_OPTIONS);
    setHasBeenFramed(true);
  }, [isLaidOutOnMeasuredWidths, hasBeenFramed, reactFlow]);

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
        setSelectedIds(selectedAfter);
        const clickedLast = [...selectionChanges].reverse().find((change) => change.selected)?.id ?? [...selectedAfter][0] ?? null;
        if (clickedLast !== null || selectedAfter.size === 0) onNodeSelected(clickedLast);
      }
    },
    [onNodeSelected, nodeById, selectedIds, editing],
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
      const moves = [
        ...draggedCards.map((card) => ({ node_id: card.id, position: onTheCanvasPixel(card.position) })),
        ...nodes.filter((node) => node.saved_position === null && !draggedIds.has(node.node_id)).map((node) => ({ node_id: node.node_id, position: onTheCanvasPixel(positionOfTheCard(node)) })),
      ];
      setHeldCardPositions((held) => withEntriesSet(held, moves.map((move) => ({ id: move.node_id, value: move.position }))));
      void editing.onCardsMoved(moves, onlyCard === undefined || linkLetGoOver === null ? null : { node_id: onlyCard.id, link_id: linkLetGoOver }).then((answer) => {
        if (answer === "refused") setHeldCardPositions((held) => withoutTheIds(held, moves.map((move) => move.node_id)));
      });
    },
    [editing, nodeById, nodes, links, positionOfTheCard, sizeOfTheCard, linkMidpointsDrawn],
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

  const [frameIdBeingRenamed, setFrameIdBeingRenamed] = useState<string | null>(null);
  const frameIdsWhenAFrameWasAskedFor = useRef<ReadonlySet<string> | null>(null);
  const frameTheSelection = useCallback(() => {
    if (editing === null) return;
    const frameIdsBefore = new Set(frames.map((frame) => frame.frame_id));
    frameIdsWhenAFrameWasAskedFor.current = frameIdsBefore;
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
    setFrameIdBeingRenamed(newFrame.frame_id);
  }, [frames]);
  const frameRenaming = useMemo(() => ({ frameIdBeingRenamed, renameTheFrame: setFrameIdBeingRenamed }), [frameIdBeingRenamed]);
  const cardAndFrameEditing = useMemo(() => (editing === null ? null : { onFrameRenamed: editing.onFrameRenamed, onCardCollapsed: editing.onCardCollapsed }), [editing]);

  const followTheKeys = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editing === null || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
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
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (selectedIds.size === 0 && selectedLinkIds.size === 0 && selectedNoteIds.size === 0) return;
        event.preventDefault();
        editing.onDeleted({ node_ids: [...selectedIds], link_ids: [...selectedLinkIds], note_ids: [...selectedNoteIds] });
        setSelectedLinkIds(new Set());
        setSelectedNoteIds(new Set());
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          onNodeSelected(null);
        }
      }
    },
    [editing, middleOfTheView, selectedIds, selectedLinkIds, selectedNoteIds, frameTheSelection, onNodeSelected],
  );

  return (
    <NodeGraphSelectionContext value={selectedIds}>
      <NodeGraphEditableContext value={editing !== null}>
        <NodeGraphNoteEditingContext value={editing?.onNoteChanged ?? null}>
        <NodeGraphNoteResizingContext value={editing === null ? null : keepTheResizedNote}>
          <NodeGraphCardAndFrameEditingContext value={cardAndFrameEditing}>
            <NodeGraphFrameRenamingContext value={frameRenaming}>
          <NodeGraphLinkedPinsContext value={linkedPins}>
            <div
              ref={canvasElement}
              className="relative size-full"
              tabIndex={editing === null ? undefined : 0}
              onKeyDown={followTheKeys}
              onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                pointerRestsAt.current = canvasPointOf({ x: event.clientX, y: event.clientY });
              }}
              data-node-graph-editable={editing !== null || undefined}
            >
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
                onConnect={wireThePins}
                onConnectEnd={followTheWireLetGo}
                isValidConnection={canTheConnectionBeWired}
                onPaneClick={() => {
                  onNodeSelected(null);
                  setSelectedLinkIds(new Set());
                  setSelectedNoteIds(new Set());
                  setSelectedIds(new Set());
                }}
                nodesDraggable={editing !== null}
                nodesConnectable={editing !== null}
                edgesFocusable={editing !== null}
                elementsSelectable
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
                  {editing !== null && (
                    <>
                      <IconButton icon={Plus} label="Add node" tooltip="Add node (Tab)" size="compact" onPressed={() => editing.onNodeAskedFor(clearPlaceBroughtIntoView())} data-node-graph-tool="add_node" />
                      <IconButton
                        icon={Frame}
                        label="Frame the selected nodes"
                        tooltip="Frame the selected nodes (F)"
                        disabledReason={selectedIds.size === 0 ? "Select the nodes to frame first" : null}
                        size="compact"
                        onPressed={frameTheSelection}
                        data-node-graph-tool="frame_selection"
                      />
                      <IconButton icon={StickyNote} label="Add a note" size="compact" onPressed={() => editing.onNoteAskedFor(clearPlaceBroughtIntoView())} data-node-graph-tool="add_note" />
                    </>
                  )}
                </div>
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
                {overlay}
              </ReactFlow>
            </div>
          </NodeGraphLinkedPinsContext>
            </NodeGraphFrameRenamingContext>
          </NodeGraphCardAndFrameEditingContext>
        </NodeGraphNoteResizingContext>
        </NodeGraphNoteEditingContext>
      </NodeGraphEditableContext>
    </NodeGraphSelectionContext>
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
  selectedNodeId,
  onNodeSelected,
  editing = null,
  overlay,
  ...controlDataAttributes
}: {
  label: string;
  nodes: readonly NodeGraphCanvasNode[];
  links: readonly NodeGraphCanvasLink[];
  frames?: readonly NodeGraphCanvasFrame[];
  notes?: readonly NodeGraphCanvasNote[];
  selectedNodeId: string | null;
  onNodeSelected: (nodeId: string | null) => void;
  /** What a person's edits ask for; `null` draws the graph read only. */
  editing?: NodeGraphCanvasEditing | null;
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
          selectedNodeId={selectedNodeId}
          onNodeSelected={onNodeSelected}
          editing={editing}
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
