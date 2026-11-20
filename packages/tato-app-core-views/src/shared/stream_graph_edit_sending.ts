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

/** Why an edit did not apply, as `applying` says it, the runtime's words unchanged, and the edit its refusal suggests; `null` when it applied. */
export function streamGraphEditRefusalOf(applying: ProjectGraphTransactionApplying): { lead: string; words: string; suggestedEdit: SuggestedGraphEdit | null } | null {
  switch (applying.kind) {
    case "applied":
      return null;
    case "refused":
      return { lead: "The runtime refused the edit:", words: applying.refusal.runtime_words, suggestedEdit: suggestedGraphEditOf(applying.refusal.suggested_call) };
    case "not_sent":
      return { lead: "Studio didn't send the edit:", words: applying.because, suggestedEdit: null };
  }
}

const NO_PROJECT_TO_EDIT_IN = "The runtime lists this stream in no project, so Studio has no project to edit it in.";

/**
 * Sends each gesture's actions to `projectFolder`'s runtime as one transaction, inside the subgraph `level` names when given, answering whether it applied, and a suggested
 * edit as the runtime named it, level and all; the refusal of the latest one sent, until a later one applies. A suggested edit Studio did not send stays offered under its key.
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
  const sendAndKeepTheRefusal = useCallback(
    async (sending: () => Promise<ProjectGraphTransactionApplying>, suggestedEditSent: SuggestedGraphEditToSend | null): Promise<NodeGraphCanvasEditAnswer> => {
      latestGestureNumber.current += 1;
      const gestureNumber = latestGestureNumber.current;
      const applying = await sending();
      const refusal = streamGraphEditRefusalOf(applying);
      if (gestureNumber === latestGestureNumber.current) {
        const suggestedEdit =
          applying.kind === "not_sent" && suggestedEditSent !== null
            ? suggestedEditSent
            : refusal?.suggestedEdit
              ? { edit: refusal.suggestedEdit, idempotencyKey: newGestureIdempotencyKey() }
              : null;
        setRefusalOfTheLatestEdit(refusal === null ? null : { lead: refusal.lead, words: refusal.words, suggestedEdit });
      }
      return refusal === null ? "applied" : "refused";
    },
    [],
  );
  const sendTheGesture = useCallback(
    async (operations: readonly StreamGraphAction[], level: readonly string[] = []): Promise<NodeGraphCanvasEditAnswer> => {
      if (operations.length === 0) return "applied";
      const operationsAtTheLevel = streamGraphActionsAtTheLevel(operations, level);
      return sendAndKeepTheRefusal(async (): Promise<ProjectGraphTransactionApplying> => {
        if (projectFolder === null) return { kind: "not_sent", because: NO_PROJECT_TO_EDIT_IN };
        if ("because" in operationsAtTheLevel) return { kind: "not_sent", because: operationsAtTheLevel.because };
        return connection.transactInTheProject(projectFolder, operationsAtTheLevel, { mode: "commit", idempotencyKey: newGestureIdempotencyKey() });
      }, null);
    },
    [connection, projectFolder, sendAndKeepTheRefusal],
  );
  const sendTheSuggestedEdit = useCallback(
    async (suggested: SuggestedGraphEditToSend): Promise<NodeGraphCanvasEditAnswer> => {
      return sendAndKeepTheRefusal(async (): Promise<ProjectGraphTransactionApplying> => {
        if (projectFolder === null) return { kind: "not_sent", because: NO_PROJECT_TO_EDIT_IN };
        return connection.transactInTheProject(projectFolder, suggested.edit.operations, { mode: suggested.edit.mode, idempotencyKey: suggested.idempotencyKey });
      }, suggested);
    },
    [connection, projectFolder, sendAndKeepTheRefusal],
  );
  return { sendTheGesture, sendTheSuggestedEdit, refusalOfTheLatestEdit };
}
