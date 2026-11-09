// A view people write is a node in its stream's graph, and each of its inputs reads whatever output
// a link wires into it, through that output's port viewer.

import type { ViewDeclaredPort } from "@tatolab/tato-app-view-sdk";
import type { PortViewerTarget, StreamGraphNode, StreamGraphSummary } from "./studio_view_contract";

/** The node type a view stands in its stream's graph as, its view type named by `config.view_type`. */
export const STUDIO_VIEW_NODE_TYPE = "tatolab.studio:StudioView";

/** The issue that brings the runtime's view node, which carries what a view sends on its outputs into the stream. */
export const STUDIO_VIEW_NODE_ISSUE = "tatolab/streamlib#3306";

/** The issue that brings the runtime's listing of the views a stream's packages bring. */
export const STUDIO_VIEW_LISTING_ISSUE = "tatolab/streamlib#3307";

/** What one input of a view reads: the output wired into it, named as `Node › port`, or why it reads nothing. */
export type StudioViewInputWiring = { kind: "wired"; target: PortViewerTarget; wired_from_words: string } | { kind: "unwired"; because: string };

/** The nodes of `graph` standing for the view type `viewTypeId`, in the graph's order. */
export function nodesOfTheStudioViewType(graph: StreamGraphSummary, viewTypeId: string): StreamGraphNode[] {
  return graph.nodes.filter((node) => node.type === STUDIO_VIEW_NODE_TYPE && node.config["view_type"] === viewTypeId);
}

/** What each of `declaredInputs` of the view node `viewNode` reads in `graph`, by input name. */
export function studioViewInputWiring(graph: StreamGraphSummary, viewNode: StreamGraphNode, declaredInputs: readonly ViewDeclaredPort[]): Record<string, StudioViewInputWiring> {
  const wiringByInput: Record<string, StudioViewInputWiring> = {};
  for (const declaredInput of declaredInputs) {
    const link = graph.links.find((graphLink) => graphLink.target_node === viewNode.name && graphLink.target_port === declaredInput.name);
    if (link === undefined) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `Nothing is wired into ${declaredInput.name}.` };
      continue;
    }
    const sourceNode = graph.nodes.find((node) => node.name === link.source_node);
    if (sourceNode === undefined) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `${declaredInput.name} is wired from ${link.source_node}, in another stream, which a view does not read.` };
      continue;
    }
    const sourcePort = sourceNode.output_ports.find((outputPort) => outputPort.name === link.source_port);
    const wiredFromWords = `${sourceNode.name} › ${link.source_port}`;
    if (sourcePort !== undefined && sourcePort.family !== null && sourcePort.family !== declaredInput.family) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `${wiredFromWords} carries ${sourcePort.family}, and ${declaredInput.name} takes ${declaredInput.family}.` };
      continue;
    }
    wiringByInput[declaredInput.name] = { kind: "wired", target: { stream: graph.stream, node_id: sourceNode.id, port: link.source_port }, wired_from_words: wiredFromWords };
  }
  return wiringByInput;
}
