// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgElement, setTextIfChanged, type ElementChild } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { EYE_ICON_SVG } from "../icons";
import { presentGraphLinkState, presentGraphNodeState } from "../presentation/stream_graph_presentation";
import {
  exposedOutputAddress,
  readableExposedPorts,
  summarizeGraphHealth,
  type GraphNodeOutputPort,
} from "../presentation/stream_overview_presentation";
import { abbreviateHomeDirectory } from "../presentation/stream_presentation";
import { createCopyButton } from "./copy_button";
import { layOutStreamGraph, showsExposureWord, type StreamGraphLayout, type StreamGraphLayoutNode } from "./stream_graph_layout";
import { createExposedAddressLabel, createFailureIcon, createIcon, createWindowShortcutCap } from "./window_controls";

/** Below this the node names get too small to read, so the canvas scrolls instead. */
const SMALLEST_GRAPH_SCALE = 0.78;
const GRAPH_FIT_PADDING_TOP = 40;
const GRAPH_FIT_PADDING_BOTTOM = 44;
const GRAPH_FIT_PADDING_SIDES = 28;
const NODE_PORTS_TOOLTIP = "Ports appear here once they are linked or exposed.";

/** An output port, by its node and name, such as the one Watch shows. */
export interface GraphOutputPortAddress {
  node: string;
  port: string;
}

/** What the canvas asks of the stream view around it. */
export interface StreamGraphViewActions {
  /** A port row or the exposed strip's address was chosen, with the flag on. */
  onWatchOutputPort(outputPort: GraphOutputPortAddress, exposureLevel: string | null): void;
  /** An errored node's foot was chosen: show the log's errors. */
  onShowErrorLines(): void;
  /** `and 2 more` was chosen: show every exposed output in Overview. */
  onShowExposedOutputs(): void;
}

function appendSvgTitle(parent: SVGElement, titleText: string): void {
  const titleElement = createSvgElement("title");
  titleElement.textContent = titleText;
  parent.append(titleElement);
}

function capitalise(word: string): string {
  return word === "" ? word : word[0].toUpperCase() + word.slice(1);
}

/** A stream's live graph on its canvas: nodes with their port rows, links between them, and what is exposed. */
export class StreamGraphView {
  readonly element: HTMLElement;
  private readonly healthLine: HTMLElement;
  private readonly projectPathLabel: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly worldSizer: HTMLElement;
  private readonly world: HTMLElement;
  private readonly exposedStrip: HTMLElement;
  private readonly messageSlot: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private shownGraph: StreamGraphSummary | null = null;
  private shownGraphSignature: string | null = null;
  private machineName: string | null = null;
  private projectDirectory = "";
  private watchedOutputPort: GraphOutputPortAddress | null = null;
  private drawnForCanvasSize: string | null = null;

