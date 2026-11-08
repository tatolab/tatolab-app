// A stream's graph as the window draws it, read from the runtime's `graph {stream}` tool: its
// nodes by name with their type, state, config, declared ports and drop counters, its links by id, node and port, and the
// tool's text itself. Every other key the runtime renders stays only in that text.

import type {
  JsonValue,
  StreamGraphDeclaredPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
} from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  isAJsonValue,
  jsonObject,
  objectOrEmpty,
  type JsonObjectOnTheWire,
  optionalText,
  parseJsonOnTheWire,
  requiredText,
  textOrDefault,
} from "./json_on_the_wire.js";
import { portFamilyOnTheWire } from "./port_family_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The runtime's own reading of a link rendered without a state. */
const A_LINK_RENDERED_WITHOUT_A_STATE_IS_PENDING = "pending";

/** The summary of the graph the `graph {stream: <requestedStream>}` tool answered with `graphToolResultText`; a graph naming no stream is the requested one's. */
export function streamGraphSummaryFromTheGraphToolResult(requestedStream: string, graphToolResultText: string): Result<StreamGraphSummary, string> {
  const summary = streamGraphSummaryFromTheParsedGraph(requestedStream, parseJsonOnTheWire(graphToolResultText));
  if (!summary.ok) return failedWith(`the runtime's graph of \`${requestedStream}\` could not be read: ${summary.failure}`);
  return succeeded({ ...summary.value, graph_document_text: graphToolResultText });
}

function streamGraphSummaryFromTheParsedGraph(
  requestedStream: string,
  parsedGraph: Result<unknown, string>,
): Result<Omit<StreamGraphSummary, "graph_document_text">, string> {
  if (!parsedGraph.ok) return parsedGraph;
  const graph = jsonObject(parsedGraph.value, "the graph");
  if (!graph.ok) return graph;
  const stream = optionalText(graph.value, "stream");
  if (!stream.ok) return stream;
  const nodesOnTheWire = arrayOrEmpty(graph.value, "nodes");
  if (!nodesOnTheWire.ok) return nodesOnTheWire;
  const nodes = everyOneRead(nodesOnTheWire.value, streamGraphNodeOnTheWire);
  if (!nodes.ok) return nodes;
  const linksOnTheWire = arrayOrEmpty(graph.value, "links");
  if (!linksOnTheWire.ok) return linksOnTheWire;
  const links = everyOneRead(linksOnTheWire.value, streamGraphLinkOnTheWire);
  if (!links.ok) return links;
  return succeeded({ stream: stream.value ?? requestedStream, nodes: nodes.value, links: links.value });
}

/** A `{ name: count }` object of the node's `components.metrics`, keeping each count the runtime wrote as a number; `{}` when it wrote none. */
function nonNegativeCountsUnderTheNodesMetricsKey(metrics: unknown, metricsKey: string): Record<string, number> {
  const countsOnTheWire = isAJsonObject(metrics) ? metrics[metricsKey] : undefined;
  if (!isAJsonObject(countsOnTheWire)) return {};
  return Object.fromEntries(
    Object.entries(countsOnTheWire).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0),
  );
}

