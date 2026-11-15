import { ChevronDown, ChevronRight, Combine, Frame, Palette, Pencil, Pipette, Plus, Scan, StickyNote, Text, Trash2, Ungroup } from "lucide-react";
import { RightClickMenuItem, RightClickMenuSeparator, RightClickMenuSingleChoiceGroup, RightClickSubmenu } from "./menus";
import { useContext } from "react";
import { type NodeGraphCanvasNode, type NodeGraphCanvasFrame, NODE_GRAPH_FRAME_COLOURS, type NodeGraphCanvasPoint, type NodeGraphCanvasEditing } from "./support/node_graph_canvas_contract";
import { NodeGraphFrameColoursUsedContext } from "./support/node_graph_flow_elements";
import type { NodeGraphFrameWordsField } from "./node_graph_frame_view";

/** What a right-click on the canvas landed on: the canvas itself at a point, a card, a link or a note. */
export type NodeGraphRightClicked =
  | { kind: "canvas"; at: NodeGraphCanvasPoint }
  | { kind: "card"; node_id: string }
  | { kind: "link"; link_id: string }
  | { kind: "note"; note_id: string };

/** What a right-click on a frame's tab offers on an editable canvas: rename it, describe it, colour it, or remove it and keep its cards. */
export function NodeGraphFrameRightClickChoices({
  graphFrame,
  frameEditing,
  editTheFrameWords,
  openTheColourPicker,
}: {
  graphFrame: NodeGraphCanvasFrame;
  frameEditing: Pick<NodeGraphCanvasEditing, "onFrameChanged" | "onFrameRemoved">;
  editTheFrameWords: (field: NodeGraphFrameWordsField) => void;
  openTheColourPicker: () => void;
}) {
  const hasADescription = graphFrame.description !== null && graphFrame.description !== "";
  const coloursUsedElsewhere = useContext(NodeGraphFrameColoursUsedContext);
  const colourChoices = [...NODE_GRAPH_FRAME_COLOURS, ...coloursUsedElsewhere.map((colour) => ({ name: colour.toUpperCase(), colour }))];
  return (
    <>
      <RightClickMenuItem icon={Pencil} onChosen={() => editTheFrameWords("title")} data-node-graph-frame-choice="rename">
        Rename
      </RightClickMenuItem>
      <RightClickMenuItem icon={Text} onChosen={() => editTheFrameWords("description")} data-node-graph-frame-choice="describe">
        {hasADescription ? "Edit description" : "Add description"}
      </RightClickMenuItem>
      <RightClickSubmenu label="Color" icon={Palette} data-node-graph-frame-choice="colour">
        <RightClickMenuSingleChoiceGroup
          choices={colourChoices.map(({ name, colour }) => ({
            choice: colour,
            label: (
              <span className="flex items-center gap-2">
                <span className="node-graph-frame-colour-swatch" style={{ backgroundColor: colour }} aria-hidden />
                {name}
              </span>
            ),
          }))}
          chosen={graphFrame.colour?.toLowerCase() ?? null}
          onChosen={(colour) => frameEditing.onFrameChanged(graphFrame.frame_id, { colour })}
          dataAttributeOfEachChoice="data-node-graph-frame-colour"
        />
        <RightClickMenuSeparator />
        <RightClickMenuItem icon={Pipette} onChosen={openTheColourPicker} data-node-graph-frame-choice="custom_colour">
          Custom color…
        </RightClickMenuItem>
      </RightClickSubmenu>
      <RightClickMenuSeparator />
      <RightClickMenuItem icon={Ungroup} isDestructive onChosen={() => frameEditing.onFrameRemoved(graphFrame.frame_id)} data-node-graph-frame-choice="remove">
        Remove frame
      </RightClickMenuItem>
    </>
  );
}

