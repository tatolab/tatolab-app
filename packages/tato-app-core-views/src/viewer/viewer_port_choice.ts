import type { ViewSettings } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphSummary, StudioSelection } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTitle } from "../shared/node_words";

/** One output port of a stream's graph: its node's id as `graph` lists it, that node's name, and the port's own name. */
export type ViewerPortAddress = { node_id: string; node_name: string; port: string };

/** The port a Viewer area keeps in its `chosen_port` setting, by its node's id, or `null` to follow the selection. */
export type ViewerChosenPort = { stream: string; node_id: string; port: string } | null;

/** The `chosen_port` setting of `settings`; `null`, following the selection, for anything else. */
export function viewerChosenPortOf(settings: ViewSettings | null): ViewerChosenPort {
  const chosenPort = settings?.["chosen_port"];
  if (typeof chosenPort !== "object" || chosenPort === null || Array.isArray(chosenPort)) return null;
  const { stream, node_id, port } = chosenPort;
  if (typeof stream !== "string" || typeof node_id !== "string" || typeof port !== "string") return null;
  return { stream, node_id, port };
}

/** The key a port is chosen by in the Viewer's port menu. */
export function viewerPortChoiceKey(portAddress: { node_id: string; port: string }): string {
  return JSON.stringify([portAddress.node_id, portAddress.port]);
}

/** Every output port of `graph`, with its family. */
export function everyOutputPortOf(graph: StreamGraphSummary): (ViewerPortAddress & { family: string | null })[] {
  return graph.nodes.flatMap((node) => node.output_ports.map((outputPort) => ({ node_id: node.id, node_name: node.name, port: outputPort.name, family: outputPort.family })));
}

/**
 * The output port the Viewer plays for `graph`: the selected node's, its picture first; or else the stream's last picture, the first
 * Image port that feeds no other node's Image output, then a port whose family the runtime does not serve, which may be a picture;
 * or else its first port of any family.
 */
export function outputPortTheViewerPlays(graph: StreamGraphSummary, selection: StudioSelection | null): ViewerPortAddress | null {
  const outputPorts = everyOutputPortOf(graph);
  const mayBeAPicture = (outputPort: { family: string | null }) => outputPort.family === "image" || outputPort.family === null;
  const selectedNode = selection?.kind === "node" && selection.stream === graph.stream ? selection.node : null;
  const selectedNodesPorts = outputPorts.filter((outputPort) => outputPort.node_name === selectedNode);
  const pictures = outputPorts.filter(mayBeAPicture);
  const imagePorts = outputPorts.filter((outputPort) => outputPort.family === "image");
  const feedsANodeOf = (outputPort: ViewerPortAddress, nodeNames: Set<string>) =>
    graph.links.some((link) => link.source_node === outputPort.node_name && link.source_port === outputPort.port && nodeNames.has(link.target_node));
  const nodesWithAPicture = new Set(pictures.map((outputPort) => outputPort.node_name));
  const nodesWithAnImagePort = new Set(imagePorts.map((outputPort) => outputPort.node_name));
  const played =
    selectedNodesPorts.find(mayBeAPicture) ??
    selectedNodesPorts[0] ??
    imagePorts.find((outputPort) => !feedsANodeOf(outputPort, nodesWithAnImagePort)) ??
    pictures.find((outputPort) => !feedsANodeOf(outputPort, nodesWithAPicture)) ??
    pictures[0] ??
    outputPorts[0] ??
    null;
  return played === null ? null : { node_id: played.node_id, node_name: played.node_name, port: played.port };
}

/** The port `chosenPort` names while it is of `graph`'s stream and the graph still has it; `null` otherwise. */
export function chosenPortStillInTheGraph(graph: StreamGraphSummary, chosenPort: ViewerChosenPort): ViewerPortAddress | null {
  if (chosenPort === null || chosenPort.stream !== graph.stream) return null;
  const outputPortInTheGraph = everyOutputPortOf(graph).find((outputPort) => outputPort.node_id === chosenPort.node_id && outputPort.port === chosenPort.port);
  return outputPortInTheGraph === undefined ? null : { node_id: outputPortInTheGraph.node_id, node_name: outputPortInTheGraph.node_name, port: outputPortInTheGraph.port };
}

/** The port the Viewer plays: the one chosen for this stream while the graph still has it, or else the one the selection gives. */
export function portTheViewerPlays(graph: StreamGraphSummary, selection: StudioSelection | null, chosenPort: ViewerChosenPort): ViewerPortAddress | null {
  return chosenPortStillInTheGraph(graph, chosenPort) ?? outputPortTheViewerPlays(graph, selection);
}

/** A port in words: its node's title, then the port's name. */
export function portWordsOf(graph: StreamGraphSummary, portAddress: ViewerPortAddress): string {
  const node = graph.nodes.find((graphNode) => graphNode.id === portAddress.node_id);
  return `${node === undefined ? portAddress.node_name : nodeTitle(node.name, node.type)} › ${portAddress.port}`;
}
