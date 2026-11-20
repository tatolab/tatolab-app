import type { Edge, Node } from "@xyflow/react";
import { createContext } from "react";
import type { NodeGraphPosition } from "./node_graph_layout";
import type { PinTypeKey } from "../../pin_model/pin_type_words";
import type { InputValues } from "../../pin_services/input_values";
import type { NodeGraphCanvasNode, NodeGraphCanvasFrame, NodeGraphCanvasNote, NodeGraphCanvasLink, NodeGraphCanvasEditing, NodeGraphWireFits } from "./node_graph_canvas_contract";

/** A card as React Flow holds it. */
export type NodeGraphCardFlowNode = Node<
  { graphNode: NodeGraphCanvasNode },
  "node_graph_card"
>;

/** A note as React Flow holds it. */
export type NodeGraphNoteFlowNode = Node<
  { graphNote: NodeGraphCanvasNote },
  "node_graph_note"
>;

/** A frame as React Flow holds it. */
export type NodeGraphFrameFlowNode = Node<
  { graphFrame: NodeGraphCanvasFrame },
  "node_graph_frame"
>;

/** Any node React Flow holds for the canvas: a card, a note or a frame. */
export type NodeGraphFlowNode = NodeGraphCardFlowNode | NodeGraphNoteFlowNode | NodeGraphFrameFlowNode;

/** A link as React Flow holds it, with the type key of the pin it starts from, which colours it. */
export type NodeGraphLinkFlowEdge = Edge<
  { graphLink: NodeGraphCanvasLink; pin_type_key: PinTypeKey },
  "node_graph_link"
>;

/** The React Flow handle id of the socket of a card's input row whose key, as `nodePinRowKey` writes it, is `rowKey`. */
export const inputPinHandleId = (rowKey: string) => `input:${rowKey}`;

/** The React Flow handle id of the socket of a card's output row whose key, as `nodePinRowKey` writes it, is `rowKey`. */
export const outputPinHandleId = (rowKey: string) => `output:${rowKey}`;

/** The key React Flow 12 keeps a handle's links under in its store's `connectionLookup`, as its `useNodeConnections` spells it. */
export const connectionLookupKeyOfTheHandle = (nodeId: string, handleType: "source" | "target", handleId: string) => `${nodeId}-${handleType}-${handleId}`;

/** The attribute every inline control on a card carries, which the canvas hides by while zoomed out past reading it. */
export const NODE_GRAPH_INLINE_CONTROL_ATTRIBUTE = "data-node-graph-inline-control";

/** The store a card's rows read each input's value from; `null` shows no value. */
export const NodeGraphInputValuesContext = createContext<InputValues | null>(null);

/** Whether the canvas takes edits, which lets its pins start wires and its notes be edited. */
export const NodeGraphEditableContext = createContext<boolean>(false);

/** How the wire being dragged fits each pin, once the runtime has answered; `null` while no wire is dragged or no answer has arrived. */
export const NodeGraphWireFitsContext = createContext<NodeGraphWireFits | null>(null);

/** What a note asks for when its text is edited or it is resized. */
export const NodeGraphNoteEditingContext = createContext<NodeGraphCanvasEditing["onNoteChanged"] | null>(null);

/** What a note's corners ask for when a resize ends; `null` on a read-only canvas. */
export const NodeGraphNoteResizingContext = createContext<((noteId: string, resized: NodeGraphPosition & { width: number; height: number }) => void) | null>(null);

/** What a card's chevron and a frame's title ask for on an editable canvas; `null` on a read-only one. */
export const NodeGraphCardAndFrameEditingContext = createContext<Pick<NodeGraphCanvasEditing, "onFrameChanged" | "onFrameRemoved" | "onCardCollapsed" | "onBundleOpened"> | null>(null);

/** The colours the canvas's frames use beyond the presets, which each frame's Color menu offers again. */
export const NodeGraphFrameColoursUsedContext = createContext<readonly string[]>([]);

/** Opens the colour picker for the frame it names. */
export const NodeGraphFrameColourPickingContext = createContext<(frameId: string) => void>(() => undefined);

/** Which of a frame's words is typed on its tab: its title or its description. */
export type NodeGraphFrameWordsFieldName = "title" | "description";

/** A frame's title or description being edited, with what was typed for it before its field opened. */
export interface NodeGraphFrameWordsBeingEdited {
  frame_id: string;
  field: NodeGraphFrameWordsFieldName;
  typed_ahead?: string;
}

/** The frame whose title or description is being edited, and how a frame starts or stops having one edited; `null` outside a canvas. */
export const NodeGraphFrameWordsEditingContext = createContext<{
  frameWordsBeingEdited: NodeGraphFrameWordsBeingEdited | null;
  editTheFrameWords: (edited: NodeGraphFrameWordsBeingEdited | null) => void;
} | null>(null);
