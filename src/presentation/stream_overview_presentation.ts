// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream, StreamGraphExposedPort, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { labelUnknownStreamState } from "./stream_presentation";

/** An exposure level in the window's words: who may read the output, and what that means. */
export interface ExposureLevelPresentation {
  label: string;
  /** `null` for a level newer than this app, which shows its word alone. */
  meaning: string | null;
  /** Which icon stands beside the words: a lock, a laptop, a globe, or none for a level newer than this app. */
  icon: "internal" | "this_machine" | "public" | null;
}

/** `private` reads This machine and `public` reads Public, as the design's vocabulary words them; a newer level keeps its own word. */
export function presentExposureLevel(level: string): ExposureLevelPresentation {
  switch (level) {
    case "internal":
      return { label: "Internal", meaning: "Only this stream's own steps can read it.", icon: "internal" };
    case "private":
      return { label: "This machine", meaning: "Any stream or app on this machine can read it.", icon: "this_machine" };
    case "public":
      return { label: "Public", meaning: "Readable on this machine now; other machines read it through the relays this machine joins.", icon: "public" };
    default:
      return { label: labelUnknownStreamState(level), meaning: null, icon: null };
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

/** Whether the Overview's steps are the loaded graph's, or the last graph this window read of a stream no longer loaded. */
export type StreamStepsSource = "loaded" | "as_of_the_last_load";

/** How strongly a step's state word reads: plain, with a spinner while starting, dimmed while not loaded, or red in error. */
export type StreamStepStateEmphasis = "plain" | "starting" | "quiet" | "failure";

/** A counter the steps table shows beside a step: messages dropped on its links in, or refused by its outputs. */
export interface StreamStepCounter {
  countText: string;
  word: "dropped" | "refused";
}

/** One row of the Overview's steps table. */
export interface StreamStepRow {
  name: string;
  type: string;
  origin: "Built-in" | "Python" | null;
  /** Where the step runs: a built-in in the runtime, a Python node in its own processor interpreter. */
  process: "in runtime" | "own process" | null;
  stateWord: string;
  stateEmphasis: StreamStepStateEmphasis;
  /** Only counters above zero, and none for a graph from the last load. */
  counters: StreamStepCounter[];
}

function sumOfCounts(countsByName: Record<string, number>): number {
  return Object.values(countsByName).reduce((total, count) => total + count, 0);
}

/** A step's state word as the runtime's processor state reads in the window: Running, Starting, In error, or a newer state's own word. */
export function presentStepState(processorState: string | null): Pick<StreamStepRow, "stateWord" | "stateEmphasis"> {
  switch (processorState) {
    case null:
    case "Running":
      return { stateWord: "Running", stateEmphasis: "plain" };
    case "Pending":
      return { stateWord: "Starting", stateEmphasis: "starting" };
    case "Error":
      return { stateWord: "In error", stateEmphasis: "failure" };
    default:
      return { stateWord: processorState, stateEmphasis: "plain" };
  }
}

/**
 * The steps of `graph` in `nodeNamesInPipelineOrder` (any step it misses after them), each with its origin, process, state
 * and the counters above zero. Steps from the last load read Not loaded, or Starting while `isLoadedNow` says the stream is
 * loaded again and its new graph is not read yet.
 */
export function presentStreamSteps(
  graph: StreamGraphSummary,
  nodeNamesInPipelineOrder: readonly string[],
  stepsSource: StreamStepsSource,
  isLoadedNow: boolean,
): StreamStepRow[] {
  const pipelinePlace = (nodeName: string) => {
    const place = nodeNamesInPipelineOrder.indexOf(nodeName);
    return place === -1 ? nodeNamesInPipelineOrder.length : place;
  };
  return [...graph.nodes]
    .sort((first, second) => pipelinePlace(first.name) - pipelinePlace(second.name))
    .map((node) => {
      const origin = presentNodeKind(node.type);
      const counters: StreamStepCounter[] =
        stepsSource === "loaded"
          ? [
              { count: sumOfCounts(node.dropped_bags_by_link), word: "dropped" as const },
              { count: sumOfCounts(node.refused_bags_by_output_port), word: "refused" as const },
            ]
              .filter((counter) => counter.count > 0)
              .map((counter) => ({ countText: counter.count.toLocaleString("en-US"), word: counter.word }))
          : [];
      return {
        name: node.name,
        type: node.type,
        origin,
        process: origin === "Built-in" ? "in runtime" : origin === "Python" ? "own process" : null,
        ...(stepsSource === "loaded"
          ? presentStepState(node.state)
          : isLoadedNow
            ? { stateWord: "Starting", stateEmphasis: "starting" as const }
            : { stateWord: "Not loaded", stateEmphasis: "quiet" as const }),
        counters,
      };
    });
}

/** A link whose target dropped messages arriving on it, which the Overview names in one amber line. */
export interface DroppingLinkPresentation {
  linkId: string;
  /** `halftonelenseffect`, or `halftonelenseffect.video_to_downstream` when another dropping link joins the same two nodes. */
  sourceWords: string;
  targetWords: string;
  droppedCountText: string;
  /** Whether it dropped exactly one message, which reads "message" rather than "messages". */
  isOne: boolean;
}

/** Every link of `graph` whose target counts messages dropped on it since it was wired, most first, naming its ports when its nodes alone would not tell it apart. */
export function droppingLinksOf(graph: StreamGraphSummary): DroppingLinkPresentation[] {
  const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));
  const droppingLinks = graph.links
    .map((link) => ({ link, droppedCount: nodeByName.get(link.target_node)?.dropped_bags_by_link[link.id] ?? 0 }))
    .filter(({ droppedCount }) => droppedCount > 0)
    .sort((first, second) => second.droppedCount - first.droppedCount);
  const nodePairKey = (link: { source_node: string; target_node: string }) => `${link.source_node}\u0000${link.target_node}`;
  const droppingLinkCountByNodePair = new Map<string, number>();
  for (const { link } of droppingLinks) droppingLinkCountByNodePair.set(nodePairKey(link), (droppingLinkCountByNodePair.get(nodePairKey(link)) ?? 0) + 1);
  return droppingLinks.map(({ link, droppedCount }) => {
    const isAmbiguous = (droppingLinkCountByNodePair.get(nodePairKey(link)) ?? 0) > 1;
    return {
      linkId: link.id,
      sourceWords: isAmbiguous ? `${link.source_node}.${link.source_port}` : link.source_node,
      targetWords: isAmbiguous ? `${link.target_node}.${link.target_port}` : link.target_node,
      droppedCountText: droppedCount.toLocaleString("en-US"),
      isOne: droppedCount === 1,
    };
  });
}

