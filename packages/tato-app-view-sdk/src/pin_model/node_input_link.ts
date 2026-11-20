// What the runtime says of the link that feeds one input of a node, as its `graph` answers it: the wire's own
// type where the input reads it as its own type for free, and what the link does that a person may not
// expect, each warning with the runtime's sentence for it. Studio judges no link: both marks are the
// runtime's, read off the link, and a link it marks neither way carries neither.

import { pinOfThePort, type StreamGraph, type StreamGraphLinkWarning, type StreamGraphPortPin } from "../studio_readings.js";
import { pinTypeWords } from "./pin_type_words.js";

/** The marks the runtime gives the link into an input: the pin of the output wired in, where the input reads it as its own type at no cost, and the link's warnings, empty where it warns of nothing. */
export interface NodeInputLink {
  /** The output's type and flow where the runtime marks the link `free_conversion`; `null` on every other link, and where the output states no exact type. */
  readonly converts_for_free_from: StreamGraphPortPin | null;
  readonly warnings: readonly StreamGraphLinkWarning[];
}

/** What the runtime marks on the link into the input `inputName` of the node `nodeName` in `graph`; `null` while no link feeds it, and for a link it marks neither way. */
export function nodeInputLinkOfTheGraph(graph: Pick<StreamGraph, "nodes" | "links">, nodeName: string, inputName: string): NodeInputLink | null {
  const link = graph.links.find((graphLink) => graphLink.target.node === nodeName && graphLink.target.port === inputName);
  if (link === undefined) return null;
  const outputPort = link.free_conversion === true ? graph.nodes.find((node) => node.name === link.source.node)?.ports.outputs.find((port) => port.name === link.source.port) : undefined;
  const convertsForFreeFrom = outputPort === undefined ? null : pinOfThePort(outputPort);
  const warnings = link.warnings ?? [];
  return convertsForFreeFrom === null && warnings.length === 0 ? null : { converts_for_free_from: convertsForFreeFrom, warnings };
}

/** What an input's hint says of a link the runtime converts for free, naming both types, as "Reads Integer as Float, for free"; `null` on any other link, and on an input with no exact type. */
export function freeConversionWords(link: NodeInputLink | null, inputPin: StreamGraphPortPin | null): string | null {
  const convertedFrom = link?.converts_for_free_from ?? null;
  if (convertedFrom === null || inputPin === null) return null;
  return `Reads ${pinTypeWords(convertedFrom.pin_type)} as ${pinTypeWords(inputPin.pin_type)}, for free`;
}
