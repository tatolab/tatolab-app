// A view people write is a node in its stream's graph: each of its inputs reads whatever output a
// link wires into it, through that output's port viewer, and what it writes on an output is set on
// the node's input of that name, which the node publishes on the output.

import type { ViewDeclaredPort } from "@tatolab/tato-app-view-sdk";
import { graphAddressOfTheStreamsOwnLevel } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import { familyOfThePort } from "../../shared/tatolab_backend_contract";
import type { PortViewerTarget, StreamGraph, StreamGraphNode, StudioViewNodeAddress } from "./studio_view_contract";

/** What one input of a view reads: the output wired into it, named as `Node › port`, or why it reads nothing. */
export type StudioViewInputWiring = { kind: "wired"; target: PortViewerTarget; wired_from_words: string } | { kind: "unwired"; because: string };

/** The nodes of `graph` of the view type `viewTypeId`, which is a node type of its own, in the graph's order. */
export function nodesOfTheStudioViewType(graph: StreamGraph, viewTypeId: string): StreamGraphNode[] {
  return graph.nodes.filter((node) => node.type === viewTypeId);
}

/** Where a value is set on the inputs of `viewNode`, on the own level of the stream `graph` renders, named `streamWords`, in the window's project at `projectFolder`; or why none is while either is unknown. */
export function studioViewNodeAddressOf(projectFolder: string | null, graph: StreamGraph, viewNode: StreamGraphNode, streamWords: string): StudioViewNodeAddress {
  const title = nodeTitle(viewNode.name, viewNode.type);
  if (projectFolder === null) return { kind: "not_addressed", because: `No project is open in this window, so nothing is set on the ${title} node in ${streamWords}.` };
  const streamAsset = graph.asset ?? null;
  if (streamAsset === null) return { kind: "not_addressed", because: `The runtime's graph of ${streamWords} names no stream asset, so nothing is set on its ${title} node.` };
  return { kind: "addressed", graph: graphAddressOfTheStreamsOwnLevel(projectFolder, streamAsset), node_id: viewNode.id };
}

/** What each of `declaredInputs` of the view node `viewNode` reads in `graph`, the graph of the stream `stream`, by input name. */
export function studioViewInputWiring(stream: string, graph: StreamGraph, viewNode: StreamGraphNode, declaredInputs: readonly ViewDeclaredPort[]): Record<string, StudioViewInputWiring> {
  const wiringByInput: Record<string, StudioViewInputWiring> = {};
  for (const declaredInput of declaredInputs) {
    const link = graph.links.find((graphLink) => graphLink.target.node === viewNode.name && graphLink.target.port === declaredInput.name);
    if (link === undefined) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `Nothing is wired into ${declaredInput.name}.` };
      continue;
    }
    const sourceNode = graph.nodes.find((node) => node.name === link.source.node);
    if (sourceNode === undefined) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `${declaredInput.name} is wired from ${link.source.node}, in another stream, which a view does not read.` };
      continue;
    }
    const sourcePort = sourceNode.ports.outputs.find((outputPort) => outputPort.name === link.source.port);
    const sourceFamily = sourcePort === undefined ? null : familyOfThePort(sourcePort);
    const wiredFromWords = `${sourceNode.name} › ${link.source.port}`;
    if (sourceFamily !== null && sourceFamily !== declaredInput.family) {
      wiringByInput[declaredInput.name] = { kind: "unwired", because: `${wiredFromWords} carries ${sourceFamily}, and ${declaredInput.name} takes ${declaredInput.family}.` };
      continue;
    }
    wiringByInput[declaredInput.name] = { kind: "wired", target: { stream, node_id: sourceNode.id, port: link.source.port }, wired_from_words: wiredFromWords };
  }
  return wiringByInput;
}
