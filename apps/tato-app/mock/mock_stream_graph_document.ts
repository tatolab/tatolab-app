// The browser mock's `graph` tool: a mock stream's graph rendered as the runtime answers `graph`,
// typed by the control contract — node ids, config, ports, components with state and metrics, link
// ids and ends, `machine` — which the main process passes on unchanged.

import { mockFamilyOfThePort } from "./mock_port_families";
import { mockGraphNodeIdOf, type MockGraphLink, type MockGraphNode, type MockGraphPort, type MockStreamGraph } from "./mock_stream_fixtures";
import type {
  JsonValue,
  ListedStream,
  PortStreamFacts,
  StreamGraph,
  StreamGraphInterfacePort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphNodeKind,
  StreamGraphNodeStudioFields,
  StreamGraphPort,
} from "../src/shared/tatolab_backend_contract";

/** A node's state as the runtime names it. */
type NodeState = NonNullable<StreamGraphNode["components"]["state"]>;

/** Where a mock stream's run stands when its graph is read. */
export interface MockStreamGraphMoment {
  /** Whether its nodes have started; before they have, they read `Pending` and their links `pending`. */
  hasSettled: boolean;
  /** How long its counters have been climbing. */
  secondsSinceSettled: number;
}

/** The keys of `PortStreamFacts` the runtime does not render as they are: what the facts are of and their type, rendered as `type`, and the configuration record's length, rendered as its hex. */
const KEYS_NAMING_THE_STREAM_FACTS: ReadonlySet<string> = new Set(["facts_of", "type", "codec_configuration_byte_length"]);

/** `facts` as the runtime renders a port's `stream_facts`: the pin type they describe under `type`, each fact the port does not state left out. */
function streamFactsAsTheRuntimeRendersThem(facts: PortStreamFacts): Record<string, unknown> {
  const statedFacts = Object.fromEntries(Object.entries(facts).filter(([key, value]) => value !== null && !KEYS_NAMING_THE_STREAM_FACTS.has(key)));
  const codecConfigurationByteLength = facts.facts_of === "encoded_units" ? facts.codec_configuration_byte_length : null;
  return {
    type: facts.type,
    ...statedFacts,
    ...(codecConfigurationByteLength === null ? {} : { codec_configuration_hex: "00".repeat(codecConfigurationByteLength) }),
  };
}

/** `values_checked` as the runtime renders it: only on a port that carries the mark. */
function valuesCheckedAsTheRuntimeRendersIt(port: MockGraphPort): { values_checked?: boolean } {
  return port.values_checked === null ? {} : { values_checked: port.values_checked };
}

/** An input's value as the runtime renders it beside its pin type: `value` and `value_comes_from`, only `value_comes_from` while a link feeds it, a `null` value alone while it reads none, and neither on an input that takes no stored value. */
function inputValueAsTheRuntimeRendersIt(port: MockGraphPort): Pick<StreamGraphPort, "value" | "value_comes_from"> {
  if (port.value_read === null) return {};
  if (port.value_read.comes_from === null) return { value: null };
  if (port.value_read.comes_from === "wire") return { value_comes_from: "wire" };
  return { value: port.value_read.value, value_comes_from: port.value_read.comes_from };
}

/**
 * A bundle input's members as the runtime renders them in place of its value: a row for each, in the order the bundle declares
 * them, each reading `wire` while a link feeds the whole input or that member, and what it reads unlinked otherwise.
 */
function memberValuesAsTheRuntimeRendersThem(port: MockGraphPort, linksIntoThePort: readonly MockGraphLink[]): Pick<StreamGraphPort, "member_values"> {
  const isWholeInputLinked = linksIntoThePort.some((link) => link.target_member === undefined);
  return {
    member_values: (port.member_reads ?? []).map(({ member, value_read: valueRead }) => {
      if (isWholeInputLinked || linksIntoThePort.some((link) => link.target_member === member)) return { member, value_comes_from: "wire" };
      if (valueRead.comes_from === null) return { member, value: null };
      return { member, value: valueRead.value, value_comes_from: valueRead.comes_from };
    }),
  };
}

/** What the input `port` of `node` reads while unlinked: for one of its settings, the value its config holds, else the default the port reads, as the runtime renders a view's settings reading its node's config; for every other input, what the port reads. */
function valueReadOfTheInput(node: Pick<MockGraphNode, "config" | "settings">, port: MockGraphPort): MockGraphPort {
  const held = node.config[port.name];
  if (node.settings?.includes(port.name) !== true || held === undefined || held === null) return port;
  return { ...port, value_read: { value: held, comes_from: "saved" } };
}

/** A port's pin type and flow as the runtime renders them: both on a typed port, neither on an untyped one. */
function pinAsTheRuntimeRendersIt(port: MockGraphPort): Pick<StreamGraphPort, "pin_type" | "flow"> {
  return port.pin === null ? {} : { pin_type: port.pin.pin_type, flow: port.pin.flow };
}

/** The runtime's capitalised link state in `components`. */
const LINK_COMPONENT_STATE = { pending: "Pending", wired: "Wired", disconnecting: "Disconnecting", disconnected: "Disconnected", error: "Error" } as const;

