import type { StreamGraphNode, StreamGraphSummary, StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTitle } from "../shared/node_words";

/** One output port of a stream's graph: its node's id as `graph` lists it, that node's name, and the port's own name. */
export type NodeVisualizerPortAddress = { node_id: string; node_name: string; port: string };

/** What the Node visualizer shows for the selection: nothing selected in this stream, a selected node with no output, or the selected node's port it plays. */
export type NodeVisualizerSubject = { kind: "nothing_selected" } | { kind: "node_without_output"; node: StreamGraphNode } | { kind: "port"; port: NodeVisualizerPortAddress };

/** The selected node of `graph`'s stream and what the Node visualizer plays of it: its first port that may carry a picture, an Image port or one whose family the runtime does not serve, or else its first port of any family. */
export function nodeVisualizerSubjectOf(graph: StreamGraphSummary, selection: StudioSelection | null): NodeVisualizerSubject {
  if (selection?.kind !== "node" || selection.stream !== graph.stream || (selection.level ?? []).length > 0) return { kind: "nothing_selected" };
  const selectedNode = graph.nodes.find((node) => node.name === selection.node);
  if (selectedNode === undefined) return { kind: "nothing_selected" };
  const played =
    selectedNode.output_ports.find((outputPort) => outputPort.family === "image") ??
    selectedNode.output_ports.find((outputPort) => outputPort.family === null) ??
    selectedNode.output_ports[0];
  if (played === undefined) return { kind: "node_without_output", node: selectedNode };
  return { kind: "port", port: { node_id: selectedNode.id, node_name: selectedNode.name, port: played.name } };
}

/** The key a played port's live read is kept by, so choosing another port opens a read of its own. */
export function nodeVisualizerPortKey(portAddress: { node_id: string; port: string }): string {
  return JSON.stringify([portAddress.node_id, portAddress.port]);
}

/** A port in words: its node's title, then the port's name. */
export function portWordsOf(graph: StreamGraphSummary, portAddress: NodeVisualizerPortAddress): string {
  const node = graph.nodes.find((graphNode) => graphNode.id === portAddress.node_id);
  return `${node === undefined ? portAddress.node_name : nodeTitle(node.name, node.type)} › ${portAddress.port}`;
}

/** The node state the runtime names a processor by while it processes, the one state whose ports the Node visualizer opens. */
const NODE_STATE_RUNNING = "Running";

/** The state of the node of `playedPort` while it is one other than `Running`, so its port writes nothing to read; `null` while it runs, or while the graph names no state. */
export function stateKeepingThePlayedNodeFromWriting(graph: StreamGraphSummary, playedPort: NodeVisualizerPortAddress): string | null {
  const playedNodeState = graph.nodes.find((node) => node.id === playedPort.node_id)?.state ?? null;
  return playedNodeState === NODE_STATE_RUNNING ? null : playedNodeState;
}
