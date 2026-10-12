import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { STREAM_FAILED_ICON_SVG, STREAM_NOT_LOADED_ICON_SVG, STREAM_STOPPED_ICON_SVG } from "../icons";
import {
  abbreviateHomeDirectory,
  countLabel,
  presentStreamState,
  streamNotLoadedReason,
  type StreamNotLoadedReason,
} from "../presentation/stream_presentation";
import { RepeatingBackendPoll } from "../repeating_backend_poll";
import { createCopyButton, createTerminalCommand } from "./copy_button";
import { StreamGraphView } from "./stream_graph_view";
import { StreamLogConsoleView } from "./stream_log_console_view";
import { StreamLogFollower } from "./stream_log_follower";

const STREAM_GRAPH_POLL_MILLISECONDS = 2500;

/** The graph and log console of a loaded stream, polled while the window shows them. */
class LoadedStreamLiveView {
  readonly element: HTMLElement;
  private readonly graphView: StreamGraphView;
  private readonly graphPoll: RepeatingBackendPoll;
  private readonly logConsole: StreamLogConsoleView;
  private readonly logFollower: StreamLogFollower;
  private shownNodeCount: number | null = null;
  private isDisposed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly streamName: string,
    platform: TatolabPlatform,
  ) {
    this.graphView = new StreamGraphView(streamName, platform);
    this.graphPoll = new RepeatingBackendPoll(() => this.readGraph(), STREAM_GRAPH_POLL_MILLISECONDS);
    this.logConsole = new StreamLogConsoleView(streamName);
    this.logFollower = new StreamLogFollower(backend, streamName, this.logConsole);
    this.element = createElement("div", { class: "stream-detail-live" }, [this.graphView.element, this.logConsole.element]);
  }

  showListing(stream: ListedStream): void {
    if (this.shownNodeCount !== null && stream.node_count !== this.shownNodeCount) this.graphPoll.pollNow();
    this.shownNodeCount = stream.node_count;
  }

  setPolling(shouldPoll: boolean): void {
    if (shouldPoll) {
      this.graphPoll.start();
    } else {
      this.graphPoll.stop();
    }
    this.logFollower.setReading(shouldPoll);
  }

  pollNow(): void {
    this.graphPoll.pollNow();
    this.logFollower.readNow();
  }

  focusLogFilter(): void {
    this.logConsole.focusTextFilter();
  }

  dispose(): void {
    this.isDisposed = true;
    this.graphPoll.stop();
    this.logFollower.dispose();
    this.graphView.dispose();
  }

  private async readGraph(): Promise<void> {
    try {
      const graphSummary = await this.backend.describeStreamGraph(this.streamName);
      if (!this.isDisposed) this.graphView.showGraph(graphSummary);
    } catch (rejection) {
      if (this.isDisposed) return;
      this.graphView.showMessage("Couldn't read this stream's graph.", describeBackendRejection(rejection));
    }
  }
}

const NOT_LOADED_ICONS: Record<StreamNotLoadedReason, string> = {
  stopped: STREAM_STOPPED_ICON_SVG,
  failed: STREAM_FAILED_ICON_SVG,
  loading: STREAM_NOT_LOADED_ICON_SVG,
  not_loaded: STREAM_NOT_LOADED_ICON_SVG,
};

function notLoadedHeadline(streamName: string, reason: StreamNotLoadedReason): string {
  switch (reason) {
    case "stopped":
      return `${streamName} is stopped`;
    case "failed":
      return `${streamName} failed`;
    case "loading":
      return `${streamName} is loading`;
    case "not_loaded":
      return `${streamName} isn't loaded`;
  }
}

function notLoadedExplanation(reason: StreamNotLoadedReason): string {
  switch (reason) {
    case "stopped":
      return "Its graph and logs come back when it runs. Start it again from Terminal:";
    case "failed":
      return "The runtime skips it until it's retried. Fix what it names, then retry it from Terminal:";
    case "loading":
      return "The runtime is loading this stream. Its graph and logs appear as soon as it's running.";
    case "not_loaded":
      return "Its graph and logs appear while it's loaded. Start it from Terminal:";
  }
}

/** Why a listed stream shows no graph or logs, and the command that loads it again. */
class StreamNotLoadedPanel {
  readonly element: HTMLElement;
  private readonly runtimeRefusal: HTMLElement;

  constructor(
    stream: ListedStream,
    readonly reason: StreamNotLoadedReason,
    readonly failedBecause: string | null,
  ) {
    this.runtimeRefusal = createElement("p", { class: "stream-not-loaded-runtime-refusal selectable-text", hidden: true });
    this.element = createElement("div", { class: "stream-not-loaded", "data-reason": reason }, [
      createElement("div", { class: "stream-not-loaded-column" }, [
        createElement("span", { class: "stream-not-loaded-icon" }, [createSvgFromMarkup(NOT_LOADED_ICONS[reason])]),
        createElement("h3", { class: "stream-not-loaded-headline" }, [notLoadedHeadline(stream.name, reason)]),
        reason === "failed" &&
          failedBecause !== null &&
          createElement("p", { class: "stream-not-loaded-failure selectable-text" }, [failedBecause]),
        createElement("p", { class: "stream-not-loaded-explanation" }, [notLoadedExplanation(reason)]),
        reason !== "loading" && createTerminalCommand(`tatolab start ${stream.name}`),
        this.runtimeRefusal,
      ]),
    ]);
  }

