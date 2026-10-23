// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type {
  ListedStream,
  StreamGraphExposedPort,
  StreamGraphSummary,
  TatolabPlatform,
} from "../backend/tatolab_backend_contract";
import { presentPlatform } from "./platform_presentation";
import { abbreviateHomeDirectory, labelUnknownStreamState, streamNotLoadedReason } from "./stream_presentation";

/** A run of a sentence: plain words, or a command or path set in mono. */
export type InlineTextPart = string | { code: string };

/** The Overview's first sentence about a stream: a lead phrase in text, then the rest in text-2. */
export interface StreamStoryPresentation {
  leadPhrase: string;
  rest: InlineTextPart[];
  /** A loading stream shows a spinner after its story. */
  isInProgress: boolean;
}

/** What the Overview says first about `stream`, by whether it runs, loads, stopped or failed. */
export function presentStreamStory(stream: ListedStream): StreamStoryPresentation {
  const notLoadedReason = streamNotLoadedReason(stream);
  if (notLoadedReason === "loading") {
    return { leadPhrase: "Loading.", rest: [" Its graph and logs show up as soon as it runs."], isInProgress: true };
  }
  switch (stream.state) {
    case "kept":
      return {
        leadPhrase: "Running, and kept.",
        rest: [" Tatolab loads it again every time the runtime starts, until you stop it."],
        isInProgress: false,
      };
    case "attached":
      return {
        leadPhrase: "Running, attached",
        rest: [" to the terminal that started it. It stops when that ", { code: "tatolab run" }, " or ", { code: "tatolab dev" }, " ends."],
        isInProgress: false,
      };
    case "stopped":
      return {
        leadPhrase: "Stopped.",
        rest: [" Tatolab remembers it but won't load it until you start it again. Its graph and logs come back when it runs."],
        isInProgress: false,
      };
    case "failed":
      return {
        leadPhrase: "Failed at its last start.",
        rest: [" Tatolab skips it each time the runtime starts, until you retry it."],
        isInProgress: false,
      };
    default:
      return {
        leadPhrase: `${labelUnknownStreamState(stream.state)}.`,
        rest: [" This version of Tatolab doesn't know this state yet."],
        isInProgress: false,
      };
  }
}

/** A command the Overview offers to copy, and what it does in a few words. */
export interface StreamTerminalCommand {
  command: string;
  description: string;
}

/** A path as a shell reads it: quoted only when it holds a character the shell would split or expand, keeping `~/` bare. */
function shellPath(path: string): string {
  if (/^[\w@%+=:,./~-]+$/.test(path)) return path;
  const homePrefix = path.startsWith("~/") ? "~/" : "";
  return `${homePrefix}"${path.slice(homePrefix.length).replace(/(["\\$`])/g, "\\$1")}"`;
}

/** The `tatolab` commands that act on `stream` in its state, each checked against tatolab-cli's verbs. */
export function terminalCommandsForStream(stream: ListedStream): StreamTerminalCommand[] {
  const followLogs = { command: `tatolab logs --stream ${stream.name} -f`, description: "Follow its logs" };
  const forget = { command: `tatolab rm ${stream.name}`, description: "Forget it for good" };
  const notLoadedReason = streamNotLoadedReason(stream);
  switch (notLoadedReason) {
    case "loading":
      return [followLogs];
    case "stopped":
      return [{ command: `tatolab start ${stream.name}`, description: "Load it again" }, forget];
    case "failed":
      return [{ command: `tatolab start ${stream.name}`, description: "Retry it" }, forget];
    case "not_loaded":
      return [{ command: `tatolab start ${stream.name}`, description: "Load it" }, forget];
    case null:
      break;
  }
  if (stream.state === "kept") {
    return [
      followLogs,
      { command: `tatolab stop ${stream.name}`, description: "Stop it, and keep it stopped" },
      {
        command: `cd ${shellPath(abbreviateHomeDirectory(stream.project_directory))} && tatolab run -d`,
        description: "Load your edits",
      },
    ];
  }
  if (stream.state === "attached") {
    return [followLogs, { command: `tatolab stop ${stream.name}`, description: "Stop it" }];
  }
  return [followLogs];
}

