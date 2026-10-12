import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { streamNotLoadedReason, type StreamNotLoadedReason } from "../presentation/stream_presentation";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import { LogDockSplitter } from "./log_dock_splitter";
import { StreamGraphView, type GraphOutputPortAddress } from "./stream_graph_view";
import { StreamLogConsoleView } from "./stream_log_console_view";
import { StreamLogFollower } from "./stream_log_follower";
import { StreamOverviewView } from "./stream_overview_view";
import { isWatchableExposureLevel, WatchPlaceholderView } from "./watch_placeholder_view";

const STREAM_GRAPH_POLL_MILLISECONDS = 2500;

/** The three views of a loaded stream, as the band's tabs name them. */
export type StreamViewTab = "graph" | "logs" | "overview";

/** What the stream view asks of the page around it. */
export interface StreamDetailActions {
  /** Something in the view needs another tab: Open graph, an errored node's foot from Logs, Watch from Overview. */
  onTabRequested(tab: StreamViewTab): void;
}

/** The output Watch is open on, and its level when it opened. */
interface OpenWatch {
  outputPort: GraphOutputPortAddress;
  exposureLevel: string | null;
}

/** A loaded stream: its canvas over the docked log, or the log alone, or its Overview, with the graph and log polled throughout. */
class LoadedStreamLiveView {
  readonly element: HTMLElement;
  private readonly workspace: HTMLElement;
  private readonly logDock: HTMLElement;
  private readonly graphView: StreamGraphView;
  private readonly graphPoll: RepeatingBackendPoll;
  private readonly logConsole: StreamLogConsoleView;
  private readonly logFollower: StreamLogFollower;
  private readonly splitter: LogDockSplitter;
  private readonly overview: StreamOverviewView;
  private readonly watchPlaceholder: WatchPlaceholderView | null;
  private openWatch: OpenWatch | null = null;
  private shownTab: StreamViewTab = "graph";
  private shownNodeCount: number | null = null;
  private machineName: string | null = null;
  private isDisposed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly streamName: string,
    platform: TatolabPlatform,
    featureFlags: TatolabFrontendFeatureFlags,
    private readonly actions: StreamDetailActions,
  ) {
    this.graphView = new StreamGraphView(streamName, platform, featureFlags, {
      onWatchOutputPort: (outputPort, exposureLevel) => this.showWatch(outputPort, exposureLevel),
      onShowErrorLines: () => {
        this.logConsole.showErrorLinesOnly();
        if (this.shownTab !== "graph") this.actions.onTabRequested("graph");
      },
      onShowExposedOutputs: () => this.actions.onTabRequested("overview"),
    });
    this.graphPoll = new RepeatingBackendPoll(() => this.readGraph(), STREAM_GRAPH_POLL_MILLISECONDS);
    this.logConsole = new StreamLogConsoleView(streamName, platform);
    this.logFollower = new StreamLogFollower(backend, streamName, this.logConsole);
    this.watchPlaceholder = featureFlags.watchExposedOutput ? new WatchPlaceholderView(platform, () => this.closeWatch()) : null;
    this.logDock = createElement("div", { class: "log-dock" }, [this.logConsole.element, this.watchPlaceholder?.element]);
    this.workspace = createElement("div", { class: "stream-workspace" });
    this.splitter = new LogDockSplitter(this.workspace);
    this.workspace.append(this.graphView.element, this.splitter.element, this.logDock);
    this.overview = new StreamOverviewView(platform, featureFlags, {
      onOpenGraph: () => this.actions.onTabRequested("graph"),
      onWatchOutputPort: (outputPort, exposureLevel) => {
        this.actions.onTabRequested("graph");
        this.showWatch(outputPort, exposureLevel);
      },
    });
    this.element = createElement("div", { class: "stream-live" }, [this.workspace, this.overview.element]);
    this.updateWatchVisibility();
  }

  showListing(stream: ListedStream, machineName: string | null): void {
    if (this.shownNodeCount !== null && stream.node_count !== this.shownNodeCount) this.graphPoll.pollNow();
    this.shownNodeCount = stream.node_count;
    this.machineName = machineName;
    this.graphView.showProjectDirectory(stream.project_directory);
    this.overview.showStream(stream, machineName);
  }

  showTab(tab: StreamViewTab): void {
    this.shownTab = tab;
    this.element.dataset.tab = tab;
    this.workspace.hidden = tab === "overview";
    this.overview.element.hidden = tab !== "overview";
    this.logConsole.setShownInLogsTab(tab === "logs");
    if (tab === "logs") this.closeWatch();
  }

  setPolling(shouldPoll: boolean): void {
    if (shouldPoll) this.graphPoll.start();
    else this.graphPoll.stop();
    this.logFollower.setReading(shouldPoll);
  }

  pollNow(): void {
    this.graphPoll.pollNow();
    this.logFollower.readNow();
  }

  focusLogFilter(): void {
    this.closeWatch();
    this.logConsole.focusTextFilter();
  }

  currentGraph(): StreamGraphSummary | null {
    return this.graphView.currentGraph();
  }

  focusExposedOutput(outputPort: GraphOutputPortAddress): void {
    this.overview.focusExposedOutput(outputPort);
  }

  /** Opens Watch on an output, in place of the log dock; it lights the port's path on the canvas. */
  showWatch(outputPort: GraphOutputPortAddress, exposureLevel: string | null): void {
    if (!this.watchPlaceholder) return;
    this.openWatch = { outputPort, exposureLevel };
    this.watchPlaceholder.show({
      streamName: this.streamName,
      machineName: this.machineName,
      node: outputPort.node,
      port: outputPort.port,
      exposureLevel,
    });
    this.updateWatchVisibility();
  }

  /** Closes Watch and puts the logs back exactly as they were; false when Watch wasn't open. */
  closeWatch(): boolean {
    if (this.openWatch === null) return false;
    this.openWatch = null;
    this.updateWatchVisibility();
    return true;
  }

  dispose(): void {
    this.isDisposed = true;
    this.graphPoll.stop();
    this.logFollower.dispose();
    this.logConsole.dispose();
    this.graphView.dispose();
    this.splitter.dispose();
  }

  private updateWatchVisibility(): void {
    const isWatchOpen = this.openWatch !== null;
    this.logDock.dataset.watching = String(isWatchOpen);
    if (this.watchPlaceholder) this.watchPlaceholder.element.hidden = !isWatchOpen;
    this.logConsole.element.hidden = isWatchOpen;
    this.graphView.setWatchedOutputPort(this.openWatch?.outputPort ?? null);
  }

  /** Watch closes when its port leaves the graph, or a readable port drops to internal. */
  private closeWatchWhenItsPortIsGone(graph: StreamGraphSummary): void {
    if (this.openWatch === null) return;
    const { outputPort, exposureLevel } = this.openWatch;
    const isStillInGraph = graph.links.some((link) => link.source_node === outputPort.node && link.source_port === outputPort.port)
      || graph.exposed.some((exposedPort) => exposedPort.node === outputPort.node && exposedPort.port === outputPort.port);
    const levelNow = graph.exposed.find((exposedPort) => exposedPort.node === outputPort.node && exposedPort.port === outputPort.port)?.level ?? null;
    const droppedToInternal = isWatchableExposureLevel(exposureLevel) && !isWatchableExposureLevel(levelNow);
    if (!isStillInGraph || droppedToInternal) this.closeWatch();
  }

  private async readGraph(): Promise<void> {
    try {
      const graphSummary = await this.backend.describeStreamGraph(this.streamName);
      if (this.isDisposed) return;
      this.graphView.showGraph(graphSummary, this.machineName);
      this.overview.showGraph(graphSummary);
      this.closeWatchWhenItsPortIsGone(graphSummary);
    } catch (rejection) {
      if (this.isDisposed) return;
      const reasonText = describeBackendRejection(rejection);
      this.graphView.showReadFailure(reasonText);
      this.overview.showGraphReadFailure(reasonText);
    }
  }
}

