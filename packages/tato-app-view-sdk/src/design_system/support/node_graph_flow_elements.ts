import type { Edge, Node } from "@xyflow/react";
import { createContext } from "react";
import type { NodeGraphPosition } from "./node_graph_layout";
import type { NodeGraphPinFamily, NodeGraphCanvasNode, NodeGraphCanvasFrame, NodeGraphCanvasNote, NodeGraphCanvasLink, NodeGraphCanvasEditing } from "./node_graph_canvas_contract";

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

/** A link as React Flow holds it, with the family of the pins it joins. */
export type NodeGraphLinkFlowEdge = Edge<
  { graphLink: NodeGraphCanvasLink; family: NodeGraphPinFamily | null },
  "node_graph_link"
>;

/** The React Flow handle id of a card's input pin `pinName`. */
export const inputPinHandleId = (pinName: string) => `input:${pinName}`;

/** The React Flow handle id of a card's output pin `pinName`. */
export const outputPinHandleId = (pinName: string) => `output:${pinName}`;

/** The cards drawn selected, which every card reads so a selection redraws cards without rebuilding the graph. */
export const NodeGraphSelectionContext = createContext<ReadonlySet<string>>(new Set());

/** The pick a card is drawn for while the canvas picks a port: the ports of each node that can join, the node asking which of its ports, and what choosing one does; `null` while nothing is picked. */
export const NodeGraphPortPickingContext = createContext<{ portsThatCanJoinByNodeId: ReadonlyMap<string, readonly string[]>; nodeAskingWhichPort: string | null; onPortChosen: (nodeId: string, port: string) => void; onAskWhichClosed: () => void } | null>(null);

/** Whether the canvas takes edits, which lets its pins start wires and its notes be edited. */
export const NodeGraphEditableContext = createContext<boolean>(false);

/** What a note asks for when its text is edited or it is resized. */
export const NodeGraphNoteEditingContext = createContext<NodeGraphCanvasEditing["onNoteChanged"] | null>(null);

/** What a note's corners ask for when a resize ends; `null` on a read-only canvas. */
export const NodeGraphNoteResizingContext = createContext<((noteId: string, resized: NodeGraphPosition & { width: number; height: number }) => void) | null>(null);

/** What a card's chevron and a frame's title ask for on an editable canvas; `null` on a read-only one. */
export const NodeGraphCardAndFrameEditingContext = createContext<Pick<NodeGraphCanvasEditing, "onFrameChanged" | "onFrameRemoved" | "onCardCollapsed"> | null>(null);

/** The colours the canvas's frames use beyond the presets, which each frame's Color menu offers again. */
export const NodeGraphFrameColoursUsedContext = createContext<readonly string[]>([]);

/** Opens the colour picker for the frame it names. */
export const NodeGraphFrameColourPickingContext = createContext<(frameId: string) => void>(() => undefined);

/** Every pin a link joins, by `linkedPinKey`, which a card draws filled. */
export const NodeGraphLinkedPinsContext = createContext<ReadonlySet<string>>(
  new Set(),
);

/** The key of a card's pin in `NodeGraphLinkedPinsContext`. */
export const linkedPinKey = (
  nodeId: string,
  side: "input" | "output",
  pinName: string,
) => `${nodeId}\u0000${side}\u0000${pinName}`;

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
