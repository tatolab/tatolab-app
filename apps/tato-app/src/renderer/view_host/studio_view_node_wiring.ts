// A view people write is a node in its stream's graph: each of its inputs reads whatever output a
// link wires into it, through that output's port viewer, and what it writes on an output is set on
// the node's input of that name, which the node publishes on the output.

import type { ViewDeclaredPort } from "@tatolab/tato-app-view-sdk";
import type { PortViewerTarget, StreamGraphNode, StreamGraphSummary, StudioViewNodeAddress } from "./studio_view_contract";

/** What one input of a view reads: the output wired into it, named as `Node › port`, or why it reads nothing. */
export type StudioViewInputWiring = { kind: "wired"; target: PortViewerTarget; wired_from_words: string } | { kind: "unwired"; because: string };

/** The nodes of `graph` of the view type `viewTypeId`, which is a node type of its own, in the graph's order. */
export function nodesOfTheStudioViewType(graph: StreamGraphSummary, viewTypeId: string): StreamGraphNode[] {
  return graph.nodes.filter((node) => node.type === viewTypeId);
}

/** Where a value is set on the inputs of `viewNode`, on the own level of the stream `graph` renders, named `streamWords`, in the window's project at `projectFolder`; or why none is while either is unknown. */
export function studioViewNodeAddressOf(projectFolder: string | null, graph: StreamGraphSummary, viewNode: StreamGraphNode, streamWords: string): StudioViewNodeAddress {
  if (projectFolder === null) return { kind: "not_addressed", because: `No project is open in this window, so nothing is set on the ${viewNode.name} node in ${streamWords}.` };
  if (graph.stream_asset === null) return { kind: "not_addressed", because: `The runtime's graph of ${streamWords} names no stream asset, so nothing is set on its ${viewNode.name} node.` };
  return { kind: "addressed", graph: { project_folder: projectFolder, stream_asset: graph.stream_asset, level: [] }, node_id: viewNode.id };
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
