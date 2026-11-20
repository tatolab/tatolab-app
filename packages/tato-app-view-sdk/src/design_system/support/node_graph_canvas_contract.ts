import type { NodePin } from "../../pin_model/node_pins";
import type { NodeGraphPosition } from "./node_graph_layout";

/** How a card shows its node is doing: as every healthy card, restarting (a quiet tag), not ready (amber, why in the runtime's words on the tag's tooltip), or failed (red, with why in the runtime's words when it gave them). */
export type NodeGraphCardCondition =
  | { look: "healthy" }
  | { look: "restarting" }
  | { look: "not_ready"; not_ready_because: string }
  | { look: "failed"; failed_because: string | null };

/** One node a graph canvas draws: its name on the card's header, how it is doing, its pins as the pin model's rows (an input's socket on the left, an output's on the right), where it was left, and the frame it sits in. */
export interface NodeGraphCanvasNode {
  node_id: string;
  title: string;
  /** Its type's short name, quiet beside the title; `null` when the title already says it. */
  type_name: string | null;
  /** Its node type in full, as `nodes.crossfade:Crossfade`, by which a module registers the body that draws its card; `null` where no body is drawn. */
  node_type: string | null;
  /** Its node type's description, shown while the pointer rests on the card's header; `null` for none. */
  description: string | null;
  condition: NodeGraphCardCondition;
  inputs: readonly NodePin[];
  outputs: readonly NodePin[];
  /** Where its card was left; `null` lays it out with the other cards that have none. */
  saved_position: NodeGraphPosition | null;
  /** The frame drawn around it, by `frame_id`; `null` for none. */
  frame_id: string | null;
  /** Drawn as its header alone, its wires meeting the header's edges. */
  is_collapsed: boolean;
  /** How the subgraph it holds came to be, which a double-click steps inside; `null` for a node that holds none. */
  subgraph: NodeGraphSubgraphKind | null;
  /** What kind of node it is, which its header shows by an icon and a colour. */
  kind: NodeGraphCardKind;
}

/** The language a function node is written in, which its header names. */
export type NodeGraphFunctionLanguage = "python" | "rust";

/**
 * What kind of node a card draws: how its code runs (a process, a shader or a function, with the function's language
 * where it is known), a subgraph a generator made or a selection collapsed into, another stream placed by reference, or
 * `unknown` where nothing says, as for a type no module registers.
 */
export type NodeGraphCardKind =
  | { look: "process" }
  | { look: "shader" }
  | { look: "function"; language: NodeGraphFunctionLanguage | null }
  | { look: "subgraph" }
  | { look: "placed_stream" }
  | { look: "unknown" };

/** Whether a card's node type has code to open, and what opening it does, or why it has none in words a person reads. */
export type NodeGraphCardCode = { kind: "opens"; onOpened: () => void } | { kind: "does_not_open"; because: string };

/** How a subgraph came to be: a graph generator's read-only output, a collapsed selection, or another stream placed by reference. */
export type NodeGraphSubgraphKind = "generated" | "placed_stream";

/** A labelled frame drawn around the cards that name it, with its title on a tab, its description under it, and a tint of its colour. */
export interface NodeGraphCanvasFrame {
  frame_id: string;
  title: string;
  description: string | null;
  /** A CSS colour the frame is tinted with; `null` for the canvas's own. */
  colour: string | null;
}

/** What an edit of a frame changes: its title, its description or its colour, each one given. */
export interface NodeGraphCanvasFrameChange {
  title?: string;
  description?: string;
  colour?: string;
}

/** The colours a frame's right-click menu offers before Custom color…, each a hex colour as the runtime stores a group's. */
export const NODE_GRAPH_FRAME_COLOURS: readonly { name: string; colour: string }[] = [
  { name: "Red", colour: "#c46a6a" },
  { name: "Yellow", colour: "#c9b45a" },
  { name: "Green", colour: "#6f9e6a" },
  { name: "Blue", colour: "#5f86b8" },
  { name: "Purple", colour: "#8f72b5" },
];

/** A note on the canvas beside the cards: its text, where its top-left corner sits and its size. */
export interface NodeGraphCanvasNote {
  note_id: string;
  text: string;
  position: NodeGraphPosition;
  size: { width: number; height: number };
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
  /** What the runtime warns the link does that a person may not expect, in its words, which draw the link amber; empty where it warns of nothing. */
  warning_words: readonly string[];
}

/** One end of a wire a person drew: a card's pin. */
export interface NodeGraphCanvasPinEnd {
  node_id: string;
  pin: string;
}

/** A pin a person drags a wire off: which side of its card it is on. */
export interface NodeGraphCanvasDraggedPin extends NodeGraphCanvasPinEnd {
  side: "input" | "output";
}

