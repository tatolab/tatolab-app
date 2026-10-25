// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream, StreamGraphExposedPort, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
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
  process: "in runtime" | "own process" | null;
  stateWord: string;
  stateEmphasis: StreamStepStateEmphasis;
  /** Only counters above zero, and none for a graph from the last load. */
  counters: StreamStepCounter[];
}

/** Where a step runs: a built-in in the runtime, a Python node in its own processor interpreter. */
export type StreamStepProcess = "in_the_runtime" | "own_process";

/** Where a step of `origin` runs; `null` for an origin this app cannot place. */
export function stepProcessOf(origin: "Built-in" | "Python" | null): StreamStepProcess | null {
  return origin === "Built-in" ? "in_the_runtime" : origin === "Python" ? "own_process" : null;
}

const STEPS_TABLE_PROCESS_WORDS = { in_the_runtime: "in runtime", own_process: "own process" } as const;

/** The total of a `{ name: count }` counter object, such as a node's `dropped_bags_by_link`. */
export function totalOfCounts(countsByName: Record<string, number>): number {
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
      const stepProcess = stepProcessOf(origin);
      const counters: StreamStepCounter[] =
        stepsSource === "loaded"
          ? [
              { count: totalOfCounts(node.dropped_bags_by_link), word: "dropped" as const },
              { count: totalOfCounts(node.refused_bags_by_output_port), word: "refused" as const },
            ]
              .filter((counter) => counter.count > 0)
              .map((counter) => ({ countText: counter.count.toLocaleString("en-US"), word: counter.word }))
          : [];
      return {
        name: node.name,
        type: node.type,
        origin,
        process: stepProcess === null ? null : STEPS_TABLE_PROCESS_WORDS[stepProcess],
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