/** What a right-click on the canvas offers: on the canvas, a node or a note placed there; on a card, what F, ⇧⌘G and Delete do to the selection it joins; on a link or a note, removing it. */
export function NodeGraphRightClickChoices({
  rightClicked,
  graphNode,
  editing,
  selectedCardCount,
  onFrameTheSelection,
  onCollapseTheSelection,
  onDeleteTheSelection,
  onFrameTheWholeGraph,
  onSubgraphOpened,
}: {
  rightClicked: NodeGraphRightClicked;
  /** The card right-clicked, when it was one. */
  graphNode: NodeGraphCanvasNode | null;
  editing: NodeGraphCanvasEditing | null;
  selectedCardCount: number;
  onFrameTheSelection: () => void;
  onCollapseTheSelection: () => void;
  onDeleteTheSelection: () => void;
  onFrameTheWholeGraph: () => void;
  onSubgraphOpened: ((nodeId: string) => void) | null;
}) {
  const frameTheWholeGraphChoice = (
    <RightClickMenuItem icon={Scan} onChosen={onFrameTheWholeGraph} data-node-graph-choice="frame_all">
      Frame the whole graph
    </RightClickMenuItem>
  );
  if (rightClicked.kind === "link") {
    return (
      <RightClickMenuItem icon={Trash2} isDestructive shortcutHint="⌫" onChosen={onDeleteTheSelection} data-node-graph-choice="delete">
        Delete link
      </RightClickMenuItem>
    );
  }
  if (rightClicked.kind === "note") {
    return (
      <RightClickMenuItem icon={Trash2} isDestructive shortcutHint="⌫" onChosen={onDeleteTheSelection} data-node-graph-choice="delete">
        Delete note
      </RightClickMenuItem>
    );
  }
  if (rightClicked.kind === "canvas") {
    return (
      <>
        {editing !== null && (
          <>
            <RightClickMenuItem icon={Plus} shortcutHint="Tab" onChosen={() => editing.onNodeAskedFor(rightClicked.at)} data-node-graph-choice="add_node">
              Add node…
            </RightClickMenuItem>
            <RightClickMenuItem icon={StickyNote} onChosen={() => editing.onNoteAskedFor(rightClicked.at)} data-node-graph-choice="add_note">
              Add note
            </RightClickMenuItem>
            <RightClickMenuSeparator />
          </>
        )}
        {frameTheWholeGraphChoice}
      </>
    );
  }
  const isASubgraph = graphNode !== null && graphNode.subgraph !== null && onSubgraphOpened !== null;
  const selectionWords = selectedCardCount > 1 ? `the ${selectedCardCount} selected nodes` : "the node";
  return (
    <>
      {isASubgraph && (
        <RightClickMenuItem icon={ChevronRight} onChosen={() => onSubgraphOpened(rightClicked.node_id)} data-node-graph-choice="open_subgraph">
          Step inside
        </RightClickMenuItem>
      )}
      {editing !== null && graphNode !== null && (
        <>
          {isASubgraph && <RightClickMenuSeparator />}
          <RightClickMenuItem icon={Frame} shortcutHint="F" onChosen={onFrameTheSelection} data-node-graph-choice="frame_selection">
            Frame {selectionWords}
          </RightClickMenuItem>
          <RightClickMenuItem icon={Combine} shortcutHint="⇧⌘G" onChosen={onCollapseTheSelection} data-node-graph-choice="add_subgraph">
            Collapse into a subgraph
          </RightClickMenuItem>
          <RightClickMenuItem
            icon={graphNode.is_collapsed ? ChevronDown : ChevronRight}
            onChosen={() => editing.onCardCollapsed(graphNode.node_id, !graphNode.is_collapsed)}
            data-node-graph-choice={graphNode.is_collapsed ? "expand_card" : "collapse_card"}
          >
            {graphNode.is_collapsed ? "Show its pins" : "Hide its pins"}
          </RightClickMenuItem>
          <RightClickMenuSeparator />
          <RightClickMenuItem icon={Trash2} isDestructive shortcutHint="⌫" onChosen={onDeleteTheSelection} data-node-graph-choice="delete">
            Delete {selectionWords}
          </RightClickMenuItem>
        </>
      )}
      {editing === null && !isASubgraph && frameTheWholeGraphChoice}
    </>
  );
}
