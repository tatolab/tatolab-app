import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import type { StreamGraphEditRefusal, SuggestedGraphEditToSend } from "./stream_graph_edit_sending";

/** The bar across the top of a graph's view saying why its latest edit did not apply, in the runtime's words, with the edit the runtime suggested as one action. */
export function StreamGraphEditRefusalBar({
  refusal,
  onSuggestedEditTaken,
}: {
  refusal: StreamGraphEditRefusal | null;
  onSuggestedEditTaken: (suggested: SuggestedGraphEditToSend) => void;
}) {
  if (refusal === null) return null;
  const { suggestedEdit } = refusal;
  return (
    <RefusalLine
      layout="bar"
      lead={refusal.lead}
      words={refusal.words}
      action={
        suggestedEdit === null ? undefined : (
          <ActionButton size="small" tooltip="Makes the edit the runtime suggests, as one step Undo takes back." onPressed={() => onSuggestedEditTaken(suggestedEdit)} data-suggested-graph-edit="take">
            Apply the fix
          </ActionButton>
        )
      }
      data-stream-graph-edit-refusal={suggestedEdit === null ? "words_alone" : "with_a_suggested_edit"}
    />
  );
}