/** A node's studio fields as the runtime renders them: each one set, under the studio contract. */
export function studioAsTheRuntimeRendersIt(studio: StreamGraphNodeStudioFields): Record<string, JsonValue> {
  return {
    contract: 1,
    ...(studio.position === null ? {} : { position: studio.position }),
    ...(studio.group === null ? {} : { group: studio.group }),
    ...(studio.comment === null ? {} : { comment: studio.comment }),
    ...(studio.colour === null ? {} : { colour: studio.colour }),
    ...(studio.collapsed === null ? {} : { collapsed: studio.collapsed }),
    ...(Object.keys(studio.metadata).length === 0 ? {} : { metadata: studio.metadata }),
  };
}

/** Whether a client writes `node`, a top-level `GraphInput` of a family that runs: Array, Channels or Records. */
export function isAGraphInputAClientWrites(node: MockGraphNode): boolean {
  const family = familyTheInterfaceNodeCarries(node);
  return node.type === "tatolab.stream:GraphInput" && portTheInterfaceNodeNames(node) !== null && (family === null || ["array", "channels", "records"].includes(family));
}

/** The family an interface node's messages travel in, as the mock's runtime finds it: its config's or its pins' `family`, else the one its `value` port's pin type travels in; `null` while it names none. */
function familyTheInterfaceNodeCarries(node: MockGraphNode): string | null {
  const family = node.config["family"] ?? node.pins?.["family"];
  if (typeof family === "string") return family;
  const valuePort = (node.type === "tatolab.stream:GraphInput" ? node.output_ports : node.input_ports).find((port) => port.name === "value");
  return valuePort?.pin === null || valuePort?.pin === undefined ? (valuePort?.family ?? null) : mockFamilyOfThePort(valuePort.pin);
}

/** The port an interface node names in its graph's interface: its config's or its pins' `port`, else the value its `port` input reads. */
function portTheInterfaceNodeNames(node: MockGraphNode): string | null {
  const port = node.config["port"] ?? node.pins?.["port"] ?? node.input_ports.find((input) => input.name === "port")?.value_read?.value ?? null;
  return typeof port === "string" ? port : null;
}

/** The port `node` declares as the runtime renders its `graph_interface`: a top-level Input a client writes, while it reads `nodeState` `Running`, carrying the pin type its `value` port carries, as its `pin_type` setting chose it, and what its `value` input reads, else the `value` the mock keeps in the config of an Input it added with no `value` input; `null` for a node that is no interface node. */
function graphInterfacePortAsTheRuntimeRendersIt(node: MockGraphNode, nodeState: string | null, isTopLevel: boolean): StreamGraphInterfacePort | null {
  const direction = node.type === "tatolab.stream:GraphInput" ? "input" : node.type === "tatolab.stream:GraphOutput" ? "output" : null;
  const port = portTheInterfaceNodeNames(node);
  if (direction === null || port === null) return null;
  const carriesAValue = isTopLevel && nodeState === "Running" && isAGraphInputAClientWrites(node);
  const valueRead = node.input_ports.find((input) => input.name === "value")?.value_read?.value ?? null;
  const currentValue = carriesAValue ? (valueRead ?? node.config["value"] ?? node.pins?.["value"] ?? null) : null;
  const pin = (direction === "input" ? node.output_ports : node.input_ports).find((valuePort) => valuePort.name === "value")?.pin ?? null;
  return { direction, port, ...(pin === null ? {} : { pin_type: pin.pin_type }), ...(currentValue === null ? {} : { current_value: currentValue }) };
}

/** How the mock node `node`'s code runs, as the runtime renders its `kind`. */
function mockGraphNodeKindOf(node: MockGraphNode): StreamGraphNodeKind {
  return node.kind ?? (node.fragment === undefined ? "process" : "fragment");
}

/** The state a mock node in `state` renders while its stream settles, as the runtime names a node's state. */
const NODE_STATES: readonly NodeState[] = ["Pending", "Idle", "Running", "Paused", "Stopping", "Stopped", "Error", "Restarting"];

/** `state` as the runtime names a node's state; a mock node holds only those. */
function nodeStateOf(state: string): NodeState {
  const nodeState = NODE_STATES.find((candidate) => candidate === state);
  if (nodeState === undefined) throw new Error(`a mock node holds the state ${state}, which the runtime never renders`);
  return nodeState;
}

