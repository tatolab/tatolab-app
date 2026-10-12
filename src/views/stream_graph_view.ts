import type { StreamGraphExposedPort, StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgElement, createSvgFromMarkup } from "../dom";
import { EXPOSED_PORT_ICON_SVG } from "../icons";
import { presentPlatform } from "../presentation/platform_presentation";
import type { StatusTone } from "../presentation/runtime_presentation";
import {
  GRAPH_EXPOSED_PORT_MARK_WIDTH,
  GRAPH_NODE_DOT_TO_NAME_GAP,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_HORIZONTAL_PADDING,
  GRAPH_NODE_STATE_DOT_RADIUS,
  layOutStreamGraph,
  type StreamGraphLayout,
  type StreamGraphLayoutNode,
} from "./stream_graph_layout";

const GRAPH_LINK_PULSE_MILLISECONDS = 2400;
const GRAPH_LINK_PULSE_STAGGER_MILLISECONDS = 700;
const GRAPH_PORT_DOT_RADIUS = 2.5;
const GRAPH_EXPOSED_PORT_ICON_SIZE = 14;
/** Below this the node names get too small to read, so the canvas scrolls instead. */
const SMALLEST_GRAPH_SCALE = 0.78;

/** A processor state as the runtime names it, coloured. */
function toneOfGraphNodeState(processorState: string | null): StatusTone {
  switch (processorState) {
    case "Running":
      return "ok";
    case "Pending":
    case "Idle":
      return "progress";
    case "Paused":
      return "warning";
    case "Error":
      return "error";
    default:
      return "idle";
  }
}

