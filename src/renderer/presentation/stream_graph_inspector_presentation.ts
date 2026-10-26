import { previewedOutputOf, type StreamGraphCanvas, type StreamGraphPreviewedOutput, type StreamGraphStepCard, type StreamGraphStepOutputPort } from "./stream_graph_canvas_presentation";
import type { GraphDocumentValue } from "./stream_graph_document_presentation";
import { stepProcessOf } from "./stream_overview_presentation";

const INSPECTOR_PROCESS_WORDS = { in_the_runtime: "In the runtime", own_process: "Own process" } as const;

/** One key of a step's config and its value as the graph document wrote it, a number keeping every digit. */
export interface StreamGraphConfigRow {
  key: string;
  valueText: string;
}

/** One counter the runtime keeps on a step: messages dropped on a link into it, or refused by one of its outputs. */
export interface StreamGraphStepCounterRow {
  /** The link's source, `testpatternsource/video`, or the output's name. */
  counted: string;
  word: "dropped" | "refused";
  count: number;
}

/** What the inspector shows of the selected step. */
export interface StreamGraphStepInspection {
  kind: "step";
  step: StreamGraphStepCard;
  linksInCount: number;
  linksOutCount: number;
  /** Where it runs, as the Overview's steps table words it: a built-in in the runtime, a Python node in its own processor interpreter. */
  processWords: (typeof INSPECTOR_PROCESS_WORDS)[keyof typeof INSPECTOR_PROCESS_WORDS] | null;
  /** Its outputs with a preview page, the first previewed unless another is chosen. */
  previewableOutputs: StreamGraphPreviewedOutput[];
  /** Why the inspector previews nothing; `null` when it has an output to preview. */
  previewAbsenceWords: string | null;
  /** `Running · 1 link in · 2 out`, after the state word. */
  linkCountWords: string;
  /** Its config's keys in the document's order; `null` when the document could not be read or names no config for it. */
  configRows: StreamGraphConfigRow[] | null;
  counterRows: StreamGraphStepCounterRow[];
}

/** What the inspector shows with nothing selected: the whole stream. */
export interface StreamGraphStreamInspection {
  kind: "stream";
  stepCount: number;
  ownProcessStepCount: number;
  linkCount: number;
  droppedCount: number;
  /** Every output of its own steps exposed to this machine or publicly. */
  exposedOutputs: StreamGraphStepOutputPort[];
  /** `4 · 2 in their own process`, or the count alone when none is. */
  stepCountWords: string;
}

export type StreamGraphInspection = StreamGraphStepInspection | StreamGraphStreamInspection;

function objectEntry(value: GraphDocumentValue | undefined, key: string): GraphDocumentValue | undefined {
  return value?.kind === "object" ? value.entries.find(([entryKey]) => entryKey === key)?.[1] : undefined;
}

/** `value` as compact JSON, each number in the digits the runtime wrote. */
export function compactJsonTextOf(value: GraphDocumentValue): string {
  switch (value.kind) {
    case "object":
      return `{${value.entries.map(([key, entryValue]) => `${JSON.stringify(key)}: ${compactJsonTextOf(entryValue)}`).join(", ")}}`;
    case "array":
      return `[${value.items.map(compactJsonTextOf).join(", ")}]`;
    case "string":
      return JSON.stringify(value.text);
    case "number":
    case "literal":
      return value.literal;
  }
}

/** The config the graph document gives the node named `stepName`, a row per key; `null` when it gives none. */
export function configRowsOfStep(graphDocument: GraphDocumentValue | null, stepName: string): StreamGraphConfigRow[] | null {
  const nodes = objectEntry(graphDocument ?? undefined, "nodes");
  if (nodes?.kind !== "array") return null;
  const node = nodes.items.find((item) => {
    const name = objectEntry(item, "name");
    return name?.kind === "string" && name.text === stepName;
  });
  const config = objectEntry(node, "config");
  if (config?.kind !== "object") return null;
  return config.entries.map(([key, value]) => ({ key, valueText: value.kind === "string" ? value.text : compactJsonTextOf(value) }));
}

/** The inspection of `selectedStepName` on `canvas`, or of the whole stream when it is `null` or names no step of the stream's own. */
export function presentStreamGraphInspection(
  canvas: StreamGraphCanvas,
  graphDocument: GraphDocumentValue | null,
  selectedStepName: string | null,
): StreamGraphInspection {
  const selectedStep = canvas.steps.find((step) => step.name === selectedStepName && !step.isInAnotherStream);
  if (selectedStep === undefined) {
    const ownSteps = canvas.steps.filter((step) => !step.isInAnotherStream);
    const ownProcessStepCount = ownSteps.filter((step) => step.origin === "Python").length;
    return {
      kind: "stream",
      stepCount: ownSteps.length,
      ownProcessStepCount,
      stepCountWords: ownProcessStepCount === 0 ? String(ownSteps.length) : `${ownSteps.length} · ${ownProcessStepCount} in their own process`,
      linkCount: canvas.links.length,
      droppedCount: canvas.links.reduce((total, link) => total + link.droppedCount, 0),
      exposedOutputs: ownSteps.flatMap((step) => step.outputPorts.filter((port) => port.exposureLevel !== null && port.exposureLevel !== "internal")),
    };
  }
  const linksIn = canvas.links.filter((link) => link.targetStepName === selectedStep.name);
  const selectedStepProcess = stepProcessOf(selectedStep.origin);
  const linksOutCount = canvas.links.filter((link) => link.sourceStepName === selectedStep.name).length;
  const previewableOutputs = selectedStep.outputPorts.flatMap((output) => previewedOutputOf(output) ?? []);
  return {
    kind: "step",
    step: selectedStep,
    linksInCount: linksIn.length,
    linksOutCount,
    processWords: selectedStepProcess === null ? null : INSPECTOR_PROCESS_WORDS[selectedStepProcess],
    previewableOutputs,
    previewAbsenceWords:
      previewableOutputs.length > 0
        ? null
        : selectedStep.outputPorts.length === 0
          ? "This node has no outputs."
          : "No output of this node is exposed. An internal output has no preview until it is exposed to this machine or publicly.",
    linkCountWords: `${linksIn.length} ${linksIn.length === 1 ? "link" : "links"} in · ${linksOutCount} out`,
    configRows: configRowsOfStep(graphDocument, selectedStep.name),
    counterRows: [
      ...linksIn.map((link) => ({ counted: `${link.sourceStepName}/${link.sourcePortName}`, word: "dropped" as const, count: link.droppedCount })),
      ...selectedStep.outputPorts.map((port) => ({ counted: port.name, word: "refused" as const, count: port.refusedCount })),
    ],
  };
}