/** An exposure level as the Overview words it: the level, and who may read the output. */
export interface ExposureLevelPresentation {
  levelWord: string;
  /** `null` for a level newer than this app, which shows its raw word alone. */
  explanation: string | null;
}

/** Who reads an output exposed at `level`, said of this platform's machine and `streamName`. */
export function explainExposureLevel(level: string, platform: TatolabPlatform, streamName: string): ExposureLevelPresentation {
  const thisMachine = presentPlatform(platform).thisMachineMidSentence;
  switch (level) {
    case "private":
      return { levelWord: "Private", explanation: `Readable by other streams and tools on ${thisMachine}.` };
    case "public":
      return { levelWord: "Public", explanation: `Readable on ${thisMachine} now; other machines read it once sharing arrives.` };
    case "internal":
      return { levelWord: "Internal", explanation: `Only ${streamName}'s own nodes read it.` };
    default:
      return { levelWord: labelUnknownStreamState(level), explanation: null };
  }
}

/** An exposed output's address, `<machine>/<stream>/<node>/<port>`, with the machine segment kept apart to draw quietly. */
export interface ExposedOutputAddress {
  /** `jonathanf-macbook/`, or `null` while the runtime has not named the machine. */
  machineSegment: string | null;
  /** `main/invertingeffect/video_to_downstream`. */
  streamPath: string;
  fullAddress: string;
}

/** The address the plan gives an exposed output: the machine, then the stream, the node and the port. */
export function exposedOutputAddress(
  machineName: string | null,
  streamName: string,
  exposedPort: Pick<StreamGraphExposedPort, "node" | "port">,
): ExposedOutputAddress {
  const streamPath = `${streamName}/${exposedPort.node}/${exposedPort.port}`;
  const machineSegment = machineName === null ? null : `${machineName}/`;
  return { machineSegment, streamPath, fullAddress: `${machineSegment ?? ""}${streamPath}` };
}

/** The exposed outputs other streams and tools may read: every one not exposed at `internal`. */
export function readableExposedPorts(graph: Pick<StreamGraphSummary, "exposed">): StreamGraphExposedPort[] {
  return graph.exposed.filter((exposedPort) => exposedPort.level !== "internal");
}

/** `Built-in` for a node type from `tatolab.stream`, `Python` for any other `module:Class` type, else nothing. */
export function presentNodeKind(nodeType: string): "Built-in" | "Python" | null {
  if (nodeType.startsWith("tatolab.stream:")) return "Built-in";
  return nodeType.includes(":") ? "Python" : null;
}

/** The class part of a `module:Class` node type, or the whole type when it has no colon. */
export function nodeClassName(nodeType: string): string {
  const colonIndex = nodeType.lastIndexOf(":");
  return colonIndex === -1 ? nodeType : nodeType.slice(colonIndex + 1);
}

/** The graph health line's clauses: nodes running, links wired, and nodes in error. */
export interface GraphHealthSummary {
  nodesClause: string;
  /** `null` for a graph with no links. */
  linksClause: string | null;
  /** `1 node in error`, or `null` when no node is. */
  errorClause: string | null;
}

