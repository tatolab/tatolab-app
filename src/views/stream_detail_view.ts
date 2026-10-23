// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import { isStreamLoaded } from "../presentation/stream_presentation";
import type { StreamGraphReadings } from "../stream_graph_readings";
import { StreamLogConsoleView } from "./stream_log_console_view";
import { StreamLogFollower } from "./stream_log_follower";

/** A loaded stream's log, followed throughout, the load it read remembered in `StreamGraphReadings`. */
class LoadedStreamLogView {
  readonly element: HTMLElement;
  private readonly logConsole: StreamLogConsoleView;
  private readonly logFollower: StreamLogFollower;
  private shownNodeCount: number | null = null;

  constructor(
    backend: TatolabBackend,
    private readonly streamGraphReadings: StreamGraphReadings,
    streamName: string,
    platform: TatolabPlatform,
  ) {
    this.logConsole = new StreamLogConsoleView(streamName, platform);
    this.logConsole.setShownInLogsTab(true);
    this.logFollower = new StreamLogFollower(backend, streamName, this.logConsole, (streamInstance) =>
      streamGraphReadings.rememberStreamInstance(streamName, streamInstance),
    );
    this.element = createElement("div", { class: "stream-live" }, [createElement("div", { class: "log-dock" }, [this.logConsole.element])]);
  }

  /** A listing whose step count changed asks for the graph again at once. */
  showListing(stream: ListedStream): void {
    if (this.shownNodeCount !== null && stream.node_count !== this.shownNodeCount) this.streamGraphReadings.pollNow();
    this.shownNodeCount = stream.node_count;
  }

  setLogFollowing(shouldFollow: boolean): void {
    this.logFollower.setReading(shouldFollow);
  }

  readNow(): void {
    this.streamGraphReadings.pollNow();
    this.logFollower.readNow();
  }

  focusLogFilter(): void {
    this.logConsole.focusTextFilter();
  }

  showErrorLinesOnly(): void {
    this.logConsole.showErrorLinesOnly();
  }

  dispose(): void {
    this.logFollower.dispose();
    this.logConsole.dispose();
  }
}

/** The selected stream's log while it is loaded; nothing while it isn't. */
export class StreamDetailView {
  readonly element: HTMLElement;
  private shownStream: ListedStream | null = null;
  private logView: LoadedStreamLogView | null = null;
  private isLogFollowingAllowed = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly streamGraphReadings: StreamGraphReadings,
    private readonly platform: TatolabPlatform,
  ) {
    this.element = createElement("div", { class: "stream-detail" });
  }

  showStream(stream: ListedStream): void {
    if (this.shownStream?.name !== stream.name || !isStreamLoaded(stream)) this.disposeBody();
    this.shownStream = stream;
    if (!isStreamLoaded(stream)) return;
    if (!this.logView) {
      this.logView = new LoadedStreamLogView(this.backend, this.streamGraphReadings, stream.name, this.platform);
      this.element.replaceChildren(this.logView.element);
      this.logView.setLogFollowing(this.isLogFollowingAllowed);
    }
    this.logView.showListing(stream);
  }

  setLogFollowingAllowed(isAllowed: boolean): void {
    this.isLogFollowingAllowed = isAllowed;
    this.logView?.setLogFollowing(isAllowed);
  }

  readNow(): void {
    if (this.isLogFollowingAllowed) this.logView?.readNow();
  }

  /** Focuses the log filter; false when no log shows. */
  focusLogFilter(): boolean {
    if (!this.logView) return false;
    this.logView.focusLogFilter();
    return true;
  }

  /** Narrows the log to its errors; false when no log shows. */
  showErrorLinesOnly(): boolean {
    if (!this.logView) return false;
    this.logView.showErrorLinesOnly();
    return true;
  }

  dispose(): void {
    this.disposeBody();
    this.shownStream = null;
  }

  private disposeBody(): void {
    this.logView?.dispose();
    this.logView = null;
    this.element.replaceChildren();
  }
}
