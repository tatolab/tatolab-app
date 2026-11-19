// What the runtime says of the link that feeds one input of a node, as its `graph` answers it: the wire's own
// type where the input reads it as its own type for free, and what the link does that a person may not
// expect. Studio judges no link: both marks are the runtime's, read off the link, and a link it marks
// neither way carries neither.

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

/** `quoted`, each in backticks, joined by commas, as the runtime lists names. */
function inBackticks(quoted: readonly string[]): string {
  return quoted.map((words) => `\`${words}\``).join(", ");
}

/** `words` with its first letter a capital, as a line of its own starts. */
function asALine(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A warning of a link in the runtime's words: the sentence the runtime writes for it (`PinLinkWarning`'s `Display` in streamlib's
 * `pin_link_verdict.rs`), which the wire carries only as its tag and the names it quotes.
 */
export function wordsOfTheLinkWarning(warning: StreamGraphLinkWarning): string {
  switch (warning.warning) {
    case "meanings_differ":
      return asALine(`the output carries \`${warning.output_meaning}\` and the input takes \`${warning.input_meaning}\``);
    case "member_meanings_differ":
      return asALine(`member \`${warning.member}\` of the output carries \`${warning.output_meaning}\` and of the input takes \`${warning.input_meaning}\``);
    case "vector_read_as_a_color":
      return asALine("a Vector is read as a Color: x, y, z and w become red, green, blue and alpha");
    case "menu_options_the_input_does_not_list":
      return asALine(`the output may send ${inBackticks(warning.option_names)}, which the input does not list`);
    case "texture_output_states_no_format":
      return asALine("the output states no pixel format, so it may send one the input cannot take");
    case "type_found_only_once_placed":
      return asALine("the node type's port finds its type from a link into its node or from a setting, so it is judged as taking the other end's type until a node of the type is placed");
  }
}

/** The warnings `warnings` gives, each in the runtime's words; none where it gives none. */
export function wordsOfTheLinkWarnings(warnings: readonly StreamGraphLinkWarning[] | undefined): string[] {
  return (warnings ?? []).map(wordsOfTheLinkWarning);
}

/** What an input's hint says of a link the runtime converts for free, naming both types, as "Reads Integer as Float, for free"; `null` on any other link, and on an input with no exact type. */
export function freeConversionWords(link: NodeInputLink | null, inputPin: StreamGraphPortPin | null): string | null {
  const convertedFrom = link?.converts_for_free_from ?? null;
  if (convertedFrom === null || inputPin === null) return null;
  return `Reads ${pinTypeWords(convertedFrom.pin_type)} as ${pinTypeWords(inputPin.pin_type)}, for free`;
}
