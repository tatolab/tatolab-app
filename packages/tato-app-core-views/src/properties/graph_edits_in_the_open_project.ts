import { useCallback, useMemo, useRef, useState } from "react";
import { newGestureIdempotencyKey, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamGraphActionsAtTheLevel } from "../shared/stream_graph_edits";

/** Where on a node's panel an edit was made, which its refusal shows under: the name, or a port or setting. */
export type PlaceOfAnEdit = "name" | `input:${string}` | `output:${string}`;

/** One edit sent as one commit under its gesture's key. */
interface GraphEditSent {
  nodeId: string;
  place: PlaceOfAnEdit;
  operations: StreamGraphAction[];
  idempotencyKey: string;
}

/** The edits of one node: sent in the panel's one order, its refusals kept by place. */
export interface GraphEditsOfTheNode {
  refusalsByPlace: ReadonlyMap<PlaceOfAnEdit, string>;
  commit: (place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey?: string) => Promise<boolean>;
  keepTheRefusal: (place: PlaceOfAnEdit, refusal: string | null) => void;
}

const NO_REFUSALS: ReadonlyMap<PlaceOfAnEdit, string> = new Map();

/**
 * Sends the panel's edits to the open project in the order they were made, across every node it shows, each as one
 * commit, each refusal kept under its node and place in the runtime's words until a later commit on that node applies. A
 * node's edits at a level, inside a subgraph, carry that level.
 */
export function useGraphEditsInTheOpenProject(connection: Pick<TatoAppViewConnection, "transactInTheProject">, projectFolder: string | null) {
  const [refusalsByNode, setRefusalsByNode] = useState<ReadonlyMap<string, ReadonlyMap<PlaceOfAnEdit, string>>>(new Map());
  const editsInOrder = useRef<Promise<void>>(Promise.resolve());
  const keepTheRefusal = useCallback((nodeId: string, place: PlaceOfAnEdit, refusal: string | null) => {
    setRefusalsByNode((refusalsOfEveryNode) => {
      const refusals = refusalsOfEveryNode.get(nodeId) ?? NO_REFUSALS;
      if (refusal === null && !refusals.has(place)) return refusalsOfEveryNode;
      const changed = new Map(refusals);
      if (refusal === null) changed.delete(place);
      else changed.set(place, refusal);
      return new Map(refusalsOfEveryNode).set(nodeId, changed);
    });
  }, []);
  const clearEveryRefusalOfTheNode = useCallback((nodeId: string) => {
    setRefusalsByNode((refusalsOfEveryNode) => {
      if (!refusalsOfEveryNode.has(nodeId)) return refusalsOfEveryNode;
      const withoutTheNode = new Map(refusalsOfEveryNode);
      withoutTheNode.delete(nodeId);
      return withoutTheNode;
    });
  }, []);
  const sendNow = useCallback(
    async (edit: GraphEditSent): Promise<boolean> => {
      if (projectFolder === null) {
        keepTheRefusal(edit.nodeId, edit.place, "No project is open, so nothing can be edited.");
        return false;
      }
      const applying = await connection.transactInTheProject(projectFolder, edit.operations, { mode: "commit", idempotencyKey: edit.idempotencyKey });
      if (applying.kind === "applied") {
        clearEveryRefusalOfTheNode(edit.nodeId);
        return true;
      }
      keepTheRefusal(edit.nodeId, edit.place, applying.kind === "refused" ? applying.refusal.runtime_words : applying.because);
      return false;
    },
    [connection, projectFolder, keepTheRefusal, clearEveryRefusalOfTheNode],
  );
  const commit = useCallback(
    (nodeId: string, place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey = newGestureIdempotencyKey()): Promise<boolean> => {
      const sending = editsInOrder.current.then(() => sendNow({ nodeId, place, operations, idempotencyKey }));
      editsInOrder.current = sending.then(() => undefined);
      return sending;
    },
    [sendNow],
  );
  const ofTheNode = useCallback(
    (nodeId: string, level: readonly string[] = []): GraphEditsOfTheNode => ({
      refusalsByPlace: refusalsByNode.get(nodeId) ?? NO_REFUSALS,
      commit: (place, operations, idempotencyKey) => {
        const operationsAtTheLevel = streamGraphActionsAtTheLevel(operations, level);
        if (!Array.isArray(operationsAtTheLevel)) {
          keepTheRefusal(nodeId, place, operationsAtTheLevel.because);
          return Promise.resolve(false);
        }
        return commit(nodeId, place, operationsAtTheLevel, idempotencyKey);
      },
      keepTheRefusal: (place, refusal) => keepTheRefusal(nodeId, place, refusal),
    }),
    [refusalsByNode, commit, keepTheRefusal],
  );
  return useMemo(() => ({ ofTheNode }), [ofTheNode]);
}

/** The panel's edits, sent in one order, with each node's refusals kept by place. */
export type GraphEditsInTheOpenProject = ReturnType<typeof useGraphEditsInTheOpenProject>;
