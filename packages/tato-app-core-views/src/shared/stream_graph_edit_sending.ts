// A gesture's graph actions sent to the runtime as one transaction under a key of its own, and what the runtime
// or Studio said refusing the latest one, with the edit the runtime suggested, which is sent as the runtime named it.

import { newGestureIdempotencyKey, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { NodeGraphCanvasEditAnswer } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import type { ProjectGraphTransactionApplying, StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { suggestedGraphEditOf, type SuggestedGraphEdit } from "@tatolab/tato-app-view-sdk/suggested_graph_edit_of_a_refusal";
import { useCallback, useRef, useState } from "react";
import { streamGraphActionsAtTheLevel } from "./stream_graph_edits";

/** The edit a refusal suggests, with the one key it is sent under however often it is taken, so it applies once. */
export interface SuggestedGraphEditToSend {
  edit: SuggestedGraphEdit;
  idempotencyKey: string;
}

/** Why the latest edit did not apply: the window's lead, then the refusal's own words, and the edit the runtime suggested, `null` when it suggested none. */
export interface StreamGraphEditRefusal {
  lead: string;
  words: string;
  suggestedEdit: SuggestedGraphEditToSend | null;
}

/** What `applying` says of an edit not applied, the runtime's words unchanged, with the edit its refusal suggests under `newKey()`; `null` when it applied. */
export function streamGraphEditRefusalOf(applying: ProjectGraphTransactionApplying, newKey: () => string = newGestureIdempotencyKey): StreamGraphEditRefusal | null {
  switch (applying.kind) {
    case "applied":
      return null;
    case "refused": {
      const edit = suggestedGraphEditOf(applying.refusal.suggested_call);
      return { lead: "The runtime refused the edit:", words: applying.refusal.runtime_words, suggestedEdit: edit === null ? null : { edit, idempotencyKey: newKey() } };
    }
    case "not_sent":
      return { lead: "Studio didn't send the edit:", words: applying.because, suggestedEdit: null };
  }
}

/**
 * Sends each gesture's actions to `projectFolder`'s runtime as one transaction, inside the subgraph `level` names when given, answering whether it applied, and a suggested
 * edit as the runtime named it, level and all; the refusal of the latest one sent, until a later one applies.
 */
export function useStreamGraphEditsSentToTheRuntime(
  connection: Pick<TatoAppViewConnection, "transactInTheProject">,
  projectFolder: string | null,
): {
  sendTheGesture: (operations: readonly StreamGraphAction[], level?: readonly string[]) => Promise<NodeGraphCanvasEditAnswer>;
  sendTheSuggestedEdit: (suggested: SuggestedGraphEditToSend) => Promise<NodeGraphCanvasEditAnswer>;
  refusalOfTheLatestEdit: StreamGraphEditRefusal | null;
} {
  const [refusalOfTheLatestEdit, setRefusalOfTheLatestEdit] = useState<StreamGraphEditRefusal | null>(null);
  const latestGestureNumber = useRef(0);
  const sendAndKeepTheRefusal = useCallback(async (sending: () => Promise<ProjectGraphTransactionApplying>): Promise<NodeGraphCanvasEditAnswer> => {
    latestGestureNumber.current += 1;
    const gestureNumber = latestGestureNumber.current;
    const refusal = streamGraphEditRefusalOf(await sending());
    if (gestureNumber === latestGestureNumber.current) setRefusalOfTheLatestEdit(refusal);
    return refusal === null ? "applied" : "refused";
  }, []);
  const sendTheGesture = useCallback(
    async (operations: readonly StreamGraphAction[], level: readonly string[] = []): Promise<NodeGraphCanvasEditAnswer> => {
      if (operations.length === 0) return "applied";
      const operationsAtTheLevel = streamGraphActionsAtTheLevel(operations, level);
      return sendAndKeepTheRefusal(async (): Promise<ProjectGraphTransactionApplying> => {
        if (projectFolder === null) return { kind: "not_sent", because: "The runtime lists this stream in no project, so Studio has no project to edit it in." };
        if ("because" in operationsAtTheLevel) return { kind: "not_sent", because: operationsAtTheLevel.because };
        return connection.transactInTheProject(projectFolder, operationsAtTheLevel, { mode: "commit", idempotencyKey: newGestureIdempotencyKey() });
      });
    },
    [connection, projectFolder, sendAndKeepTheRefusal],
  );
  const sendTheSuggestedEdit = useCallback(
    ({ edit, idempotencyKey }: SuggestedGraphEditToSend): Promise<NodeGraphCanvasEditAnswer> =>
      sendAndKeepTheRefusal(async (): Promise<ProjectGraphTransactionApplying> => {
        if (projectFolder === null) return { kind: "not_sent", because: "The runtime lists this stream in no project, so Studio has no project to edit it in." };
        return connection.transactInTheProject(projectFolder, edit.operations, { mode: edit.mode, idempotencyKey: edit.mode === "commit" ? idempotencyKey : null });
      }),
    [connection, projectFolder, sendAndKeepTheRefusal],
  );
  return { sendTheGesture, sendTheSuggestedEdit, refusalOfTheLatestEdit };
}