function countWord(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** A node runs while the runtime says `Running`, or says nothing. */
function isGraphNodeRunning(state: string | null): boolean {
  return state === null || state === "Running";
}

/** `4 nodes running, 3 links wired` when all is well; `3 of 4 nodes running, 2 of 3 links wired` when it isn't. */
export function summarizeGraphHealth(graph: StreamGraphSummary): GraphHealthSummary {
  const nodeCount = graph.nodes.length;
  const runningNodeCount = graph.nodes.filter((node) => isGraphNodeRunning(node.state)).length;
  const linkCount = graph.links.length;
  const wiredLinkCount = graph.links.filter((link) => link.state === "wired").length;
  const erroredNodeCount = graph.nodes.filter((node) => node.state === "Error").length;
  const isAllWell = runningNodeCount === nodeCount && wiredLinkCount === linkCount;
  const nodesClause = isAllWell
    ? `${countWord(nodeCount, "node", "nodes")} running`
    : `${runningNodeCount.toLocaleString("en-US")} of ${countWord(nodeCount, "node", "nodes")} running`;
  const linksClause =
    linkCount === 0
      ? null
      : isAllWell
        ? `${countWord(linkCount, "link", "links")} wired`
        : `${wiredLinkCount.toLocaleString("en-US")} of ${countWord(linkCount, "link", "links")} wired`;
  const errorClause = erroredNodeCount === 0 ? null : `${countWord(erroredNodeCount, "node", "nodes")} in error`;
  return { nodesClause, linksClause, errorClause };
}

/** An output port a node draws: its name and, when the stream exposes it, its level. */
export interface GraphNodeOutputPort {
  port: string;
  /** `private`, `public`, `internal`, a level newer than this app, or `null` when it is not exposed. */
  exposureLevel: string | null;
}

/** The ports a node draws, derived from the links into and out of it and its exposed outputs. */
export interface GraphNodePorts {
  inputs: string[];
  outputs: GraphNodeOutputPort[];
}

/**
 * Each node's ports, the graph listing no port inventory: inputs are the target ports of its incoming links, outputs
 * the source ports of its outgoing links then its exposed ports, each in order of first appearance. A link end in
 * another stream gets ports too.
 */
export function portsOfGraphNodes(graph: StreamGraphSummary): Map<string, GraphNodePorts> {
  const portsByNode = new Map<string, GraphNodePorts>();
  const portsOf = (nodeName: string): GraphNodePorts => {
    let ports = portsByNode.get(nodeName);
    if (!ports) {
      ports = { inputs: [], outputs: [] };
      portsByNode.set(nodeName, ports);
    }
    return ports;
  };
  for (const node of graph.nodes) portsOf(node.name);
  const levelOf = (nodeName: string, port: string): string | null =>
    graph.exposed.find((exposedPort) => exposedPort.node === nodeName && exposedPort.port === port)?.level ?? null;
  const addOutput = (nodeName: string, port: string) => {
    const ports = portsOf(nodeName);
    if (!ports.outputs.some((output) => output.port === port)) {
      ports.outputs.push({ port, exposureLevel: levelOf(nodeName, port) });
    }
  };
  for (const link of graph.links) {
    const targetPorts = portsOf(link.target_node);
    if (!targetPorts.inputs.includes(link.target_port)) targetPorts.inputs.push(link.target_port);
    addOutput(link.source_node, link.source_port);
  }
  for (const exposedPort of graph.exposed) {
    if (portsByNode.has(exposedPort.node)) addOutput(exposedPort.node, exposedPort.port);
  }
  return portsByNode;
}

/**
 * The output to suggest exposing when a stream exposes none: the linked output that feeds the most links, first in
 * link order on a tie, from a node in this stream; `null` when the graph has no such link.
 */
export function outputToSuggestExposing(graph: StreamGraphSummary): { node: string; port: string } | null {
  const nodesInThisStream = new Set(graph.nodes.map((node) => node.name));
  const linkCountByOutput = new Map<string, { node: string; port: string; linkCount: number }>();
  for (const link of graph.links) {
    if (!nodesInThisStream.has(link.source_node)) continue;
    const outputKey = `${link.source_node}\u0000${link.source_port}`;
    const output = linkCountByOutput.get(outputKey) ?? { node: link.source_node, port: link.source_port, linkCount: 0 };
    output.linkCount += 1;
    linkCountByOutput.set(outputKey, output);
  }
  let suggested: { node: string; port: string; linkCount: number } | null = null;
  for (const output of linkCountByOutput.values()) {
    if (suggested === null || output.linkCount > suggested.linkCount) suggested = output;
  }
  return suggested === null ? null : { node: suggested.node, port: suggested.port };
}
