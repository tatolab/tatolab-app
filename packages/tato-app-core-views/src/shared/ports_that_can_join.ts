// Which ports of a stream's other nodes one port could be linked with, as Properties' target pickers list them and the
// Stream graph lights them while that port is picked.

import type { StreamGraphDeclaredPort, StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A port of another node the port could be linked with, and whether it carries the port's family. */
export interface PortThatCouldJoin {
  node: StreamGraphNode;
  port: StreamGraphDeclaredPort;
  isOfTheFamily: boolean;
}

/** Each port of the stream's other nodes `node`'s `port` could be linked with: an input's, every output but the one it is linked with; an output's, every input not linked yet, since an input takes one link. */
export function portsThatCouldJoin(graph: Pick<StreamGraphSummary, "nodes" | "links">, node: Pick<StreamGraphNode, "id" | "name">, direction: "input" | "output", port: Pick<StreamGraphDeclaredPort, "name" | "family">): PortThatCouldJoin[] {
  return graph.nodes.flatMap((otherNode) => {
    if (otherNode.id === node.id) return [];
    const otherPorts =
      direction === "input"
        ? otherNode.output_ports.filter((output) => !graph.links.some((link) => link.source_node === otherNode.name && link.source_port === output.name && link.target_node === node.name && link.target_port === port.name))
        : otherNode.input_ports.filter((input) => !graph.links.some((link) => link.target_node === otherNode.name && link.target_port === input.name));
    return otherPorts.map((otherPort) => ({ node: otherNode, port: otherPort, isOfTheFamily: port.family !== null && otherPort.family === port.family }));
  });
}

/** The ports of each other node that can be linked with `node`'s `port`, by node id, for the nodes that have any. */
export function portsThatCanJoinByNodeId(graph: Pick<StreamGraphSummary, "nodes" | "links">, node: Pick<StreamGraphNode, "id" | "name">, direction: "input" | "output", port: Pick<StreamGraphDeclaredPort, "name" | "family">): ReadonlyMap<string, readonly string[]> {
  const portsByNodeId = new Map<string, string[]>();
  for (const candidate of portsThatCouldJoin(graph, node, direction, port)) {
    if (candidate.isOfTheFamily) portsByNodeId.set(candidate.node.id, [...(portsByNodeId.get(candidate.node.id) ?? []), candidate.port.name]);
  }
  return portsByNodeId;
}