  constructor(
    private readonly streamName: string,
    private readonly platform: TatolabPlatform,
    private readonly featureFlags: TatolabFrontendFeatureFlags,
    private readonly actions: StreamGraphViewActions,
  ) {
    this.healthLine = createElement("p", { class: "graph-canvas-health" });
    this.projectPathLabel = createElement("code", { class: "graph-canvas-project-path selectable-text" });
    this.world = createElement("div", { class: "graph-world" });
    this.worldSizer = createElement("div", { class: "graph-world-sizer" }, [this.world]);
    this.viewport = createElement("div", { class: "graph-viewport" }, [this.worldSizer]);
    this.exposedStrip = createElement("p", { class: "graph-canvas-exposed" });
    this.messageSlot = createElement("div", { class: "graph-canvas-message", hidden: true });
    this.element = createElement("section", { class: "graph-canvas", "aria-label": `${streamName} graph` }, [
      this.viewport,
      this.healthLine,
      createElement("div", { class: "graph-canvas-project" }, [
        this.projectPathLabel,
        createCopyButton("the project path", () => this.projectDirectory),
      ]),
      this.exposedStrip,
      this.messageSlot,
    ]);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.canvasSizeKey() !== this.drawnForCanvasSize) this.drawGraph();
    });
    this.resizeObserver.observe(this.element);
  }

  showProjectDirectory(projectDirectory: string): void {
    this.projectDirectory = projectDirectory;
    setTextIfChanged(this.projectPathLabel, abbreviateHomeDirectory(projectDirectory));
    this.projectPathLabel.title = projectDirectory;
  }

  showGraph(graphSummary: StreamGraphSummary, machineName: string | null): void {
    const graphSignature = `${machineName ?? ""}\u0000${JSON.stringify(graphSummary)}`;
    if (graphSignature === this.shownGraphSignature) return;
    this.shownGraphSignature = graphSignature;
    this.machineName = machineName;
    if (graphSummary.nodes.length === 0 && graphSummary.links.length === 0) {
      this.shownGraph = null;
      this.showCanvasMessage([createElement("p", { class: "graph-canvas-message-quiet" }, ["This stream's graph has no nodes yet."])]);
      return;
    }
    this.shownGraph = graphSummary;
    this.messageSlot.hidden = true;
    this.healthLine.hidden = false;
    this.exposedStrip.hidden = false;
    this.showHealthLine(graphSummary);
    this.showExposedStrip(graphSummary);
    this.drawGraph();
  }

  /** Replaces the drawing with why the graph could not be read. */
  showReadFailure(reasonText: string): void {
    this.shownGraph = null;
    this.shownGraphSignature = null;
    this.showCanvasMessage([
      createElement("p", { class: "graph-canvas-message-failure" }, [createFailureIcon(16), "Couldn't read this stream's graph."]),
      createElement("p", { class: "graph-canvas-message-detail selectable-text" }, [reasonText]),
    ]);
  }

  /** Lights the watched port, its node and the links out of it; `null` puts them back. */
  setWatchedOutputPort(watchedOutputPort: GraphOutputPortAddress | null): void {
    const isSame =
      watchedOutputPort?.node === this.watchedOutputPort?.node && watchedOutputPort?.port === this.watchedOutputPort?.port;
    if (isSame) return;
    this.watchedOutputPort = watchedOutputPort;
    this.drawnForCanvasSize = null;
    this.drawGraph();
  }

  /** The graph last shown, for the Overview and Search. */
  currentGraph(): StreamGraphSummary | null {
    return this.shownGraph;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
  }

  private showCanvasMessage(children: ElementChild[]): void {
    this.world.replaceChildren();
    this.healthLine.hidden = true;
    this.exposedStrip.hidden = true;
    this.messageSlot.replaceChildren(...children.filter((child): child is HTMLElement => child instanceof HTMLElement));
    this.messageSlot.hidden = false;
  }

  private showHealthLine(graphSummary: StreamGraphSummary): void {
    const health = summarizeGraphHealth(graphSummary);
    const plainText = [health.nodesClause, health.linksClause].filter((clause) => clause !== null).join(", ");
    this.healthLine.replaceChildren(
      plainText,
      ...(health.errorClause === null ? [] : [", ", createElement("span", { class: "failure-text" }, [health.errorClause])]),
    );
  }

  private showExposedStrip(graphSummary: StreamGraphSummary): void {
    const readablePorts = readableExposedPorts(graphSummary);
    const [firstPort, ...morePorts] = readablePorts;
    if (!firstPort) {
      this.exposedStrip.replaceChildren(`Nothing exposed. Every output is internal to ${this.streamName}.`);
      return;
    }
    const address = exposedOutputAddress(this.machineName, this.streamName, firstPort);
    const addressLabel = createExposedAddressLabel(address, "graph-canvas-exposed-address");
    const addressElement = this.featureFlags.watchExposedOutput
      ? createElement(
          "button",
          {
            type: "button",
            class: "graph-canvas-exposed-watch",
            "data-watch": "exposed-strip",
            title: `Watch ${address.fullAddress}`,
            onClick: () => this.actions.onWatchOutputPort({ node: firstPort.node, port: firstPort.port }, firstPort.level),
          },
          [addressLabel],
        )
      : addressLabel;
    const stripParts: HTMLElement[] = [
      createElement("span", { class: "graph-canvas-exposed-word" }, ["Exposed"]),
      addressElement,
      createElement("span", { class: "graph-canvas-exposed-level" }, [capitalise(firstPort.level)]),
    ];
    if (morePorts.length > 0) {
      stripParts.push(
        createElement(
          "button",
          { type: "button", class: "text-link", title: "Every exposed output, in Overview", onClick: () => this.actions.onShowExposedOutputs() },
          [`and ${morePorts.length} more`, createWindowShortcutCap(this.platform, "3")],
        ),
      );
    }
    this.exposedStrip.replaceChildren(...stripParts);
  }

  private canvasSizeKey(): string {
    return `${this.element.clientWidth}x${this.element.clientHeight}`;
  }

  /** Lays the graph out for the canvas, centred and scaled down only, scrolling below the smallest readable scale. */
  private drawGraph(): void {
    if (!this.shownGraph) return;
    const canvasWidth = this.element.clientWidth;
    const canvasHeight = this.element.clientHeight;
    if (canvasWidth === 0 || canvasHeight === 0) return;
    this.drawnForCanvasSize = this.canvasSizeKey();
    const layout = layOutStreamGraph(this.shownGraph, canvasWidth, {
      reservesWatchIconOnReadableOutputs: this.featureFlags.watchExposedOutput,
    });
    const availableWidth = canvasWidth - GRAPH_FIT_PADDING_SIDES * 2;
    const availableHeight = canvasHeight - GRAPH_FIT_PADDING_TOP - GRAPH_FIT_PADDING_BOTTOM;
    const fittingScale = Math.min(1, availableWidth / Math.max(1, layout.width), availableHeight / Math.max(1, layout.height));
    const graphScale = Math.max(SMALLEST_GRAPH_SCALE, fittingScale);
    const scaledWidth = layout.width * graphScale;
    const scaledHeight = layout.height * graphScale;
    const offsetX = Math.max(GRAPH_FIT_PADDING_SIDES, (canvasWidth - scaledWidth) / 2);
    const offsetY = GRAPH_FIT_PADDING_TOP + Math.max(0, (availableHeight - scaledHeight) / 2);
    this.worldSizer.style.width = `${Math.ceil(offsetX + scaledWidth + GRAPH_FIT_PADDING_SIDES)}px`;
    this.worldSizer.style.height = `${Math.ceil(offsetY + scaledHeight + GRAPH_FIT_PADDING_BOTTOM)}px`;
    this.world.style.width = `${layout.width}px`;
    this.world.style.height = `${layout.height}px`;
    this.world.style.transform = `translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px) scale(${graphScale})`;
    this.world.replaceChildren(this.renderLinks(layout), ...layout.nodes.map((layoutNode) => this.renderNode(layoutNode)));
    this.world.setAttribute("aria-label", `${this.shownGraph.nodes.length} nodes and ${this.shownGraph.links.length} links in ${this.streamName}`);
  }

  private isWatched(nodeName: string, port: string): boolean {
    return this.watchedOutputPort?.node === nodeName && this.watchedOutputPort.port === port;
  }

  private renderLinks(layout: StreamGraphLayout): SVGSVGElement {
    const linksSvg = createSvgElement("svg", {
      class: "graph-links",
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      "aria-hidden": "true",
    });
    for (const layoutLink of layout.links) {
      const { link } = layoutLink;
      const linkState = presentGraphLinkState(link);
      const isWatched = this.featureFlags.watchExposedOutput && this.isWatched(link.source_node, link.source_port);
      const linkGroup = createSvgElement("g", { class: "graph-link", "data-look": linkState.look });
      if (isWatched) linkGroup.dataset.watched = "true";
      const hitPath = createSvgElement("path", { class: "graph-link-hit", d: layoutLink.pathData });
      appendSvgTitle(hitPath, `${link.source_node}.${link.source_port} → ${link.target_node}.${link.target_port}\n${linkState.sentence}`);
      linkGroup.append(
        createSvgElement("path", { class: "graph-link-stroke", d: layoutLink.pathData }),
        createSvgElement("path", { class: "graph-link-arrow", d: layoutLink.arrowPathData }),
        hitPath,
      );
      linksSvg.append(linkGroup);
    }
    return linksSvg;
  }

  private renderNode(layoutNode: StreamGraphLayoutNode): HTMLElement {
    const nodeState = presentGraphNodeState(layoutNode.state, layoutNode.isInThisStream);
    const isHoldingWatchedPort =
      this.featureFlags.watchExposedOutput && layoutNode.outputs.some((output) => this.isWatched(layoutNode.name, output.port));
    const ports = [
      ...layoutNode.inputs.map((input) => createElement("li", { class: "graph-node-port graph-node-port-input" }, [input])),
      ...layoutNode.outputs.map((output) => this.renderOutputPort(layoutNode, output)),
    ];
    const foot =
      nodeState.footText === null
        ? null
        : nodeState.isFailure
          ? createElement(
              "button",
              {
                type: "button",
                class: "graph-node-foot graph-node-foot-failure",
                title: "Show the log's errors",
                onClick: () => this.actions.onShowErrorLines(),
              },
              [nodeState.footText],
            )
          : createElement("p", { class: "graph-node-foot" }, [nodeState.footText]);
    const nodeElement = createElement(
      "div",
      {
        class: "graph-node",
        "data-look": nodeState.look,
        "data-node": layoutNode.name,
        title: layoutNode.isInThisStream ? `${layoutNode.type ?? layoutNode.name}\n${NODE_PORTS_TOOLTIP}` : `${layoutNode.name}, in another stream`,
      },
      [
        createElement("div", { class: "graph-node-head" }, [
          createElement("p", { class: "graph-node-name" }, [
            nodeState.isFailure && createFailureIcon(14),
            createElement("span", { class: "graph-node-name-text" }, [layoutNode.name]),
          ]),
          createElement("p", { class: "graph-node-class-line" }, [
            createElement("span", { class: "graph-node-class" }, [layoutNode.isInThisStream ? (layoutNode.className ?? "") : "In another stream"]),
            layoutNode.kindWord !== null && createElement("span", { class: "graph-node-kind" }, [layoutNode.kindWord]),
          ]),
        ]),
        ports.length > 0 && createElement("ul", { class: "graph-node-ports" }, ports),
        foot,
      ],
    );
    if (isHoldingWatchedPort) nodeElement.dataset.holdsWatchedPort = "true";
    nodeElement.style.left = `${layoutNode.x}px`;
    nodeElement.style.top = `${layoutNode.y}px`;
    nodeElement.style.width = `${layoutNode.width}px`;
    return nodeElement;
  }

  private renderOutputPort(layoutNode: StreamGraphLayoutNode, output: GraphNodeOutputPort): HTMLElement {
    const showsWord = showsExposureWord(output);
    const portChildren: ElementChild[] = [
      showsWord && createElement("span", { class: "graph-node-port-exposure" }, [output.exposureLevel ?? ""]),
      createElement("span", { class: "graph-node-port-name" }, [output.port]),
    ];
    if (!this.featureFlags.watchExposedOutput || !layoutNode.isInThisStream) {
      return createElement("li", { class: "graph-node-port graph-node-port-output" }, portChildren);
    }
    const isReadable = showsWord;
    const isWatched = this.isWatched(layoutNode.name, output.port);
    const address = exposedOutputAddress(this.machineName, this.streamName, { node: layoutNode.name, port: output.port });
    return createElement("li", { class: "graph-node-port-item" }, [
      createElement(
        "button",
        {
          type: "button",
          class: "graph-node-port graph-node-port-output graph-node-port-watchable",
          "data-watch": "port",
          "data-readable": String(isReadable),
          "aria-pressed": String(isWatched),
          title: isReadable ? `Watch ${address.fullAddress}` : `Internal: only ${this.streamName}'s own nodes read it.`,
          onClick: () => this.actions.onWatchOutputPort({ node: layoutNode.name, port: output.port }, output.exposureLevel),
        },
        [isReadable && createIcon(EYE_ICON_SVG, 13, "graph-node-port-eye"), ...portChildren],
      ),
    ]);
  }
}
