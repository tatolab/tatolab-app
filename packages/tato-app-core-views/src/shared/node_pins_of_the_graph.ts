// A node's pins as every surface reads them from a stream's graph: the card on the canvas and its
// row in Properties draw the same pins, each described by its node type and addressed where its
// value is kept. A node's settings come first among its inputs, each a setting of a typed node the
// graph lists among its ports or one of a node type not yet typed that it lists among none. Whether
// a link may end at an input is the runtime's mark on it, which Studio reads and never works out.

import { wiringOfTheInput } from "@tatolab/tato-app-view-sdk/pin_model/input_wiring";
import { membersOfTheBundle, nodeInputLinkOfTheGraph, pinOfTheEnd } from "@tatolab/tato-app-view-sdk/pin_model/node_input_link";
import { valueAddressOfTheInput, valueAddressOfTheMember, type GraphAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { doesTheDescribedInputTakeAWire, exactPinOfTheDeclaredPort, openBundlesOfTheMetadata, settingOfTheDescribedInput, type NodePin, type NodePinBundle, type NodePinWire } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { settingsOfTheNodeNotAmongItsPorts } from "@tatolab/tato-app-view-sdk/pin_model/node_settings";
import {
  familyOfThePort,
  memberValueReadsOfThePort,
  pinOfThePort,
  studioFieldsOfTheNode,
  type NodeTypeDescription,
  type NodeTypeInputDescribed,
  type NodeTypePortDescribed,
  type StreamGraph,
  type StreamGraphNode,
  type StreamGraphPort,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { portStreamFactsWords, streamFactsAnInputReceives } from "./port_stream_facts_words";

/** `description` trimmed, or `null` for none. */
export function descriptionWords(description: string | undefined): string | null {
  return description === undefined || description.trim() === "" ? null : description.trim();
}

/**
 * What `port` says and annotates: its documentation as its node type's description, among `ports`, says it, `null` for none, and
 * its annotations as `graph` serves them on the port, which on a Graph Input's `value` are those its settings state, else as
 * that description annotates it, empty for none.
 */
function describedWordsOfThePort(ports: readonly NodeTypePortDescribed[] | undefined, port: Pick<StreamGraphPort, "name" | "annotations">): Pick<NodePin, "description" | "annotations"> {
  const described = ports?.find((describedPort) => describedPort.name === port.name);
  return { description: descriptionWords(described?.documentation), annotations: port.annotations ?? described?.annotations ?? {} };
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

/** A setting of a node type not yet typed, which the graph lists among no port of `node`: typed exactly where its node type says so, addressed at `valuesAt`, which `null` addresses none at, and taking no wire, since no link ends where no port is. */
function nodePinOfTheSettingNotAmongThePorts(node: Pick<StreamGraphNode, "id">, setting: NodeTypeInputDescribed, valuesAt: GraphAddress | null): NodePin {
  return {
    name: setting.name,
    member: null,
    pin: exactPinOfTheDeclaredPort(setting),
    family: null,
    description: descriptionWords(setting.documentation),
    annotations: setting.annotations ?? {},
    stream_facts_words: [],
    value_address: valuesAt === null ? null : { graph: valuesAt, node_id: node.id, input: setting.name, member: null },
    setting: settingOfTheDescribedInput(setting),
    takes_a_wire: false,
    wire: null,
    link: null,
    bundle: null,
  };
}

/** The rows of the bundle `whole`, a pin carrying one, each member built by `memberRow`, open where `openNames` names its pin; `null` for a pin that carries no bundle. */
function bundleOfThePin(whole: Pick<NodePin, "name" | "pin">, openNames: readonly string[], memberRow: (member: string) => NodePin): NodePinBundle | null {
  const members = membersOfTheBundle(whole.pin);
  return whole.pin?.pin_type.type === "bundle" ? { members: members.map(memberRow), is_open: openNames.includes(whole.name) } : null;
}

/** Where Studio reads the wires into a node's inputs: the stream whose port viewers it reads, and the level of its graph, its own; `null` where it reads none. */
export interface WiresReadAt {
  readonly stream: string;
  readonly graph: GraphAddress;
}

/** Where Studio reads the wires into the inputs of the stream `stream` at `valuesAt`: on the stream's own level, whose outputs its port viewers read, and nowhere inside a subgraph or while no level is known. */
export function wiresReadAtTheLevel(stream: string, valuesAt: GraphAddress | null): WiresReadAt | null {
  return valuesAt === null || valuesAt.level.length > 0 ? null : { stream, graph: valuesAt };
}

/**
 * Whether a link may end at the input `port`, as the runtime marks it: on the port in `graph`, else on its input in `described`, its
 * node type's description, which marks each one, and as taking one where neither says, as on a port of a subgraph's own node.
 */
function doesTheInputTakeAWire(port: Pick<StreamGraphPort, "name" | "takes_a_wire">, described: Pick<NodeTypeDescription, "inputs"> | undefined): boolean {
  if (port.takes_a_wire !== undefined && port.takes_a_wire !== null) return port.takes_a_wire;
  const describedInput = described?.inputs.find((input) => input.name === port.name);
  return describedInput === undefined || doesTheDescribedInputTakeAWire(describedInput);
}

/** What the input `port` of `node` reads through its wire in `graph`, at `wiresAt`; `null` for one that takes no wire, and where no wire is read. */
function wireIntoTheInput(graph: Pick<StreamGraph, "nodes" | "links">, node: StreamGraphNode, port: StreamGraphPort, takesAWire: boolean, wiresAt: WiresReadAt | null): NodePinWire | null {
  if (wiresAt === null || !takesAWire) return null;
  return { into: { graph: wiresAt.graph, node_id: node.id, input: port.name, member: null }, wiring: wiringOfTheInput(wiresAt.stream, graph, node.name, port.name, familyOfThePort(port)) };
}

/**
 * The inputs of `node` in `graph`, its settings first: each described as `described`, its node type's description, describes it,
 * annotated as `graph` serves it, else as that description does, with the stream facts it receives, and addressed at `valuesAt`, the level of the graph it is at, where it holds a
 * value of its own; a link renders on every input it feeds, so an input the runtime reads from a wire is addressed by none, and
 * `null` addresses none. Each input that takes a wire reads it at `wiresAt`, `null` reading none, and carries what the runtime
 * marks on the link that feeds it. A setting the graph lists among no port of the node follows those it does.
 */
export function nodeInputs(
  graph: Pick<StreamGraph, "nodes" | "links">,
  node: StreamGraphNode,
  described: NodeTypeDescription | undefined,
  valuesAt: GraphAddress | null,
  wiresAt: WiresReadAt | null,
): NodePin[] {
  const openInputs = openBundlesOfTheMetadata(studioFieldsOfTheNode(node).metadata).inputs;
  const ofThePorts = node.ports.inputs.map((port): NodePin => {
    const setting = settingOfTheInput(node, described, port.name);
    const takesAWire = doesTheInputTakeAWire(port, described);
    const pin = pinOfThePort(port);
    const memberValueReads = memberValueReadsOfThePort(port);
    const memberRow = (member: string): NodePin => ({
      name: port.name,
      member,
      pin: pinOfTheEnd(pin, member),
      family: null,
      description: null,
      annotations: {},
      stream_facts_words: [],
      value_address: valueAddressOfTheMember(valuesAt, node.id, port.name, member, memberValueReads.find((row) => row.member === member)?.value_read ?? null),
      setting,
      takes_a_wire: takesAWire,
      wire: null,
      link: nodeInputLinkOfTheGraph(graph, node.name, port.name, member),
      bundle: null,
    });
    return {
      name: port.name,
      member: null,
      pin,
      family: familyOfThePort(port),
      ...describedWordsOfThePort(described?.inputs, port),
      stream_facts_words: portStreamFactsWords(streamFactsAnInputReceives(graph, node.name, port)),
      value_address: valueAddressOfTheInput(valuesAt, node.id, port),
      setting,
      takes_a_wire: takesAWire,
      wire: wireIntoTheInput(graph, node, port, takesAWire, wiresAt),
      link: nodeInputLinkOfTheGraph(graph, node.name, port.name, null),
      bundle: bundleOfThePin({ name: port.name, pin }, openInputs, memberRow),
    };
  });
  const settingsNotAmongThePorts = settingsOfTheNodeNotAmongItsPorts(described, node).map((setting) => nodePinOfTheSettingNotAmongThePorts(node, setting, valuesAt));
  return [...ofThePorts.filter((pin) => pin.setting !== null), ...settingsNotAmongThePorts, ...ofThePorts.filter((pin) => pin.setting === null)];
}

/** The outputs of `node`, each described as `described`, its node type's description, describes its port, and annotated as `graph` serves it, else as that description does, with the stream facts it states, and a row for each member of a bundle it carries, shown where the node keeps it open. */
export function nodeOutputs(node: StreamGraphNode, described: NodeTypeDescription | undefined): NodePin[] {
  const openOutputs = openBundlesOfTheMetadata(studioFieldsOfTheNode(node).metadata).outputs;
  return node.ports.outputs.map((port): NodePin => {
    const pin = pinOfThePort(port);
    const memberRow = (member: string): NodePin => ({
      name: port.name,
      member,
      pin: pinOfTheEnd(pin, member),
      family: null,
      description: null,
      annotations: {},
      stream_facts_words: [],
      value_address: null,
      setting: null,
      takes_a_wire: true,
      wire: null,
      link: null,
      bundle: null,
    });
    return {
      name: port.name,
      member: null,
      pin,
      family: familyOfThePort(port),
      ...describedWordsOfThePort(described?.outputs, port),
      stream_facts_words: portStreamFactsWords(port),
      value_address: null,
      setting: null,
      takes_a_wire: true,
      wire: null,
      link: null,
      bundle: bundleOfThePin({ name: port.name, pin }, openOutputs, memberRow),
    };
  });
}
