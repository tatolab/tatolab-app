import type { NodeGraphCanvasEditAnswer } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { useRef, useState } from "react";
import type { StreamGraphEditRefusal, SuggestedGraphEditToSend } from "./stream_graph_edit_sending";

/** The view's surface the person was editing, the graph's canvas or the outliner's tree, which takes the focus back once the fix applies and the bar is gone. */
const THE_VIEWS_EDITING_SURFACE = "[data-node-graph-editable], [role='tree'] [tabindex='0']";

/**
 * The bar across the top of a graph's view saying why its latest edit did not apply, in the runtime's words, with the edit the runtime suggested as one action,
 * which waits while the fix is being applied.
 */
export function StreamGraphEditRefusalBar({
  refusal,
  sendTheSuggestedEdit,
}: {
  refusal: StreamGraphEditRefusal | null;
  sendTheSuggestedEdit: (suggested: SuggestedGraphEditToSend) => Promise<NodeGraphCanvasEditAnswer>;
}) {
  const [isTheFixBeingApplied, setIsTheFixBeingApplied] = useState(false);
  const isSending = useRef(false);
  if (refusal === null) return null;
  const { suggestedEdit } = refusal;
  const takeTheFix = async (suggested: SuggestedGraphEditToSend) => {
    if (isSending.current) return;
    isSending.current = true;
    setIsTheFixBeingApplied(true);
    try {
      if ((await sendTheSuggestedEdit(suggested)) === "applied") document.querySelector<HTMLElement>(THE_VIEWS_EDITING_SURFACE)?.focus();
    } finally {
      isSending.current = false;
      setIsTheFixBeingApplied(false);
    }
  };
  return (
    <RefusalLine
      layout="bar"
      lead={refusal.lead}
      words={refusal.words}
      action={
        suggestedEdit === null ? undefined : (
          <ActionButton
            size="small"
            tooltip="Makes the edit the runtime suggests, as one step Undo takes back."
            disabledReason={isTheFixBeingApplied ? "Applying the fix…" : null}
            onPressed={() => void takeTheFix(suggestedEdit)}
            data-suggested-graph-edit="take"
          >
            Apply the fix
          </ActionButton>
        )
      }
      data-stream-graph-edit-refusal={suggestedEdit === null ? "words_alone" : "with_a_suggested_edit"}
    />
  );
}
