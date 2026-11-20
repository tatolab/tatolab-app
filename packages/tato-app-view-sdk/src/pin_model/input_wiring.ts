// What an input of a node reads through a wire: the output a link wires into it, read through that
// output's port viewer, or why it reads nothing. A view's input and a control on a wire-only input
// read their wire the same way.

import type { PortFamily } from "../port_families.js";
import { familyOfThePort, type PortViewerTarget, type StreamGraph } from "../studio_readings.js";
import { isTheLinkInto } from "./node_input_link.js";

/** What one input reads: the output wired into it, named as `Node › port`, or why it reads nothing. */
export type InputWiring = { kind: "wired"; target: PortViewerTarget; wired_from_words: string } | { kind: "unwired"; because: string };

/**
 * What the input `inputName` of the node `nodeName` reads in `graph`, the graph of the stream `stream`: the output a link
 * wires into the whole input, unless that output is in another stream, or carries another family than `family`, the one the
 * input takes; `null` takes any.
 */
export function wiringOfTheInput(stream: string, graph: Pick<StreamGraph, "nodes" | "links">, nodeName: string, inputName: string, family: PortFamily | null): InputWiring {
  const link = graph.links.find((graphLink) => isTheLinkInto(graphLink, nodeName, inputName, null));
  if (link === undefined) return { kind: "unwired", because: `Nothing is wired into ${inputName}.` };
  const sourceNode = graph.nodes.find((node) => node.name === link.source.node);
  if (sourceNode === undefined) return { kind: "unwired", because: `${inputName} is wired from ${link.source.node}, in another stream, which Studio does not read.` };
  const sourcePort = sourceNode.ports.outputs.find((outputPort) => outputPort.name === link.source.port);
  const sourceFamily = sourcePort === undefined ? null : familyOfThePort(sourcePort);
  const wiredFromWords = `${sourceNode.name} › ${link.source.port}`;
  if (family !== null && sourceFamily !== null && sourceFamily !== family) return { kind: "unwired", because: `${wiredFromWords} carries ${sourceFamily}, and ${inputName} takes ${family}.` };
  return { kind: "wired", target: { stream, node_id: sourceNode.id, port: link.source.port }, wired_from_words: wiredFromWords };
}
