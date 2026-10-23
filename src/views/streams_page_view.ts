// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { presentRuntimeStatus, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { chooseSelectedStreamName } from "../presentation/stream_selection";
import type { StreamGraphReadings } from "../stream_graph_readings";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "../window_visibility";
import { createFirstStreamGuide } from "./first_stream_guide_view";
import { createRuntimeStatePage, createStreamsNotListedPage } from "./runtime_state_page_view";
import { StreamDetailView, type StreamDetailActions, type StreamWorkspaceTab } from "./stream_detail_view";
import type { GraphOutputPortAddress } from "./stream_graph_view";
import type { TatolabWindowPage } from "./tatolab_window_page";

type StreamsPageBodyKind = "stream" | "first_stream_guide" | "runtime_state" | "streams_not_listed";

/**
 * The selected stream's graph canvas and log, under the stream page's header; or the first-stream guide, or the page
 * saying why the runtime isn't running.
 */
export class StreamsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly pageBody: HTMLElement;
  private readonly streamDetail: StreamDetailView;
  private shownBodyKind: StreamsPageBodyKind | null = null;
  /** The body kind, and for a runtime that isn't running which state it is in, so a new state redraws it. */
  private shownBodyKey: string | null = null;
  private selectedStreamName: string | null = null;
  private listedStreams: ListedStream[] = [];
  private latestStatus: TatolabStatus | null = null;
  private chosenTab: StreamWorkspaceTab = "graph";
  private runtimeLastAnsweredAt: Date | null = null;
  private isPageShown = false;

  constructor(
    private readonly backend: TatolabBackend,
    streamGraphReadings: StreamGraphReadings,
    platform: TatolabPlatform,
    featureFlags: TatolabFrontendFeatureFlags,
    streamDetailActions: StreamDetailActions,
  ) {
    this.streamDetail = new StreamDetailView(backend, streamGraphReadings, platform, featureFlags, streamDetailActions);
    this.pageBody = createElement("div", { class: "streams-page-body" });
    this.element = createElement("section", { class: "window-page streams-page", "aria-label": "Streams" }, [this.pageBody]);
    onTatolabWindowVisibilityChanged(() => this.updatePolling());
  }

  /** The local time of the last status that found the runtime running, for the not-responding page. */
  setRuntimeLastAnsweredAt(lastAnsweredAt: Date | null): void {
    this.runtimeLastAnsweredAt = lastAnsweredAt;
  }

  showStatus(status: TatolabStatus): void {
    this.latestStatus = status;
    const presentation = presentRuntimeStatus(status);
    const isRunning = presentation.displayState === "running";
    const bodyKind: StreamsPageBodyKind = !isRunning
      ? "runtime_state"
      : status.streams === null
        ? "streams_not_listed"
        : status.streams.length === 0
          ? "first_stream_guide"
          : "stream";
    this.showBody(bodyKind, presentation);

    if (status.streams !== null && isRunning) {
      this.selectedStreamName = chooseSelectedStreamName(
        status.streams,
        this.selectedStreamName,
        this.listedStreams.map((stream) => stream.name),
      );
      this.listedStreams = status.streams;
      this.showSelectedStream();
      this.streamDetail.readNow();
    } else if (status.streams !== null) {
      this.listedStreams = status.streams;
    } else if (!isRunning) {
      this.listedStreams = [];
    }
  }

  setPageShown(isShown: boolean): void {
    this.isPageShown = isShown;
    this.updatePolling();
  }

  /** Selects `streamName`, as the window's route or Search does. */
  chooseStream(streamName: string): void {
    if (!this.listedStreams.some((stream) => stream.name === streamName)) return;
    this.selectedStreamName = streamName;
    this.showSelectedStream();
  }

  /** The stream listed before (`-1`) or after (`1`) the selected one; `null` when there is none to go to. */
  adjacentStreamName(step: -1 | 1): string | null {
    if (this.shownBodyKind !== "stream" || this.listedStreams.length === 0) return null;
    const selectedIndex = this.listedStreams.findIndex((stream) => stream.name === this.selectedStreamName);
    const nextIndex = Math.min(this.listedStreams.length - 1, Math.max(0, selectedIndex + step));
    return this.listedStreams[nextIndex]?.name ?? null;
  }

  /** Shows `tab` of the selected stream's workspace; false when it is not loaded, so it has none. */
  showTab(tab: StreamWorkspaceTab): boolean {
    const selectedStream = this.selectedStream();
    if (this.shownBodyKind !== "stream" || selectedStream === null || !isStreamLoaded(selectedStream)) return false;
    this.chosenTab = tab;
    this.streamDetail.showTab(tab);
    return true;
  }

  /** Focuses the selected stream's log filter; false when no log dock applies. */
  focusLogFilter(): boolean {
    const selectedStream = this.selectedStream();
    if (this.shownBodyKind !== "stream" || selectedStream === null || !isStreamLoaded(selectedStream)) return false;
    return this.streamDetail.focusLogFilter();
  }

  /** Closes Watch; false when it wasn't open. */
  closeWatch(): boolean {
    return this.shownBodyKind === "stream" && this.streamDetail.closeWatch();
  }

  /** Opens Watch on `outputPort` of the selected stream, on its Graph tab; false when it has no Graph tab. */
  watchOutput(outputPort: GraphOutputPortAddress, exposureLevel: string | null): boolean {
    if (!this.showTab("graph")) return false;
    this.streamDetail.showWatch(outputPort, exposureLevel);
    return true;
  }

  listedStreamsForSearch(): ListedStream[] {
    return this.shownBodyKind === "stream" ? this.listedStreams : [];
  }

  selectedStream(): ListedStream | null {
    return this.listedStreams.find((stream) => stream.name === this.selectedStreamName) ?? null;
  }

  machineName(): string | null {
    return this.latestStatus?.machine_name ?? null;
  }

  private showSelectedStream(): void {
    const selectedStream = this.selectedStream();
    if (!selectedStream || this.shownBodyKind !== "stream") return;
    this.streamDetail.showStream(selectedStream, this.latestStatus?.machine_name ?? null, this.chosenTab);
  }

  private showBody(bodyKind: StreamsPageBodyKind, presentation: RuntimeDisplayPresentation): void {
    const bodyKey = bodyKind === "runtime_state" ? `${bodyKind}:${presentation.displayState}` : bodyKind;
    if (bodyKey === this.shownBodyKey) return;
    if (this.shownBodyKind === "stream") this.streamDetail.dispose();
    this.shownBodyKind = bodyKind;
    this.shownBodyKey = bodyKey;
    switch (bodyKind) {
      case "stream":
        this.pageBody.replaceChildren(this.streamDetail.element);
        break;
      case "first_stream_guide":
        this.pageBody.replaceChildren(createFirstStreamGuide());
        break;
      case "runtime_state":
        this.pageBody.replaceChildren(createRuntimeStatePage(this.backend, presentation, this.runtimeLastAnsweredAt));
        break;
      case "streams_not_listed":
        this.pageBody.replaceChildren(createStreamsNotListedPage());
        break;
    }
    this.updatePolling();
  }

  private updatePolling(): void {
    this.streamDetail.setLogFollowingAllowed(this.isPageShown && isTatolabWindowVisible() && this.shownBodyKind === "stream");
  }
}
