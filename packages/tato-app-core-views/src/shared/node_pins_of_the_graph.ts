// A node's pins as every surface reads them from a stream's graph: the card on the canvas and its
// row in Properties draw the same pins, each described by its node type and addressed where its
// value is kept.

import { valueAddressOfTheInput, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { familyOfThePort, pinOfThePort, type NodeTypeDescription, type NodeTypePortDescribed, type StreamGraph, type StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { portStreamFactsWords, streamFactsAnInputReceives } from "./port_stream_facts_words";

/** `description` trimmed, or `null` for none. */
export function descriptionWords(description: string | undefined): string | null {
  return description === undefined || description.trim() === "" ? null : description.trim();
}

/** What a node type's description says and annotates of its port `portName`: its documentation, `null` for none, and its annotations, empty for none. */
function describedWordsOfThePort(ports: readonly NodeTypePortDescribed[] | undefined, portName: string): Pick<NodePin, "description" | "annotations"> {
  const port = ports?.find((describedPort) => describedPort.name === portName);
  return { description: descriptionWords(port?.documentation), annotations: port?.annotations ?? {} };
}

/**
 * The inputs of `node` in `graph`, each described and annotated as `described`, its node type's description, describes its port, with the stream facts it receives,
 * and addressed at `valuesAt`, the level of the graph it is at, where it holds a value of its own; a link renders on every
 * input it feeds, so an input the runtime reads from a wire is addressed by none, and `null` addresses none.
 */
export function nodeInputs(graph: Pick<StreamGraph, "nodes" | "links">, node: StreamGraphNode, described: NodeTypeDescription | undefined, valuesAt: GraphAddress | null): NodePin[] {
  return node.ports.inputs.map((port) => ({
    name: port.name,
    pin: pinOfThePort(port),
    family: familyOfThePort(port),
    ...describedWordsOfThePort(described?.inputs, port.name),
    stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
    value_address: valueAddressOfTheInput(valuesAt, node.id, port),
  }));
}

/** The outputs of `node`, each described and annotated as `described`, its node type's description, describes its port, with the stream facts it states. */
export function nodeOutputs(node: StreamGraphNode, described: NodeTypeDescription | undefined): NodePin[] {
  return node.ports.outputs.map((port) => ({
    name: port.name,
    pin: pinOfThePort(port),
    family: familyOfThePort(port),
    ...describedWordsOfThePort(described?.outputs, port.name),
    stream_facts_words: portStreamFactsWords(port),
    value_address: null,
  }));
}