/** The exposed outputs the runtime's preview page plays: every one it gives a preview page, so never an internal one. */
export function previewableOutputsOf(graph: Pick<StreamGraphSummary, "exposed">): StreamGraphExposedPort[] {
  return graph.exposed.filter((exposedPort) => exposedPort.watch_page_url !== null);
}

/** The output the Overview previews: the one chosen while it is still previewable, else the first previewable one; `null` when there is none. */
export function choosePreviewedOutput(
  graph: Pick<StreamGraphSummary, "exposed">,
  chosenOutput: { node: string; port: string } | null,
): StreamGraphExposedPort | null {
  const previewableOutputs = previewableOutputsOf(graph);
  const stillPreviewable = chosenOutput === null ? undefined : previewableOutputs.find((output) => output.node === chosenOutput.node && output.port === chosenOutput.port);
  return stillPreviewable ?? previewableOutputs[0] ?? null;
}

/** `6 · 3 Python` from a graph, or the listing's step count while there is none, `—` while it is not loaded. */
export function streamStepsCountLabel(graph: StreamGraphSummary | null, stream: ListedStream): string {
  if (graph === null) return stream.node_count === null ? "—" : String(stream.node_count);
  const pythonStepCount = graph.nodes.filter((node) => presentNodeKind(node.type) === "Python").length;
  return pythonStepCount === 0 ? String(graph.nodes.length) : `${graph.nodes.length} · ${pythonStepCount} Python`;
}

/** The command that prints the `graph` document Inspect shows. */
export function streamGraphDocumentCommand(streamName: string): string {
  return `tatolab graph --stream ${streamName}`;
}

/** The `tatolab` commands that watch `streamName` from a terminal: follow its logs, and print the graph Inspect shows. */
export function streamObservationCommands(streamName: string): string[] {
  return [`tatolab logs --stream ${streamName} -f`, streamGraphDocumentCommand(streamName)];
}
