// What an input of a node reads through a wire: the output a link wires into it, read through that
// output's port viewer, or why it reads nothing. A view's input and a control on a wire-only input
// read their wire the same way.

import type { PortViewerTarget, StreamGraph } from "../studio_readings.js";
import { isTheLinkInto } from "./node_input_link.js";

/** What one input reads: the output wired into it, named as `Node › port`, or why it reads nothing. */
export type InputWiring = { kind: "wired"; target: PortViewerTarget; wired_from_words: string } | { kind: "unwired"; because: string };

/**
 * What the input `inputName` of the node `nodeName` reads in `graph`, the graph of the stream `stream`: the output a link
 * wires into the whole input, unless that output is in another stream. The runtime judges each link as it makes it, so one it
 * renders joins an output the input takes.
 */
export function wiringOfTheInput(stream: string, graph: Pick<StreamGraph, "nodes" | "links">, nodeName: string, inputName: string): InputWiring {
  const link = graph.links.find((graphLink) => isTheLinkInto(graphLink, nodeName, inputName, null));
  if (link === undefined) return { kind: "unwired", because: `Nothing is wired into ${inputName}.` };
  const sourceNode = graph.nodes.find((node) => node.name === link.source.node);
  if (sourceNode === undefined) return { kind: "unwired", because: `${inputName} is wired from ${link.source.node}, in another stream, which Studio does not read.` };
  return { kind: "wired", target: { stream, node_id: sourceNode.id, port: link.source.port }, wired_from_words: `${sourceNode.name} › ${link.source.port}` };
}
