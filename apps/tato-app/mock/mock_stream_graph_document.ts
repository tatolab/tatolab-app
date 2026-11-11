// The browser mock's `graph` tool: a mock stream's graph rendered as the runtime renders its
// document — node ids, config, ports, components with state and metrics, link ids and ends,
// `machine` — and the summary the main process would read from it.

import { mockGraphNodeIdOf, type MockGraphNode, type MockStreamGraph } from "./mock_stream_fixtures";
import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";
import type {
  JsonValue,
  ListedStream,
  PortStreamFacts,
  StreamGraphDeclaredPort,
  StreamGraphInterfacePort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphNodeStudioFields,
  StreamGraphSummary,
} from "../src/shared/tatolab_backend_contract";

/** Where a mock stream's run stands when its graph is read. */
export interface MockStreamGraphMoment {
  /** Whether its nodes have started; before they have, they read `Pending` and their links `pending`. */
  hasSettled: boolean;
  /** How long its counters have been climbing. */
  secondsSinceSettled: number;
}

/** `facts` as the runtime renders a port's `stream_facts`: tagged by `family`, each fact the port does not state left out. */
function streamFactsAsTheRuntimeRendersThem(facts: PortStreamFacts): Record<string, unknown> {
  if (facts.family === "image") {
    return Object.fromEntries(Object.entries(facts).filter((entry) => entry[1] !== null));
  }
  const { codec_configuration_byte_length: codecConfigurationByteLength, ...statedFacts } = facts;
  return {
    ...Object.fromEntries(Object.entries(statedFacts).filter((entry) => entry[1] !== null)),
    ...(codecConfigurationByteLength === null ? {} : { codec_configuration_hex: "00".repeat(codecConfigurationByteLength) }),
  };
}

/** `values_checked` as the runtime renders it: only on a port that carries the mark. */
function valuesCheckedAsTheRuntimeRendersIt(port: StreamGraphDeclaredPort): { values_checked?: boolean } {
  return port.values_checked === null ? {} : { values_checked: port.values_checked };
}

/** The runtime's capitalised link state in `components`: `awaiting_remote` reads `AwaitingRemote`. */
function linkComponentState(linkState: string): string {
  return linkState
    .split("_")
    .map((word) => (word === "" ? word : word[0].toUpperCase() + word.slice(1)))
    .join("");
}

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

/** The families a client writes a stream's top-level `GraphInput` of, which run and so carry a current value. */
const GRAPH_INPUT_FAMILIES_A_CLIENT_WRITES: readonly string[] = ["array", "channels", "records"];

/** The port `node` declares as the runtime renders its `graph_interface`: a top-level running Input carrying the value last written to it by name, else its `default`; `null` for a node that is no interface node. */
function graphInterfacePortAsTheRuntimeRendersIt(node: MockGraphNode, isTopLevel: boolean, valueWrittenToEachGraphInput: ReadonlyMap<string, JsonValue>): StreamGraphInterfacePort | null {
  const direction = node.type === "tatolab.stream:GraphInput" ? "input" : node.type === "tatolab.stream:GraphOutput" ? "output" : null;
  const { port, family } = node.config;
  if (direction === null || typeof port !== "string" || typeof family !== "string") return null;
  const carriesAValue = direction === "input" && isTopLevel && GRAPH_INPUT_FAMILIES_A_CLIENT_WRITES.includes(family);
  return { direction, port, family, current_value: carriesAValue ? (valueWrittenToEachGraphInput.get(port) ?? node.config["default"] ?? null) : null };
}

/** `{ graph_interface }` as the runtime renders it on `node`'s components, its `current_value` left out where it carries none; `{}` on a node that is no interface node. */
function graphInterfaceComponentOf(node: StreamGraphNode | undefined): Record<string, JsonValue> {
  const graphInterface = node?.graph_interface ?? null;
  if (graphInterface === null) return {};
  const { current_value: currentValue, ...declared } = graphInterface;
  return { graph_interface: currentValue === null ? declared : { ...declared, current_value: currentValue } };
}

/** A link's source, a node in another stream rendered with that stream beside it, as `<stream>/<node>` names it in the summary. */
function linkSourceAsTheRuntimeRendersIt(sourceNode: string, sourcePort: string): { stream?: string; node: string; port: string } {
  const streamSeparator = sourceNode.indexOf("/");
  if (streamSeparator === -1) return { node: sourceNode, port: sourcePort };
  return { stream: sourceNode.slice(0, streamSeparator), node: sourceNode.slice(streamSeparator + 1), port: sourcePort };
}

