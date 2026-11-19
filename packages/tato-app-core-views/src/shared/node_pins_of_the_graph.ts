// A node's pins as every surface reads them from a stream's graph: the card on the canvas and its
// row in Properties draw the same pins, each described by its node type and addressed where its
// value is kept. A node's settings come first among its inputs, each a setting of a typed node the
// graph lists among its ports or one of a node type not yet typed that it lists among none.

import { valueAddressOfTheInput, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { exactPinOfTheDeclaredPort, settingOfTheDescribedInput, type NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { settingsOfTheNodeNotAmongItsPorts } from "@tatolab/tato-app-view-sdk/pin_model/node_settings";
import { familyOfThePort, pinOfThePort, type NodeTypeDescription, type NodeTypeInputDescribed, type NodeTypePortDescribed, type StreamGraph, type StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
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
 * The setting the input `inputName` of `node` is as `described`, its node type's description, lists it; `null` for an input that
 * takes a wire, one it lists none of, and a setting the node takes as an input, exposed, which a wire feeds.
 */
function settingOfTheInput(node: Pick<StreamGraphNode, "exposed_config_fields">, described: Pick<NodeTypeDescription, "inputs"> | undefined, inputName: string): NodePin["setting"] {
  if (node.exposed_config_fields?.includes(inputName) === true) return null;
  const input = described?.inputs.find((describedInput) => describedInput.name === inputName);
  return input === undefined ? null : settingOfTheDescribedInput(input);
}

/** A setting of a node type not yet typed, which the graph lists among no port of `node`: typed exactly where its node type says so, and addressed at `valuesAt`, which `null` addresses none at. */
function nodePinOfTheSettingNotAmongThePorts(node: Pick<StreamGraphNode, "id">, setting: NodeTypeInputDescribed, valuesAt: GraphAddress | null): NodePin {
  return {
    name: setting.name,
    pin: exactPinOfTheDeclaredPort(setting),
    family: null,
    description: descriptionWords(setting.documentation),
    annotations: setting.annotations ?? {},
    stream_facts_words: [],
    value_address: valuesAt === null ? null : { graph: valuesAt, node_id: node.id, input: setting.name },
    setting: settingOfTheDescribedInput(setting),
  };
}

/**
 * The inputs of `node` in `graph`, its settings first: each described and annotated as `described`, its node type's description,
 * describes it, with the stream facts it receives, and addressed at `valuesAt`, the level of the graph it is at, where it holds a
 * value of its own; a link renders on every input it feeds, so an input the runtime reads from a wire is addressed by none, and
 * `null` addresses none. A setting the graph lists among no port of the node follows those it does.
 */
export function nodeInputs(graph: Pick<StreamGraph, "nodes" | "links">, node: StreamGraphNode, described: NodeTypeDescription | undefined, valuesAt: GraphAddress | null): NodePin[] {
  const ofThePorts = node.ports.inputs.map(
    (port): NodePin => ({
      name: port.name,
      pin: pinOfThePort(port),
      family: familyOfThePort(port),
      ...describedWordsOfThePort(described?.inputs, port.name),
      stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
      value_address: valueAddressOfTheInput(valuesAt, node.id, port),
      setting: settingOfTheInput(node, described, port.name),
    }),
  );
  const settingsNotAmongThePorts = settingsOfTheNodeNotAmongItsPorts(described, node).map((setting) => nodePinOfTheSettingNotAmongThePorts(node, setting, valuesAt));
  return [...ofThePorts.filter((pin) => pin.setting !== null), ...settingsNotAmongThePorts, ...ofThePorts.filter((pin) => pin.setting === null)];
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
    setting: null,
  }));
}
