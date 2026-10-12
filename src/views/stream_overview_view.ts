import type { ListedStream, StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, type ElementChild } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { EYE_ICON_SVG } from "../icons";
import { presentPlatform } from "../presentation/platform_presentation";
import { presentGraphNodeState } from "../presentation/stream_graph_presentation";
import {
  explainExposureLevel,
  exposedOutputAddress,
  outputToSuggestExposing,
  presentNodeKind,
  presentStreamStory,
  readableExposedPorts,
  summarizeGraphHealth,
  terminalCommandsForStream,
  type InlineTextPart,
} from "../presentation/stream_overview_presentation";
import { abbreviateHomeDirectory, streamNotLoadedReason } from "../presentation/stream_presentation";
import { createCommandWell, createCopyButton } from "./copy_button";
import { graphNodesInFlowOrder, layOutStreamGraph } from "./stream_graph_layout";
import type { GraphOutputPortAddress } from "./stream_graph_view";
import { createExposedAddressLabel, createFailureIcon, createIcon, createSpinner, createWindowShortcutCap } from "./window_controls";

/** What the Overview asks of the stream view around it. */
export interface StreamOverviewActions {
  onOpenGraph(): void;
  /** A row's Watch button was chosen, with the flag on. */
  onWatchOutputPort(outputPort: GraphOutputPortAddress, exposureLevel: string | null): void;
}

function inlineText(parts: InlineTextPart[]): ElementChild[] {
  return parts.map((part) => (typeof part === "string" ? part : createElement("code", {}, [part.code])));
}

function createSectionHead(title: string, meta: ElementChild[], trailing: ElementChild = null): HTMLElement {
  return createElement("div", { class: "section-head" }, [
    createElement("h2", { class: "section-head-title" }, [title]),
    meta.length > 0 && createElement("span", { class: "section-head-meta" }, meta),
    trailing,
  ]);
}

/**
 * A stream in sentences: its story and project, why it failed, what it exposes, its nodes in flow order, and the
 * terminal commands that act on it. The whole body of a stream that isn't loaded.
 */
export class StreamOverviewView {
  readonly element: HTMLElement;
  private readonly column: HTMLElement;
  private stream: ListedStream | null = null;
  private machineName: string | null = null;
  private graph: StreamGraphSummary | null = null;
  private graphReadFailure: string | null = null;
  private runtimeRefusal: string | null = null;
  private renderedSignature: string | null = null;

  constructor(
    private readonly platform: TatolabPlatform,
    private readonly featureFlags: TatolabFrontendFeatureFlags,
    private readonly actions: StreamOverviewActions,
  ) {
    this.column = createElement("div", { class: "overview-column" });
    this.element = createElement("div", { class: "overview-page" }, [this.column]);
  }

  showStream(stream: ListedStream, machineName: string | null): void {
    if (this.stream?.name !== stream.name) {
      this.graph = null;
      this.graphReadFailure = null;
      this.runtimeRefusal = null;
    }
    this.stream = stream;
    this.machineName = machineName;
    this.render();
  }

  showGraph(graph: StreamGraphSummary): void {
    this.graph = graph;
    this.graphReadFailure = null;
    this.render();
  }

  showGraphReadFailure(reasonText: string): void {
    this.graphReadFailure = reasonText;
    this.render();
  }

  /** What the runtime said when asked for a stream it hasn't loaded. */
  showRuntimeRefusal(refusalText: string): void {
    this.runtimeRefusal = refusalText;
    this.render();
  }