/** The `graph {stream}` document of `graph` for the stream `listing` lists, on `machineName` at `moment`, each top-level Input carrying what `valueWrittenToEachGraphInput` holds under its name, and the summary read from it; its ports name their families only when `arePortFamiliesServed`. */
export function mockStreamGraphSummary(
  listing: ListedStream,
  machineName: string,
  graph: MockStreamGraph,
  moment: MockStreamGraphMoment,
  arePortFamiliesServed: boolean,
  valueWrittenToEachGraphInput: ReadonlyMap<string, JsonValue>,
): StreamGraphSummary {
  const streamId = listing.stream;
  const streamAsset = listing.location?.stream_asset ?? null;
  const servedPorts = (ports: StreamGraphDeclaredPort[]): StreamGraphDeclaredPort[] => (arePortFamiliesServed ? ports : ports.map((port) => ({ ...port, family: null })));
  const familyAsTheRuntimeRendersIt = (port: StreamGraphDeclaredPort) => (arePortFamiliesServed && port.family !== null ? { family: port.family } : {});
  const nodeState = (state: string | null) => (state === null ? null : moment.hasSettled ? state : "Pending");
  const linkState = (state: string) => (moment.hasSettled ? state : "pending");
  const climbed = (perSecond: number) => (moment.hasSettled ? Math.floor(perSecond * moment.secondsSinceSettled) : 0);
  const nodesOfTheLevel = (levelNodes: MockGraphNode[], levelLinks: StreamGraphLink[], isTopLevel: boolean): StreamGraphNode[] =>
    levelNodes.map((node) => ({
      id: mockGraphNodeIdOf(streamId, node),
      name: node.name,
      type: node.type,
      state: nodeState(node.state),
      failed_because: moment.hasSettled ? (node.failed_because ?? null) : null,
      process_raising_because: moment.hasSettled ? (node.process_raising_because ?? null) : null,
      config: node.config,
      pins: node.pins ?? {},
      input_ports: servedPorts(node.input_ports),
      output_ports: servedPorts(node.output_ports),
      dropped_bags_by_link: Object.fromEntries(
        levelLinks.filter((link) => link.target_node === node.name).map((link) => [link.id, climbed(graph.counterRates.droppedPerSecondByLinkId[link.id] ?? 0)]),
      ),
      refused_bags_by_output_port: Object.fromEntries(
        [...new Set([...levelLinks.filter((link) => link.source_node === node.name).map((link) => link.source_port)])].map((port) => [
          port,
          climbed(graph.counterRates.refusedPerSecondByOutput.find((output) => output.node === node.name && output.port === port)?.perSecond ?? 0),
        ]),
      ),
      studio: node.studio ?? NODE_STUDIO_FIELDS_NONE_SET,
      fragment:
        node.fragment === undefined
          ? null
          : {
              kind: node.fragment.kind,
              nodes: nodesOfTheLevel(node.fragment.nodes, node.fragment.links, false),
              links: node.fragment.links.map((link) => ({ ...link, state: linkState(link.state) })),
              groups: node.fragment.groups,
            },
      graph_interface: graphInterfacePortAsTheRuntimeRendersIt(node, isTopLevel, valueWrittenToEachGraphInput),
    }));
  const nodes = nodesOfTheLevel(graph.nodes, graph.links, true);
  const groups = graph.groups ?? [];
  const notes = graph.notes ?? [];
  const graphDocument = {
    ...(streamAsset === null ? {} : { asset: streamAsset }),
    stream: streamId,
    nodes: graph.nodes.map((node, nodeIndex) => ({
      id: mockGraphNodeIdOf(streamId, node),
      type: node.type,
      name: node.name,
      config: node.config,
      pins: node.pins ?? {},
      ...(node.studio === undefined ? {} : { studio: studioAsTheRuntimeRendersIt(node.studio) }),
      ports: {
        inputs: node.input_ports.map((port) => ({
          name: port.name,
          description: "",
          port_kind: "data",
          delivery_profile: "newest",
          ...valuesCheckedAsTheRuntimeRendersIt(port),
          ...familyAsTheRuntimeRendersIt(port),
        })),
        outputs: node.output_ports.map((port) => ({
          name: port.name,
          description: "",
          port_kind: "data",
          delivery_profile: null,
          ...(port.stream_facts === null ? {} : { stream_facts: streamFactsAsTheRuntimeRendersThem(port.stream_facts) }),
          ...valuesCheckedAsTheRuntimeRendersIt(port),
          ...familyAsTheRuntimeRendersIt(port),
        })),
      },
      components: node.state === null ? graphInterfaceComponentOf(nodes[nodeIndex]) : {
        ...graphInterfaceComponentOf(nodes[nodeIndex]),
        state: nodes[nodeIndex]?.state ?? null,
        failed_because: nodes[nodeIndex]?.failed_because ?? null,
        process_raising_because: nodes[nodeIndex]?.process_raising_because ?? null,
        paused: false,
        metrics: {
          frames_dropped: 0,
          dropped_bags_by_link: nodes[nodeIndex]?.dropped_bags_by_link ?? {},
          refused_bags_by_output_port: nodes[nodeIndex]?.refused_bags_by_output_port ?? {},
        },
      },
    })),
    links: graph.links.map((link) => ({
      id: link.id,
      source: linkSourceAsTheRuntimeRendersIt(link.source_node, link.source_port),
      target: { node: link.target_node, port: link.target_port },
      capacity: 4,
      state: linkState(link.state),
      components: { state: linkComponentState(linkState(link.state)) },
    })),
    ...(groups.length === 0 ? {} : { groups }),
    ...(notes.length === 0 ? {} : { studio: { contract: 1, notes } }),
    machine: machineName,
  };
  return {
    stream: streamId,
    stream_asset: streamAsset,
    groups,
    notes,
    nodes,
    links: graph.links.map((link) => ({ ...link, state: linkState(link.state) })),
    graph_document_text: JSON.stringify(graphDocument, null, 2),
  };
}
