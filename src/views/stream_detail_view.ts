// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { isStreamLoaded } from "../presentation/stream_presentation";
import type { StreamGraphReadings } from "../stream_graph_readings";
import { LogDockSplitter } from "./log_dock_splitter";
import { StreamGraphView, type GraphOutputPortAddress } from "./stream_graph_view";
import { StreamLogConsoleView } from "./stream_log_console_view";
import { StreamLogFollower } from "./stream_log_follower";
import { isWatchableExposureLevel, WatchPlaceholderView } from "./watch_placeholder_view";

/** The two views of a loaded stream the DOM workspace draws: its canvas over the docked log, or the log alone. */
export type StreamWorkspaceTab = "graph" | "logs";

/** What the workspace asks of the stream page around it. */
export interface StreamDetailActions {
  /** Something in the workspace needs another tab: an errored node's foot from Logs, the exposed outputs from Graph. */
  onTabRequested(tab: StreamWorkspaceTab | "overview"): void;
}

/** The output Watch is open on, and its level when it opened. */
interface OpenWatch {
  outputPort: GraphOutputPortAddress;
  exposureLevel: string | null;
}

/** A loaded stream's canvas over its docked log, or the log alone, the graph read through `StreamGraphReadings` and the log followed throughout. */
class LoadedStreamLiveView {
  readonly element: HTMLElement;
  private readonly workspace: HTMLElement;
  private readonly logDock: HTMLElement;
  private readonly graphView: StreamGraphView;
  private readonly logConsole: StreamLogConsoleView;
  private readonly logFollower: StreamLogFollower;
  private readonly splitter: LogDockSplitter;
  private readonly watchPlaceholder: WatchPlaceholderView | null;
  private readonly stopHearingReadings: () => void;
  private openWatch: OpenWatch | null = null;
  private shownTab: StreamWorkspaceTab = "graph";
  private shownNodeCount: number | null = null;
  private machineName: string | null = null;
  private shownGraph: StreamGraphSummary | null = null;
  private shownReadRefusal: string | null = null;

  constructor(
    backend: TatolabBackend,
    private readonly streamGraphReadings: StreamGraphReadings,
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
    this.logConsole = new StreamLogConsoleView(streamName, platform);
    this.logFollower = new StreamLogFollower(backend, streamName, this.logConsole, (streamInstance) =>
      streamGraphReadings.rememberStreamInstance(streamName, streamInstance),
    );
    this.watchPlaceholder = featureFlags.watchExposedOutput ? new WatchPlaceholderView(platform, () => this.closeWatch()) : null;
    this.logDock = createElement("div", { class: "log-dock" }, [this.logConsole.element, this.watchPlaceholder?.element]);
    this.workspace = createElement("div", { class: "stream-workspace" });
    this.splitter = new LogDockSplitter(this.workspace);
    this.workspace.append(this.graphView.element, this.splitter.element, this.logDock);
    this.element = createElement("div", { class: "stream-live" }, [this.workspace]);
    this.updateWatchVisibility();
    this.stopHearingReadings = streamGraphReadings.subscribeToReadings(() => this.showTheLatestReading());
    this.showTheLatestReading();
  }

  showListing(stream: ListedStream, machineName: string | null): void {
    if (this.shownNodeCount !== null && stream.node_count !== this.shownNodeCount) this.streamGraphReadings.pollNow();
    this.shownNodeCount = stream.node_count;
    this.machineName = machineName;
    this.graphView.showProjectDirectory(stream.project_directory);
  }

  showTab(tab: StreamWorkspaceTab): void {
    this.shownTab = tab;
    this.element.dataset.tab = tab;
    this.logConsole.setShownInLogsTab(tab === "logs");
    if (tab === "logs") this.closeWatch();
  }

  setLogFollowing(shouldFollow: boolean): void {
    this.logFollower.setReading(shouldFollow);
  }

  readNow(): void {
    this.streamGraphReadings.pollNow();
    this.logFollower.readNow();
  }

  focusLogFilter(): void {
    this.closeWatch();
    this.logConsole.focusTextFilter();
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
    this.stopHearingReadings();
    this.logFollower.dispose();
    this.logConsole.dispose();
    this.graphView.dispose();
    this.splitter.dispose();
  }

  private showTheLatestReading(): void {
    const reading = this.streamGraphReadings.readingOf(this.streamName);
    if (reading.graphSource === "loaded" && reading.graph !== null && reading.graph !== this.shownGraph) {
      this.shownGraph = reading.graph;
      this.graphView.showGraph(reading.graph, this.machineName);
      this.closeWatchWhenItsPortIsGone(reading.graph);
    }
    if (reading.readRefusal !== null && reading.readRefusal !== this.shownReadRefusal) this.graphView.showReadFailure(reading.readRefusal);
    this.shownReadRefusal = reading.readRefusal;
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
}

/** The selected stream's graph canvas and log while it is loaded; nothing while it isn't, whose Overview the stream page draws. */
export class StreamDetailView {
  readonly element: HTMLElement;
  private shownStream: ListedStream | null = null;
  private liveView: LoadedStreamLiveView | null = null;
  private isLogFollowingAllowed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly streamGraphReadings: StreamGraphReadings,
    private readonly platform: TatolabPlatform,
    private readonly featureFlags: TatolabFrontendFeatureFlags,
    private readonly actions: StreamDetailActions,
  ) {
    this.element = createElement("div", { class: "stream-detail" });
  }

  /** Shows `stream`, on `tab` while it is loaded. */
  showStream(stream: ListedStream, machineName: string | null, tab: StreamWorkspaceTab): void {
    if (this.shownStream?.name !== stream.name || !isStreamLoaded(stream)) this.disposeBody();
    this.shownStream = stream;
    if (!isStreamLoaded(stream)) return;
    if (!this.liveView) {
      this.liveView = new LoadedStreamLiveView(this.backend, this.streamGraphReadings, stream.name, this.platform, this.featureFlags, this.actions);
      this.element.replaceChildren(this.liveView.element);
      this.liveView.setLogFollowing(this.isLogFollowingAllowed);
    }
    this.liveView.showTab(tab);
    this.liveView.showListing(stream, machineName);
  }

  showTab(tab: StreamWorkspaceTab): void {
    this.liveView?.showTab(tab);
  }

  setLogFollowingAllowed(isAllowed: boolean): void {
    this.isLogFollowingAllowed = isAllowed;
    this.liveView?.setLogFollowing(isAllowed);
  }

  readNow(): void {
    if (this.isLogFollowingAllowed) this.liveView?.readNow();
  }

  /** Focuses the log filter; false when no log dock is showing. */
  focusLogFilter(): boolean {
    if (!this.liveView) return false;
    this.liveView.focusLogFilter();
    return true;
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

  private disposeBody(): void {
    this.liveView?.dispose();
    this.liveView = null;
    this.element.replaceChildren();
  }
}