/** A link state as the runtime names it, coloured. */
function toneOfGraphLinkState(linkState: string): StatusTone {
  switch (linkState) {
    case "wired":
      return "ok";
    case "pending":
      return "progress";
    case "awaiting_remote":
      return "warning";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

/** Who may read a port exposed at `level`, said of `thisMachine`; `undefined` for a level newer than this app. */
function explainExposureLevel(level: string, thisMachine: string): string | undefined {
  switch (level) {
    case "internal":
      return "Only this stream's own nodes read it";
    case "private":
      return `Other streams on ${thisMachine} can read it`;
    case "public":
      return `Machines off ${thisMachine} can read it too`;
    default:
      return undefined;
  }
}

function describeGraphNode(layoutNode: StreamGraphLayoutNode): string {
  const descriptionLines = [layoutNode.name];
  if (layoutNode.processorClassImportPath) descriptionLines.push(layoutNode.processorClassImportPath);
  descriptionLines.push(layoutNode.isInThisStream ? (layoutNode.state ?? "No state reported") : "In another stream");
  for (const exposedPort of layoutNode.exposedPorts) {
    descriptionLines.push(`Exposes ${exposedPort.port} (${exposedPort.level})`);
  }
  return descriptionLines.join("\n");
}

function appendSvgTitle(parent: SVGElement, titleText: string): void {
  const titleElement = createSvgElement("title");
  titleElement.textContent = titleText;
  parent.append(titleElement);
}

function renderGraphNode(layoutNode: StreamGraphLayoutNode): SVGGElement {
  const nodeGroup = createSvgElement("g", {
    class: "stream-graph-node",
    transform: `translate(${layoutNode.x} ${layoutNode.y})`,
  });
  nodeGroup.dataset.tone = toneOfGraphNodeState(layoutNode.state);
  if (!layoutNode.isInThisStream) nodeGroup.dataset.outsideThisStream = "true";
  appendSvgTitle(nodeGroup, describeGraphNode(layoutNode));
  nodeGroup.append(
    createSvgElement("rect", {
      class: "stream-graph-node-pill",
      x: 0.5,
      y: 0.5,
      width: layoutNode.width - 1,
      height: GRAPH_NODE_HEIGHT - 1,
      rx: (GRAPH_NODE_HEIGHT - 1) / 2,
    }),
    createSvgElement("circle", {
      class: "stream-graph-node-state-dot",
      cx: GRAPH_NODE_HORIZONTAL_PADDING + GRAPH_NODE_STATE_DOT_RADIUS,
      cy: GRAPH_NODE_HEIGHT / 2,
      r: GRAPH_NODE_STATE_DOT_RADIUS,
    }),
  );
  const nameText = createSvgElement("text", {
    class: "stream-graph-node-name",
    x: GRAPH_NODE_HORIZONTAL_PADDING + GRAPH_NODE_STATE_DOT_RADIUS * 2 + GRAPH_NODE_DOT_TO_NAME_GAP,
    y: GRAPH_NODE_HEIGHT / 2,
    "dominant-baseline": "central",
  });
  nameText.textContent = layoutNode.name;
  nodeGroup.append(nameText);
  if (layoutNode.exposedPorts.length > 0) {
    const exposedPortIcon = createSvgFromMarkup(EXPOSED_PORT_ICON_SVG);
    exposedPortIcon.setAttribute("class", "line-icon stream-graph-node-exposed-mark");
    exposedPortIcon.setAttribute(
      "x",
      String(layoutNode.width - GRAPH_NODE_HORIZONTAL_PADDING - GRAPH_EXPOSED_PORT_MARK_WIDTH + 4),
    );
    exposedPortIcon.setAttribute("y", String((GRAPH_NODE_HEIGHT - GRAPH_EXPOSED_PORT_ICON_SIZE) / 2));
    exposedPortIcon.setAttribute("width", String(GRAPH_EXPOSED_PORT_ICON_SIZE));
    exposedPortIcon.setAttribute("height", String(GRAPH_EXPOSED_PORT_ICON_SIZE));
    nodeGroup.append(exposedPortIcon);
  }
  return nodeGroup;
}

function renderGraphSvg(layout: StreamGraphLayout, isGhost: boolean): SVGSVGElement {
  const graphSvg = createSvgElement("svg", {
    class: "stream-graph-svg",
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
    role: "img",
  });
  const nodeByName = new Map(layout.nodes.map((layoutNode) => [layoutNode.name, layoutNode]));
  const linksGroup = createSvgElement("g", { class: "stream-graph-links" });
  const portsGroup = createSvgElement("g", { class: "stream-graph-ports" });
  const drawnPortPositions = new Set<string>();
  const pulsePhaseNow = performance.now();

  layout.links.forEach((layoutLink, linkIndex) => {
    const linkTone = toneOfGraphLinkState(layoutLink.link.state);
    const linkPath = createSvgElement("path", { class: "stream-graph-link", d: layoutLink.pathData });
    linkPath.dataset.tone = linkTone;
    appendSvgTitle(
      linkPath,
      `${layoutLink.link.source_node}.${layoutLink.link.source_port} → ${layoutLink.link.target_node}.${layoutLink.link.target_port}\n${layoutLink.link.state}`,
    );
    linksGroup.append(linkPath);

    const bothEndsRunning =
      nodeByName.get(layoutLink.link.source_node)?.state === "Running" &&
      nodeByName.get(layoutLink.link.target_node)?.state === "Running";
    if (!isGhost && linkTone === "ok" && bothEndsRunning) {
      const pulsePath = createSvgElement("path", {
        class: "stream-graph-link-pulse",
        d: layoutLink.pathData,
        pathLength: 100,
      });
      // A negative delay keeps each pulse's phase across re-renders, so a refreshed graph does not stutter.
      const pulsePhaseMilliseconds =
        (pulsePhaseNow + linkIndex * GRAPH_LINK_PULSE_STAGGER_MILLISECONDS) % GRAPH_LINK_PULSE_MILLISECONDS;
      pulsePath.style.animationDuration = `${GRAPH_LINK_PULSE_MILLISECONDS}ms`;
      pulsePath.style.animationDelay = `-${pulsePhaseMilliseconds}ms`;
      linksGroup.append(pulsePath);
    }

    for (const [portX, portY] of [
      [layoutLink.startX, layoutLink.startY],
      [layoutLink.endX, layoutLink.endY],
    ]) {
      const portPositionKey = `${portX},${portY}`;
      if (drawnPortPositions.has(portPositionKey)) continue;
      drawnPortPositions.add(portPositionKey);
      const portDot = createSvgElement("circle", {
        class: "stream-graph-port",
        cx: portX,
        cy: portY,
        r: GRAPH_PORT_DOT_RADIUS,
      });
      portDot.dataset.tone = linkTone;
      portsGroup.append(portDot);
    }
  });

  const nodesGroup = createSvgElement("g", { class: "stream-graph-nodes" });
  for (const layoutNode of layout.nodes) nodesGroup.append(renderGraphNode(layoutNode));
  graphSvg.append(linksGroup, nodesGroup, portsGroup);
  return graphSvg;
}

function exposedPortAddress(streamName: string, exposedPort: StreamGraphExposedPort): string {
  return `${streamName}/${exposedPort.node}/${exposedPort.port}`;
}

function createExposedPortCaption(streamName: string, exposedPort: StreamGraphExposedPort, thisMachine: string): HTMLElement {
  return createElement("li", { class: "stream-graph-exposed-port" }, [
    createSvgFromMarkup(EXPOSED_PORT_ICON_SVG),
    createElement("code", { class: "stream-graph-exposed-port-address selectable-text" }, [
      exposedPortAddress(streamName, exposedPort),
    ]),
    createElement(
      "span",
      {
        class: "state-chip",
        "data-tone": exposedPort.level === "public" ? "accent" : "outline",
        title: explainExposureLevel(exposedPort.level, thisMachine),
      },
      [exposedPort.level],
    ),
  ]);
}

/** A stream's nodes and links drawn left to right, coloured by their live states, with its exposed ports listed. */
export class StreamGraphView {
  readonly element: HTMLElement;
  private readonly graphCanvas: HTMLElement;
  private readonly exposedPortList: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private shownGraphSummary: StreamGraphSummary | null = null;
  private shownGraphSignature: string | null = null;
  private drawnForCanvasWidth: number | null = null;

  constructor(
    private readonly streamName: string,
    private readonly platform: TatolabPlatform,
    private readonly isGhost = false,
  ) {
    this.graphCanvas = createElement("div", { class: "stream-graph-canvas" });
    this.exposedPortList = createElement("ul", { class: "stream-graph-exposed-ports", "aria-label": "Exposed ports" });
    this.element = createElement("section", { class: "stream-graph", "aria-label": `${streamName} graph` }, [
      this.graphCanvas,
      this.exposedPortList,
    ]);
    if (isGhost) this.element.dataset.ghost = "true";
    this.resizeObserver = new ResizeObserver(() => {
      if (this.graphCanvas.clientWidth !== this.drawnForCanvasWidth) this.drawGraph();
    });
    this.resizeObserver.observe(this.graphCanvas);
  }

  showGraph(graphSummary: StreamGraphSummary): void {
    const graphSignature = JSON.stringify(graphSummary);
    if (graphSignature === this.shownGraphSignature) return;
    if (graphSummary.nodes.length === 0 && graphSummary.links.length === 0) {
      this.showMessage("This stream's graph has no nodes yet.");
    } else {
      this.shownGraphSummary = graphSummary;
      this.drawGraph();
      this.exposedPortList.replaceChildren(
        ...(this.isGhost
          ? []
          : graphSummary.exposed.map((exposedPort) =>
              createExposedPortCaption(this.streamName, exposedPort, presentPlatform(this.platform).thisMachineMidSentence),
            )),
      );
    }
    this.shownGraphSignature = graphSignature;
  }

  /** Replaces the drawing with a line of text, such as why the graph could not be read. */
  showMessage(messageText: string, detailText: string | null = null): void {
    this.shownGraphSummary = null;
    this.shownGraphSignature = null;
    this.graphCanvas.replaceChildren(
      createElement("div", { class: "stream-graph-message" }, [
        createElement("p", {}, [messageText]),
        detailText !== null && createElement("p", { class: "stream-graph-message-detail selectable-text" }, [detailText]),
      ]),
    );
    this.exposedPortList.replaceChildren();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
  }

  /** Lays the graph out for the canvas width, scaling it down only when even the closest columns overflow. */
  private drawGraph(): void {
    if (!this.shownGraphSummary) return;
    const canvasWidth = this.graphCanvas.clientWidth;
    this.drawnForCanvasWidth = canvasWidth;
    const layout = layOutStreamGraph(this.shownGraphSummary, canvasWidth > 0 ? canvasWidth : null);
    const graphScale = canvasWidth > 0 ? Math.max(SMALLEST_GRAPH_SCALE, Math.min(1, canvasWidth / layout.width)) : 1;
    const graphSvg = renderGraphSvg(layout, this.isGhost);
    graphSvg.setAttribute("width", String(Math.round(layout.width * graphScale)));
    graphSvg.setAttribute("height", String(Math.round(layout.height * graphScale)));
    graphSvg.setAttribute(
      "aria-label",
      `${this.shownGraphSummary.nodes.length} nodes and ${this.shownGraphSummary.links.length} links in ${this.streamName}`,
    );
    this.graphCanvas.replaceChildren(graphSvg);
  }
}
