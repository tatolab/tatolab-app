// A stream's graph as the window draws it, read from the runtime's `graph {stream}` tool: its stream
// asset, its nodes by name with their type, state, config, declared ports, drop counters and studio
// fields, its links by id, node and port, its labelled groups and canvas notes, and the tool's text
// itself. Every other key the runtime renders stays only in that text.

import type {
  JsonValue,
  StreamGraphDeclaredPort,
  StreamGraphGroup,
  StreamGraphNodeStudioFields,
  StreamGraphNote,
  StudioCanvasPair,
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
import { portStreamFactsOnTheWire, portValuesCheckedOnTheWire } from "./port_stream_facts_on_the_wire.js";
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
  const streamAsset = optionalText(graph.value, "asset");
  if (!streamAsset.ok) return streamAsset;
  const groupsOnTheWire = arrayOrEmpty(graph.value, "groups");
  if (!groupsOnTheWire.ok) return groupsOnTheWire;
  const groups = everyOneRead(groupsOnTheWire.value, streamGraphGroupOnTheWire);
  if (!groups.ok) return groups;
  const documentStudio = objectOrEmpty(graph.value, "studio");
  if (!documentStudio.ok) return documentStudio;
  const notesOnTheWire = arrayOrEmpty(documentStudio.value, "notes");
  if (!notesOnTheWire.ok) return notesOnTheWire;
  const notes = everyOneRead(notesOnTheWire.value, streamGraphNoteOnTheWire);
  if (!notes.ok) return notes;
  return succeeded({ stream: stream.value ?? requestedStream, stream_asset: streamAsset.value, nodes: nodes.value, links: links.value, groups: groups.value, notes: notes.value });
}

/** `[x, y]` as two finite numbers; `null` for anything else. */
function canvasPairOnTheWire(value: unknown): StudioCanvasPair | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second]: unknown[] = value;
  return typeof first === "number" && Number.isFinite(first) && typeof second === "number" && Number.isFinite(second) ? [first, second] : null;
}

/** A node's `studio` under the runtime's studio contract: a fixed key of another shape reads as absent, since the runtime refuses to write one; a free `group` string an earlier runtime wrote reads ungrouped. */
function nodeStudioFieldsOnTheWire(studioOnTheWire: unknown): StreamGraphNodeStudioFields {
  const studio = isAJsonObject(studioOnTheWire) ? studioOnTheWire : {};
  const textUnder = (key: string): string | null => (typeof studio[key] === "string" ? studio[key] : null);
  const group = textUnder("group");
  const metadata = studio["metadata"];
  return {
    position: canvasPairOnTheWire(studio["position"]),
    group: group !== null && A_UUID.test(group) ? group : null,
    comment: textUnder("comment"),
    colour: textUnder("colour"),
    collapsed: studio["collapsed"] === true,
    metadata: isAJsonObject(metadata) ? Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1]))) : {},
  };
}

/** A UUID in its hyphenated text form, as the runtime writes a group's. */
const A_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function streamGraphGroupOnTheWire(groupOnTheWire: unknown): Result<StreamGraphGroup, string> {
  const group = jsonObject(groupOnTheWire, "a group");
  if (!group.ok) return group;
  const id = requiredText(group.value, "id");
  if (!id.ok) return id;
  const title = textOrDefault(group.value, "title", "");
  if (!title.ok) return title;
  const description = optionalText(group.value, "description");
  if (!description.ok) return description;
  const colour = optionalText(group.value, "colour");
  if (!colour.ok) return colour;
  return succeeded({ id: id.value, title: title.value, description: description.value, colour: colour.value });
}

function streamGraphNoteOnTheWire(noteOnTheWire: unknown): Result<StreamGraphNote, string> {
  const note = jsonObject(noteOnTheWire, "a note");
  if (!note.ok) return note;
  const id = requiredText(note.value, "id");
  if (!id.ok) return id;
  const text = textOrDefault(note.value, "text", "");
  if (!text.ok) return text;
  const position = canvasPairOnTheWire(note.value["position"]);
  if (position === null) return failedWith(`the note \`${id.value}\` has no \`position\` of two numbers`);
  const size = canvasPairOnTheWire(note.value["size"]);
  if (size === null) return failedWith(`the note \`${id.value}\` has no \`size\` of two numbers`);
  return succeeded({ id: id.value, text: text.value, position, size });
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
  const pins = objectOrEmpty(node.value, "pins");
  if (!pins.ok) return pins;
  const state = components.value["state"];
  const failedBecause = components.value["failed_because"];
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
    failed_because: typeof failedBecause === "string" ? failedBecause : null,
    config: Object.fromEntries(Object.entries(config.value).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1]))),
    pins: Object.fromEntries(Object.entries(pins.value).filter((entry): entry is [string, JsonValue] => isAJsonValue(entry[1]))),
    input_ports: inputPorts.value,
    output_ports: outputPorts.value,
    dropped_bags_by_link: nonNegativeCountsUnderTheNodesMetricsKey(metrics, "dropped_bags_by_link"),
    refused_bags_by_output_port: nonNegativeCountsUnderTheNodesMetricsKey(metrics, "refused_bags_by_output_port"),
    studio: nodeStudioFieldsOnTheWire(node.value["studio"]),
  });
}

/** The ports a node's `ports.<direction>` lists, each by name with its family, its stream facts and its `values_checked` mark when it carries them. */
function declaredPortsUnder(ports: JsonObjectOnTheWire, direction: "inputs" | "outputs"): Result<StreamGraphDeclaredPort[], string> {
  const portsOnTheWire = arrayOrEmpty(ports, direction);
  if (!portsOnTheWire.ok) return portsOnTheWire;
  return everyOneRead(portsOnTheWire.value, (portOnTheWire) => {
    const port = jsonObject(portOnTheWire, "a port");
    if (!port.ok) return port;
    const name = requiredText(port.value, "name");
    if (!name.ok) return name;
    return succeeded({
      name: name.value,
      family: portFamilyOnTheWire(port.value),
      stream_facts: portStreamFactsOnTheWire(port.value),
      values_checked: portValuesCheckedOnTheWire(port.value),
    });
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
