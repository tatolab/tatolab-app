import { NodeResizer, type NodeProps, type OnResizeEnd } from "@xyflow/react";
import { useContext, useState } from "react";
import { type NodeGraphNoteFlowNode, NodeGraphEditableContext, NodeGraphNoteEditingContext, NodeGraphNoteResizingContext } from "./support/node_graph_flow_elements";

const NODE_GRAPH_NOTE_SMALLEST_SIZE = { width: 120, height: 60 };

/** A note: its text, which a double-click edits on an editable canvas and leaving the field keeps, and its corners, which resize it while it is selected. */
export function NodeGraphNoteView({ data, selected }: NodeProps<NodeGraphNoteFlowNode>) {
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
