import { useCallback, useMemo, useRef, useState } from "react";
import { newGestureIdempotencyKey, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { GraphEditMode, JsonValue, StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";

/** Where on a node's panel an edit was made, which its refusal shows under: the name, a config field, or a port. */
export type PlaceOfAnEdit = "name" | `config:${string}` | `input:${string}` | `output:${string}`;

/** A node's config as the graph reading gives it. */
type NodeConfig = Record<string, JsonValue>;

/** One edit sent as one transaction under its gesture's key. */
interface GraphEditSent {
  nodeId: string;
  place: PlaceOfAnEdit;
  operations: StreamGraphAction[];
  mode: GraphEditMode;
  idempotencyKey: string;
}

/** The config last sent for a node, and the config the graph reading showed when it was sent. */
interface ConfigSentAheadOfTheReading {
  readingWhenSent: string;
  configSent: NodeConfig;
}

/** The edits of one node: sent in the panel's one order, its refusals kept by place. */
export interface GraphEditsOfTheNode {
  refusalsByPlace: ReadonlyMap<PlaceOfAnEdit, string>;
  commit: (place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey?: string) => Promise<boolean>;
  sendLive: (place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey: string) => void;
  keepTheRefusal: (place: PlaceOfAnEdit, refusal: string | null) => void;
  /** The config a new config edit starts from: the one last sent while the reading has not caught up with it, else the reading's. */
  configToEditFrom: (configTheReadingShows: NodeConfig) => NodeConfig;
  /** Remembers `configSent` as sent while the reading still shows `configTheReadingShows`. */
  rememberTheConfigSent: (configTheReadingShows: NodeConfig, configSent: NodeConfig) => void;
}

const NO_REFUSALS: ReadonlyMap<PlaceOfAnEdit, string> = new Map();

/**
 * Sends the panel's edits to the open project in the order they were made, across every node it shows, each refusal
 * kept under its node and place in the runtime's words until a later commit on that node applies. A drag's live edits wait for the one before to be answered,
 * the newest replacing any not sent yet, so the runtime is never sent more than it can apply; its commit drops a
 * live edit not sent yet.
 */
export function useGraphEditsInTheOpenProject(connection: Pick<TatoAppViewConnection, "transactInTheProject">, projectFolder: string | null) {
  const [refusalsByNode, setRefusalsByNode] = useState<ReadonlyMap<string, ReadonlyMap<PlaceOfAnEdit, string>>>(new Map());
  const editsInOrder = useRef<Promise<void>>(Promise.resolve());
  const liveEditWaiting = useRef<GraphEditSent | null>(null);
  const configsSentAheadOfTheReading = useRef(new Map<string, ConfigSentAheadOfTheReading>());
  const keepTheRefusal = useCallback((nodeId: string, place: PlaceOfAnEdit, refusal: string | null) => {
    if (refusal !== null && place.startsWith("config:")) configsSentAheadOfTheReading.current.delete(nodeId);
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
      const applying = await connection.transactInTheProject(projectFolder, edit.operations, { mode: edit.mode, idempotencyKey: edit.idempotencyKey });
      if (applying.kind === "applied") {
        if (edit.mode === "commit") clearEveryRefusalOfTheNode(edit.nodeId);
        return true;
      }
      keepTheRefusal(edit.nodeId, edit.place, applying.kind === "refused" ? applying.refusal.runtime_words : applying.because);
      return false;
    },
    [connection, projectFolder, keepTheRefusal, clearEveryRefusalOfTheNode],
  );
  const commit = useCallback(
    (nodeId: string, place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey = newGestureIdempotencyKey()): Promise<boolean> => {
      liveEditWaiting.current = null;
      const sending = editsInOrder.current.then(() => sendNow({ nodeId, place, operations, mode: "commit", idempotencyKey }));
      editsInOrder.current = sending.then(() => undefined);
      return sending;
    },
    [sendNow],
  );
  const sendLive = useCallback(
    (nodeId: string, place: PlaceOfAnEdit, operations: StreamGraphAction[], idempotencyKey: string) => {
      const isOneAlreadyWaiting = liveEditWaiting.current !== null;
      liveEditWaiting.current = { nodeId, place, operations, mode: "live", idempotencyKey };
      if (isOneAlreadyWaiting) return;
      editsInOrder.current = editsInOrder.current.then(async () => {
        const waiting = liveEditWaiting.current;
        liveEditWaiting.current = null;
        if (waiting !== null) await sendNow(waiting);
      });
    },
    [sendNow],
  );
  const ofTheNode = useCallback(
    (nodeId: string): GraphEditsOfTheNode => ({
      refusalsByPlace: refusalsByNode.get(nodeId) ?? NO_REFUSALS,
      commit: (place, operations, idempotencyKey) => commit(nodeId, place, operations, idempotencyKey),
      sendLive: (place, operations, idempotencyKey) => sendLive(nodeId, place, operations, idempotencyKey),
      keepTheRefusal: (place, refusal) => keepTheRefusal(nodeId, place, refusal),
      configToEditFrom: (configTheReadingShows) => {
        const sentAhead = configsSentAheadOfTheReading.current.get(nodeId);
        return sentAhead !== undefined && sentAhead.readingWhenSent === JSON.stringify(configTheReadingShows) ? sentAhead.configSent : configTheReadingShows;
      },
      rememberTheConfigSent: (configTheReadingShows, configSent) => {
        configsSentAheadOfTheReading.current.set(nodeId, { readingWhenSent: JSON.stringify(configTheReadingShows), configSent });
      },
    }),
    [refusalsByNode, commit, sendLive, keepTheRefusal],
  );
  return useMemo(() => ({ ofTheNode }), [ofTheNode]);
}

/** The panel's edits, sent in one order, with each node's refusals kept by place. */
export type GraphEditsInTheOpenProject = ReturnType<typeof useGraphEditsInTheOpenProject>;