/** The `graph {stream}` answer of `graph` for the stream `listing` lists, on `machineName` at `moment`, each top-level Input carrying what its `value` input reads. */
export function mockStreamGraphOf(listing: ListedStream, machineName: string, graph: MockStreamGraph, moment: MockStreamGraphMoment): StreamGraph {
  const streamId = listing.stream;
  const streamAsset = listing.location?.stream_asset ?? null;
  const nodeState = (state: string | null): NodeState | null => (state === null ? null : moment.hasSettled ? nodeStateOf(state) : "Pending");
  const linkState = (state: MockGraphLink["state"]): MockGraphLink["state"] => (moment.hasSettled ? state : "pending");
  const climbed = (perSecond: number) => (moment.hasSettled ? Math.floor(perSecond * moment.secondsSinceSettled) : 0);
  const portAsTheRuntimeRendersIt = (port: MockGraphPort): StreamGraphPort => ({
    name: port.name,
    description: "",
    port_kind: "data",
    ...(port.stream_facts === null ? {} : { stream_facts: streamFactsAsTheRuntimeRendersThem(port.stream_facts) }),
    ...valuesCheckedAsTheRuntimeRendersIt(port),
    ...pinAsTheRuntimeRendersIt(port),
    ...(port.annotations === undefined ? {} : { annotations: port.annotations }),
  });
  const linkAsTheRuntimeRendersIt = (link: MockGraphLink): StreamGraphLink => ({
    id: link.id,
    source: { node: link.source_node, port: link.source_port, ...(link.source_member === undefined ? {} : { member: link.source_member }) },
    target: { node: link.target_node, port: link.target_port, ...(link.target_member === undefined ? {} : { member: link.target_member }) },
    capacity: 4,
    state: linkState(link.state),
    ...(link.free_conversion === undefined ? {} : { free_conversion: link.free_conversion }),
    ...(link.warnings === undefined ? {} : { warnings: link.warnings }),
    components: { state: LINK_COMPONENT_STATE[linkState(link.state)] },
  });
  const nodesOfTheLevel = (levelNodes: MockGraphNode[], levelLinks: MockGraphLink[], isTopLevel: boolean): StreamGraphNode[] =>
    levelNodes.map((node) => {
      const state = nodeState(node.state);
      const graphInterface = graphInterfacePortAsTheRuntimeRendersIt(node, state, isTopLevel);
      const linksInto = (port: MockGraphPort) => levelLinks.filter((link) => link.target_node === node.name && link.target_port === port.name);
      return {
        id: mockGraphNodeIdOf(streamId, node),
        type: node.type,
        kind: mockGraphNodeKindOf(node),
        ...(node.language === undefined ? {} : { language: node.language }),
        name: node.name,
        input_values: { ...node.config, ...node.pins },
        ...(node.studio === undefined ? {} : { studio: studioAsTheRuntimeRendersIt(node.studio) }),
        ports: {
          // As the runtime renders it, a link reads `wire` on every input it feeds, one that takes no stored value too, and on each member of a bundle it feeds.
          inputs: node.input_ports.map((port) => ({
            ...portAsTheRuntimeRendersIt(port),
            delivery_profile: "newest",
            ...(port.takes_a_wire === undefined ? {} : { takes_a_wire: port.takes_a_wire }),
            ...(port.member_reads === undefined
              ? inputValueAsTheRuntimeRendersIt(linksInto(port).length > 0 ? { ...port, value_read: { value: null, comes_from: "wire" } } : valueReadOfTheInput(node, port))
              : memberValuesAsTheRuntimeRendersThem(port, linksInto(port))),
          })),
          outputs: node.output_ports.map((port) => ({ ...portAsTheRuntimeRendersIt(port), delivery_profile: null })),
        },
        components: {
          failed_because: moment.hasSettled ? (node.failed_because ?? null) : null,
          process_raising_because: moment.hasSettled ? (node.process_raising_because ?? null) : null,
          not_ready_because: moment.hasSettled ? (node.not_ready_because ?? null) : null,
          ...(graphInterface === null ? {} : { graph_interface: graphInterface }),
          ...(state === null
            ? {}
            : {
                state,
                paused: false,
                metrics: {
                  frames_dropped: 0,
                  dropped_bags_by_link: Object.fromEntries(
                    levelLinks.filter((link) => link.target_node === node.name).map((link) => [link.id, climbed(graph.counterRates.droppedPerSecondByLinkId[link.id] ?? 0)]),
                  ),
                  refused_bags_by_output_port: Object.fromEntries(
                    [...new Set(levelLinks.filter((link) => link.source_node === node.name).map((link) => link.source_port))].map((port) => [
                      port,
                      climbed(graph.counterRates.refusedPerSecondByOutput.find((output) => output.node === node.name && output.port === port)?.perSecond ?? 0),
                    ]),
                  ),
                  written_bags_by_output_port: {},
                },
              }),
        },
        ...(node.fragment === undefined
          ? {}
          : { fragment: { nodes: nodesOfTheLevel(node.fragment.nodes, node.fragment.links, false), links: node.fragment.links.map(linkAsTheRuntimeRendersIt), groups: node.fragment.groups } }),
      };
    });
  const groups = graph.groups ?? [];
  const notes = graph.notes ?? [];
  return {
    ...(streamAsset === null ? {} : { asset: streamAsset }),
    stream: streamId,
    nodes: nodesOfTheLevel(graph.nodes, graph.links, true),
    links: graph.links.map(linkAsTheRuntimeRendersIt),
    ...(groups.length === 0 ? {} : { groups }),
    ...(notes.length === 0 ? {} : { studio: { contract: 1, notes } }),
    machine: machineName,
  };
}