function streamGraphNodeOnTheWire(nodeOnTheWire: unknown): Result<StreamGraphNode, string> {
  const node = jsonObject(nodeOnTheWire, "a node");
  if (!node.ok) return node;
  const name = requiredText(node.value, "name");
  if (!name.ok) return name;
  const nodeId = textOrDefault(node.value, "id", "");
  if (!nodeId.ok) return nodeId;
  const nodeType = textOrDefault(node.value, "type", "");
  if (!nodeType.ok) return nodeType;
  const components = objectOrEmpty(node.value, "components");
  if (!components.ok) return components;
  const config = objectOrEmpty(node.value, "config");
  if (!config.ok) return config;
  const state = components.value["state"];
  const metrics = components.value["metrics"];
  const ports = objectOrEmpty(node.value, "ports");
  if (!ports.ok) return ports;
  const inputPorts = declaredPortsUnder(ports.value, "inputs");
  if (!inputPorts.ok) return inputPorts;
  const outputPorts = declaredPortsUnder(ports.value, "outputs");
  if (!outputPorts.ok) return outputPorts;
  return succeeded({
    id: nodeId.value,
    name: name.value,
    type: nodeType.value,
    state: typeof state === "string" ? state : null,
    config: Object.fromEntries(Object.entries(config.value).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1]))),
    input_ports: inputPorts.value,
    output_ports: outputPorts.value,
    dropped_bags_by_link: nonNegativeCountsUnderTheNodesMetricsKey(metrics, "dropped_bags_by_link"),
    refused_bags_by_output_port: nonNegativeCountsUnderTheNodesMetricsKey(metrics, "refused_bags_by_output_port"),
  });
}

/** The ports a node's `ports.<direction>` lists, each by name with its family and its `catalog_entry.section` when it carries them. */
function declaredPortsUnder(ports: JsonObjectOnTheWire, direction: "inputs" | "outputs"): Result<StreamGraphDeclaredPort[], string> {
  const portsOnTheWire = arrayOrEmpty(ports, direction);
  if (!portsOnTheWire.ok) return portsOnTheWire;
  return everyOneRead(portsOnTheWire.value, (portOnTheWire) => {
    const port = jsonObject(portOnTheWire, "a port");
    if (!port.ok) return port;
    const name = requiredText(port.value, "name");
    if (!name.ok) return name;
    const catalogEntry = port.value["catalog_entry"];
    // A section only picks the port's icon, so one of another shape draws as data rather than refusing the graph.
    const catalogSection = isAJsonObject(catalogEntry) ? catalogEntry["section"] : undefined;
    return succeeded({ name: name.value, family: portFamilyOnTheWire(port.value), catalog_section: typeof catalogSection === "string" ? catalogSection : null });
  });
}

function streamGraphLinkOnTheWire(linkOnTheWire: unknown): Result<StreamGraphLink, string> {
  const link = jsonObject(linkOnTheWire, "a link");
  if (!link.ok) return link;
  const id = textOrDefault(link.value, "id", "");
  if (!id.ok) return id;
  const source = streamGraphLinkEndOnTheWire(link.value["source"], "source");
  if (!source.ok) return source;
  const target = streamGraphLinkEndOnTheWire(link.value["target"], "target");
  if (!target.ok) return target;
  const state = textOrDefault(link.value, "state", A_LINK_RENDERED_WITHOUT_A_STATE_IS_PENDING);
  if (!state.ok) return state;
  return succeeded({
    id: id.value,
    source_node: source.value.nodeNameAsTheWindowShowsIt,
    source_port: source.value.port,
    target_node: target.value.nodeNameAsTheWindowShowsIt,
    target_port: target.value.port,
    state: state.value,
  });
}

/** One end of a link: a port of a node in this stream, or, for a source, in the stream named, which the window shows as `<stream>/<node>`. */
function streamGraphLinkEndOnTheWire(
  linkEndOnTheWire: unknown,
  whichEnd: string,
): Result<{ nodeNameAsTheWindowShowsIt: string; port: string }, string> {
  if (linkEndOnTheWire === undefined) return failedWith(`missing field \`${whichEnd}\``);
  const linkEnd = jsonObject(linkEndOnTheWire, `a link's ${whichEnd}`);
  if (!linkEnd.ok) return linkEnd;
  const stream = optionalText(linkEnd.value, "stream");
  if (!stream.ok) return stream;
  const node = requiredText(linkEnd.value, "node");
  if (!node.ok) return node;
  const port = requiredText(linkEnd.value, "port");
  if (!port.ok) return port;
  return succeeded({ nodeNameAsTheWindowShowsIt: stream.value === null ? node.value : `${stream.value}/${node.value}`, port: port.value });
}
