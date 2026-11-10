// The browser mock's `graph` tool: a mock stream's graph rendered as the runtime renders its
// document — node ids, config, ports, components with state and metrics, link ids and ends,
// `machine` — and the summary the main process would read from it.

import { mockGraphNodeIdOf, type MockStreamGraph } from "./mock_stream_fixtures";
import type { PortStreamFacts, StreamGraphDeclaredPort, StreamGraphNode, StreamGraphSummary } from "../src/shared/tatolab_backend_contract";

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

/** A link's source, a node in another stream rendered with that stream beside it, as `<stream>/<node>` names it in the summary. */
function linkSourceAsTheRuntimeRendersIt(sourceNode: string, sourcePort: string): { stream?: string; node: string; port: string } {
  const streamSeparator = sourceNode.indexOf("/");
  if (streamSeparator === -1) return { node: sourceNode, port: sourcePort };
  return { stream: sourceNode.slice(0, streamSeparator), node: sourceNode.slice(streamSeparator + 1), port: sourcePort };
}

/** The `graph {stream}` document of `graph` for the stream `streamId` on `machineName` at `moment`, and the summary read from it; its ports name their families only when `arePortFamiliesServed`. */
export function mockStreamGraphSummary(
  streamId: string,
  machineName: string,
  graph: MockStreamGraph,
  moment: MockStreamGraphMoment,
  arePortFamiliesServed: boolean,
): StreamGraphSummary {
  const servedPorts = (ports: StreamGraphDeclaredPort[]): StreamGraphDeclaredPort[] => (arePortFamiliesServed ? ports : ports.map((port) => ({ ...port, family: null })));
  const familyAsTheRuntimeRendersIt = (port: StreamGraphDeclaredPort) => (arePortFamiliesServed && port.family !== null ? { family: port.family } : {});
  const nodeState = (state: string) => (moment.hasSettled ? state : "Pending");
  const linkState = (state: string) => (moment.hasSettled ? state : "pending");
  const climbed = (perSecond: number) => (moment.hasSettled ? Math.floor(perSecond * moment.secondsSinceSettled) : 0);
  const nodes: StreamGraphNode[] = graph.nodes.map((node) => ({
    id: mockGraphNodeIdOf(streamId, node),
    name: node.name,
    type: node.type,
    state: nodeState(node.state),
    failed_because: moment.hasSettled ? (node.failed_because ?? null) : null,
    config: node.config,
    input_ports: servedPorts(node.input_ports),
    output_ports: servedPorts(node.output_ports),
    dropped_bags_by_link: Object.fromEntries(
      graph.links.filter((link) => link.target_node === node.name).map((link) => [link.id, climbed(graph.counterRates.droppedPerSecondByLinkId[link.id] ?? 0)]),
    ),
    refused_bags_by_output_port: Object.fromEntries(
      [...new Set([...graph.links.filter((link) => link.source_node === node.name).map((link) => link.source_port)])].map((port) => [
        port,
        climbed(graph.counterRates.refusedPerSecondByOutput.find((output) => output.node === node.name && output.port === port)?.perSecond ?? 0),
      ]),
    ),
  }));
  const graphDocument = {
    stream: streamId,
    nodes: graph.nodes.map((node, nodeIndex) => ({
      id: mockGraphNodeIdOf(streamId, node),
      type: node.type,
      name: node.name,
      config: node.config,
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
      components: {
        state: nodes[nodeIndex]?.state ?? null,
        failed_because: nodes[nodeIndex]?.failed_because ?? null,
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
    machine: machineName,
  };
  return {
    stream: streamId,
    nodes,
    links: graph.links.map((link) => ({ ...link, state: linkState(link.state) })),
    graph_document_text: JSON.stringify(graphDocument, null, 2),
  };
}