/** How the runtime answered that a wire dragged off a pin would link to another pin: as it is, converted for free, through a convert node it places, refused, or not checked. */
export type NodeGraphWireFitOutcome = "connects" | "connects_with_free_conversion" | "connects_through_convert_node" | "refused" | "not_checked";

/** How a wire dragged off a pin fits one pin of a card, and what a pointer resting on that pin's socket reads of it, such as the runtime's refusal in its words; `null` for nothing more. */
export interface NodeGraphPinWireFit {
  outcome: NodeGraphWireFitOutcome;
  words: string | null;
}

/** How a wire dragged off a pin fits each pin it was asked about, keyed by `nodeGraphPinKey`; a pin not in it is not judged, so its socket stays as it is and the wire can be let go on it. */
export type NodeGraphWireFits = ReadonlyMap<string, NodeGraphPinWireFit>;

/** The key of the pin `pin` on side `side` of the card `nodeId` in a `NodeGraphWireFits`. */
export function nodeGraphPinKey(nodeId: string, side: "input" | "output", pin: string): string {
  return JSON.stringify([nodeId, side, pin]);
}

/** A point a person pointed at: on the canvas, where a card placed there sits, and in the canvas element's own pixels, where a menu opened there shows. */
export interface NodeGraphCanvasPoint {
  on_the_canvas: NodeGraphPosition;
  in_the_element: { x: number; y: number };
}

/** The canvas's pan and zoom, as React Flow keeps its viewport. */
export interface NodeGraphCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** A card's new top-left corner and the frame it belongs to there, by `frame_id`; `null` for none. */
export interface NodeGraphCanvasCardMove {
  node_id: string;
  position: NodeGraphPosition;
  frame_id: string | null;
}

/** Whether an edit the canvas asked for was applied; a refused one puts what it moved back. */
export type NodeGraphCanvasEditAnswer = "applied" | "refused";

/** What a person's edits on the canvas ask for; each call is one gesture. */
export interface NodeGraphCanvasEditing {
  /** Cards dragged and let go, each at its new top-left corner and in the frame it now belongs to, together with every card that had no saved place, so the layout stays as seen; a lone card with no links let go of over a link is spliced into it in the same gesture. */
  onCardsMoved(moves: readonly NodeGraphCanvasCardMove[], cardLetGoOverALink: { node_id: string; link_id: string } | null): Promise<NodeGraphCanvasEditAnswer>;
  /** A wire dragged off `from`, asking once how it fits every other pin; the canvas judges nothing until the answer arrives, and drops an answer that arrives after the wire is let go. */
  fitsOfAWireFrom(from: NodeGraphCanvasDraggedPin): Promise<NodeGraphWireFits>;
  /** A wire drawn from an output pin to an input pin that the answer to `fitsOfAWireFrom` did not refuse. */
  onPinsWired(source: NodeGraphCanvasPinEnd, target: NodeGraphCanvasPinEnd): void;
  /** A wire dragged off a pin and let go of over empty canvas, to place a node there that it feeds or reads. */
  onWireLetGoOverTheCanvas(looseWire: NodeGraphCanvasDraggedPin, at: NodeGraphCanvasPoint): void;
  /** Tab pressed over the canvas, to place a node where the pointer rests, or Add node pressed, to place one in the middle of the view. */
  onNodeAskedFor(at: NodeGraphCanvasPoint): void;
  /** Note pressed, to place a note in the middle of the view. */
  onNoteAskedFor(at: NodeGraphCanvasPoint): void;
  /** The selected cards, links and notes, deleted with Backspace or Delete. */
  onDeleted(deleted: { node_ids: readonly string[]; link_ids: readonly string[]; note_ids: readonly string[] }): void;
  /** F, ⌘G or Frame pressed with cards selected, to frame them. */
  onFrameAskedFor(nodeIds: readonly string[]): Promise<NodeGraphCanvasEditAnswer>;
  /** ⌘⇧G or Subgraph pressed with cards selected, to collapse them into one subgraph. */
  onSubgraphAskedFor(nodeIds: readonly string[]): void;
  /** A frame's title or description edited on its tab, or a colour chosen from its right-click menu; a field not given is kept. */
  onFrameChanged(frameId: string, change: NodeGraphCanvasFrameChange): void;
  /** Remove frame chosen from a frame's right-click menu: the frame goes and its cards stay. */
  onFrameRemoved(frameId: string): void;
  /** A card's chevron pressed, to collapse it to its header or open it again. */
  onCardCollapsed(nodeId: string, collapsed: boolean): void;
  /** A note's text edited, or the note moved or resized. */
  onNoteChanged(noteId: string, change: { text?: string; position?: NodeGraphPosition; size?: { width: number; height: number } }): Promise<NodeGraphCanvasEditAnswer>;
}
