// A gesture's graph actions sent to the runtime as one transaction under a key of its own, and what the runtime
// or Studio said refusing the latest one.

import { newGestureIdempotencyKey, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { NodeGraphCanvasEditAnswer } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import type { ProjectGraphTransactionApplying, StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useCallback, useRef, useState } from "react";
import { streamGraphActionsAtTheLevel } from "./stream_graph_edits";

/** Why the latest edit did not apply: the window's lead, then the refusal's own words. */
export interface StreamGraphEditRefusal {
  lead: string;
  words: string;
}

/** What `applying` says of an edit not applied, the runtime's words unchanged; `null` when it applied. */
export function streamGraphEditRefusalOf(applying: ProjectGraphTransactionApplying): StreamGraphEditRefusal | null {
  switch (applying.kind) {
    case "applied":
      return null;
    case "refused":
      return { lead: "The runtime refused the edit:", words: applying.refusal.runtime_words };
    case "not_sent":
      return { lead: "Studio didn't send the edit:", words: applying.because };
  }
}

/** Sends each gesture's actions to `projectFolder`'s runtime as one transaction, inside the subgraph `level` names when given, answering whether it applied; the refusal of the latest one sent, until a later one applies. */
export function useStreamGraphEditsSentToTheRuntime(
  connection: TatoAppViewConnection,
  projectFolder: string | null,
): {
  sendTheGesture: (operations: readonly StreamGraphAction[], level?: readonly string[]) => Promise<NodeGraphCanvasEditAnswer>;
  refusalOfTheLatestEdit: StreamGraphEditRefusal | null;
} {
  const [refusalOfTheLatestEdit, setRefusalOfTheLatestEdit] = useState<StreamGraphEditRefusal | null>(null);
  const latestGestureNumber = useRef(0);
  const sendTheGesture = useCallback(
    async (operations: readonly StreamGraphAction[], level: readonly string[] = []): Promise<NodeGraphCanvasEditAnswer> => {
      if (operations.length === 0) return "applied";
      latestGestureNumber.current += 1;
      const gestureNumber = latestGestureNumber.current;
      const operationsAtTheLevel = streamGraphActionsAtTheLevel(operations, level);
      const applying: ProjectGraphTransactionApplying =
        projectFolder === null
          ? { kind: "not_sent", because: "The runtime lists this stream in no project, so Studio has no project to edit it in." }
          : "because" in operationsAtTheLevel
            ? { kind: "not_sent", because: operationsAtTheLevel.because }
            : await connection.transactInTheProject(projectFolder, operationsAtTheLevel, { mode: "commit", idempotencyKey: newGestureIdempotencyKey() });
      const refusal = streamGraphEditRefusalOf(applying);
      if (gestureNumber === latestGestureNumber.current) setRefusalOfTheLatestEdit(refusal);
      return refusal === null ? "applied" : "refused";
    },
    [connection, projectFolder],
  );
  return { sendTheGesture, refusalOfTheLatestEdit };
}
