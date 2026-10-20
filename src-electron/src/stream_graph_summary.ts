// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// A stream's graph as the window draws it, read from the runtime's `GET /api/graph?stream=`: its
// nodes by name with their type and state, its links by node and port, and the ports it exposes.
// Every other key the runtime renders is dropped.

import type {
  StreamGraphExposedPort,
  StreamGraphLink,
  StreamGraphNode,
  StreamGraphSummary,
} from "../../src/backend/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  jsonObject,
  optionalText,
  parseJsonOnTheWire,
  requiredText,
  textOrDefault,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The runtime's own reading of a link rendered without a state. */
const A_LINK_RENDERED_WITHOUT_A_STATE_IS_PENDING = "pending";

/** The runtime's own reading of an exposure written before exposure had levels. */
const AN_EXPOSURE_RENDERED_WITHOUT_A_LEVEL_IS_PRIVATE = "private";

/** The summary of the graph `GET /api/graph?stream=<requestedStream>` answered with `graphJson`; a graph naming no stream is the requested one's. */
export function streamGraphSummaryFromTheGraphJson(requestedStream: string, graphJson: string): Result<StreamGraphSummary, string> {
  const summary = streamGraphSummaryFromTheParsedGraph(requestedStream, parseJsonOnTheWire(graphJson));
  return summary.ok ? summary : failedWith(`the runtime's graph of \`${requestedStream}\` could not be read: ${summary.failure}`);
}

function streamGraphSummaryFromTheParsedGraph(requestedStream: string, parsedGraph: Result<unknown, string>): Result<StreamGraphSummary, string> {
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
  const exposedOnTheWire = arrayOrEmpty(graph.value, "exposed");
  if (!exposedOnTheWire.ok) return exposedOnTheWire;
  const exposed = everyOneRead(exposedOnTheWire.value, streamGraphExposedPortOnTheWire);
  if (!exposed.ok) return exposed;
  return succeeded({ stream: stream.value ?? requestedStream, nodes: nodes.value, links: links.value, exposed: exposed.value });
}

function streamGraphNodeOnTheWire(nodeOnTheWire: unknown): Result<StreamGraphNode, string> {
  const node = jsonObject(nodeOnTheWire, "a node");
  if (!node.ok) return node;
  const name = requiredText(node.value, "name");
  if (!name.ok) return name;
  const nodeType = textOrDefault(node.value, "type", "");
  if (!nodeType.ok) return nodeType;
  const components = node.value["components"] === undefined ? {} : node.value["components"];
  if (!isAJsonObject(components)) return failedWith("`components` is not an object");
  const state = components["state"];
  return succeeded({ name: name.value, type: nodeType.value, state: typeof state === "string" ? state : null });
}

function streamGraphLinkOnTheWire(linkOnTheWire: unknown): Result<StreamGraphLink, string> {
  const link = jsonObject(linkOnTheWire, "a link");
  if (!link.ok) return link;
  const source = streamGraphLinkEndOnTheWire(link.value["source"], "source");
  if (!source.ok) return source;
  const target = streamGraphLinkEndOnTheWire(link.value["target"], "target");
  if (!target.ok) return target;
  const state = textOrDefault(link.value, "state", A_LINK_RENDERED_WITHOUT_A_STATE_IS_PENDING);
  if (!state.ok) return state;
  return succeeded({
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

function streamGraphExposedPortOnTheWire(exposedPortOnTheWire: unknown): Result<StreamGraphExposedPort, string> {
  const exposedPort = jsonObject(exposedPortOnTheWire, "an exposed port");
  if (!exposedPort.ok) return exposedPort;
  const node = requiredText(exposedPort.value, "node");
  if (!node.ok) return node;
  const port = requiredText(exposedPort.value, "port");
  if (!port.ok) return port;
  const level = textOrDefault(exposedPort.value, "level", AN_EXPOSURE_RENDERED_WITHOUT_A_LEVEL_IS_PRIVATE);
  if (!level.ok) return level;
  return succeeded({ node: node.value, port: port.value, level: level.value });
}
