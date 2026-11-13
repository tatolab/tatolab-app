// Which ports of a stream's other nodes one port could be linked with, as Properties' target pickers list them and the
// Stream graph lights them while that port is picked.

import type { StreamGraphDeclaredPort, StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A port of another node the port could be linked with, and whether it carries the port's family. */
export interface PortThatCouldJoin {
  node: StreamGraphNode;
  port: StreamGraphDeclaredPort;
  isOfTheFamily: boolean;
}

/** Whether `node` is a Graph Input or Output naming no family and linked to nothing, which takes the family of the first port linked to it, so a port of any family can join it. */
export function isAGraphInterfaceNodeWaitingForItsFamily(node: Pick<StreamGraphNode, "graph_interface">): boolean {
  return node.graph_interface !== null && node.graph_interface.family === null;
}

/** Each port of the stream's other nodes `node`'s `port` could be linked with: an input's, every output but the one it is linked with; an output's, every input not linked yet, since an input takes one link. */
export function portsThatCouldJoin(graph: Pick<StreamGraphSummary, "nodes" | "links">, node: Pick<StreamGraphNode, "id" | "name" | "graph_interface">, direction: "input" | "output", port: Pick<StreamGraphDeclaredPort, "name" | "family">): PortThatCouldJoin[] {
  return graph.nodes.flatMap((otherNode) => {
    if (otherNode.id === node.id) return [];
    const otherPorts =
      direction === "input"
        ? otherNode.output_ports.filter((output) => !graph.links.some((link) => link.source_node === otherNode.name && link.source_port === output.name && link.target_node === node.name && link.target_port === port.name))
        : otherNode.input_ports.filter((input) => !graph.links.some((link) => link.target_node === otherNode.name && link.target_port === input.name));
    const eitherWaitsForItsFamily = isAGraphInterfaceNodeWaitingForItsFamily(node) || isAGraphInterfaceNodeWaitingForItsFamily(otherNode);
    return otherPorts.map((otherPort) => ({ node: otherNode, port: otherPort, isOfTheFamily: eitherWaitsForItsFamily || (port.family !== null && otherPort.family === port.family) }));
  });
}

/** The ports of each other node that can be linked with `node`'s `port`, by node id, for the nodes that have any. */
export function portsThatCanJoinByNodeId(graph: Pick<StreamGraphSummary, "nodes" | "links">, node: Pick<StreamGraphNode, "id" | "name" | "graph_interface">, direction: "input" | "output", port: Pick<StreamGraphDeclaredPort, "name" | "family">): ReadonlyMap<string, readonly string[]> {
  const portsByNodeId = new Map<string, string[]>();
  for (const candidate of portsThatCouldJoin(graph, node, direction, port)) {
    if (candidate.isOfTheFamily) portsByNodeId.set(candidate.node.id, [...(portsByNodeId.get(candidate.node.id) ?? []), candidate.port.name]);
  }
  return portsByNodeId;
}
