// A node's pins as every surface reads them from a stream's graph: the card on the canvas and its
// row in Properties draw the same pins, each described by its node type and addressed where its
// value is kept.

import { valueAddressOfTheInput, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import type { NodeCatalogEntry, NodeCatalogPort, StreamGraphNode, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";
import { portStreamFactsWords, streamFactsAnInputReceives } from "./port_stream_facts_words";

/** `description` trimmed, or `null` for none. */
export function descriptionWords(description: string | undefined): string | null {
  return description === undefined || description.trim() === "" ? null : description.trim();
}

/** What a node type's catalog says and annotates of its port `portName`: its description, `null` for none, and its annotations, empty for none. */
function catalogWordsOfThePort(ports: readonly NodeCatalogPort[] | undefined, portName: string): Pick<NodePin, "description" | "annotations"> {
  const port = ports?.find((catalogPort) => catalogPort.name === portName);
  return { description: descriptionWords(port?.description), annotations: port?.annotations ?? {} };
}

/**
 * The inputs of `node` in `graph`, each described and annotated as `catalogEntry` describes its port, with the stream facts it receives,
 * and addressed at `valuesAt`, the level of the graph it is at, where it holds a value of its own; a link renders on every
 * input it feeds, so an input the runtime reads from a wire is addressed by none, and `null` addresses none.
 */
export function nodeInputs(graph: StreamGraphSummary, node: StreamGraphNode, catalogEntry: NodeCatalogEntry | undefined, valuesAt: GraphAddress | null): NodePin[] {
  return node.input_ports.map((port) => ({
    name: port.name,
    pin: port.pin,
    family: port.family,
    ...catalogWordsOfThePort(catalogEntry?.inputs, port.name),
    stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
    value_address: valueAddressOfTheInput(valuesAt, node.id, port),
  }));
}

/** The outputs of `node`, each described and annotated as `catalogEntry` describes its port, with the stream facts it states. */
export function nodeOutputs(node: StreamGraphNode, catalogEntry: NodeCatalogEntry | undefined): NodePin[] {
  return node.output_ports.map((port) => ({
    name: port.name,
    pin: port.pin,
    family: port.family,
    ...catalogWordsOfThePort(catalogEntry?.outputs, port.name),
    stream_facts_words: portStreamFactsWords(port),
    value_address: null,
  }));
}