  showRuntimeRefusal(refusalText: string): void {
    this.runtimeRefusal.hidden = false;
    this.runtimeRefusal.replaceChildren(
      createElement("span", { class: "stream-not-loaded-runtime-refusal-label" }, ["The runtime says"]),
      createElement("code", {}, [refusalText]),
    );
  }
}

/** The selected stream: its name, state and project, then its live graph and logs or why it has none. */
export class StreamDetailView {
  readonly element: HTMLElement;
  private readonly streamNameHeading: HTMLElement;
  private readonly stateChip: HTMLElement;
  private readonly nodeCountLabel: HTMLElement;
  private readonly projectPath: HTMLElement;
  private readonly detailBody: HTMLElement;
  private shownStream: ListedStream | null = null;
  private liveView: LoadedStreamLiveView | null = null;
  private notLoadedPanel: StreamNotLoadedPanel | null = null;
  private isPollingAllowed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
  ) {
    this.streamNameHeading = createElement("h2", { class: "stream-detail-name selectable-text" });
    this.stateChip = createElement("span", { class: "state-chip" });
    this.nodeCountLabel = createElement("span", { class: "stream-detail-node-count" });
    this.projectPath = createElement("code", { class: "stream-detail-project-path selectable-text" });
    this.detailBody = createElement("div", { class: "stream-detail-body" });
    this.element = createElement("article", { class: "stream-detail" }, [
      createElement("header", { class: "stream-detail-header" }, [
        createElement("div", { class: "stream-detail-identity" }, [
          createElement("div", { class: "stream-detail-title-row" }, [
            this.streamNameHeading,
            this.stateChip,
            this.nodeCountLabel,
          ]),
          createElement("div", { class: "stream-detail-project" }, [
            this.projectPath,
            createCopyButton("project path", () => this.shownStream?.project_directory ?? ""),
          ]),
        ]),
        createElement("div", { class: "stream-detail-actions" }),
      ]),
      this.detailBody,
    ]);
  }

  showStream(stream: ListedStream): void {
    if (this.shownStream?.name !== stream.name) this.disposeBody();
    this.shownStream = stream;

    const statePresentation = presentStreamState(stream);
    setTextIfChanged(this.streamNameHeading, stream.name);
    setTextIfChanged(this.stateChip, statePresentation.label);
    this.stateChip.dataset.tone = statePresentation.chipTone;
    setTextIfChanged(this.nodeCountLabel, stream.node_count === null ? "" : countLabel(stream.node_count, "node", "nodes"));
    setTextIfChanged(this.projectPath, abbreviateHomeDirectory(stream.project_directory));
    this.projectPath.title = stream.project_directory;

    const notLoadedReason = streamNotLoadedReason(stream);
    if (notLoadedReason === null) {
      this.showLiveView(stream);
    } else {
      this.showNotLoadedPanel(stream, notLoadedReason);
    }
  }

  setPollingAllowed(isAllowed: boolean): void {
    this.isPollingAllowed = isAllowed;
    this.liveView?.setPolling(isAllowed);
  }

  pollNow(): void {
    if (this.isPollingAllowed) this.liveView?.pollNow();
  }

  /** Focuses the log filter; false when no log console is showing. */
  focusLogFilter(): boolean {
    if (!this.liveView) return false;
    this.liveView.focusLogFilter();
    return true;
  }

  dispose(): void {
    this.disposeBody();
    this.shownStream = null;
  }

  private showLiveView(stream: ListedStream): void {
    if (this.notLoadedPanel) {
      this.notLoadedPanel = null;
      this.detailBody.replaceChildren();
    }
    if (!this.liveView) {
      this.liveView = new LoadedStreamLiveView(this.backend, stream.name, this.platform);
      this.detailBody.replaceChildren(this.liveView.element);
      this.liveView.setPolling(this.isPollingAllowed);
    }
    this.liveView.showListing(stream);
  }

  private showNotLoadedPanel(stream: ListedStream, reason: StreamNotLoadedReason): void {
    this.liveView?.dispose();
    this.liveView = null;
    if (this.notLoadedPanel?.reason === reason && this.notLoadedPanel.failedBecause === stream.failed_because) return;
    const notLoadedPanel = new StreamNotLoadedPanel(stream, reason, stream.failed_because);
    this.notLoadedPanel = notLoadedPanel;
    this.detailBody.replaceChildren(notLoadedPanel.element);
    if (reason === "loading") return;
    void this.backend.describeStreamGraph(stream.name).then(
      () => undefined,
      (rejection: unknown) => {
        if (this.notLoadedPanel === notLoadedPanel) notLoadedPanel.showRuntimeRefusal(describeBackendRejection(rejection));
      },
    );
  }

  private disposeBody(): void {
    this.liveView?.dispose();
    this.liveView = null;
    this.notLoadedPanel = null;
    this.detailBody.replaceChildren();
  }
}
