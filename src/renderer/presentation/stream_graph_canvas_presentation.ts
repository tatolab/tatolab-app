import type { StreamGraphDeclaredPort, StreamGraphNode, StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { presentGraphLinkState, type GraphLinkLook } from "./stream_graph_presentation";
import { presentNodeKind, presentStepState, totalOfCounts, type StreamStepStateEmphasis } from "./stream_overview_presentation";

/** What a port carries as its icon shows it: video or audio when the runtime's catalog section says so, otherwise data. */
export type StreamGraphPortDataKind = "video" | "audio" | "data";

/** The level a port the stream lists in no `exposed` entry is at. */
const AN_OUTPUT_NOT_LISTED_AS_EXPOSED_IS_INTERNAL = "internal";

/** One input port a step card draws, on its left. */
export interface StreamGraphStepInputPort {
  name: string;
  dataKind: StreamGraphPortDataKind;
}

/** Why an output has no preview: internal, exposed in a graph that names no machine, or a port of another stream's step. */
export type StreamGraphOutputPreviewAbsence = "internal" | "no_preview_page" | "in_another_stream";

/** An output's preview: the runtime's preview page playing it, or why it has none. */
export type StreamGraphOutputPreview = { kind: "watch_page"; watchPageUrl: string } | { kind: "absent"; absence: StreamGraphOutputPreviewAbsence };

/** One output port a step card draws, on its right, with what reading it from outside the stream takes. */
export interface StreamGraphStepOutputPort {
  stepName: string;
  name: string;
  dataKind: StreamGraphPortDataKind;
  /** `internal`, `private`, `public` or a newer level; `null` for a port of a step in another stream, whose level this graph does not give. */
  exposureLevel: string | null;
  preview: StreamGraphOutputPreview;
  /** Messages it refused, as the step's `refused_bags_by_output_port` counts them. */
  refusedCount: number;
}

/** An output with a preview page, and that page. */
export interface StreamGraphPreviewedOutput {
  output: StreamGraphStepOutputPort;
  watchPageUrl: string;
}

/** `output` with its preview page; `null` when it has none. */
export function previewedOutputOf(output: StreamGraphStepOutputPort): StreamGraphPreviewedOutput | null {
  return output.preview.kind === "watch_page" ? { output, watchPageUrl: output.preview.watchPageUrl } : null;
}

/** What a screen reader hears on a step card with keyboard focus, after its name: the keys the canvas answers there. */
export const STREAM_GRAPH_STEP_CARD_KEYBOARD_DESCRIPTION = "Press Enter or Space to inspect this step. Escape selects nothing.";

/** One step as its card on the canvas shows it. */
export interface StreamGraphStepCard {
  name: string;
  /** `testpatternsource, Running, Built-in`, or `main/invertingeffect, in another stream`: the card's name for a screen reader. */
  accessibleName: string;
  type: string;
  origin: "Built-in" | "Python" | null;
  /** A link's source in another stream on this machine, named `<stream>/<node>`, which this graph gives no state or counters for. */
  isInAnotherStream: boolean;
  stateWord: string;
  stateEmphasis: StreamStepStateEmphasis;
  inputPorts: StreamGraphStepInputPort[];
  outputPorts: StreamGraphStepOutputPort[];
  /** Messages it dropped on every link into it since each was wired. */
  droppedInCount: number;
  /** Messages all its outputs refused. */
  refusedCount: number;
  /** The output the card plays inside it, at its preview page: its first one with one; `null` when none has one. */
  cardPreview: StreamGraphPreviewedOutput | null;
}

/** One link as a line on the canvas: its ends, its state's look, and what its target dropped on it. */
export interface StreamGraphLinkLine {
  linkId: string;
  sourceStepName: string;
  sourcePortName: string;
  targetStepName: string;
  targetPortName: string;
  look: GraphLinkLook;
  stateSentence: string;
  droppedCount: number;
}

/** A stream's graph as its canvas draws it. */
export interface StreamGraphCanvas {
  /** The stream's own steps in the graph's order, then each link source in another stream. */
  steps: StreamGraphStepCard[];
  links: StreamGraphLinkLine[];
}

/** `video` and `audio` catalog sections draw as themselves; every other section, and none, as data. */
export function dataKindOfCatalogSection(catalogSection: string | null): StreamGraphPortDataKind {
  return catalogSection === "video" || catalogSection === "audio" ? catalogSection : "data";
}

/** `ports` with any of `extraPortNames` it does not already declare, after them in order. */
function withUndeclaredPorts(ports: readonly StreamGraphDeclaredPort[], extraPortNames: readonly string[]): StreamGraphDeclaredPort[] {
  const declared = [...ports];
  for (const portName of extraPortNames) {
    if (!declared.some((port) => port.name === portName)) declared.push({ name: portName, catalog_section: null });
  }
  return declared;
}

/**
 * The cards and lines of `graph`'s canvas. A step draws the ports it declares, then any port only a link or an exposure
 * names; an input takes the data kind of the output linked into it. Counters are kept at every value; the view shows
 * them above zero.
 */
export function presentStreamGraphCanvas(graph: StreamGraphSummary): StreamGraphCanvas {
  const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));
  const stepsInAnotherStream: StreamGraphNode[] = [];
  for (const link of graph.links) {
    if (nodeByName.has(link.source_node) || stepsInAnotherStream.some((step) => step.name === link.source_node)) continue;
    stepsInAnotherStream.push({
      id: "",
      name: link.source_node,
      type: "",
      state: null,
      input_ports: [],
      output_ports: [],
      dropped_bags_by_link: {},
      refused_bags_by_output_port: {},
    });
  }
  const linkedOrExposedOutputNames = (stepName: string) => [
    ...graph.links.filter((link) => link.source_node === stepName).map((link) => link.source_port),
    ...graph.exposed.filter((exposedPort) => exposedPort.node === stepName).map((exposedPort) => exposedPort.port),
  ];
  const outputPortsByStep = new Map(
    [...graph.nodes, ...stepsInAnotherStream].map((node) => [node.name, withUndeclaredPorts(node.output_ports, linkedOrExposedOutputNames(node.name))]),
  );
  const dataKindOfOutput = (stepName: string, portName: string): StreamGraphPortDataKind =>
    dataKindOfCatalogSection(outputPortsByStep.get(stepName)?.find((port) => port.name === portName)?.catalog_section ?? null);

  const stepCardOf = (node: StreamGraphNode, isInAnotherStream: boolean): StreamGraphStepCard => {
    const linksIn = graph.links.filter((link) => link.target_node === node.name);
    const inputPorts = withUndeclaredPorts(node.input_ports, linksIn.map((link) => link.target_port)).map((port) => {
      const linkIn = linksIn.find((link) => link.target_port === port.name);
      return {
        name: port.name,
        dataKind: linkIn === undefined ? dataKindOfCatalogSection(port.catalog_section) : dataKindOfOutput(linkIn.source_node, linkIn.source_port),
      };
    });
    const outputPorts = (outputPortsByStep.get(node.name) ?? []).map((port): StreamGraphStepOutputPort => {
      const exposedPort = graph.exposed.find((exposed) => exposed.node === node.name && exposed.port === port.name);
      const exposureLevel = isInAnotherStream ? null : (exposedPort?.level ?? AN_OUTPUT_NOT_LISTED_AS_EXPOSED_IS_INTERNAL);
      const watchPageUrl = exposedPort?.watch_page_url ?? null;
      return {
        stepName: node.name,
        name: port.name,
        dataKind: dataKindOfCatalogSection(port.catalog_section),
        exposureLevel,
        preview:
          watchPageUrl !== null
            ? { kind: "watch_page", watchPageUrl }
            : { kind: "absent", absence: exposureLevel === null ? "in_another_stream" : exposureLevel === "internal" ? "internal" : "no_preview_page" },
        refusedCount: node.refused_bags_by_output_port[port.name] ?? 0,
      };
    });

    const origin = presentNodeKind(node.type);
    const stepState = isInAnotherStream ? { stateWord: "In another stream", stateEmphasis: "quiet" as const } : presentStepState(node.state);
    return {
      name: node.name,
      accessibleName: isInAnotherStream ? `${node.name}, in another stream` : [node.name, stepState.stateWord, origin].filter((part) => part !== null).join(", "),
      type: node.type,
      origin,
      isInAnotherStream,
      ...stepState,
      inputPorts,
      outputPorts,
      droppedInCount: totalOfCounts(node.dropped_bags_by_link),
      refusedCount: totalOfCounts(node.refused_bags_by_output_port),
      cardPreview: outputPorts.flatMap((output) => previewedOutputOf(output) ?? [])[0] ?? null,
    };
  };

  return {
    steps: [...graph.nodes.map((node) => stepCardOf(node, false)), ...stepsInAnotherStream.map((node) => stepCardOf(node, true))],
    links: graph.links.map((link) => {
      const linkState = presentGraphLinkState(link);
      return {
        linkId: link.id,
        sourceStepName: link.source_node,
        sourcePortName: link.source_port,
        targetStepName: link.target_node,
        targetPortName: link.target_port,
        look: linkState.look,
        stateSentence: linkState.sentence,
        droppedCount: nodeByName.get(link.target_node)?.dropped_bags_by_link[link.id] ?? 0,
      };
    }),
  };
}