  /** Focuses the exposed output's copy button, as Search does after it opens Overview. */
  focusExposedOutput(outputPort: GraphOutputPortAddress): void {
    const row = this.column.querySelector<HTMLElement>(
      `.exposed-output-row[data-node="${CSS.escape(outputPort.node)}"][data-port="${CSS.escape(outputPort.port)}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
    row?.querySelector<HTMLElement>(".copy-button")?.focus();
  }

  private render(): void {
    const stream = this.stream;
    if (!stream) return;
    const signature = JSON.stringify([stream, this.machineName, this.graph, this.graphReadFailure, this.runtimeRefusal]);
    if (signature === this.renderedSignature) return;
    this.renderedSignature = signature;
    const isLoaded = streamNotLoadedReason(stream) === null;
    const graphSections: ElementChild[] = !isLoaded
      ? []
      : this.graph !== null
        ? [this.createExposedOutputsSection(stream, this.graph), this.createNodesSection(this.graph)]
        : [
            createElement("p", { class: "overview-graph-status" }, [
              this.graphReadFailure === null ? "Reading its graph…" : `Couldn't read this stream's graph: ${this.graphReadFailure}`,
            ]),
          ];
    this.column.replaceChildren(
      this.createStory(stream),
      ...(stream.state === "failed" ? [this.createFailureBlock(stream)] : []),
      ...(streamNotLoadedReason(stream) === "not_loaded" && this.runtimeRefusal !== null ? [this.createRuntimeRefusal(this.runtimeRefusal)] : []),
      ...graphSections.filter((section): section is HTMLElement => section instanceof HTMLElement),
      createElement("section", { class: "overview-section" }, [
        createSectionHead("From the terminal", []),
        createCommandWell(terminalCommandsForStream(stream)),
      ]),
    );
  }

  private createStory(stream: ListedStream): HTMLElement {
    const story = presentStreamStory(stream);
    return createElement("p", { class: "overview-story" }, [
      createElement("strong", {}, [story.leadPhrase]),
      ...inlineText(story.rest),
      story.isInProgress && createSpinner(),
      " Its project is ",
      createElement("code", { class: "selectable-text", title: stream.project_directory }, [abbreviateHomeDirectory(stream.project_directory)]),
      createCopyButton("the project path", () => stream.project_directory),
    ]);
  }

  private createRuntimeRefusal(refusalText: string): HTMLElement {
    return createElement("p", { class: "runtime-refusal" }, [
      createElement("span", {}, ["The runtime says"]),
      createElement("code", { class: "selectable-text" }, [refusalText]),
    ]);
  }

  private createFailureBlock(stream: ListedStream): HTMLElement {
    const retryCommand = `tatolab start ${stream.name}`;
    return createElement("div", { class: "failure-block", role: "alert" }, [
      createFailureIcon(16),
      createElement("div", { class: "failure-block-copy" }, [
        createElement("p", { class: "failure-block-title" }, ["Failed at its last start"]),
        createElement("p", { class: "failure-block-reason selectable-text" }, [stream.failed_because ?? "The runtime gave no reason."]),
        createElement("div", { class: "failure-block-actions" }, [
          createElement("span", { class: "failure-block-retry-label" }, ["Retry it with"]),
          createElement("code", { class: "selectable-text" }, [retryCommand]),
          createCopyButton(retryCommand, () => retryCommand),
        ]),
        this.runtimeRefusal !== null && this.createRuntimeRefusal(this.runtimeRefusal),
      ]),
    ]);
  }

  private createExposedOutputsSection(stream: ListedStream, graph: StreamGraphSummary): HTMLElement {
    const listedPorts = graph.exposed;
    const readablePorts = readableExposedPorts(graph);
    const rows: HTMLElement[] = listedPorts.map((exposedPort) => {
      const address = exposedOutputAddress(this.machineName, stream.name, exposedPort);
      const level = explainExposureLevel(exposedPort.level, this.platform, stream.name);
      const isReadable = exposedPort.level !== "internal";
      return createElement(
        "div",
        { class: "exposed-output-row", "data-node": exposedPort.node, "data-port": exposedPort.port },
        [
          createElement("div", { class: "exposed-output-copy" }, [
            createExposedAddressLabel(address, "exposed-output-address"),
            createElement("p", { class: "exposed-output-level" }, [
              createElement("span", { class: "exposed-output-level-word" }, [level.explanation === null ? level.levelWord : `${level.levelWord}.`]),
              level.explanation !== null && ` ${level.explanation}`,
            ]),
          ]),
          this.featureFlags.watchExposedOutput &&
            isReadable &&
            createElement(
              "button",
              {
                type: "button",
                class: "button button-small",
                "data-watch": "overview",
                onClick: () => this.actions.onWatchOutputPort({ node: exposedPort.node, port: exposedPort.port }, exposedPort.level),
              },
              [createIcon(EYE_ICON_SVG, 14), "Watch"],
            ),
          createCopyButton("the address", () => address.fullAddress),
        ],
      );
    });
    const wellChildren: HTMLElement[] = [...rows];
    if (readablePorts.length === 0) {
      wellChildren.push(
        createElement("p", { class: "exposed-output-none" }, [
          `None. Every output of ${stream.name} is internal: only its own nodes read them.`,
        ]),
      );
    }
    const suggestedOutput = readablePorts.length === 0 ? outputToSuggestExposing(graph) : null;
    return createElement("section", { class: "overview-section" }, [
      createSectionHead("Exposed outputs", [`readable outside ${stream.name}`]),
      createElement("div", { class: "well exposed-outputs-well" }, wellChildren),
      suggestedOutput !== null &&
        createCommandWell([
          {
            command: `tatolab expose ${stream.name} ${suggestedOutput.node} ${suggestedOutput.port}`,
            description: `Make one readable on ${presentPlatform(this.platform).thisMachineMidSentence}`,
          },
        ]),
    ]);
  }

  private createNodesSection(graph: StreamGraphSummary): HTMLElement {
    const health = summarizeGraphHealth(graph);
    const healthText = [health.nodesClause, health.linksClause].filter((clause) => clause !== null).join(", ");
    const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));
    const nodesInFlowOrder = graphNodesInFlowOrder(layOutStreamGraph(graph, null)).filter((layoutNode) => layoutNode.isInThisStream);
    return createElement("section", { class: "overview-section" }, [
      createSectionHead(
        "Nodes",
        [healthText, health.errorClause !== null && ", ", health.errorClause !== null && createElement("span", { class: "failure-text" }, [health.errorClause])],
        createElement("button", { type: "button", class: "text-link section-head-link", onClick: () => this.actions.onOpenGraph() }, [
          "Open graph",
          createWindowShortcutCap(this.platform, "1"),
        ]),
      ),
      createElement(
        "div",
        { class: "well overview-nodes-well" },
        nodesInFlowOrder.map((layoutNode) => {
          const node = nodeByName.get(layoutNode.name);
          const nodeState = presentGraphNodeState(node?.state ?? null, true);
          const stateWord =
            nodeState.look === "running" && nodeState.footText === null
              ? null
              : nodeState.isFailure
                ? createElement("span", { class: "overview-node-state failure-text" }, [createFailureIcon(14), "In error"])
                : createElement("span", { class: "overview-node-state" }, [nodeState.footText ?? ""]);
          return createElement("div", { class: "overview-node-row" }, [
            createElement("code", { class: "overview-node-name selectable-text" }, [layoutNode.name]),
            createElement("code", { class: "overview-node-type selectable-text", title: node?.type ?? "" }, [node?.type ?? ""]),
            stateWord ?? createElement("span", {}),
            createElement("span", { class: "overview-node-kind" }, [presentNodeKind(node?.type ?? "") ?? ""]),
          ]);
        }),
      ),
    ]);
  }
}
