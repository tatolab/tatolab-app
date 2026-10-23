// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, StreamGraphExposedPort, TatolabPlatform, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { presentPlatform, shortcutHint } from "../presentation/platform_presentation";
import { presentRuntimeStatus, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import { readableExposedPorts } from "../presentation/stream_overview_presentation";
import { presentStreamState, streamNotLoadedReason } from "../presentation/stream_presentation";
import { chooseSelectedStreamName } from "../presentation/stream_selection";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "../window_visibility";
import { createFirstStreamGuide } from "./first_stream_guide_view";
import { createRuntimeStatePage, createStreamsNotListedPage } from "./runtime_state_page_view";
import { StreamDetailView, type StreamViewTab } from "./stream_detail_view";
import type { GraphOutputPortAddress } from "./stream_graph_view";
import type { TatolabWindowPage } from "./tatolab_window_page";
import { createFailureIcon, SegmentedControlView } from "./window_controls";

type StreamsPageBodyKind = "stream" | "first_stream_guide" | "runtime_state" | "streams_not_listed";

/**
 * One stream's page: the band with the selected stream's name, state and tabs, then its graph, logs or Overview; or
 * the first-stream guide, or the page saying why the runtime isn't running.
 */
export class StreamsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly bandTitle: HTMLElement;
  private readonly bandTitleName: HTMLElement;
  private readonly bandTitleState: HTMLElement;
  private readonly bandTitleStateIcon: SVGElement;
  private readonly bandTitleStateText: HTMLElement;
  private readonly bandTabs: SegmentedControlView<StreamViewTab>;
  private readonly pageBody: HTMLElement;
  private readonly streamDetail: StreamDetailView;
  private shownBodyKind: StreamsPageBodyKind | null = null;
  /** The body kind, and for a runtime that isn't running which state it is in, so a new state redraws it. */
  private shownBodyKey: string | null = null;
  private selectedStreamName: string | null = null;
  private listedStreams: ListedStream[] = [];
  private latestStatus: TatolabStatus | null = null;
  private chosenTab: StreamViewTab = "graph";
  private runtimeLastAnsweredAt: Date | null = null;
  private isPageShown = false;

  constructor(
    private readonly backend: TatolabBackend,
    private readonly platform: TatolabPlatform,
    featureFlags: TatolabFrontendFeatureFlags,
  ) {
    this.bandTitleName = createElement("h1", { class: "content-band-name selectable-text" });
    this.bandTitleStateIcon = createFailureIcon(14);
    this.bandTitleStateText = createElement("span", {});
    this.bandTitleState = createElement("span", { class: "content-band-state" }, [this.bandTitleStateIcon, this.bandTitleStateText]);
    this.bandTitle = createElement("div", { class: "content-band-title" }, [this.bandTitleName, this.bandTitleState]);
    this.bandTabs = new SegmentedControlView<StreamViewTab>(
      [
        { key: "graph", label: "Graph", title: `Graph (${shortcutHint(platform, "1")})` },
        { key: "logs", label: "Logs", title: `Logs (${shortcutHint(platform, "2")})` },
        { key: "overview", label: "Overview", title: `Overview (${shortcutHint(platform, "3")})` },
      ],
      "Stream views",
      (tab) => this.showTab(tab),
    );
    this.streamDetail = new StreamDetailView(backend, platform, featureFlags, { onTabRequested: (tab) => this.showTab(tab) });
    this.pageBody = createElement("div", { class: "streams-page-body" });
    this.element = createElement("section", { class: "window-page streams-page", "aria-label": "Streams" }, [
      createElement("header", { class: "content-band" }, [
        this.bandTitle,
        createElement("div", { class: "content-band-tabs" }, [this.bandTabs.element]),
      ]),
      this.pageBody,
    ]);
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
      this.streamDetail.pollNow();
    } else if (status.streams !== null) {
      this.listedStreams = status.streams;
    } else if (!isRunning) {
      this.listedStreams = [];
    }
    this.showBand();
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
    this.showBand();
  }

  /** Selects the stream before (`-1`) or after (`1`) the selected one; false when there is none to select. */
  selectAdjacentStream(step: -1 | 1): boolean {
    if (this.shownBodyKind !== "stream" || this.listedStreams.length === 0) return false;
    const selectedIndex = this.listedStreams.findIndex((stream) => stream.name === this.selectedStreamName);
    const nextIndex = Math.min(this.listedStreams.length - 1, Math.max(0, selectedIndex + step));
    this.chooseStream(this.listedStreams[nextIndex].name);
    return true;
  }

  /** Shows `tab` for the selected stream; Overview is the one tab a stream that isn't loaded has. False when no tab applies. */
  showTab(tab: StreamViewTab): boolean {
    const selectedStream = this.selectedStream();
    if (this.shownBodyKind !== "stream" || selectedStream === null) return false;
    const isLoaded = streamNotLoadedReason(selectedStream) === null;
    if (!isLoaded) return tab === "overview";
    this.chosenTab = tab;
    this.streamDetail.showTab(tab);
    this.bandTabs.showSelected(tab);
    return true;
  }

  /** Whether the selected stream is loaded, so the Graph and Logs shortcuts apply. */
  isSelectedStreamLoaded(): boolean {
    const selectedStream = this.selectedStream();
    return this.shownBodyKind === "stream" && selectedStream !== null && streamNotLoadedReason(selectedStream) === null;
  }

  /** Focuses the selected stream's log filter, from Overview by way of Graph; false when no log dock applies. */
  focusLogFilter(): boolean {
    if (!this.isSelectedStreamLoaded()) return false;
    if (this.chosenTab === "overview") this.showTab("graph");
    return this.streamDetail.focusLogFilter();
  }

  /** Closes Watch; false when it wasn't open. */
  closeWatch(): boolean {
    return this.shownBodyKind === "stream" && this.streamDetail.closeWatch();
  }

  watchOutput(streamName: string, outputPort: GraphOutputPortAddress, exposureLevel: string | null): void {
    this.chooseStream(streamName);
    if (!this.showTab("graph")) return;
    this.streamDetail.showWatch(outputPort, exposureLevel);
  }

  showExposedOutputInOverview(streamName: string, outputPort: GraphOutputPortAddress): void {
    this.chooseStream(streamName);
    if (!this.showTab("overview")) return;
    window.requestAnimationFrame(() => this.streamDetail.focusExposedOutput(outputPort));
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

  exposedPortsAlreadyRead(streamName: string): StreamGraphExposedPort[] | null {
    if (streamName !== this.selectedStreamName) return null;
    const graph = this.streamDetail.currentGraph();
    return graph === null ? null : readableExposedPorts(graph);
  }

  private showSelectedStream(): void {
    const selectedStream = this.selectedStream();
    if (!selectedStream || this.shownBodyKind !== "stream") return;
    this.streamDetail.showStream(selectedStream, this.latestStatus?.machine_name ?? null, this.chosenTab);
  }

  private showBand(): void {
    const selectedStream = this.selectedStream();
    if (this.shownBodyKind === "stream" && selectedStream) {
      const statePresentation = presentStreamState(selectedStream);
      setTextIfChanged(this.bandTitleName, selectedStream.name);
      this.bandTitleName.title = selectedStream.project_directory;
      this.bandTitleName.dataset.font = "mono";
      setTextIfChanged(this.bandTitleStateText, statePresentation.label);
      this.bandTitleState.dataset.emphasis = statePresentation.emphasis;
      this.bandTitleState.title = statePresentation.meaning;
      this.bandTitleStateIcon.toggleAttribute("hidden", statePresentation.emphasis !== "failure");
      const isLoaded = streamNotLoadedReason(selectedStream) === null;
      this.bandTabs.element.hidden = !isLoaded;
      if (isLoaded) this.bandTabs.showSelected(this.chosenTab);
      return;
    }
    const status = this.latestStatus;
    setTextIfChanged(this.bandTitleName, status?.machine_name ?? presentPlatform(this.platform).thisMachineAtSentenceStart);
    this.bandTitleName.title = "";
    this.bandTitleName.dataset.font = status?.machine_name ? "mono" : "ui";
    setTextIfChanged(this.bandTitleStateText, status ? `Tatolab ${status.app_version}` : "");
    this.bandTitleState.dataset.emphasis = "version";
    this.bandTitleState.title = "";
    this.bandTitleStateIcon.toggleAttribute("hidden", true);
    this.bandTabs.element.hidden = true;
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
    this.streamDetail.setPollingAllowed(this.isPageShown && isTatolabWindowVisible() && this.shownBodyKind === "stream");
  }
}