/** The selected stream: its live workspace and Overview while loaded, or its Overview alone while it isn't. */
export class StreamDetailView {
  readonly element: HTMLElement;
  private shownStream: ListedStream | null = null;
  private liveView: LoadedStreamLiveView | null = null;
  private notLoadedOverview: { view: StreamOverviewView; reason: StreamNotLoadedReason; failedBecause: string | null } | null = null;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
    private readonly featureFlags: TatolabFrontendFeatureFlags,
    private readonly actions: StreamDetailActions,
  ) {
    this.element = createElement("div", { class: "stream-detail" });
  }

  /** Shows `stream`, on `tab` while it is loaded. */
  showStream(stream: ListedStream, machineName: string | null, tab: StreamViewTab): void {
    if (this.shownStream?.name !== stream.name) this.disposeBody();
    this.shownStream = stream;
    const notLoadedReason = streamNotLoadedReason(stream);
    if (notLoadedReason === null) {
      this.showLiveView(stream, machineName, tab);
    } else {
      this.showNotLoadedOverview(stream, machineName, notLoadedReason);
    }
  }

  showTab(tab: StreamViewTab): void {
    this.liveView?.showTab(tab);
  }

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.liveView?.setPolling(isAllowed);
  }

  pollNow(): void {
    if (this.isPollingAllowed) this.liveView?.pollNow();
  }

  /** Focuses the log filter; false when no log dock is showing. */
  focusLogFilter(): boolean {
    if (!this.liveView) return false;
    this.liveView.focusLogFilter();
    return true;
  }

  /** The loaded stream's graph last read, for Search. */
  currentGraph(): StreamGraphSummary | null {
    return this.liveView?.currentGraph() ?? null;
  }

  focusExposedOutput(outputPort: GraphOutputPortAddress): void {
    this.liveView?.focusExposedOutput(outputPort);
  }

  showWatch(outputPort: GraphOutputPortAddress, exposureLevel: string | null): void {
    this.liveView?.showWatch(outputPort, exposureLevel);
  }

  /** Closes Watch; false when it wasn't open. */
  closeWatch(): boolean {
    return this.liveView?.closeWatch() ?? false;
  }

  dispose(): void {
    this.disposeBody();
    this.shownStream = null;
  }

  private showLiveView(stream: ListedStream, machineName: string | null, tab: StreamViewTab): void {
    if (this.notLoadedOverview) {
      this.notLoadedOverview = null;
      this.element.replaceChildren();
    }
    if (!this.liveView) {
      this.liveView = new LoadedStreamLiveView(this.backend, stream.name, this.platform, this.featureFlags, this.actions);
      this.element.replaceChildren(this.liveView.element);
      this.liveView.setPolling(this.isPollingAllowed);
    }
    this.liveView.showTab(tab);
    this.liveView.showListing(stream, machineName);
  }

  private showNotLoadedOverview(stream: ListedStream, machineName: string | null, reason: StreamNotLoadedReason): void {
    this.liveView?.dispose();
    this.liveView = null;
    if (this.notLoadedOverview?.reason === reason && this.notLoadedOverview.failedBecause === stream.failed_because) {
      this.notLoadedOverview.view.showStream(stream, machineName);
      return;
    }
    const overview = new StreamOverviewView(this.platform, this.featureFlags, {
      onOpenGraph: () => undefined,
      onWatchOutputPort: () => undefined,
    });
    overview.showStream(stream, machineName);
    const notLoadedOverview = { view: overview, reason, failedBecause: stream.failed_because };
    this.notLoadedOverview = notLoadedOverview;
    this.element.replaceChildren(overview.element);
    if (reason !== "failed" && reason !== "not_loaded") return;
    void this.backend.describeStreamGraph(stream.name).then(
      () => undefined,
      (rejection: unknown) => {
        if (this.notLoadedOverview === notLoadedOverview) overview.showRuntimeRefusal(describeBackendRejection(rejection));
      },
    );
  }

  private disposeBody(): void {
    this.liveView?.dispose();
    this.liveView = null;
    this.notLoadedOverview = null;
    this.element.replaceChildren();
  }
}
