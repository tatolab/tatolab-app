import type { NodeProps } from "@xyflow/react";
import { cn } from "cn";
import { RightClickMenu } from "./menus";
import { useContext, type CSSProperties } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { type NodeGraphFrameFlowNode, type NodeGraphFrameWordsFieldName, NodeGraphCardAndFrameEditingContext, NodeGraphFrameColourPickingContext, NodeGraphFrameWordsEditingContext } from "./support/node_graph_flow_elements";
import { NodeGraphFrameRightClickChoices } from "./node_graph_right_click_choices";

/** A frame's title or description typed in place: Enter or leaving the field keeps it, Escape puts the words back. */
export function NodeGraphFrameWordsField({
  label,
  className,
  style,
  words,
  typedAhead = null,
  onKept,
  ...controlDataAttributes
}: {
  label: string;
  className: string;
  style: CSSProperties | undefined;
  words: string;
  /** What was typed before the field opened, which it opens holding with the caret after it. */
  typedAhead?: string | null;
  onKept: (words: string) => void;
} & ControlDataAttributes) {
  return (
    <input
      aria-label={label}
      className={cn("nodrag outline-none", className)}
      style={style}
      autoFocus
      defaultValue={typedAhead ?? words}
      onFocus={(focusEvent) => {
        if (typedAhead === null) focusEvent.target.select();
        else focusEvent.target.setSelectionRange(typedAhead.length, typedAhead.length);
      }}
      onBlur={(blurEvent) => onKept(blurEvent.target.value)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Escape") keyboardEvent.currentTarget.value = words;
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === "Escape") keyboardEvent.currentTarget.blur();
        keyboardEvent.stopPropagation();
      }}
      {...controlDataAttributes}
    />
  );
}

/** A frame behind its cards: its title on a coloured tab and its description under it, each edited on a double-click or from the tab's right-click menu on an editable canvas. */
export function NodeGraphFrameView({ data }: NodeProps<NodeGraphFrameFlowNode>) {
  const { graphFrame } = data;
  const cardAndFrameEditing = useContext(NodeGraphCardAndFrameEditingContext);
  const frameWordsEditing = useContext(NodeGraphFrameWordsEditingContext);
  const fieldBeingEdited = frameWordsEditing?.frameWordsBeingEdited?.frame_id === graphFrame.frame_id ? frameWordsEditing.frameWordsBeingEdited.field : null;
  const description = graphFrame.description ?? "";
  const keepTheTitle = (title: string) => {
    const trimmedTitle = title.trim();
    if (trimmedTitle !== "" && trimmedTitle !== graphFrame.title) cardAndFrameEditing?.onFrameChanged(graphFrame.frame_id, { title: trimmedTitle });
    frameWordsEditing?.editTheFrameWords(null);
  };
  const keepTheDescription = (typedDescription: string) => {
    const trimmedDescription = typedDescription.trim();
    if (trimmedDescription !== description) cardAndFrameEditing?.onFrameChanged(graphFrame.frame_id, { description: trimmedDescription });
    frameWordsEditing?.editTheFrameWords(null);
  };
  const editTheWords = (field: NodeGraphFrameWordsFieldName) => frameWordsEditing?.editTheFrameWords({ frame_id: graphFrame.frame_id, field });
  const editTheWordsOnADoubleClick = (field: NodeGraphFrameWordsFieldName) => (cardAndFrameEditing === null ? undefined : () => editTheWords(field));
  const pickTheFramesColour = useContext(NodeGraphFrameColourPickingContext);
  const titleTabStyle = graphFrame.colour === null ? undefined : { backgroundColor: `color-mix(in srgb, ${graphFrame.colour} 30%, var(--studio-area))` };
  const titleTab = (
    <span
      className="node-graph-frame-title nopan truncate text-xs font-semibold"
      style={titleTabStyle}
      onDoubleClick={editTheWordsOnADoubleClick("title")}
      data-node-graph-frame-title={graphFrame.frame_id}
    >
      {graphFrame.title}
    </span>
  );
  return (
    <div
      className="node-graph-frame size-full"
      style={graphFrame.colour === null ? undefined : { borderColor: `color-mix(in srgb, ${graphFrame.colour} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${graphFrame.colour} 7%, transparent)` }}
      data-node-graph-frame={graphFrame.frame_id}
    >
      {fieldBeingEdited === "title" ? (
        <NodeGraphFrameWordsField
          label="Frame title"
          className="node-graph-frame-title text-xs font-semibold text-fg"
          style={titleTabStyle}
          words={graphFrame.title}
          typedAhead={frameWordsEditing?.frameWordsBeingEdited?.typed_ahead ?? null}
          onKept={keepTheTitle}
          data-node-graph-frame-title-field={graphFrame.frame_id}
        />
      ) : cardAndFrameEditing === null ? (
        titleTab
      ) : (
        <RightClickMenu
          label={`Frame ${graphFrame.title}`}
          choices={<NodeGraphFrameRightClickChoices graphFrame={graphFrame} frameEditing={cardAndFrameEditing} editTheFrameWords={editTheWords} openTheColourPicker={() => pickTheFramesColour(graphFrame.frame_id)} />}
          returnsFocusToTheRowOnClosing={false}
        >
          {titleTab}
        </RightClickMenu>
      )}
      {fieldBeingEdited === "description" ? (
        <NodeGraphFrameWordsField
          label="Frame description"
          className="node-graph-frame-description node-graph-frame-description-field mx-2.5 text-2xs text-fg"
          style={undefined}
          words={description}
          onKept={keepTheDescription}
          data-node-graph-frame-description-field={graphFrame.frame_id}
        />
      ) : (
        description !== "" && (
          <p
            className={cn("node-graph-frame-description truncate px-2.5 text-2xs text-fg-2", cardAndFrameEditing !== null && "node-graph-frame-description-editable nopan")}
            onDoubleClick={editTheWordsOnADoubleClick("description")}
            data-node-graph-frame-description={graphFrame.frame_id}
          >
            {description}
          </p>
        )
      )}
    </div>
  );
}