/** How a link's line reads: red when the runtime reports it failed, amber with its count when it dropped messages and counters show, blue when it touches the selected step, otherwise neutral. */
export type StreamGraphLinkTone = "failed" | "dropping" | "selected" | "neutral";

/** `link`'s tone, a failure first, so a failed link that also dropped messages still reads failed. */
export function streamGraphLinkTone(link: StreamGraphLinkLine, selectedStepName: string | null, areCountersShown: boolean): StreamGraphLinkTone {
  if (link.look === "error") return "failed";
  if (areCountersShown && link.droppedCount > 0) return "dropping";
  if (selectedStepName !== null && (link.sourceStepName === selectedStepName || link.targetStepName === selectedStepName)) return "selected";
  return "neutral";
}

/** A step card's counters as its foot shows them, only those above zero: `12 dropped in`, `212 refused`. */
export function stepCardCounterWords(step: Pick<StreamGraphStepCard, "droppedInCount" | "refusedCount">): string[] {
  return [
    step.droppedInCount > 0 ? `${step.droppedInCount.toLocaleString("en-US")} dropped in` : null,
    step.refusedCount > 0 ? `${step.refusedCount.toLocaleString("en-US")} refused` : null,
  ].filter((words): words is string => words !== null);
}

/** One clause of a link's label, red for a failure and amber for drops. */
export interface StreamGraphLinkLabelClause {
  words: string;
  emphasis: "failure" | "warning";
}

/** What a link's line says without a hover: that it failed, and what it dropped while counters show; empty for a link with neither. */
export function streamGraphLinkLabelClauses(link: StreamGraphLinkLine, areCountersShown: boolean): StreamGraphLinkLabelClause[] {
  const labelClauses: StreamGraphLinkLabelClause[] = [];
  if (link.look === "error") labelClauses.push({ words: link.stateSentence, emphasis: "failure" });
  if (areCountersShown && link.droppedCount > 0) labelClauses.push({ words: `${link.droppedCount.toLocaleString("en-US")} dropped`, emphasis: "warning" });
  return labelClauses;
}

/** What hovering an output without a preview says. */
export function outputPreviewAbsenceWords(previewAbsence: StreamGraphOutputPreviewAbsence): string {
  switch (previewAbsence) {
    case "internal":
      return "Internal. Expose it to this machine or publicly to preview it.";
    case "no_preview_page":
      return "The runtime's graph names no machine, so this output has no preview page.";
    case "in_another_stream":
      return "In another stream. Open that stream to preview it.";
  }
}
